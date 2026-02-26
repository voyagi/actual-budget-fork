import type { Locator, Page } from "@playwright/test";

export class SelectLinkedAccountsModal {
  readonly page: Page;
  readonly heading: Locator;
  readonly instructionText: Locator;
  readonly closeButton: Locator;
  readonly footerButton: Locator;
  readonly accountTable: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: "Link Accounts" });

    this.instructionText = page.getByText(
      /We found the following accounts. Select which ones you want to add/,
    );

    this.closeButton = page.getByRole("button", { name: "Close" });

    this.footerButton = page
      .getByRole("button", {
        name: /Link|Unlink/,
      })
      .last();

    this.accountTable = page.locator('[data-testid="select-linked-accounts"]');
  }

  async waitToLoad() {
    await this.heading.waitFor({ state: "visible", timeout: 10000 });
  }

  /**
   * Get the "Set up bank sync" button for a specific account by name.
   */
  getSetupButton(accountName: string) {
    return this.page
      .locator("tr, [style]")
      .filter({ hasText: accountName })
      .getByRole("button", { name: "Set up bank sync" });
  }

  /**
   * Get the "Remove bank sync" button for a specific account by name.
   */
  getRemoveButton(accountName: string) {
    return this.page
      .locator("tr, [style]")
      .filter({ hasText: accountName })
      .getByRole("button", { name: "Remove bank sync" });
  }

  /**
   * Get the "Link account" button in mobile card layout for a specific account.
   */
  getLinkAccountButton(accountName: string) {
    return this.page
      .locator("[style]")
      .filter({ hasText: accountName })
      .getByRole("button", { name: "Link account" });
  }

  /**
   * Click "Set up bank sync" for a specific external account to open
   * the account selection dropdown.
   */
  async clickSetupBankSync(accountName: string) {
    await this.getSetupButton(accountName).click();
  }

  /**
   * Click "Remove bank sync" for a specific external account.
   */
  async clickRemoveBankSync(accountName: string) {
    await this.getRemoveButton(accountName).click();
  }

  /**
   * Select an Actual account option from the dropdown.
   */
  async selectActualAccount(optionName: string) {
    await this.page.getByRole("option", { name: optionName }).first().click();
  }

  /**
   * Click the footer action button (Link accounts / Unlink accounts / etc.)
   */
  async clickFooterAction() {
    await this.footerButton.click();
  }

  async close() {
    await this.closeButton.click();
  }
}
