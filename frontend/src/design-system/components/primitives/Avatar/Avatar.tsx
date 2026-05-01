import { useState } from 'react';
import { AvatarProps } from './AvatarProps';
import styles from './Avatar.module.scss';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('');
}

/**
 * Avatar — circular user image with initials fallback.
 * @example <Avatar name="Ada Lovelace" src="/u.png" status="online" />
 */
export function Avatar({
  src,
  name,
  size = 'md',
  status,
  className = '',
  testId,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = src && !imgFailed;
  const cls = `${styles.root} ${styles[size]} ${className}`.trim();

  return (
    <span className={styles.wrapper} data-testid={testId}>
      <span className={cls} aria-label={name}>
        {showImg ? (
          <img
            className={styles.img}
            src={src}
            alt={name}
            onError={() => setImgFailed(true)}
          />
        ) : (
          initials(name)
        )}
      </span>
      {status && <span className={`${styles.status} ${styles[status]}`} aria-label={status} />}
    </span>
  );
}

export default Avatar;
