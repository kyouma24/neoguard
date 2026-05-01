import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Popover } from './index';

describe('Popover', () => {
  it('hidden by default', () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <div>panel content</div>
      </Popover>,
    );
    expect(screen.queryByText('panel content')).not.toBeInTheDocument();
  });

  it('opens on trigger click', async () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <div>panel content</div>
      </Popover>,
    );
    await userEvent.click(screen.getByText('Open'));
    expect(screen.getByText('panel content')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(
      <Popover trigger={<button>Open</button>}>
        <div>panel content</div>
      </Popover>,
    );
    await userEvent.click(screen.getByText('Open'));
    expect(screen.getByText('panel content')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('panel content')).not.toBeInTheDocument();
  });
});
