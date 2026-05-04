import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionTrustWarning } from './ProductionTrustWarning';

import type { ProductionTrustState } from '@desktop-client/hooks/useProductionTrustStatus';
import { useProductionTrustStatus } from '@desktop-client/hooks/useProductionTrustStatus';
import { TestProviders } from '@desktop-client/mocks';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      let text = key;
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.replace(`{{${name}}}`, value);
      }
      return text;
    },
  }),
}));

vi.mock('@actual-app/components/hooks/useResponsive', () => ({
  useResponsive: () => ({
    atLeastMediumWidth: true,
    isNarrowWidth: false,
    isSmallWidth: false,
    isMediumWidth: true,
    isWideWidth: false,
    height: 900,
    width: 1200,
  }),
}));

vi.mock('@desktop-client/hooks/useProductionTrustStatus', () => ({
  useProductionTrustStatus: vi.fn(),
}));

function makeProductionTrustState(
  override: Partial<ProductionTrustState>,
): ProductionTrustState {
  return {
    isTrusted: true,
    activeConditions: [],
    conditions: [],
    lastCheckedAt: '2026-05-04T10:00:00.000Z',
    canRunAutomatedCheck: true,
    ...override,
  };
}

describe('ProductionTrustWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render after all production trust conditions are verified', () => {
    vi.mocked(useProductionTrustStatus).mockReturnValue({
      state: makeProductionTrustState({ isTrusted: true }),
      isLoading: false,
      isChecking: false,
      refresh: vi.fn(),
      runAutomatedCheck: vi.fn(),
      verifyManually: vi.fn(),
    });

    const { container } = render(<ProductionTrustWarning />, {
      wrapper: TestProviders,
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders a persistent aggregate warning for active trust failures', () => {
    vi.mocked(useProductionTrustStatus).mockReturnValue({
      state: makeProductionTrustState({
        isTrusted: false,
        activeConditions: [
          {
            condition: 'access',
            status: 'untrusted',
            reason: 'unverified',
            message: 'Access has not been verified.',
            lastCheckedAt: '2026-05-04T10:00:00.000Z',
            lastVerifiedAt: null,
            recoverySource: null,
            evidence: null,
          },
          {
            condition: 'bank_sync',
            status: 'untrusted',
            reason: 'sync_failed',
            message: 'Bank sync failed.',
            lastCheckedAt: '2026-05-04T10:00:00.000Z',
            lastVerifiedAt: null,
            recoverySource: null,
            evidence: null,
          },
        ],
      }),
      isLoading: false,
      isChecking: false,
      refresh: vi.fn(),
      runAutomatedCheck: vi.fn(),
      verifyManually: vi.fn(),
    });

    render(<ProductionTrustWarning />, { wrapper: TestProviders });

    expect(
      screen.getByText('Production readiness needs verification'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Untrusted checks: access, bank sync'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /close|dismiss/i }),
    ).not.toBeInTheDocument();
  });

  it('reruns the automated production trust check from the warning', async () => {
    const runAutomatedCheck = vi.fn();
    vi.mocked(useProductionTrustStatus).mockReturnValue({
      state: makeProductionTrustState({
        isTrusted: false,
        activeConditions: [
          {
            condition: 'bank_sync',
            status: 'untrusted',
            reason: 'sync_stale',
            message: 'Latest bank sync is stale.',
            lastCheckedAt: '2026-05-04T10:00:00.000Z',
            lastVerifiedAt: null,
            recoverySource: null,
            evidence: null,
          },
        ],
      }),
      isLoading: false,
      isChecking: false,
      refresh: vi.fn(),
      runAutomatedCheck,
      verifyManually: vi.fn(),
    });

    render(<ProductionTrustWarning />, { wrapper: TestProviders });

    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));

    expect(runAutomatedCheck).toHaveBeenCalledTimes(1);
  });
});
