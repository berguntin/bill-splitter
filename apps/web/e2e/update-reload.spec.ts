import { expect, test } from '@playwright/test';

test('reloads into the new version when a screen from an old deploy is gone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill('Pizza');
  await page.getByRole('textbox', { name: 'Line total' }).fill('12');
  await page.getByRole('button', { name: 'Add item' }).click();

  // Simulate a deploy: the next screen's chunk from the old build no longer exists.
  let served404 = false;
  await page.route('**/assets/DinersView-*.js', async (route) => {
    if (served404) return route.continue();
    served404 = true;
    await route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html>' });
  });

  await page.getByRole('link', { name: "Next: who's eating" }).click();

  await expect(page.getByRole('heading', { name: "Who's at the table?" })).toBeVisible();
  expect(served404).toBe(true);
  // The bill survived the reload.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByText('Pizza')).toBeVisible();
});
