// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { defineConfig, devices } from '@playwright/test';

// Point at a deployment with E2E_URL, or leave it unset to run against a
// local dev server.
const baseURL = process.env.E2E_URL ?? 'http://localhost:3000';
const useLocalServer = !process.env.E2E_URL;

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
