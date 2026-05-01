// Components — re-export everything via tier index
export * from './components';

// Tokens
export * as tokens from './tokens';
export type {
  Typography,
  Colors,
  Spacing,
  Shadows,
  ZIndex,
  Transitions,
} from './tokens';

// Hooks
export * from './hooks';

// Base classes (utility, not a component tier)
export { BaseComponent, StyleComposer } from './components/base';
export type {
  IComponent,
  ComponentProps,
  VariantMap,
  StyleComposerConfig,
} from './components/base';

// Side-effect: global styles
import './styles/index.css';
