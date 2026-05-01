/**
 * Trigger Enrichment dialog — Storybook composition. Wire to
 * POST /api/enrichment/trigger.
 */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { Modal } from '../../composite/Modal';
import { FormLayout, FormField, FormActions } from '../FormLayout';
import { Combobox } from '../../composite/Combobox';
import { Input } from '../../primitives/Input';
import { Button } from '../../primitives/Button';

const meta: Meta = {
  title: 'Patterns/Screens/Enrichment Trigger',
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj;

const SCOPES = [
  { value: 'lead',    label: 'Single lead' },
  { value: 'company', label: 'All leads at a company' },
  { value: 'group',   label: 'Lead group' },
];

export const Default: Story = {
  render: () => {
    const [scope, setScope] = useState('lead');
    const [target, setTarget] = useState('');
    return (
      <Modal isOpen onClose={() => undefined} title="Trigger enrichment" size="md">
        <FormLayout columns={1}>
          <FormField label="Scope" htmlFor="et-scope" required>
            <Combobox id="et-scope" options={SCOPES} value={scope} onChange={setScope} />
          </FormField>
          <FormField label="Target ID" htmlFor="et-target" required hint="Lead ID, Company ID, or Group ID">
            <Input id="et-target" placeholder="lead_aa11 / cmp_4qj3z9 / grp_01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </FormField>
        </FormLayout>
        <FormActions align="right">
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary" onClick={() => alert(`POST /api/enrichment/trigger\n${JSON.stringify({ scope, target }, null, 2)}`)}>Trigger</Button>
        </FormActions>
      </Modal>
    );
  },
};
