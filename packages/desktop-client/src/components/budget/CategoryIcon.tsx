import type { CSSProperties } from 'react';

import { View } from '@actual-app/components/view';

// Theme-independent decorative colors for category icon backgrounds.
// Intentionally not in palette.ts — these don't change with theme switching.
const ICON_COLORS = [
  '#C8E64C', // yellow-green
  '#2DD4A8', // teal
  '#4FC3F7', // blue
  '#FF6B8A', // pink
  '#7B61FF', // purple
  '#3EBD93', // green
  '#F5E35D', // orange-yellow
  '#F86A6A', // red
];

const MIN_FONT_SIZE = 11;

function getContrastTextColor(bgHex: string): string {
  const r = parseInt(bgHex.slice(1, 3), 16) / 255;
  const g = parseInt(bgHex.slice(3, 5), 16) / 255;
  const b = parseInt(bgHex.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1A1A2E' : '#FFFFFF';
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

type CategoryIconProps = {
  name: string;
  icon?: string | null;
  color?: string | null;
  size?: number;
  style?: CSSProperties;
};

export function CategoryIcon({
  name,
  icon,
  color,
  size = 32,
  style,
}: CategoryIconProps) {
  const bgColor = color || ICON_COLORS[hashString(name) % ICON_COLORS.length];
  const displayChar = icon || name.charAt(0).toUpperCase();
  const rawFontSize = icon ? size * 0.5 : size * 0.45;
  const fontSize = Math.max(rawFontSize, MIN_FONT_SIZE);

  return (
    <View
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 600,
          color: getContrastTextColor(bgColor),
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {displayChar}
      </span>
    </View>
  );
}
