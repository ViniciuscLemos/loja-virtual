import { expect, test, type Page } from '@playwright/test';

// each test makes its own account, so they don't depend on each other
const newEmail = () => `buyer-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function signUp(page: Page) {
  const email = newEmail();
  await page.goto('/register');
  await page.getByLabel('Name').fill('Ana Souza');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Confirm your email to place orders')).toBeVisible();
  return email;
}

// opens the confirmation email in the demo inbox and follows its link
async function confirmEmail(page: Page) {
  await page.goto('/inbox');
  await page.getByRole('button', { name: /Confirm your email/ }).click();
  const link = page.frameLocator('iframe').getByRole('link', { name: /confirm/i });
  const href = await link.getAttribute('href');
  expect(href).toContain('/verify-email?token=');
  await page.goto(href!);
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
}

test('a visitor browses, filters and opens a product', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Things for people who build things' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(12);

  await page.getByRole('button', { name: 'Mugs', exact: true }).click();
  await expect(page).toHaveURL(/category=Mugs/);
  // waits for the filtered list (2 mugs in the sample data) before reading it,
  // otherwise it could still read the cards of the unfiltered list
  const cards = page.locator('.product-card');
  await expect(cards).toHaveCount(2);
  for (const text of await cards.allInnerTexts()) expect(text).toContain('Mugs');

  await page.getByRole('link', { name: /Classic Coffee Mug/ }).click();
  await expect(page.getByRole('heading', { name: 'Classic Coffee Mug' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Mugs');
  await expect(page.getByRole('heading', { name: 'More in Mugs' })).toBeVisible();
});

test('adding to the cart while logged out goes to the login', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Desk Plant to the cart' }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test("can't check out before confirming the email", async ({ page }) => {
  await signUp(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Desk Plant to the cart' }).click();
  await expect(page.getByText('Desk Plant added to the cart.')).toBeVisible();

  await page.goto('/cart');
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeDisabled();
});

test('full purchase: sign up, confirm email, cart, pay and the order email', async ({ page }) => {
  await signUp(page);
  await confirmEmail(page);

  // two units of the mug from the card, one plant from the product page
  await page.goto('/');
  const addMug = page.getByRole('button', { name: 'Add Classic Coffee Mug to the cart' });
  await addMug.click();
  await expect(page.getByText('Classic Coffee Mug added to the cart.')).toBeVisible();
  await addMug.click();
  await expect(page.getByRole('link', { name: 'Cart, 2 items' })).toBeVisible();

  await page.goto('/products/desk-plant');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('link', { name: 'Cart, 3 items' })).toBeVisible();

  await page.goto('/cart');
  await expect(page.locator('.cart-list li')).toHaveCount(2);
  // 2 x $14.90 + $21.90
  await expect(page.locator('.summary')).toContainText('$51.70');

  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Pay $51.70' })).toBeVisible();
  await page.getByRole('button', { name: /Pay \$51\.70/ }).click();

  await expect(page.getByText('Payment confirmed!')).toBeVisible();
  await expect(page.locator('.status')).toHaveText('Paid');
  await expect(page.locator('.steps li.done')).toHaveCount(2);
  // the cart is empty after paying
  await expect(page.getByRole('link', { name: 'Cart, 0 items' })).toBeVisible();

  await page.goto('/inbox');
  await expect(page.getByRole('button', { name: /confirmed/ })).toBeVisible();
});

test('the stock goes down after an order', async ({ page }, testInfo) => {
  // the server (and its stock) is shared by the desktop and phone runs, so this one runs once
  test.skip(testInfo.project.name !== 'desktop', 'changes the stock of the shared server');
  // Dev Cap starts with 3 in the sample data
  await page.goto('/products/dev-cap');
  await expect(page.getByText('Only 3 left')).toBeVisible();

  await signUp(page);
  await confirmEmail(page);
  await page.goto('/products/dev-cap');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('link', { name: 'Cart, 2 items' })).toBeVisible();
  await page.goto('/cart');
  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: /Pay/ }).click();
  await expect(page.getByText('Payment confirmed!')).toBeVisible();

  await page.goto('/products/dev-cap');
  await expect(page.getByText('Only 1 left')).toBeVisible();
});
