import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://dev-mvlearn.verificient.com/login/index.php');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('***');
  await page.getByRole('textbox', { name: 'Username' }).press('Tab');
  await page.getByRole('textbox', { name: 'Password' }).fill('***');
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  await page.getByRole('menuitem', { name: 'My courses' }).click();
  await page.getByRole('link', { name: 'Course name License Renewal' }).click();
  await page.getByRole('link', { name: 'Begin Course (English)' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'Restart' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('navigation', { name: 'slide navigation' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().locator('.slide-object').first().click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'previous' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'next' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('navigation', { name: 'slide navigation' }).dblclick();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().locator('#focus-sink').click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('navigation', { name: 'slide navigation' }).dblclick();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'replay' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().locator('#focus-sink').click({
    clickCount: 3
  });
  await page.getByRole('link', { name: 'Exit activity' }).click();
  await page.getByRole('link', { name: 'Begin Course (English)' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'Resume' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'next' }).click();
  await page.getByRole('link', { name: 'Exit activity' }).click();
  await page.getByRole('link', { name: 'Begin Course (English)' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('link', { name: 'Exit activity' }).click();
  await page.getByRole('link', { name: 'Begin Course (English)' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'Resume' }).click();
  await page.locator('iframe[title="Driver\'s License Renewal Course"]').contentFrame().getByRole('button', { name: 'Exit' }).click();
  await page.getByRole('link', { name: 'Exit activity' }).click();
});