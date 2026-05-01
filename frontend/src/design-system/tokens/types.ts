export interface ColorPalette {
  [key: string]: string;
}

export interface Colors {
  primary: ColorPalette;
  secondary: ColorPalette;
  accent: ColorPalette;
  success: ColorPalette;
  danger: ColorPalette;
  warning: ColorPalette;
  info: ColorPalette;
  neutral: ColorPalette;
}

export interface Spacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
}

export interface Typography {
  fontFamily: {
    primary: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
  };
  fontWeight: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface Shadows {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ZIndex {
  base: number;
  dropdown: number;
  modal: number;
  tooltip: number;
  notification: number;
}

export interface Transitions {
  fast: { duration: string; easing: string };
  normal: { duration: string; easing: string };
  slow: { duration: string; easing: string };
}
