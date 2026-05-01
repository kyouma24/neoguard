import { CSSProperties, FC, ReactNode } from 'react';
import styles from './Typography.module.scss';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps {
  level: HeadingLevel;
  children: ReactNode;
  /** Visually render as a different level (preserves semantic level). */
  as?: HeadingLevel;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

const levelToClass: Record<HeadingLevel, string> = {
  1: styles.heading1,
  2: styles.heading2,
  3: styles.heading3,
  4: styles.heading4,
  5: styles.heading4,
  6: styles.heading4,
};

export const Heading: FC<HeadingProps> = ({
  level,
  as,
  children,
  className = '',
  style,
  testId,
}) => {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const visual = as ?? level;
  const classes = [levelToClass[visual], className].filter(Boolean).join(' ');
  return (
    <Tag className={classes} style={style} data-testid={testId}>
      {children}
    </Tag>
  );
};

Heading.displayName = 'Heading';

export default Heading;
