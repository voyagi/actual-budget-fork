import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { ConfigurationPage } from "./page-models/configuration-page";
import { SelectLinkedAccountsModal } from "./page-models/select-linked-accounts-modal";

/**
 * Mock Enable Banking account data matching SyncServerEnableBankingAccount type.
 * Used to open the Select Linked Accounts modal via Redux dispatch.
 */
const MOCK_EB_ACCOUNTS = [
  {
    account_id: "eb-uid-checking-001",
    name: "Checking Account",
    institution: "Danske Bank",
    mask: "1234",
    official_name: "Personal Checking DKK",
    balance: 150075,
    iban: "DK5000400440116243",
    session_id: "mock-session-001",
  },
  {
    account_id: "eb-uid-savings-002",
    name: "Savings Account",
    institution: "Danske Bank",
    mask: "5678",
    official_name: "High Yield Savings",
    balance: 500000,
    iban: "DK5000400440116244",
    session_id: "mock-session-001",
  },
  {
    account_id: "eb-uid-nobalance-003",
    name: "Joint Account",
    institution: "Nordea",
    mask: "9012",
    official_name: null,
    balance: null,
    iban: "DK9520000123456789",
    session_id: "mock-session-001",
  },
];

test.describe("Select Linked Accounts - Enable Banking", () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let modal: SelectLinkedAccountsModal;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.goto("/");
    await configurationPage.createTestFile();

    // Open Select Linked Accounts modal directly via Redux dispatch
    // with mock Enable Banking account data
    await page.evaluate((accounts) => {
      window.__actionsForMenu.pushModal({
        modal: {
          name: "select-linked-accounts",
          options: {
            externalAccounts: accounts,
            syncSource: "enableBanking",
          },
        },
      });
    }, MOCK_EB_ACCOUNTS);

    modal = new SelectLinkedAccountsModal(page);
    await modal.waitToLoad();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test("displays modal with correct heading and instructions", async () => {
    await expect(modal.heading).toBeVisible();
    await expect(modal.instructionText).toBeVisible();
  });

  test("displays all external accounts", async () => {
    await expect(page.getByText("Checking Account")).toBeVisible();
    await expect(page.getByText("Savings Account")).toBeVisible();
    await expect(page.getByText("Joint Account")).toBeVisible();
  });

  test("displays institution names", async () => {
    await expect(page.getByText("Danske Bank").first()).toBeVisible();
    await expect(page.getByText("Nordea")).toBeVisible();
  });

  test("displays balance for accounts with balance", async () => {
    // Account with balance should show formatted amount
    await expect(page.getByText("1,500.75")).toBeVisible();
    await expect(page.getByText("5,000.00")).toBeVisible();
  });

  test('displays "Unknown" for accounts without balance', async () => {
    await expect(page.getByText("Unknown")).toBeVisible();
  });

  test('shows "Set up bank sync" button for each unlinked account', async () => {
    const setupButtons = page.getByRole("button", {
      name: "Set up bank sync",
    });
    await expect(setupButtons).toHaveCount(3);
  });

  test("footer button is disabled when no changes made", async () => {
    await expect(modal.footerButton).toBeDisabled();
  });

  test('shows account selector when clicking "Set up bank sync"', async () => {
    await modal.clickSetupBankSync("Checking Account");

    // Should show "Create new account" options in the dropdown
    await expect(page.getByRole("option", { name: "Create new account" }).first()).toBeVisible();
  });

  test('selecting "Create new account" shows starting date and balance fields', async () => {
    await modal.clickSetupBankSync("Checking Account");
    await modal.selectActualAccount("Create new account");

    // Starting date input should appear
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test('selecting "Create new account (off budget)" shows starting fields', async () => {
    await modal.clickSetupBankSync("Savings Account");

    await page.getByRole("option", { name: "Create new account (off budget)" }).click();

    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test('footer button shows "Link accounts" after selecting an account', async () => {
    await modal.clickSetupBankSync("Checking Account");
    await modal.selectActualAccount("Create new account");

    await expect(page.getByRole("button", { name: "Link accounts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Link accounts" })).toBeEnabled();
  });

  test('shows "Remove bank sync" after linking then unlinking', async () => {
    // First link an account
    await modal.clickSetupBankSync("Checking Account");
    await modal.selectActualAccount("Create new account");

    // Now there should be a "Remove bank sync" button for that account
    await expect(page.getByRole("button", { name: "Remove bank sync" }).first()).toBeVisible();
  });

  test("footer button label updates based on actions", async () => {
    // Link one account
    await modal.clickSetupBankSync("Checking Account");
    await modal.selectActualAccount("Create new account");

    // Should show "Link accounts"
    await expect(page.getByRole("button", { name: "Link accounts" })).toBeVisible();
  });

  test("can close modal", async () => {
    await modal.close();
    await expect(modal.heading).not.toBeVisible();
  });

  test("displays table headers on desktop", async () => {
    await expect(page.getByText("Institution to Sync")).toBeVisible();
    await expect(page.getByText("Bank Account To Sync")).toBeVisible();
    await expect(page.getByText("Balance", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Account in Actual")).toBeVisible();
    await expect(page.getByText("Actions", { exact: true })).toBeVisible();
  });

  test("checks the page visuals", async () => {
    await expect(page).toMatchThemeScreenshots();
  });
});

test.describe("Select Linked Accounts - Enable Banking (Mobile)", () => {
  let page: Page;
  let configurationPage: ConfigurationPage;
  let modal: SelectLinkedAccountsModal;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    configurationPage = new ConfigurationPage(page);

    await page.setViewportSize({
      width: 350,
      height: 600,
    });

    await page.goto("/");
    await configurationPage.createTestFile();

    // Open modal with mock data
    await page.evaluate((accounts) => {
      window.__actionsForMenu.pushModal({
        modal: {
          name: "select-linked-accounts",
          options: {
            externalAccounts: accounts,
            syncSource: "enableBanking",
          },
        },
      });
    }, MOCK_EB_ACCOUNTS);

    modal = new SelectLinkedAccountsModal(page);
    await modal.waitToLoad();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test("displays card layout on mobile", async () => {
    // On mobile, accounts are shown as cards not table rows
    await expect(page.getByText("Checking Account")).toBeVisible();
    await expect(page.getByText("Savings Account")).toBeVisible();
    await expect(page.getByText("Joint Account")).toBeVisible();

    // Cards should show "Not linked" text
    await expect(page.getByText("Not linked").first()).toBeVisible();
  });

  test('shows "Link account" button in card layout', async () => {
    const linkButtons = page.getByRole("button", { name: "Link account" });
    await expect(linkButtons.first()).toBeVisible();
  });

  test("shows balance label on mobile cards", async () => {
    await expect(page.getByText("Balance:").first()).toBeVisible();
  });

  test("clicking link account opens account selector on mobile", async () => {
    await modal.getLinkAccountButton("Checking Account").click();

    await expect(page.getByPlaceholder("Select account...")).toBeVisible();
  });

  test("footer button is full width on mobile", async () => {
    // First make a change so the button is enabled
    await modal.getLinkAccountButton("Checking Account").click();
    await modal.selectActualAccount("Create new account");

    const footerBtn = page.getByRole("button", { name: "Link accounts" });
    await expect(footerBtn).toBeVisible();
  });

  test("shows starting date options in stacked layout on mobile", async () => {
    await modal.getLinkAccountButton("Checking Account").click();
    await modal.selectActualAccount("Create new account");

    // Stacked layout shows labels
    await expect(page.getByText("Starting date:").first()).toBeVisible();
    await expect(page.getByText("Balance on that date:").first()).toBeVisible();
  });

  test("checks the mobile visuals", async () => {
    await expect(page).toMatchThemeScreenshots();
  });
});
