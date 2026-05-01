/**
 * Lead Group Create — consumes FormScreen template.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { FormScreen } from '../FormScreen';
import { Input } from '../../primitives/Input';
import { Textarea } from '../../primitives/Textarea';

const meta: Meta = {
  title: 'Patterns/Screens/Lead Group Create',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    return (
      <FormScreen
        title="New lead group"
        subtitle="Reusable list of leads — assign to campaigns or filter dashboards"
        sections={[
          { title: 'Identity', columns: 1, fields: [
            { label: 'Name', htmlFor: 'lgc-name', required: true, hint: 'Shown across filters and campaign assignment dropdowns',
              control: <Input id="lgc-name" placeholder="e.g. Q3 priority — NA-West" value={name} onChange={(e) => setName(e.target.value)} /> },
            { label: 'Description', htmlFor: 'lgc-desc', hint: 'Optional — explains who belongs',
              control: <Textarea rows={4} value={description} onChange={setDescription} /> },
          ]},
        ]}
        actions={{
          align: 'right',
          cancel: { label: 'Cancel' },
          primary: { label: 'Create group', onClick: () => alert(`POST /api/groups\n${JSON.stringify({ name, description }, null, 2)}`) },
        }}
      />
    );
  },
};
