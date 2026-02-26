import type { Locator, Page } from "@playwright/test";

export class BankSyncPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly emptyStateText: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: "Bank Sync" });

    this.emptyStateText = page.getByText(
      /To use the bank syncing features, you must first add an account/,
    );
  }

  async waitToLoad() {
    await this.page.waitForSelector("text=Bank Sync", { timeout: 10000 });
  }

  /**
   * Get an account row by account name.
   */
  getAccountRow(accountName: string) {
    return this.page.locator('[data-testid="row"]').filter({
      hasText: accountName,
    });
  }

  /**
   * Get the Edit button for a specific account.
   */
  getEditButton(accountName: string) {
    return this.getAccountRow(accountName).getByRole("button", {
      name: "Edit",
    });
  }

  /**
   * Get the Link account button for a specific account.
   */
  getLinkButton(accountName: string) {
    return this.getAccountRow(accountName).getByRole("button", {
      name: "Link account",
    });
  }

  /**
   * Get the last sync text for a specific account.
   */
  getLastSyncCell(accountName: string) {
    return this.getAccountRow(accountName).locator('[data-testid="lastSync"]');
  }

  /**
   * Check if a provider group header is visible.
   */
  getProviderHeader(providerName: string) {
    return this.page.getByText(providerName, { exact: true });
  }
}
