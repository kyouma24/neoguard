import React, { useEffect, useRef, ReactNode } from 'react';
import styles from './Modal.module.scss';
import { ModalProps } from './ModalProps';

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  footer,
  closeButton = true,
  size = 'md',
  children,
  className = '',
  testId,
}: ModalProps): ReactNode => {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscapeKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    return (): void => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  // Handle overlay click to close modal
  const handleOverlayClick = (
    event: React.MouseEvent<HTMLDivElement>
  ): void => {
    if (event.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const sizeClass = styles[size];
  const modalClasses = [styles.modal, sizeClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
      data-testid={testId}
    >
      <div className={modalClasses}>
        {/* Header */}
        {(title || closeButton) && (
          <div className={styles.header}>
            {title && <h2 className={styles.title}>{title}</h2>}
            {closeButton && (
              <button
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>{children}</div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
