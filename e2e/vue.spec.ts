import { test, expect } from '@playwright/test'

// See here how to get started:
// https://playwright.dev/docs/intro
test('shows Richards family and friendship connections', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Richard van der Meer/ }).click()
  await page.getByRole('button', { name: 'Connecties' }).click()

  await expect(page.getByRole('heading', { name: 'Familie' })).toBeVisible()
  await expect(page.getByText('Henk van der Meer')).toBeVisible()
  await expect(page.getByText('Els van der Meer')).toBeVisible()
  await expect(page.getByText('Sophie van der Meer')).toBeVisible()
  await expect(page.getByText('Emma van der Meer')).toBeVisible()
  await expect(page.getByText('Lucas van der Meer')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vrienden' })).toBeVisible()
  await expect(page.getByText('Robin Chen')).toBeVisible()
})
