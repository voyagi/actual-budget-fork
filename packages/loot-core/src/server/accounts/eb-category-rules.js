// [eb] EU merchant categorization rules for Enable Banking imported transactions.
// Seeded once per budget on first Enable Banking account link.
//
// Rules use imported_payee field with a 'contains' operator so they fire during
// transaction import regardless of cleaned payee names.

import { v4 as uuidv4 } from 'uuid';

import * as db from '../db';

/**
 * EU merchant patterns covering grocery chains, subscriptions, transport,
 * utilities, and shopping across major EU markets.
 *
 * Each entry maps a payee substring (case-insensitive at rule application time)
 * to a category name that must already exist in the budget.
 *
 * @type {{ payeePattern: string, categoryName: string }[]}
 */
export const EU_MERCHANT_PATTERNS = [
  // Grocery chains
  { payeePattern: 'LIDL', categoryName: 'Groceries' },
  { payeePattern: 'ALDI', categoryName: 'Groceries' },
  { payeePattern: 'CARREFOUR', categoryName: 'Groceries' },
  { payeePattern: 'REWE', categoryName: 'Groceries' },
  { payeePattern: 'TESCO', categoryName: 'Groceries' },
  { payeePattern: 'SAINSBURY', categoryName: 'Groceries' },
  { payeePattern: 'KAUFLAND', categoryName: 'Groceries' },
  { payeePattern: 'PRISMA', categoryName: 'Groceries' },
  { payeePattern: 'K-MARKET', categoryName: 'Groceries' },
  { payeePattern: 'S-MARKET', categoryName: 'Groceries' },
  { payeePattern: 'ALBERT HEIJN', categoryName: 'Groceries' },
  { payeePattern: 'JUMBO', categoryName: 'Groceries' },
  { payeePattern: 'MIGROS', categoryName: 'Groceries' },
  { payeePattern: 'COOP', categoryName: 'Groceries' },
  { payeePattern: 'MERCADONA', categoryName: 'Groceries' },
  { payeePattern: 'EROSKI', categoryName: 'Groceries' },
  { payeePattern: 'EDEKA', categoryName: 'Groceries' },
  { payeePattern: 'PENNY', categoryName: 'Groceries' },
  { payeePattern: 'NETTO', categoryName: 'Groceries' },

  // Subscriptions / streaming services
  { payeePattern: 'NETFLIX', categoryName: 'Entertainment' },
  { payeePattern: 'SPOTIFY', categoryName: 'Entertainment' },
  { payeePattern: 'AMAZON PRIME', categoryName: 'Entertainment' },
  { payeePattern: 'DISNEY+', categoryName: 'Entertainment' },
  { payeePattern: 'YOUTUBE', categoryName: 'Entertainment' },
  { payeePattern: 'HBO MAX', categoryName: 'Entertainment' },
  { payeePattern: 'APPLE.COM', categoryName: 'Entertainment' },

  // Transport
  { payeePattern: 'HSL', categoryName: 'Transport' },
  { payeePattern: ' VR ', categoryName: 'Transport' },
  { payeePattern: 'MATKAHUOLTO', categoryName: 'Transport' },
  { payeePattern: 'TRANSDEV', categoryName: 'Transport' },
  { payeePattern: 'FLIXBUS', categoryName: 'Transport' },
  { payeePattern: 'UBER', categoryName: 'Transport' },
  { payeePattern: 'BOLT', categoryName: 'Transport' },
  { payeePattern: 'LIME', categoryName: 'Transport' },
  { payeePattern: 'TIER', categoryName: 'Transport' },

  // Utilities
  { payeePattern: 'FORTUM', categoryName: 'Utilities' },
  { payeePattern: 'HELEN', categoryName: 'Utilities' },
  { payeePattern: 'VATTENFALL', categoryName: 'Utilities' },
  { payeePattern: 'ELENIA', categoryName: 'Utilities' },
  { payeePattern: 'TELIA', categoryName: 'Utilities' },
  { payeePattern: 'DNA', categoryName: 'Utilities' },
  { payeePattern: 'ELISA', categoryName: 'Utilities' },

  // Shopping
  { payeePattern: 'AMAZON', categoryName: 'Shopping' },
  { payeePattern: 'ZALANDO', categoryName: 'Shopping' },
  { payeePattern: 'H&M', categoryName: 'Shopping' },
  { payeePattern: 'IKEA', categoryName: 'Shopping' },
  { payeePattern: 'TOKMANNI', categoryName: 'Shopping' },
];

/**
 * Seeds EU merchant categorization rules into the budget database once per
 * budget. Idempotent: checks for 'eb-rules-seeded' preference key first and
 * returns early if already seeded.
 *
 * Rules are inserted into the `rules` table using the `imported_payee` field
 * with a 'contains' operator. Categories are looked up by name at seed time
 * (not by hardcoded UUID) so they adapt to the user's category setup.
 *
 * Categories that do not exist in the budget are silently skipped rather than
 * erroring - partial seeding is better than no seeding.
 */
export async function seedCategoryRules() {
  // Idempotency guard: check if already seeded
  const seeded = await db.first(
    "SELECT value FROM preferences WHERE id = 'eb-rules-seeded'",
  );

  if (seeded && seeded.value === 'true') {
    return;
  }

  for (const pattern of EU_MERCHANT_PATTERNS) {
    // Look up category by name - skip if not found (user may not have it)
    const category = await db.first(
      'SELECT id FROM categories WHERE name = ? AND tombstone = 0',
      [pattern.categoryName],
    );

    if (!category) {
      continue;
    }

    const conditions = JSON.stringify([
      {
        field: 'imported_payee',
        op: 'contains',
        value: pattern.payeePattern,
      },
    ]);

    const actions = JSON.stringify([
      {
        field: 'category',
        op: 'set',
        value: category.id,
      },
    ]);

    await db.run(
      'INSERT OR IGNORE INTO rules (id, stage, conditions_op, conditions, actions, tombstone) VALUES (?, null, ?, ?, ?, 0)',
      [uuidv4(), 'and', conditions, actions],
    );
  }

  // Mark as seeded to prevent re-running on subsequent account links
  await db.run(
    "INSERT OR REPLACE INTO preferences (id, value) VALUES ('eb-rules-seeded', 'true')",
  );
}
