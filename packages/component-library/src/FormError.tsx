import type { CSSProperties, ReactNode } from 'react';

import { View } from './View';

type FormErrorProps = {
  id?: string;
  role?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function FormError({
  id,
  role = 'alert',
  style,
  children,
}: FormErrorProps) {
  return (
    <View id={id} role={role} style={{ color: 'red', fontSize: 13, ...style }}>
      {children}
    </View>
  );
}
