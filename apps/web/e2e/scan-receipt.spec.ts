import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const receiptPhoto = fileURLToPath(new URL('./fixtures/receipt.jpg', import.meta.url));

const scanned = {
  receipt: {
    merchant: 'Casa Lola',
    currency: 'EUR',
    lines: [
      { name: 'Caña', quantity: 2, total: 480, confidence: 'high' },
      { name: 'Bravas', quantity: 1, total: 650, confidence: 'high' },
      { name: 'Pulpo', quantity: 1, total: 1580, confidence: 'low' },
    ],
    total: 2980,
  },
  issues: [{ type: 'total_mismatch', difference: 270 }],
  model: 'claude-haiku-5-5',
};

test('scans a receipt and asks to check the uncertain line', async ({ page }) => {
  let uploaded: { type: string | undefined; size: number } | null = null;
  await page.route('**/api/receipts/parse', async (route) => {
    const request = route.request();
    uploaded = {
      type: request.headers()['content-type'],
      size: request.postDataBuffer()?.length ?? 0,
    };
    await route.fulfill({ json: scanned });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Scan receipt' }).click();
  await page.getByTestId('gallery-input').setInputFiles(receiptPhoto);

  await expect(page.getByRole('heading', { name: 'Check the items' })).toBeVisible();
  expect(uploaded).toMatchObject({ type: 'image/jpeg' });
  expect(uploaded!.size).toBeGreaterThan(0);

  // The misread line keeps the total from adding up until it is fixed.
  await expect(page.getByRole('status')).toContainText('€2.70 missing compared to the receipt');
  await expect(page.getByRole('button', { name: 'Check 1 line first' })).toBeDisabled();

  const price = page.getByRole('textbox', { name: 'Price of Pulpo' });
  await price.fill('18,50');
  await page.getByRole('button', { name: 'Looks right' }).click();

  await expect(page.getByRole('status')).toContainText('Items add up to the receipt total');
  await page.getByRole('link', { name: 'Looks good' }).click();
  await expect(page.getByRole('heading', { name: "Who's at the table?" })).toBeVisible();
});

test('offers manual entry when the photo cannot be read', async ({ page }) => {
  await page.route('**/api/receipts/parse', (route) =>
    route.fulfill({ status: 422, json: { error: 'not_a_receipt' } }),
  );

  await page.goto('/scan');
  await page.getByTestId('camera-input').setInputFiles(receiptPhoto);

  await expect(page.getByRole('alert')).toContainText("That doesn't look like a receipt");
  await page.getByRole('button', { name: 'Enter manually' }).click();
  await expect(page.getByRole('heading', { name: 'Add the items' })).toBeVisible();
});

test('confirms every uncertain line at once', async ({ page }) => {
  await page.route('**/api/receipts/parse', (route) =>
    route.fulfill({
      json: {
        ...scanned,
        receipt: {
          ...scanned.receipt,
          lines: scanned.receipt.lines.map((line) => ({ ...line, confidence: 'low' })),
          total: 2710,
        },
      },
    }),
  );

  await page.goto('/scan');
  await page.getByTestId('gallery-input').setInputFiles(receiptPhoto);

  await expect(page.getByRole('button', { name: 'Check 3 lines first' })).toBeDisabled();
  await page.getByRole('button', { name: 'All look right' }).click();
  await expect(page.getByRole('link', { name: 'Looks good' })).toBeVisible();
});
