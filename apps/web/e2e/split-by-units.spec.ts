import { expect, test } from '@playwright/test';

test('splits a multi-unit line by how many units each person had', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill('Beer');
  await page.getByRole('spinbutton', { name: 'Qty' }).fill('5');
  await page.getByRole('textbox', { name: 'Line total' }).fill('10.00');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('link', { name: "Next: who's eating" }).click();
  for (const name of ['Ana', 'Ben', 'Cleo']) {
    await page.getByPlaceholder('Add a name').fill(name);
    await page.getByRole('button', { name: 'Add person' }).click();
  }
  await page.getByRole('link', { name: 'Continue with 3 people' }).click();

  await page.getByRole('button', { name: 'By units' }).click();
  await expect(page.getByText('5 of 5 still to claim')).toBeVisible();
  await page.getByRole('button', { name: 'One more for Ana' }).click();
  await page.getByRole('radio', { name: /Ben/ }).click();
  await page.getByRole('button', { name: 'One more for Ben' }).click();
  await page.getByRole('button', { name: 'One more for Ben' }).click();
  await expect(page.getByText('2 of 5 still to claim')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 item left to assign' })).toBeDisabled();

  await page.getByRole('radio', { name: /Cleo/ }).click();
  await page.getByRole('button', { name: 'One more for Cleo' }).click();
  await page.getByRole('button', { name: 'One more for Cleo' }).click();
  // Every unit is claimed: no more can be added.
  await expect(page.getByRole('button', { name: 'One more for Cleo' })).toBeDisabled();
  await expect(page.getByText('Ana ×1 · Ben ×2 · Cleo ×2')).toBeVisible();

  // Undo takes back the last unit.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('units-Cleo')).toHaveText('1');
  await page.getByRole('button', { name: 'One more for Cleo' }).click();

  await page.getByRole('link', { name: 'See the split' }).click();
  const rows = page.getByRole('list', { name: 'What each person owes' }).getByRole('listitem');
  await expect(rows.nth(0)).toContainText('€2.00');
  await expect(rows.nth(0)).toContainText('1× Beer');
  await expect(rows.nth(1)).toContainText('€4.00');
  await expect(rows.nth(2)).toContainText('€4.00');
});
