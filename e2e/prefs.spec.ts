import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

test('a project opens on the file list, with no tour', async ({ page }) => {
    // as a returning person would arrive: tour previously enabled, and the
    // sidebar left on settings by whoever used this browser last
    await page.addInitScript(() => {
        window.localStorage.setItem('tour.showOnStartup', 'true');
        window.localStorage.setItem(
            'activities.selectedActivity',
            '"activity.settings"',
        );
    });

    await page.goto('/project/wah');
    await page.waitForTimeout(10_000);

    const state = await page.evaluate(() => ({
        tour: window.localStorage.getItem('tour.showOnStartup'),
        activity: window.sessionStorage.getItem('activities.selectedActivity'),
        tourVisible: !!document.querySelector('.react-joyride__tooltip'),
        explorerVisible: !!document.querySelector('.pb-explorer-file-tree'),
    }));

    console.log('\n=== after opening a project ===');
    console.log('  tour setting    :', state.tour);
    console.log('  activity        :', state.activity);
    console.log('  tour on screen  :', state.tourVisible);
    console.log('  file list shown :', state.explorerVisible);
    console.log('');

    // The tour also switches the sidebar to Settings when it runs, so it not
    // opening is what keeps a project on the file list.
    expect(state.tourVisible, 'the welcome tour should not open').toBe(false);
    expect(state.explorerVisible, 'the file list should be showing').toBe(true);
});
