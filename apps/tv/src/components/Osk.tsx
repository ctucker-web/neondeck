// On-screen keyboard for remotes and gamepads. A physical keyboard can type
// straight into it too.
import { useEffect, useRef } from 'react';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm.-/'];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  autoFocus?: boolean;
}

export function Osk({ value, onChange, onSubmit, submitLabel, autoFocus }: Props) {
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[data-nav-modal]')) return;
      const { value: v, onChange: set } = latest.current;
      if (e.key.length === 1 && e.key !== ' ') set(v + e.key);
      else if (e.key === 'Backspace' && v) set(v.slice(0, -1));
      else return;
      e.preventDefault();
      e.stopPropagation(); // Backspace here edits text; it must not mean "back".
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="osk">
      {ROWS.map((row, r) => (
        <div className="osk__row" key={row}>
          {[...row].map((ch, i) => (
            <button key={ch} className="osk__key" data-focusable data-autofocus={autoFocus && r === 1 && i === 0 ? '' : undefined} onClick={() => onChange(value + ch)}>
              {ch}
            </button>
          ))}
        </div>
      ))}
      <div className="osk__row">
        <button className="osk__key osk__key--wide" data-focusable onClick={() => onChange(value + ' ')}>Space</button>
        <button className="osk__key osk__key--wide" data-focusable onClick={() => onChange(value.slice(0, -1))}>Delete</button>
        <button className="osk__key osk__key--wide" data-focusable onClick={() => onChange('')}>Clear</button>
        <button className="osk__key osk__key--go" data-focusable onClick={onSubmit}>{submitLabel}</button>
      </div>
    </div>
  );
}
