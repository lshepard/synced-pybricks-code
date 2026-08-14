# Working in this repo

A fork of [pybricks-code](https://github.com/pybricks/pybricks-code) with cloud
project sync added for one robotics team. The added code lives in `src/cloud`.

## Keep upstream mergeable

Upstream keeps moving, and this fork has to be able to take its changes. That
only stays true if the diff against it is small and boring.

- New behaviour goes in `src/cloud`. Nothing else.
- Drive the editor with the actions it already exports. `fileStorageWriteFile`,
  `editorReplaceFile`, `editorCloseFile` and the rest are the interface; the
  sagas behind them own things that are invisible from outside, including a web
  lock per open file, a monaco model per file, and the list of open files.
- Never write to the dexie tables directly. Doing that once cost most of a day:
  files disappeared from under the editor while it still held locks, models and
  tabs for them, and four rounds of fixes went into rebuilding, from outside,
  the cleanup the sagas do for free.
- Check `git diff <upstream-base> --stat -- src/ ':!src/cloud'` before
  committing. Anything unexpected in that list wants justifying or reverting.

The exceptions currently in the tree are deliberate and small: wiring in
`src/index.tsx` and `src/sagas.ts`, a SPIKE Prime default, and a guard in
`setupTests.ts` so database tests can run under the node environment.

## Measure before fixing

Six speculative fixes in a row failed in this repo. Each was a plausible theory
formed by reading code, shipped without checking. The bug was found in minutes
once the app was asked what it was doing.

- `src/cloud/debug.ts` records every cloud, editor and file storage action when
  `localStorage.cloud.debug` is `'1'`. `e2e/diagnose.spec.ts` turns it on, walks
  the smallest failing path, and prints the action sequence next to the state of
  the screen.
- A missing action in that log is the answer. The load bug was one line: the
  files were written and never opened, and the log simply had no
  `editorActivateFile` in it.
- Playwright writes a trace on failure with a DOM snapshot and the console.
  Read it. A screenshot alone is not the evidence.

## Test what a person sees

The unit tests passed through every bug in this session. They check that actions
fire in the right order, not that text appears on screen.

- `e2e/editor.spec.ts` is one journey: make a project, add a file, type, save,
  switch projects, come back, add another file, reload. Prefer extending it over
  adding narrow tests.
- Two things about the editor will break a naive test. Code completion opens on
  the first letter of an identifier and swallows what follows, so type slowly and
  dismiss it. Loading is asynchronous, so wait for something that means it
  finished, such as the history count, rather than asserting straight after a
  click.

## Testing against a deployment

`yarn start` serves only the front end, so `/api` returns the single page app.
The functions exist once deployed. Test against a deployment.

- `vercel deploy --yes` deploys the working tree and prints a URL. Use it to
  check a change before committing.
- `E2E_URL=<preview url> npx playwright test` runs the browser tests there.
- **Never point tests at production.** They create real projects. Thirty of them
  ended up in the team's list once. `playwright.config.ts` refuses a production
  host; do not work around it.
- Preview deployments get their own Neon database branch, so they are safe.
- Database tests read `TEST_DATABASE_URL` and skip without it. It must not point
  at the branch the app uses.

## Deployment

- `master` tracks upstream. `cloud-sync` is what deploys. Work on `cloud-sync`.
- Confirm the branch before committing. Nine commits once went to the wrong one,
  and `git push` reporting "Everything up-to-date" is not proof they landed.
- `api/` is generated from `src/cloud/routes` and committed, because Vercel looks
  for that directory before the build runs. After changing a route run
  `yarn build:api` and commit the result; `yarn check:api` catches drift and CI
  runs it.
- `vercel.json` sets the cross-origin isolation headers. Pyodide and the
  mpy-cross workers need them. A blocked `vercel.live` script in the console is
  those headers working as intended on a preview, not a fault.
