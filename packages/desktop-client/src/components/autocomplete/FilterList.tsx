import React from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { ItemHeader } from './ItemHeader';

export function FilterList<T extends { id: string; name: string }>({
  items,
  getItemProps,
  highlightedIndex,
  embedded,
}: {
  items: T[];
  getItemProps: (arg: { item: T }) => ComponentProps<typeof View>;
  highlightedIndex: number;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View>
      <View
        role="listbox"
        aria-label={t('Saved Filters')}
        style={{
          overflow: 'auto',
          padding: '5px 0',
          ...(!embedded && { maxHeight: 175 }),
        }}
      >
        <ItemHeader title={t('Saved Filters')} type="filter" />
        {items.map((item, idx) => {
          return [
            <div
              key={item.id}
              role="option"
              tabIndex={0}
              aria-selected={highlightedIndex === idx}
              {...(getItemProps ? getItemProps({ item }) : null)}
              style={{
                backgroundColor:
                  highlightedIndex === idx
                    ? theme.menuAutoCompleteBackgroundHover
                    : 'transparent',
                padding: 4,
                paddingLeft: 20,
                borderRadius: embedded ? 4 : 0,
                cursor: 'default',
              }}
              data-testid={`${item.name}-filter-item`}
              data-highlighted={highlightedIndex === idx || undefined}
            >
              {item.name}
            </div>,
          ];
        })}
      </View>
    </View>
  );
}
