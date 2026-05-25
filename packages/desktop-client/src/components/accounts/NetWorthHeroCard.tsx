import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  CellValue,
  CellValueText,
} from '@desktop-client/components/spreadsheet/CellValue';
import * as bindings from '@desktop-client/spreadsheet/bindings';

export function NetWorthHeroCard() {
  const { t } = useTranslation();

  return (
    <View
      style={{
        backgroundColor: theme.heroCardNetWorthStart,
        borderRadius: 8,
        padding: '16px 20px',
        margin: '12px 16px 0',
      }}
      aria-label={t('Net worth summary')}
    >
      <Text
        style={{
          color: theme.heroCardTextSubdued,
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          marginBottom: 4,
        }}
      >
        <Trans>Total net worth</Trans>
      </Text>
      <CellValue<'account', 'accounts-balance'>
        binding={bindings.allAccountBalance()}
        type="financial"
      >
        {props => (
          <CellValueText<'account', 'accounts-balance'>
            {...props}
            style={{
              color: theme.heroCardText,
              fontSize: 26,
              fontWeight: 600,
              lineHeight: '1.2',
            }}
          />
        )}
      </CellValue>
    </View>
  );
}
