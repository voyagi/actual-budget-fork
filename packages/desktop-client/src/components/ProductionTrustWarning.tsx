import { useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgAlertTriangle } from '@actual-app/components/icons/v2';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import {
  type ProductionTrustCondition,
  useProductionTrustStatus,
} from '@desktop-client/hooks/useProductionTrustStatus';

const conditionLabelKeys: Record<ProductionTrustCondition, string> = {
  access: 'access',
  persistence: 'persistence',
  multi_device_sync: 'multi-device sync',
  bank_sync: 'bank sync',
};

export function ProductionTrustWarning() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const { state, isChecking, runAutomatedCheck } = useProductionTrustStatus();

  if (!state || state.isTrusted || state.activeConditions.length === 0) {
    return null;
  }

  const activeLabels = state.activeConditions.map(condition =>
    t(conditionLabelKeys[condition.condition]),
  );

  return (
    <View
      role="status"
      style={{
        marginTop: isNarrowWidth ? 0 : 36,
        padding: isNarrowWidth ? '8px 12px' : '9px 16px',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: theme.warningBackground,
        color: theme.warningTextDark,
        borderBottom: `1px solid ${theme.warningBorder}`,
        position: 'relative',
        zIndex: 2,
      }}
    >
      <SvgAlertTriangle
        style={{
          width: 16,
          height: 16,
          flexShrink: 0,
          color: theme.warningTextDark,
        }}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            ...styles.mediumText,
            fontWeight: 700,
            lineHeight: '1.35em',
          }}
        >
          {t('Production readiness needs verification')}
        </Text>
        <Text style={{ ...styles.smallText, lineHeight: '1.35em' }}>
          {t('Untrusted checks: {{conditions}}', {
            conditions: activeLabels.join(', '),
          })}
        </Text>
      </View>

      {state.canRunAutomatedCheck && (
        <ButtonWithLoading
          variant="bare"
          isLoading={isChecking}
          onPress={() => runAutomatedCheck()}
          style={{
            flexShrink: 0,
            border: `1px solid ${theme.warningBorder}`,
            color: theme.warningTextDark,
            minHeight: isNarrowWidth ? styles.mobileMinHeight : undefined,
          }}
        >
          {t('Check again')}
        </ButtonWithLoading>
      )}
    </View>
  );
}
