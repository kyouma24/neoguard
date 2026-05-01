import { ComponentProps } from '../../base/IComponent';

export interface NavLink {
  href: string;
  label: string;
  active?: boolean;
}

export interface NavBarProps extends ComponentProps {
  logo?: React.ReactNode;
  links: NavLink[];
  onLinkClick?: (href: string) => void;
}
