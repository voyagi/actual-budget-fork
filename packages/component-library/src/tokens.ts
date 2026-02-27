enum BreakpointNames {
  small = 'small',
  medium = 'medium',
  wide = 'wide',
}

type NumericBreakpoints = {
  [key in BreakpointNames]: number;
};

export const breakpoints: NumericBreakpoints = {
  small: 512,
  medium: 730,
  wide: 1100,
};

type BreakpointsPx = {
  [B in keyof NumericBreakpoints as `breakpoint_${B}`]: string;
};

// Provide the same breakpoints in a form usable by CSS media queries
// {
//   breakpoint_small: '512px',
//   breakpoint_medium: '740px',
//   breakpoint_wide: '1100px',
// }
export const tokens: BreakpointsPx & DesignTokens = {
  ...Object.entries(breakpoints).reduce<BreakpointsPx>(
    (acc, [key, val]) => ({
      ...acc,
      [`breakpoint_${key}`]: `${val}px`,
    }),
    {} as BreakpointsPx,
  ),
  // Border radius
  radius_small: '4px',
  radius_medium: '8px',
  radius_large: '16px',
  radius_full: '999px',
  // Shadow patterns (combine with a theme shadow color)
  shadow_small: '0 2px 4px 0',
  shadow_medium: '0 4px 12px',
  shadow_large: '0 15px 30px 0',
  // Spacing
  spacing_xs: '4px',
  spacing_sm: '8px',
  spacing_md: '16px',
  spacing_lg: '24px',
  spacing_xl: '32px',
};

type DesignTokens = {
  radius_small: string;
  radius_medium: string;
  radius_large: string;
  radius_full: string;
  shadow_small: string;
  shadow_medium: string;
  shadow_large: string;
  spacing_xs: string;
  spacing_sm: string;
  spacing_md: string;
  spacing_lg: string;
  spacing_xl: string;
};
