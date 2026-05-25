import React from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';

import { fraction } from './fraction';
import { PieProgress } from './PieProgress';

import type { CellValue } from '@desktop-client/components/spreadsheet/CellValue';
import { useSheetValue } from '@desktop-client/hooks/useSheetValue';

type IncomeProgressProps = {
  current: ComponentProps<typeof CellValue>['binding'];
  target: ComponentProps<typeof CellValue>['binding'];
};
export function IncomeProgress({ current, target }: IncomeProgressProps) {
  const { t } = useTranslation();
  let totalIncome = useSheetValue(current) || 0;
  const totalBudgeted = useSheetValue(target) || 0;

  let over = false;

  if (totalIncome < 0) {
    over = true;
    totalIncome = -totalIncome;
  }

  const frac = fraction(totalIncome, totalBudgeted);
  const percent = Math.round(frac * 100);

  return (
    <PieProgress
      progress={frac}
      color={over ? theme.numberNegative : theme.numberPositive}
      backgroundColor={over ? theme.errorBackground : theme.budgetCurrentMonth}
      style={{ width: 20, height: 20 }}
      aria-label={
        over
          ? t('Income is negative: {{percent}}%', { percent })
          : t('Income received: {{percent}}%', { percent })
      }
    />
  );
}
