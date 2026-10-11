import { expect, test, type Page } from '@playwright/test';

async function splitPizzaBetween(page: Page, names: string[]) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill('Pizza');
  await page.getByRole('textbox', { name: 'Line total' }).fill('15.00');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('link', { name: "Next: who's eating" }).click();
  for (const name of names) {
    await page.getByPlaceholder('Add a name').fill(name);
    await page.getByRole('button', { name: 'Add person' }).click();
  }
  await page.getByRole('link', { name: `Continue with ${names.length} people` }).click();
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('link', { name: 'See the split' }).click();
}

function payerRows(page: Page) {
  return page.getByRole('list', { name: 'What each person owes' }).getByRole('listitem');
}

test('groups people who pay together, and every step can be undone', async ({ page, browser }) => {
  await splitPizzaBetween(page, ['Ana', 'Ben', 'Cleo']);
  await expect(payerRows(page)).toHaveCount(3);

  // Ana and Cleo are a couple.
  await page.getByRole('button', { name: 'Pay together' }).click();
  await expect(page.getByRole('button', { name: 'Pick 2 or more' })).toBeDisabled();
  await page.getByRole('button', { name: /Ana/ }).click();
  await page.getByRole('button', { name: /Cleo/ }).click();
  await page.getByRole('button', { name: 'Pay together (2)' }).click();

  await expect(payerRows(page)).toHaveCount(2);
  await expect(payerRows(page).first()).toContainText('Ana & Cleo');
  await expect(payerRows(page).first()).toContainText('€10.00');
  await expect(page.getByRole('status')).toContainText('Ana & Cleo pay together');

  // Undo from the notice.
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(payerRows(page)).toHaveCount(3);

  // Group again, then pay separately, then undo that from the header.
  await page.getByRole('button', { name: 'Pay together' }).click();
  await page.getByRole('button', { name: /Ana/ }).click();
  await page.getByRole('button', { name: /Cleo/ }).click();
  await page.getByRole('button', { name: 'Pay together (2)' }).click();
  await page.getByRole('button', { name: 'Pay separately' }).click();
  await expect(payerRows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect(payerRows(page)).toHaveCount(2);

  // The group survives a reload and reaches guests.
  await page.reload();
  await expect(payerRows(page).first()).toContainText('Ana & Cleo');
  await page.getByRole('link', { name: 'Share with the table' }).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const url = (await page.getByTestId('share-url').textContent())!.trim();

  const guestContext = await browser.newContext({ locale: 'en-US' });
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await guest.getByRole('button', { name: 'Ana' }).click();
  await expect(guest.getByTestId('my-total')).toHaveText('€5.00');
  await expect(guest.getByTestId('my-group')).toContainText('Paying together with Cleo');
  await expect(guest.getByTestId('my-group')).toContainText('€10.00');
  await guestContext.close();
});
