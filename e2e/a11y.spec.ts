import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// automatic accessibility check (contrast, labels, landmarks, alt text...) on the pages,
// in light and dark mode

async function audit(page: Page) {
  await page.waitForLoadState('networkidle');
  // the email preview in the inbox is a sandboxed iframe with the email's own HTML, not part of the app
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .exclude('.inbox iframe')
    .analyze();
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.message ?? ''}`).join(', ')})`);
}

const PUBLIC_PAGES = ['/', '/products/merge-conflict-hoodie', '/login', '/register', '/forgot-password', '/nothing-here'];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const path of PUBLIC_PAGES) {
      test(`no accessibility problems on ${path}`, async ({ page }) => {
        await page.goto(path);
        expect(await audit(page)).toEqual([]);
      });
    }

    test('no accessibility problems on the logged in pages', async ({ page }) => {
      await page.goto('/register');
      await page.getByLabel('Name').fill('Ana Souza');
      await page.getByLabel('Email').fill(`a11y-${scheme}-${Date.now()}@example.com`);
      await page.getByLabel('Password').fill('e2e-password-123');
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByText('Confirm your email to place orders')).toBeVisible();

      await page.goto('/inbox');
      await page.getByRole('button', { name: /Confirm your email/ }).click();
      const href = await page.frameLocator('iframe').getByRole('link', { name: /confirm/i }).getAttribute('href');
      expect(await audit(page)).toEqual([]);
      await page.goto(href!);
      await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();

      await page.goto('/');
      await page.getByRole('button', { name: 'Add Sticker Pack to the cart' }).click();
      await page.goto('/cart');
      expect(await audit(page)).toEqual([]);

      await page.getByRole('button', { name: 'Checkout' }).click();
      await expect(page.getByRole('heading', { name: /Pay/ })).toBeVisible();
      expect(await audit(page)).toEqual([]);

      await page.getByRole('button', { name: /Pay/ }).click();
      await expect(page.getByText('Payment confirmed!')).toBeVisible();
      expect(await audit(page)).toEqual([]);

      await page.goto('/orders');
      expect(await audit(page)).toEqual([]);
    });
  });
}
