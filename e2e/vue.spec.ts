import { test, expect } from '@playwright/test'

test('shows Richards family and friendship connections', async ({ page }) => {
  await page.goto('/people')
  await page.getByRole('button', { name: /Richard van der Meer/ }).click()
  await page.getByRole('button', { name: 'Connecties' }).click()

  const connections = page.locator('.connections-layout')
  await expect(connections.getByRole('heading', { name: 'Familie' })).toBeVisible()
  await expect(connections.getByText('Henk van der Meer')).toBeVisible()
  await expect(connections.getByText('Els van der Meer')).toBeVisible()
  await expect(connections.getByText('Sophie van der Meer')).toBeVisible()
  await expect(connections.getByText('Emma van der Meer')).toBeVisible()
  await expect(connections.getByText('Lucas van der Meer')).toBeVisible()
  await expect(connections.getByRole('heading', { name: 'Vrienden' })).toBeVisible()
  await expect(connections.getByText('Robin Chen')).toBeVisible()
})

test('opens the dashboard with today first and the personal menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Richard')
  await expect(page.getByText('Emma is jarig')).toBeVisible()

  await page.getByRole('button', { name: 'Jouw menu' }).click()
  await page.getByRole('menuitem', { name: 'Mijn profiel' }).click()
  await expect(page.getByText('Dit ben jij')).toBeVisible()
})

test('filters upcoming items by type', async ({ page }) => {
  await page.goto('/upcoming')
  await expect(page.getByText('Emma is jarig')).toBeVisible()
  await page.getByRole('button', { name: 'Verjaardagen' }).click()
  await expect(page.getByText('Emma is jarig')).toHaveCount(0)
  await expect(page.getByText('Taart ophalen voor Emma')).toBeVisible()
})
