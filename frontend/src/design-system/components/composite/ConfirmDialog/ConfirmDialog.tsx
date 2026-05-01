import { Modal } from '../Modal';
import { Button } from '../../primitives/Button';
import { ConfirmDialogProps } from './ConfirmDialogProps';
import styles from './ConfirmDialog.module.scss';

const TONE_TO_VARIANT: Record<NonNullable<ConfirmDialogProps['tone']>, 'primary' | 'danger' | 'secondary'> = {
  info: 'primary',
  danger: 'danger',
  warning: 'secondary',
};

/**
 * ConfirmDialog — small Modal for destructive or important confirmations.
 * @example
 * <ConfirmDialog
 *   isOpen={open}
 *   title="Delete record?"
 *   description="This cannot be undone."
 *   tone="danger"
 *   onConfirm={destroy}
 *   onCancel={() => setOpen(false)}
 * />
 */
export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'info',
  loading = false,
  testId,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm" testId={testId}>
      {description && <div className={styles.body}>{description}</div>}
      <div className={styles.footer}>
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={TONE_TO_VARIANT[tone]}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
