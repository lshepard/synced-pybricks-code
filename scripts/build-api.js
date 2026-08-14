'use strict';

// Builds the serverless functions.
//
// Vercel compiles each file it finds in api/ on its own and does not follow
// imports out of that directory, so a route written there cannot use the
// database layer in src/. The sources therefore live in src/cloud/routes and
// are bundled into api/ as self-contained modules, which keeps one copy of the
// database code and gives Vercel exactly the files it expects.
//
// api/ is generated but committed, because Vercel decides what functions a
// deployment has by looking for that directory in the repository, before the
// build command ever runs. Generating it during the build is too late: the
// deployment simply has no functions and every /api path falls through to the
// single page app, which answers with HTML and a 200.
//
// Since it is committed it can drift from its sources, so `--check` verifies
// the two agree and CI runs it.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const sourceDir = path.join(root, 'src', 'cloud', 'routes');
const apiDir = path.join(root, 'api');

/** Lists the route sources, skipping tests and shared helpers. */
function findRoutes(dir) {
    const found = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            found.push(...findRoutes(full));
            continue;
        }

        // _lib is pulled in by the routes, and tests never deploy
        if (
            !entry.name.endsWith('.ts') ||
            entry.name.startsWith('_') ||
            entry.name.includes('.test.')
        ) {
            continue;
        }

        found.push(full);
    }

    return found;
}

const routes = findRoutes(sourceDir);

if (routes.length === 0) {
    console.error('no api routes found in', sourceDir);
    process.exit(1);
}

const checkOnly = process.argv.includes('--check');

/** Reads every generated file, so a check can compare before and after. */
function snapshot() {
    if (!fs.existsSync(apiDir)) {
        return {};
    }

    const files = {};

    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(full);
            } else {
                files[path.relative(apiDir, full)] = fs.readFileSync(full, 'utf8');
            }
        }
    };

    walk(apiDir);

    return files;
}

const before = checkOnly ? snapshot() : {};

// start clean so a renamed or deleted route cannot linger as a stale function
fs.rmSync(apiDir, { recursive: true, force: true });

esbuild
    .build({
        entryPoints: routes,
        outdir: apiDir,
        // a route's path is its URL, so the directory layout has to survive;
        // without this esbuild flattens to a common base
        outbase: sourceDir,
        // .mjs so node treats these as modules outright, rather than reparsing
        // to work out the module type
        outExtension: { '.js': '.mjs' },
        bundle: true,
        platform: 'node',
        target: 'node22',
        format: 'esm',
        // a real dependency at runtime, so bundling it is only weight
        external: ['@neondatabase/serverless'],
        logLevel: 'warning',
    })
    .then(() => {
        if (!checkOnly) {
            console.log(`bundled ${routes.length} api routes into api/`);
            return;
        }

        const after = snapshot();
        const names = new Set([...Object.keys(before), ...Object.keys(after)]);
        const stale = [...names].filter((n) => before[n] !== after[n]);

        if (stale.length > 0) {
            console.error(
                'api/ does not match src/cloud/routes:\n' +
                    stale.map((n) => `  ${n}`).join('\n') +
                    '\n\nRun `yarn build:api` and commit the result.',
            );
            process.exit(1);
        }

        console.log(`api/ is up to date with ${routes.length} routes`);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
