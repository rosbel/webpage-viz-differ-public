import { expect, test } from '@playwright/test';

test.describe('App layout and navigation', () => {
  test('navigates between the form and run history', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Compare two sites');

    await page.getByRole('link', { name: 'Runs' }).click();
    await expect(page.locator('h1')).toHaveText('Run history');

    await page.getByRole('link', { name: 'New comparison' }).click();
    await expect(page.locator('h1')).toHaveText('Compare two sites');
  });

  test('run history renders (empty state or table)', async ({ page }) => {
    await page.goto('/runs');
    await expect(page.locator('h1')).toHaveText('Run history');
    // Either the empty state or at least one run row is visible
    const emptyState = page.getByText('No runs yet.');
    const table = page.locator('table');
    await expect(emptyState.or(table).first()).toBeVisible();
  });

  test('unknown run ids get a 404', async ({ page }) => {
    const response = await page.goto('/runs/999999');
    expect(response?.status()).toBe(404);
  });
});
