import { Colors } from './types';

/**
 * NeoNXT Brand Palette (per Brand Guidelines 2025).
 *
 * Brand keys (used in gradient-brand):
 *   indigo  #1310A4
 *   purple  #5E0792
 *   magenta #CD0063
 *   red     #F20F07
 *   orange  #FF4000
 *
 * Primary palette is derived around brand indigo.
 * Secondary palette is derived around brand purple.
 * Accent palette is derived around brand orange.
 */
export const colors: Colors = {
  primary: {
    '50':  '#ecebff',
    '100': '#d2d0fb',
    '200': '#a6a2f5',
    '300': '#7a72ee',
    '400': '#4d3fd6',
    '500': '#1310A4',
    '600': '#100d8a',
    '700': '#0d0a70',
    '800': '#0a0856',
    '900': '#07053c',
  },
  secondary: {
    '50':  '#f4eafa',
    '100': '#e3c9f1',
    '200': '#c896e3',
    '300': '#a663d3',
    '400': '#823bba',
    '500': '#5E0792',
    '600': '#4d067a',
    '700': '#3c0561',
    '800': '#2b0448',
    '900': '#1a022f',
  },
  accent: {
    '50':  '#fff0e8',
    '500': '#FF4000',
    '900': '#330d00',
  },
  success: {
    '500': '#22c55e',
    '600': '#16a34a',
  },
  danger: {
    '500': '#ef4444',
    '600': '#dc2626',
  },
  warning: {
    '500': '#eab308',
    '600': '#ca8a04',
  },
  info: {
    '500': '#3b82f6',
    '600': '#2563eb',
  },
  neutral: {
    '0':   '#ffffff',
    '50':  '#f9fafb',
    '100': '#f3f4f6',
    '200': '#e5e7eb',
    '300': '#d1d5db',
    '400': '#9ca3af',
    '500': '#6b7280',
    '600': '#4b5563',
    '700': '#374151',
    '800': '#1f2937',
    '900': '#111827',
  },
};

/** Brand colors exposed for gradients and special accents (active states, CTAs). */
export const brandColors = {
  indigo:  '#1310A4',
  purple:  '#5E0792',
  magenta: '#CD0063',
  red:     '#F20F07',
  orange:  '#FF4000',
} as const;

/** Brand gradient — hero headers, primary CTAs, active accents. */
export const gradientBrand =
  'linear-gradient(90deg, #1310A4 0%, #5E0792 25%, #CD0063 55%, #F20F07 80%, #FF4000 100%)';
