import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  NativeSelect,
} from "../../design-system";
import type {
  AlertRule,
  Silence,
  SilenceCreate,
} from "../../types";

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "America/Chicago", label: "America/Chicago (CT)" },
  { value: "America/Denver", label: "America/Denver (MT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
];

interface SilenceCreateModalProps {
  isOpen: boolean;
  mode: "create-onetime" | "create-recurring";
  rules: AlertRule[];
  saving: boolean;
  error: string | null;
  editSilence?: Silence | null;
  onSave: (data: SilenceCreate) => void;
  onClose: () => void;
}

const toLocalISO = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function SilenceCreateModal({ isOpen, mode, rules, saving, error, editSilence, onSave, onClose }: SilenceCreateModalProps) {
  const isEditing = !!editSilence;
  const isRecurring = isEditing ? editSilence.recurring : mode === "create-recurring";
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [startsAt, setStartsAt] = useState(toLocalISO(now));
  const [endsAt, setEndsAt] = useState(toLocalISO(isRecurring ? oneYearLater : twoHoursLater));
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [matcherKey, setMatcherKey] = useState("");
  const [matcherValue, setMatcherValue] = useState("");
  const [matchers, setMatchers] = useState<Record<string, string>>({});
  const [selectedDays, setSelectedDays] = useState<string[]>(isRecurring ? ["mon", "tue", "wed", "thu", "fri"] : []);
  const [recStartTime, setRecStartTime] = useState("21:00");
  const [recEndTime, setRecEndTime] = useState("09:00");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    if (isOpen && editSilence) {
      setName(editSilence.name);
      setComment(editSilence.comment);
      setSelectedRuleIds(editSilence.rule_ids);
      setMatchers(editSilence.matchers);
      setTimezone(editSilence.timezone);
      setStartsAt(toLocalISO(new Date(editSilence.starts_at)));
      setEndsAt(toLocalISO(new Date(editSilence.ends_at)));
      setSelectedDays(editSilence.recurrence_days);
      setRecStartTime(editSilence.recurrence_start_time ?? "21:00");
      setRecEndTime(editSilence.recurrence_end_time ?? "09:00");
    } else if (isOpen && !editSilence) {
      setName("");
      setComment("");
      setSelectedRuleIds([]);
      setMatchers({});
      setTimezone("UTC");
      setStartsAt(toLocalISO(now));
      setEndsAt(toLocalISO(isRecurring ? oneYearLater : twoHoursLater));
      setSelectedDays(isRecurring ? ["mon", "tue", "wed", "thu", "fri"] : []);
      setRecStartTime("21:00");
      setRecEndTime("09:00");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editSilence]);

  const toggleDay = (day: string) => { setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]); };
  const toggleRule = (ruleId: string) => { setSelectedRuleIds((prev) => prev.includes(ruleId) ? prev.filter((id) => id !== ruleId) : [...prev, ruleId]); };
  const addMatcher = () => { if (matcherKey && matcherValue) { setMatchers((prev) => ({ ...prev, [matcherKey]: matcherValue })); setMatcherKey(""); setMatcherValue(""); } };
  const removeMatcher = (key: string) => { setMatchers((prev) => { const next = { ...prev }; delete next[key]; return next; }); };

  const hasTarget = selectedRuleIds.length > 0 || Object.keys(matchers).length > 0;
  const isValid = name.trim() && hasTarget && startsAt && endsAt;

  const handleSubmit = () => {
    const data: SilenceCreate = {
      name: name.trim(), comment, rule_ids: selectedRuleIds, matchers,
      starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(),
      timezone, recurring: isRecurring,
      ...(isRecurring ? { recurrence_days: selectedDays, recurrence_start_time: recStartTime, recurrence_end_time: recEndTime } : {}),
    };
    onSave(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? `Edit Silence: ${editSilence.name}` : isRecurring ? "Create Recurring Silence" : "Create One-Time Silence"} size="lg" footer={
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!isValid || saving}>{saving ? "Saving..." : isEditing ? "Update Silence" : "Create Silence"}</Button>
      </div>
    }>
      {error && <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)", borderRadius: "var(--border-radius-sm)", padding: "8px 12px", marginBottom: 16, fontSize: "var(--typography-font-size-sm)", color: "var(--color-danger-500)" }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label="Silence Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isRecurring ? "e.g., Nightly shutdown window" : "e.g., Deploy maintenance"} />
        </FormField>

        <FormField label="Comment (optional)">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Why this silence exists" />
        </FormField>

        <FormField label="Timezone">
          <NativeSelect options={TIMEZONES} value={timezone} onChange={(v) => setTimezone(v)} />
        </FormField>

        <FormField label="Target Rules (select one or more)">
          <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid var(--color-neutral-200)", borderRadius: "var(--border-radius-sm)" }}>
            {rules.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>No rules available</div>
            ) : (
              rules.map((r) => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: "var(--typography-font-size-sm)", borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <input type="checkbox" checked={selectedRuleIds.includes(r.id)} onChange={() => toggleRule(r.id)} />
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <code style={{ fontSize: 11, color: "var(--color-neutral-400)" }}>{r.metric_name}</code>
                </label>
              ))
            )}
          </div>
        </FormField>

        <FormField label="Tag Matchers (alternative to rule selection)">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Input style={{ flex: 1 }} placeholder="Tag key" value={matcherKey} onChange={(e) => setMatcherKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMatcher()} />
            <Input style={{ flex: 1 }} placeholder="Tag value" value={matcherValue} onChange={(e) => setMatcherValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMatcher()} />
            <Button variant="secondary" onClick={addMatcher} disabled={!matcherKey || !matcherValue}>Add</Button>
          </div>
          {Object.keys(matchers).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(matchers).map(([k, v]) => (
                <Badge key={k} variant="info">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }} onClick={() => removeMatcher(k)}>{k}={v} <X size={10} /></span>
                </Badge>
              ))}
            </div>
          )}
        </FormField>

        {!isRecurring && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Starts At"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></FormField>
            <FormField label="Ends At"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></FormField>
          </div>
        )}

        {isRecurring && (
          <>
            <FormField label="Active Days">
              <div style={{ display: "flex", gap: 6 }}>
                {WEEKDAYS.map((d) => (
                  <Button key={d.value} variant={selectedDays.includes(d.value) ? "primary" : "secondary"} size="sm" onClick={() => toggleDay(d.value)}>{d.label}</Button>
                ))}
              </div>
            </FormField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Silence Start Time"><Input type="time" value={recStartTime} onChange={(e) => setRecStartTime(e.target.value)} /></FormField>
              <FormField label="Silence End Time"><Input type="time" value={recEndTime} onChange={(e) => setRecEndTime(e.target.value)} /></FormField>
            </div>

            <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", background: "var(--color-neutral-100)", padding: "8px 12px", borderRadius: "var(--border-radius-sm)" }}>
              Alerts will be silenced every {selectedDays.map((d) => d.toUpperCase()).join(", ") || "..."} from {recStartTime} to {recEndTime} ({timezone}). Supports cross-midnight windows.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Valid From"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></FormField>
              <FormField label="Valid Until"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></FormField>
            </div>
          </>
        )}

        {!hasTarget && <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-danger-500)" }}>Select at least one rule or add a tag matcher.</div>}
      </div>
    </Modal>
  );
}
