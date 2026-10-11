import { expect, test, type Page } from '@playwright/test';

async function createBill(page: Page) {
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
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('link', { name: 'See the split' }).click();
}

test('guests follow a shared bill as the owner changes it', async ({ page, browser }) => {
  await createBill(page);
  await page.getByRole('link', { name: 'Share with the table' }).click();

  await expect(page.getByRole('status')).toHaveText('Live');
  await expect(page.getByRole('img', { name: 'QR code linking to this bill' })).toBeVisible();
  const url = (await page.getByTestId('share-url').textContent())!.trim();
  expect(url).toMatch(/\/b\/[A-Za-z0-9]{10}$/);

  // A second phone, with its own storage, opens the link.
  const guestContext = await browser.newContext({ locale: 'en-US' });
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await expect(guest.getByRole('heading', { name: 'Shared bill' })).toBeVisible();
  await guest.getByRole('button', { name: 'Ben' }).click();
  await expect(guest.getByTestId('my-total')).toHaveText('€6.00');

  // The owner adds a tip; the guest sees it on the next refresh.
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('button', { name: '10%' }).click();
  await expect(guest.getByTestId('my-total')).toHaveText('€6.60', { timeout: 15_000 });

  // The guest's choice survives a reload.
  await guest.reload();
  await expect(guest.getByTestId('my-total')).toHaveText('€6.60');
  await guestContext.close();
});

test('explains when a shared bill does not exist', async ({ page }) => {
  await page.goto('/b/Unknown123');
  await expect(
    page.getByRole('heading', { name: 'This bill is no longer available' }),
  ).toBeVisible();
});
