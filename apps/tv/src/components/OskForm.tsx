// A small form filled in with the on-screen keyboard: pick a field, type, submit.
import { useState } from 'react';
import { Osk } from './Osk';

export interface FormField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

interface Props {
  fields: FormField[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel?: () => void;
}

export function OskForm({ fields, submitLabel, onSubmit, onCancel }: Props) {
  const [active, setActive] = useState(fields[0].key);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, ''])));

  return (
    <div className="oskform">
      {fields.map((f, i) => (
        <button key={f.key} className={`field${active === f.key ? ' field--active' : ''}`} data-focusable data-autofocus={i === 0 ? '' : undefined} onClick={() => setActive(f.key)}>
          <b>{f.label}</b> {values[f.key] ? (f.secret ? '•'.repeat(values[f.key].length) : values[f.key]) : <span>{f.placeholder}</span>}
        </button>
      ))}
      <Osk value={values[active]} onChange={(v) => setValues((prev) => ({ ...prev, [active]: v }))} onSubmit={() => onSubmit(values)} submitLabel={submitLabel} />
      {onCancel && (
        <button className="btn oskform__cancel" data-focusable onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
