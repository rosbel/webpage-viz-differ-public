import { expect, test } from '@playwright/test';

test.describe('New comparison form', () => {
  test('shows the form with URL inputs, paths, and viewports', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('input[name="baseA"]')).toBeVisible();
    await expect(page.locator('input[name="baseB"]')).toBeVisible();
    await expect(page.locator('textarea[name="paths"]')).toBeVisible();
    await expect(page.locator('textarea[name="paths"]')).toHaveValue('/');
    await expect(page.getByRole('checkbox', { name: /desktop/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /mobile/ })).toBeChecked();
    await expect(page.getByRole('button', { name: /^Compare/ })).toBeVisible();
  });

  test('native validation blocks invalid URLs', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[name="baseA"]', 'not-a-url');
    await page.fill('input[name="baseB"]', 'also-not-a-url');
    await page.getByRole('button', { name: /^Compare/ }).click();

    // URL inputs are required + type=url, so submission never leaves the page
    await expect(page).toHaveURL('/');
    await expect(page.locator('form')).toBeVisible();
  });

  test('submit is disabled without paths or viewports', async ({ page }) => {
    await page.goto('/');

    // Refill until the cleared value sticks — a fill that lands before
    // hydration is reset when Svelte takes over the form.
    await expect(async () => {
      await page.fill('textarea[name="paths"]', '');
      await expect(page.getByRole('button', { name: /^Compare/ })).toBeDisabled({ timeout: 500 });
    }).toPass();

    await page.fill('textarea[name="paths"]', '/');
    await page.getByRole('checkbox', { name: /desktop/ }).uncheck();
    await page.getByRole('checkbox', { name: /mobile/ }).uncheck();
    await expect(page.getByRole('button', { name: /^Compare/ })).toBeDisabled();
  });
});
