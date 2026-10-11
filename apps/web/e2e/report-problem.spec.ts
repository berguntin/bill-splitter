import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const receiptPhoto = fileURLToPath(new URL('./fixtures/receipt.jpg', import.meta.url));

test('reports a failed scan with its reference, the photo and technical context', async ({
  page,
}) => {
  await page.route('**/api/receipts/parse', (route) =>
    route.fulfill({ status: 502, json: { error: 'upstream_error' } }),
  );

  await page.goto('/scan');
  await page.getByTestId('gallery-input').setInputFiles(receiptPhoto);
  await expect(page.getByRole('alert')).toContainText('Something went wrong on our side');
  const shown = await page.getByRole('alert').getByText('Ref.').textContent();
  const reference = shown!.match(/[0-9A-Z]{4}-[0-9A-Z]{4}/)![0];

  await page.getByRole('link', { name: 'Report this problem' }).click();
  await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Reading the receipt' })).toBeChecked();
  await expect(page.getByText(reference)).toBeAttached();

  await page.getByRole('textbox', { name: 'What happened?' }).fill('The scan failed twice.');
  await page.getByRole('textbox', { name: /Email/ }).fill('ana@example.com');
  await page.getByRole('checkbox', { name: /The receipt photo/ }).check();

  const sent = page.waitForRequest('**/api/reports');
  await page.getByRole('button', { name: 'Send report' }).click();
  const body = (await sent).postDataJSON();

  expect(body).toMatchObject({
    description: 'The scan failed twice.',
    email: 'ana@example.com',
    topic: 'scan',
    context: {
      route: '/scan',
      screen: 'scan',
      errorRef: reference.replace('-', ''),
      lastScan: { ok: false, error: 'server' },
      recentRequests: [{ method: 'POST', path: '/api/receipts/parse', status: 502 }],
    },
    attachments: [{ kind: 'receipt', mediaType: 'image/jpeg' }],
  });
  await expect(page.getByRole('status')).toContainText('Thanks, we got it');
  await expect(page.getByText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)).toBeVisible();

  await page.getByRole('button', { name: 'Back to the app' }).click();
  await expect(page).toHaveURL(/\/scan$/);
});

test('attaches the current bill with names replaced', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter items manually' }).click();
  await page.getByRole('textbox', { name: 'Item', exact: true }).fill('Pizza');
  await page.getByRole('textbox', { name: 'Line total' }).fill('12');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByRole('link', { name: "Next: who's eating" }).click();
  await page.getByPlaceholder('Add a name').fill('Ana');
  await page.getByRole('button', { name: 'Add person' }).click();

  await page.getByRole('link', { name: 'Report a problem' }).click();
  await expect(page.getByRole('radio', { name: 'Splitting the bill' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /The current bill/ })).toBeChecked();
  await page.getByRole('textbox', { name: 'What happened?' }).fill('Ana cannot be removed.');

  const sent = page.waitForRequest('**/api/reports');
  await page.getByRole('button', { name: 'Send report' }).click();
  const body = (await sent).postDataJSON();

  expect(body.bill.diners).toEqual([expect.objectContaining({ name: 'Person 1' })]);
  expect(body.bill.items).toEqual([expect.objectContaining({ name: 'Pizza', total: 1200 })]);
  expect(JSON.stringify(body)).not.toContain('Ana"');
  await expect(page.getByRole('status')).toContainText('Thanks, we got it');
});
