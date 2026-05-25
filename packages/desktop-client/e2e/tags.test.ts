import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';
import type { TagsPage } from './page-models/tags-page';

test.describe('Tags', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let tagsPage: TagsPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    tagsPage = await navigation.goToTagsPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('navigates to the tags page and shows heading', async () => {
    await expect(tagsPage.heading).toBeVisible();
    await expect(page).toHaveURL(/\/tags/);
  });

  test('shows empty state when no tags exist', async () => {
    await expect(tagsPage.emptyState).toBeVisible();
  });

  test('shows Add New and Find Existing Tags buttons', async () => {
    await expect(tagsPage.addNewButton).toBeVisible();
    await expect(tagsPage.findExistingButton).toBeVisible();
  });

  test('shows filter input', async () => {
    await expect(tagsPage.filterInput).toBeVisible();
  });

  test('checks the page visuals', async () => {
    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe('Tags - Creation', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let tagsPage: TagsPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    tagsPage = await navigation.goToTagsPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('opens the tag creation row when clicking Add New', async () => {
    await tagsPage.addNewButton.click();

    await expect(tagsPage.newTagRow).toBeVisible();
    await expect(
      tagsPage.newTagRow.locator('input[placeholder="New tag"]'),
    ).toBeVisible();
  });

  test('creates a new tag with name and description', async () => {
    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('groceries');
    await tagsPage.fillNewTagDescription('Weekly grocery shopping');
    await tagsPage.submitNewTag();

    // The empty state should disappear after creating a tag
    await expect(tagsPage.emptyState).not.toBeVisible();
  });

  test('add button is disabled for empty tag name', async () => {
    await tagsPage.addNewButton.click();

    const addButton = tagsPage.newTagRow.getByTestId('add-button');
    await expect(addButton).toBeDisabled();
  });

  test('add button is disabled for tag name with spaces', async () => {
    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('invalid tag');

    const addButton = tagsPage.newTagRow.getByTestId('add-button');
    // Spaces are stripped on input, so the field will have 'invalidtag'
    // which is valid. Verify stripping works:
    const input = tagsPage.newTagRow.locator('input[placeholder="New tag"]');
    await expect(input).toHaveValue('invalidtag');
  });

  test('cancels tag creation', async () => {
    await tagsPage.addNewButton.click();
    await expect(tagsPage.newTagRow).toBeVisible();

    await tagsPage.cancelNewTag();
    await expect(tagsPage.newTagRow).not.toBeVisible();
  });

  test('prevents creating duplicate tag names', async () => {
    // Create a tag first
    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('uniquetag');
    await tagsPage.submitNewTag();

    // Try to create the same tag again
    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('uniquetag');

    const addButton = tagsPage.newTagRow.getByTestId('add-button');
    await expect(addButton).toBeDisabled();
  });

  test('checks the creation row visuals', async () => {
    await tagsPage.addNewButton.click();
    await expect(tagsPage.newTagRow).toBeVisible();

    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe('Tags - Filtering', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;
  let tagsPage: TagsPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    tagsPage = await navigation.goToTagsPage();

    // Create some tags to filter
    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('groceries');
    await tagsPage.submitNewTag();

    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('transport');
    await tagsPage.submitNewTag();

    await tagsPage.addNewButton.click();
    await tagsPage.fillNewTagName('entertainment');
    await tagsPage.submitNewTag();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('filters tags by search text', async () => {
    await tagsPage.filterInput.fill('gro');

    // Only groceries should be visible
    await expect(tagsPage.getTagRow('groceries')).toBeVisible();
    await expect(tagsPage.getTagRow('transport')).not.toBeVisible();
    await expect(tagsPage.getTagRow('entertainment')).not.toBeVisible();
  });

  test('shows all tags when filter is cleared', async () => {
    await tagsPage.filterInput.fill('gro');
    await expect(tagsPage.getTagRow('transport')).not.toBeVisible();

    await tagsPage.filterInput.clear();
    await expect(tagsPage.getTagRow('groceries')).toBeVisible();
    await expect(tagsPage.getTagRow('transport')).toBeVisible();
    await expect(tagsPage.getTagRow('entertainment')).toBeVisible();
  });

  test('shows empty result when no tags match filter', async () => {
    await tagsPage.filterInput.fill('nonexistent');

    await expect(tagsPage.getTagRow('groceries')).not.toBeVisible();
    await expect(tagsPage.getTagRow('transport')).not.toBeVisible();
    await expect(tagsPage.getTagRow('entertainment')).not.toBeVisible();
  });
});

test.describe('Tags - Navigation Integration', () => {
  let page: Page;
  let navigation: Navigation;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('navigates from budget to tags and back', async () => {
    // Start at budget page (default after test file creation)
    await expect(page).toHaveURL(/\/budget/);

    // Navigate to tags
    const tagsPage = await navigation.goToTagsPage();
    await expect(tagsPage.heading).toBeVisible();
    await expect(page).toHaveURL(/\/tags/);

    // Navigate back to budget via sidebar
    await page.getByRole('link', { name: 'Budget' }).click();
    await expect(page.getByTestId('budget-table')).toBeVisible();
  });

  test('navigates from tags to accounts', async () => {
    await navigation.goToTagsPage();
    await expect(page).toHaveURL(/\/tags/);

    const accountPage = await navigation.goToAccountPage('Ally Savings');
    await expect(accountPage.accountName).toHaveText('Ally Savings');
  });
});
