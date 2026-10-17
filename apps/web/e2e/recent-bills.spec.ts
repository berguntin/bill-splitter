import { expect, test, type Page } from '@playwright/test';

async function splitOneItem(page: Page, item: string, total: string, person: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill(item);
  await page.getByRole('textbox', { name: 'Line total' }).fill(total);
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('link', { name: "Next: who's eating" }).click();
  await page.getByPlaceholder('Add a name').fill(person);
  await page.getByRole('button', { name: 'Add person' }).click();
  await page.getByRole('link', { name: 'Continue with 1 person' }).click();
  await page.getByRole('button', { name: person, exact: true }).click();
  await page.getByRole('link', { name: 'See the split' }).click();
  await expect(page.getByRole('heading', { name: 'The split' })).toBeVisible();
}

test('keeps recent bills on the device and reopens them as they were', async ({ page }) => {
  await splitOneItem(page, 'Pizza', '12.00', 'Ana');
  await splitOneItem(page, 'Sushi', '30.00', 'Ben');

  await page.goto('/');
  const recent = page.getByRole('list', { name: 'Recent bills' }).getByRole('listitem');
  await expect(recent).toHaveCount(1);
  await expect(recent.first()).toContainText('€12.00');

  // They survive a reload.
  await page.reload();
  await expect(recent).toHaveCount(1);

  // Opening the Pizza bill goes straight to its split; the Sushi one moves to the list.
  await recent
    .first()
    .getByRole('button', { name: /€12\.00/ })
    .click();
  await expect(page.getByRole('heading', { name: 'The split' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'What each person owes' }).getByRole('button', { name: /Ana/ }),
  ).toContainText('€12.00');

  await page.goto('/');
  await expect(recent).toHaveCount(1);
  await expect(recent.first()).toContainText('€30.00');

  // Removing can be undone.
  await recent
    .first()
    .getByRole('button', { name: /^Remove/ })
    .click();
  await expect(recent).toHaveCount(0);
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(recent).toHaveCount(1);
});
