import { Transitions } from './types';

export const transitions: Transitions = {
  fast: {
    duration: '150ms',
    easing: 'cubic-bezier(0.4, 0, 1, 1)',
  },
  normal: {
    duration: '300ms',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  slow: {
    duration: '500ms',
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};
