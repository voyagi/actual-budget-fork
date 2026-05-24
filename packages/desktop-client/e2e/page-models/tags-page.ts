import type { Locator, Page } from '@playwright/test';

export class TagsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly addNewButton: Locator;
  readonly findExistingButton: Locator;
  readonly filterInput: Locator;
  readonly emptyState: Locator;
  readonly tagTable: Locator;
  readonly newTagRow: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { name: 'Tags' });
    this.addNewButton = page.getByRole('button', { name: 'Add New' });
    this.findExistingButton = page.getByRole('button', {
      name: 'Find Existing Tags',
    });
    this.filterInput = page.getByPlaceholder('Filter tags...');
    this.emptyState = page.getByText('No Tags');
    this.tagTable = page.locator('[class*="tableContainer"]');
    this.newTagRow = page.getByTestId('new-tag');
  }

  async fillNewTagName(name: string) {
    await this.newTagRow.locator('input[placeholder="New tag"]').fill(name);
  }

  async fillNewTagDescription(description: string) {
    await this.newTagRow
      .locator('input[placeholder="Tag description"]')
      .fill(description);
  }

  async submitNewTag() {
    await this.newTagRow.getByTestId('add-button').click();
  }

  async cancelNewTag() {
    await this.newTagRow.getByTestId('close-button').click();
  }

  getTagRow(tagName: string) {
    return this.page.getByRole('row').filter({ hasText: tagName });
  }

  async selectAllTags() {
    await this.page.locator('[data-testid="select-cell"]').first().click();
  }

  getDeleteButton(count: number) {
    return this.page.getByRole('button', {
      name: new RegExp(`Delete ${count} tags?`), // nosemgrep: detect-non-literal-regexp -- e2e test with controlled test data
    });
  }
}
