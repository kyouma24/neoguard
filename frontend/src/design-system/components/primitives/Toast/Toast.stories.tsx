import type { Meta, StoryObj } from '@storybook/react';
import { ToastProvider, useToast } from './index';
import { Button } from '../Button';

const meta: Meta = {
  title: 'Primitives/Toast',
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj;

function Demo() {
  const toast = useToast();
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Button variant="primary" onClick={() => toast.success('Saved successfully')}>Success</Button>
      <Button variant="secondary" onClick={() => toast.show('FYI: cache cleared', { tone: 'info', title: 'Heads up' })}>Info</Button>
      <Button variant="ghost" onClick={() => toast.warning('Disk space low')}>Warn</Button>
      <Button variant="danger" onClick={() => toast.danger('Operation failed', { title: 'Error', durationMs: 0 })}>Persist danger</Button>
    </div>
  );
}

export const Demo$: Story = {
  name: 'Demo',
  render: () => (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  ),
};
