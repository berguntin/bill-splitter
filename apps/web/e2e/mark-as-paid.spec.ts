import { expect, test, type Page } from '@playwright/test';

async function shareBillWithAnaAndBen(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill('Pizza');
  await page.getByRole('textbox', { name: 'Line total' }).fill('12.00');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('link', { name: "Next: who's eating" }).click();
  for (const name of ['Ana', 'Ben']) {
    await page.getByPlaceholder('Add a name').fill(name);
    await page.getByRole('button', { name: 'Add person' }).click();
  }
  await page.getByRole('link', { name: 'Continue with 2 people' }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('link', { name: 'See the split' }).click();
  await page.getByRole('link', { name: 'Share with the table' }).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const url = (await page.getByTestId('share-url').textContent())!.trim();
  await page.getByRole('link', { name: 'Back' }).click();
  return url;
}

test('guests mark their share as paid and the owner sees it live', async ({ page, browser }) => {
  const url = await shareBillWithAnaAndBen(page);
  const owes = page.getByRole('list', { name: 'What each person owes' }).getByRole('listitem');

  const guestContext = await browser.newContext({ locale: 'en-US' });
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await guest.getByRole('button', { name: 'Ben' }).click();
  await guest.getByRole('button', { name: "I've paid €6.00" }).click();
  await expect(guest.getByTestId('my-payment')).toContainText('You paid');

  // The owner's phone shows it within seconds.
  await expect(owes.nth(1).getByTestId('payment-badge')).toHaveText('Paid', { timeout: 5_000 });
  await expect(page.getByTestId('paid-count')).toHaveText('1 of 2 paid');

  // A tip after paying: both sides see what is still due.
  await page.getByRole('button', { name: '10%' }).click();
  await expect(owes.nth(1).getByTestId('payment-badge')).toHaveText('Paid €6.00 · €0.60 to go');
  await expect(guest.getByTestId('my-payment')).toContainText('Paid €6.00 · €0.60 to go', {
    timeout: 5_000,
  });
  await guest.getByRole('button', { name: "I've paid €6.60" }).click();
  await expect(owes.nth(1).getByTestId('payment-badge')).toHaveText('Paid', { timeout: 5_000 });

  // The owner notes that Ana paid in cash; the guest sees it.
  // Ana's card is the first, open by default.
  await owes.nth(0).getByRole('button', { name: 'Mark as paid' }).click();
  await expect(page.getByTestId('paid-count')).toHaveText('2 of 2 paid');
  await expect(guest.getByTestId('payment-badge')).toHaveText('Paid', { timeout: 5_000 });

  // The guest takes theirs back.
  await guest.getByTestId('my-payment').getByRole('button', { name: 'Undo' }).click();
  await expect(guest.getByRole('button', { name: "I've paid €6.60" })).toBeVisible();
  await expect(page.getByTestId('paid-count')).toHaveText('1 of 2 paid', { timeout: 5_000 });
  await guestContext.close();
});
