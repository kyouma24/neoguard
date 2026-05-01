import { useCallback, useState } from 'react';

export interface ModalState<T = unknown> {
  isOpen: boolean;
  /** Optional payload — useful for "view this id" patterns. */
  data: T | null;
  open: (data?: T) => void;
  close: () => void;
}

/**
 * useModal — boolean state + payload for one-off modals/dialogs/drawers.
 *
 * @example
 * const editor = useModal<Item>();
 * <Button onClick={() => editor.open(item)}>Edit</Button>
 * <EditModal isOpen={editor.isOpen} item={editor.data} onClose={editor.close} />
 */
export function useModal<T = unknown>(): ModalState<T> {
  const [isOpen, setOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const open = useCallback((payload?: T) => {
    setData(payload ?? null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setData(null);
  }, []);

  return { isOpen, data, open, close };
}
