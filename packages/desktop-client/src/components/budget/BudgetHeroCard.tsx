import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  CellValue,
  CellValueText,
} from '@desktop-client/components/spreadsheet/CellValue';
import { envelopeBudget } from '@desktop-client/spreadsheet/bindings';

/**
 * A hero card for the mobile budget page that displays the monthly budget
 * summary (total budgeted and total spent).
 *
 * IMPORTANT: This component must be rendered inside a SheetNameProvider
 * that provides the current month's sheet context, as the envelope budget
 * bindings are sheet-scoped.
 */
export function BudgetHeroCard() {
  const { t } = useTranslation();

  return (
    <View
      style={{
        backgroundColor: theme.heroCardBudgetStart,
        borderLeft: `3px solid ${theme.heroCardBudgetEnd}`,
        borderRadius: 16,
        padding: '20px 24px',
        margin: '12px 16px 0',
      }}
      aria-label={t('Budget summary')}
    >
      <Text
        style={{
          color: theme.heroCardTextSubdued,
          fontSize: 14,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          marginBottom: 12,
        }}
      >
        <Trans>Monthly summary</Trans>
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <View>
          <Text
            style={{
              color: theme.heroCardTextSubdued,
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 2,
            }}
          >
            <Trans>Budgeted</Trans>
          </Text>
          <CellValue binding={envelopeBudget.totalBudgeted} type="financial">
            {props => (
              <CellValueText<
                'envelope-budget',
                typeof envelopeBudget.totalBudgeted
              >
                {...props}
                style={{
                  color: theme.heroCardText,
                  fontSize: 24,
                  fontWeight: 700,
                  lineHeight: '1.2',
                }}
              />
            )}
          </CellValue>
        </View>
        <View>
          <Text
            style={{
              color: theme.heroCardTextSubdued,
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 2,
            }}
          >
            <Trans>Spent</Trans>
          </Text>
          <CellValue binding={envelopeBudget.totalSpent} type="financial">
            {props => (
              <CellValueText<
                'envelope-budget',
                typeof envelopeBudget.totalSpent
              >
                {...props}
                style={{
                  color: theme.heroCardText,
                  fontSize: 24,
                  fontWeight: 700,
                  lineHeight: '1.2',
                }}
              />
            )}
          </CellValue>
        </View>
      </View>
    </View>
  );
}
