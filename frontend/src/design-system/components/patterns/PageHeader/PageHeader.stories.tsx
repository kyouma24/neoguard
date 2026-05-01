import type { Meta, StoryObj } from '@storybook/react';
import { PageHeader } from './index';
import { Button } from '../../primitives/Button';

const meta: Meta<typeof PageHeader> = {
  title: 'Patterns/PageHeader',
  component: PageHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {
    title: 'Companies',
    subtitle: 'Manage company records across your CRM',
    actions: <Button variant="primary">+ New Company</Button>,
  },
};

export const TitleOnly: Story = { args: { title: 'Settings' } };
export const WithBreadcrumbs: Story = {
  args: {
    title: 'Acme Corp',
    subtitle: 'acme.com · SaaS · 120 employees',
    breadcrumbs: 'Companies / Acme Corp',
    actions: <Button variant="secondary">Edit</Button>,
  },
};
