import React, { FC } from 'react';
import { NavBarProps } from './NavBarProps';
import styles from './NavBar.module.scss';

export const NavBar: FC<NavBarProps> = ({
  logo,
  links,
  onLinkClick,
  className = '',
  testId,
}: NavBarProps): React.JSX.Element => {
  const handleLinkClick = (href: string): void => {
    if (onLinkClick) {
      onLinkClick(href);
    }
  };

  const navBarClasses = [styles.navbar, className].filter(Boolean).join(' ');

  return (
    <nav className={navBarClasses} data-testid={testId}>
      {logo && <div className={styles.logo}>{logo}</div>}
      <ul className={styles.navLinks}>
        {links.map((link): React.JSX.Element => {
          const linkClasses = [
            styles.navLink,
            link.active && styles.active,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={link.href}>
              <a
                href={link.href}
                className={linkClasses}
                onClick={(e): void => {
                  e.preventDefault();
                  handleLinkClick(link.href);
                }}
              >
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

NavBar.displayName = 'NavBar';
