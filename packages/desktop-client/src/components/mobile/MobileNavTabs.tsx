import { useCallback, useState } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgCog,
  SvgPiggyBank,
  SvgReports,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { animated, config, useSpring } from '@react-spring/web';

import { useScrollListener } from '@desktop-client/hooks/useScrollListener';

const TAB_COUNT = 4;
const ROW_HEIGHT = 56;
const HIDDEN_Y = ROW_HEIGHT;

export const MOBILE_NAV_HEIGHT = ROW_HEIGHT;

export function MobileNavTabs() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const [navbarState, setNavbarState] = useState<'default' | 'hidden'>(
    'default',
  );

  const navTabStyle = {
    flex: `1 1 ${100 / TAB_COUNT}%`,
    height: ROW_HEIGHT,
    padding: 10,
    maxWidth: `${100 / TAB_COUNT}%`,
  };

  const [{ y }, api] = useSpring(() => ({ y: 0 }));

  const show = useCallback(
    (velocity = 0) => {
      setNavbarState('default');
      api.start({
        y: 0,
        immediate: false,
        config: { ...config.stiff, velocity },
      });
    },
    [api],
  );

  const hide = useCallback(
    (velocity = 0) => {
      setNavbarState('hidden');
      api.start({
        y: HIDDEN_Y,
        immediate: false,
        config: { ...config.stiff, velocity },
      });
    },
    [api],
  );

  const navTabs = [
    {
      name: t('Budget'),
      path: '/budget',
      style: navTabStyle,
      Icon: SvgWallet,
    },
    {
      name: t('Accounts'),
      path: '/accounts',
      style: navTabStyle,
      Icon: SvgPiggyBank,
    },
    {
      name: t('Reports'),
      path: '/reports',
      style: navTabStyle,
      Icon: SvgReports,
    },
    {
      name: t('Settings'),
      path: '/settings',
      style: navTabStyle,
      Icon: SvgCog,
    },
  ].map(tab => <NavTab key={tab.path} {...tab} />);

  useScrollListener(
    useCallback(
      ({ isScrolling, hasScrolledToEnd }) => {
        if (isScrolling('down') && !hasScrolledToEnd('up')) {
          hide();
        } else if (isScrolling('up') && !hasScrolledToEnd('down')) {
          show();
        }
      },
      [hide, show],
    ),
  );

  return (
    <animated.div
      role="navigation"
      style={{
        y,
        touchAction: 'pan-x',
        backgroundColor: theme.mobileNavBackground,
        borderTop: `1px solid ${theme.menuBorder}`,
        ...styles.shadow,
        height: ROW_HEIGHT,
        width: '100%',
        position: 'fixed',
        zIndex: 100,
        bottom: 0,
        ...(!isNarrowWidth && { display: 'none' }),
      }}
      data-navbar-state={navbarState}
    >
      <View
        style={{
          flexDirection: 'row',
          height: ROW_HEIGHT,
          width: '100%',
        }}
      >
        {navTabs}
      </View>
    </animated.div>
  );
}

type NavTabIconProps = {
  width: number;
  height: number;
  style?: CSSProperties;
};

type NavTabProps = {
  name: string;
  path: string;
  Icon: ComponentType<NavTabIconProps>;
  style?: CSSProperties;
};

function NavTab({ Icon: TabIcon, name, path, style }: NavTabProps) {
  return (
    <NavLink
      to={path}
      style={({ isActive }) => ({
        ...styles.noTapHighlight,
        alignItems: 'center',
        color: isActive ? theme.mobileNavItemSelected : theme.mobileNavItem,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textDecoration: 'none',
        textAlign: 'center',
        textWrap: 'balance',
        userSelect: 'none',
        fontSize: 12,
        gap: 4,
        ...style,
      })}
    >
      <TabIcon width={24} height={24} style={{ minHeight: '24px' }} />
      {name}
    </NavLink>
  );
}
