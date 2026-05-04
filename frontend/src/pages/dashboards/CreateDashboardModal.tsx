import { useState } from "react";
import { Button, Input, Modal } from "../../design-system";

interface Props {
  isOpen: boolean;
  onSave: (name: string, desc: string) => void;
  onClose: () => void;
}

export function CreateDashboardModal({ isOpen, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Dashboard"
      size="sm"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(name, description)} disabled={!name.trim()}>Create</Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dashboard name"
          autoFocus
        />
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this dashboard shows"
        />
      </div>
    </Modal>
  );
}
