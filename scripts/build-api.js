'use strict';

// Bundles the serverless functions.
//
// Vercel compiles each file in api/ on its own and does not follow imports out
// of that directory, so anything a route pulls in from src/ is missing at
// runtime. Bundling each route into a self-contained file avoids that without
// having to duplicate the database layer under api/.
//
// The .ts sources stay in place for editing and testing; the .js files written
// beside them are what actually deploy.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const apiDir = path.join(__dirname, '..', 'api');

/** Lists the route sources, skipping tests and shared helpers. */
function findRoutes(dir) {
    const found = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            found.push(...findRoutes(full));
            continue;
        }

        if (!entry.name.endsWith('.ts')) {
            continue;
        }

        // _lib is imported by the routes, and tests never deploy
        if (entry.name.startsWith('_') || entry.name.includes('.test.')) {
            continue;
        }

        found.push(full);
    }

    return found;
}

const routes = findRoutes(apiDir);

if (routes.length === 0) {
    console.log('no api routes to bundle');
    process.exit(0);
}

esbuild
    .build({
        entryPoints: routes,
        outdir: apiDir,
        // without this esbuild derives a common base from the entry points and
        // flattens away the directories, but a route's path is its URL
        outbase: apiDir,
        // .mjs so node treats these as modules regardless of the package type,
        // which it otherwise has to guess at by reparsing
        outExtension: { '.js': '.mjs' },
        bundle: true,
        platform: 'node',
        target: 'node22',
        format: 'esm',
        // the driver is a real dependency at runtime; bundling it is
        // unnecessary weight in every function
        external: ['@neondatabase/serverless'],
        logLevel: 'warning',
    })
    .then(() => {
        console.log(`bundled ${routes.length} api routes`);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
