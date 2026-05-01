import { ComponentProps } from '../../base';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends ComponentProps {
  /** Image URL. If absent or fails to load, initials render. */
  src?: string;
  /** Display name — used for initials fallback + alt text. */
  name: string;
  size?: AvatarSize;
  /** Show online status dot. */
  status?: 'online' | 'offline' | 'away' | 'busy';
}
