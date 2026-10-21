import { expect, test, type Page } from '@playwright/test';

function itemCard(page: Page, name: string) {
  return page.getByRole('list', { name: 'Items' }).getByRole('listitem').filter({ hasText: name });
}

test('splits a bill entered by hand and keeps it after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();

  // Step 1: items.
  const addItem = async (name: string, total: string, quantity = 1) => {
    await page.getByRole('textbox', { name: 'Item', exact: true }).fill(name);
    await page.getByRole('spinbutton', { name: 'Qty' }).fill(String(quantity));
    await page.getByRole('textbox', { name: 'Line total' }).fill(total);
    await page.getByRole('button', { name: 'Add item' }).click();
  };
  await addItem('Pizza', '12,00');
  await addItem('Wine', '9.00', 2);
  await addItem('Water', '3');
  await page.getByRole('textbox', { name: /Receipt total/ }).fill('24.00');
  await page.getByRole('textbox', { name: /Receipt total/ }).blur();
  await expect(page.getByRole('status')).toContainText('Items add up to the receipt total');
  await page.getByRole('link', { name: "Next: who's eating" }).click();

  // Step 2: people.
  for (const name of ['Ana', 'Ben']) {
    await page.getByPlaceholder('Add a name').fill(name);
    await page.getByRole('button', { name: 'Add person' }).click();
  }
  await page.getByRole('link', { name: 'Continue with 2 people' }).click();

  // Step 3: assign.
  await expect(page.getByRole('button', { name: '3 items left to assign' })).toBeDisabled();
  await itemCard(page, 'Pizza').getByRole('button', { name: 'All' }).click();
  await itemCard(page, 'Wine').getByRole('button', { name: 'By units' }).click();
  // Items are assigned one person at a time, starting with the first one.
  await expect(page.getByRole('radio', { name: /Ana/ })).toBeChecked();
  await itemCard(page, 'Wine').getByRole('button', { name: 'One more for Ana' }).click();
  await page.getByRole('button', { name: 'Next: Ben' }).click();
  await expect(page.getByRole('radio', { name: /Ben/ })).toBeChecked();
  await itemCard(page, 'Wine').getByRole('button', { name: 'One more for Ben' }).click();
  await page.getByRole('radio', { name: /Ana/ }).click();
  await itemCard(page, 'Water').getByRole('button', { name: 'Ana had Water' }).click();
  await expect(
    itemCard(page, 'Water').getByRole('button', { name: 'Ana had Water' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Undo the last tap and redo it, to cover the undo button.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: '1 item left to assign' })).toBeVisible();
  await itemCard(page, 'Water').getByRole('button', { name: 'Ana had Water' }).click();
  await page.getByRole('link', { name: 'See the split' }).click();

  // Summary: 12.00 shared, 4.50 wine each, water for Ana, plus a 10% tip.
  const owes = page.getByRole('list', { name: 'What each person owes' });
  await expect(owes.getByRole('button', { name: /Ana/ })).toContainText('€13.50');
  await expect(owes.getByRole('button', { name: /Ben/ })).toContainText('€10.50');

  await page.getByRole('button', { name: '10%' }).click();
  await expect(page.getByText('€26.40')).toBeVisible();
  await expect(owes.getByRole('button', { name: /Ana/ })).toContainText('€14.85');
  await expect(owes.getByRole('button', { name: /Ben/ })).toContainText('€11.55');

  await page.reload();
  await expect(owes.getByRole('button', { name: /Ana/ })).toContainText('€14.85');
  await expect(page.getByRole('button', { name: '10%' })).toHaveAttribute('aria-pressed', 'true');
});
