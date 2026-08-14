// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { defineConfig, devices } from '@playwright/test';

// Point at a deployment with E2E_URL, or leave it unset to run against a
// local dev server.
const baseURL = process.env.E2E_URL ?? 'http://localhost:3000';
const useLocalServer = !process.env.E2E_URL;

// These tests create projects and save versions through the real UI, so they
// write to whatever database the deployment they point at is using. Running
// them against production fills the team's project list with test data, which
// is exactly what happened once. Preview deployments get their own database
// branch, so those are the ones to point at.
//
// Set E2E_ALLOW_PRODUCTION=1 to override, deliberately.
// The bare project alias and the custom domain both resolve to whatever
// deployment is production. Branch URLs (…-git-<branch>-…) are previews and
// have their own database branch, so they are safe.
const productionHosts = [
    'https://synced-pybricks-code.vercel.app',
    'code.jahnrobotics.org',
];

if (
    !process.env.E2E_ALLOW_PRODUCTION &&
    productionHosts.some((host) => baseURL.includes(host))
) {
    throw new Error(
        `Refusing to run browser tests against ${baseURL}.\n` +
            'These write real projects to whatever database that deployment uses.\n' +
            'Point E2E_URL at a preview deployment instead, which has its own\n' +
            'database branch. To override, set E2E_ALLOW_PRODUCTION=1.',
    );
}

export default defineConfig({
    testDir: './e2e',
    // these talk to one shared database, so parallel runs would fight over
    // the project list and the locks
    workers: 1,
    fullyParallel: false,
    // a cold serverless function plus a real editor boot is not fast
    timeout: 90_000,
    expect: { timeout: 20_000 },
    reporter: process.env.CI ? 'line' : 'list',
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // the editor needs cross-origin isolation for its workers, and
                // the dev server sends the headers that turn it on
                launchOptions: { args: ['--enable-features=SharedArrayBuffer'] },
            },
        },
    ],
    webServer: useLocalServer
        ? {
              command: 'yarn start',
              url: 'http://localhost:3000',
              reuseExistingServer: true,
              timeout: 180_000,
          }
        : undefined,
});
