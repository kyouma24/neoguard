import type { Meta, StoryObj } from '@storybook/react';
import { FormLayout, FormField, FormSection, FormActions } from './index';
import { Input } from '../../primitives/Input';
import { Textarea } from '../../primitives/Textarea';
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/FormLayout',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <form style={{ maxWidth: '36rem' }}>
      <FormSection title="Profile" description="Public-facing record details.">
        <FormLayout>
          <FormField label="Name" required hint="Display name across the app.">
            <Input placeholder="Acme Corp" />
          </FormField>
          <FormField label="Domain">
            <Input placeholder="acme.com" />
          </FormField>
          <FormField label="Industry">
            <Input placeholder="SaaS" />
          </FormField>
          <FormField label="Headcount" error="Must be a positive number">
            <Input type="number" />
          </FormField>
          <FormField label="Description" full>
            <Textarea rows={4} placeholder="One-paragraph profile…" />
          </FormField>
        </FormLayout>
      </FormSection>

      <FormActions align="between">
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Save</Button>
      </FormActions>
    </form>
  ),
};
