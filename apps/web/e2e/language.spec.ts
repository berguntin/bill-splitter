import { expect, test } from '@playwright/test';

test.use({ locale: 'es-ES' });

test('speaks Spanish to Spanish browsers, and remembers a switch to English', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Divide la cuenta');

  await page.getByRole('button', { name: 'Introducir a mano' }).click();
  await expect(page.getByRole('heading', { name: 'Añade los productos' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Producto', exact: true }).fill('Pizza');
  await page.getByRole('textbox', { name: 'Importe' }).fill('12,00');
  await page.getByRole('button', { name: 'Añadir producto' }).click();
  await expect(page.getByRole('status')).toContainText('1 producto');
  await page.getByRole('link', { name: 'Siguiente: quién come' }).click();
  for (const name of ['Ana', 'Ben']) {
    await page.getByPlaceholder('Añade un nombre').fill(name);
    await page.getByRole('button', { name: 'Añadir persona' }).click();
  }
  await page.getByRole('link', { name: 'Continuar con 2 personas' }).click();
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await page.getByRole('link', { name: 'Ver el reparto' }).click();
  await expect(page.getByRole('heading', { name: 'El reparto' })).toBeVisible();
  // Amounts follow the browser's number format.
  await expect(page.getByRole('list', { name: 'Lo que debe cada uno' })).toContainText('6,00 €');

  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Split the bill');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Scan receipt' })).toBeVisible();
});
