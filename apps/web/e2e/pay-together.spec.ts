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

test('guests can say who pays together, and the owner sees it', async ({ page, browser }) => {
  await splitPizzaBetween(page, ['Ana', 'Ben', 'Cleo']);
  await page.getByRole('link', { name: 'Share with the table' }).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const url = (await page.getByTestId('share-url').textContent())!.trim();
  await page.getByRole('link', { name: 'Back' }).click();

  const guestContext = await browser.newContext({ locale: 'en-US' });
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await guest.getByRole('button', { name: 'Ben' }).click();

  // Ben covers Cleo.
  await guest.getByRole('button', { name: 'Pay together' }).click();
  const picker = guest.getByRole('list', { name: 'Pick who pays together' });
  await picker.getByRole('button', { name: /Ben/ }).click();
  await picker.getByRole('button', { name: /Cleo/ }).click();
  await guest.getByRole('button', { name: 'Pay together (2)' }).click();
  await expect(guest.getByTestId('my-group')).toContainText('Paying together with Cleo');
  await expect(guest.getByTestId('my-group')).toContainText('€10.00');

  // The owner's phone picks it up.
  await expect(payerRows(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(payerRows(page).nth(1)).toContainText('Ben & Cleo');

  // The guest changes their mind; the owner follows.
  await guest.getByRole('button', { name: 'Undo' }).first().click();
  await expect(guest.getByTestId('my-group')).toHaveCount(0);
  await expect(payerRows(page)).toHaveCount(3, { timeout: 15_000 });

  // A group the owner makes reaches the guest.
  await page.getByRole('button', { name: 'Pay together' }).click();
  await page.getByRole('button', { name: /Ana/ }).click();
  await page.getByRole('button', { name: /Ben/ }).click();
  await page.getByRole('button', { name: 'Pay together (2)' }).click();
  await expect(guest.getByTestId('my-group')).toContainText('Paying together with Ana', {
    timeout: 15_000,
  });
  await guestContext.close();
});

test('the owner keeps syncing after a reload, before opening the share screen', async ({
  page,
  browser,
}) => {
  await splitPizzaBetween(page, ['Ana', 'Ben']);
  await page.getByRole('link', { name: 'Share with the table' }).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const url = (await page.getByTestId('share-url').textContent())!.trim();
  await page.getByRole('link', { name: 'Back' }).click();
  await page.reload();

  const guestContext = await browser.newContext({ locale: 'en-US' });
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await guest.getByRole('button', { name: 'Ana' }).click();
  await expect(guest.getByTestId('my-total')).toHaveText('€7.50');

  await page.getByRole('button', { name: '10%' }).click();
  await expect(guest.getByTestId('my-total')).toHaveText('€8.25', { timeout: 15_000 });
  await guestContext.close();
});
