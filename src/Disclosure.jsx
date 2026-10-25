import { useId, useState } from 'react';
import { Info } from '@phosphor-icons/react';
import './disclosure.css';

// T6.3: a one-line conclusion with an ⓘ button that expands the full explanation below it.
// Collapsed by default and not remembered; without a detail the summary renders as plain text.
export function Disclosure({ summary, detail }) {
  const [open, setOpen] = useState(false),
    id = useId();
  if (!detail) return summary ?? null;
  return (
    <>
      {summary}
      <button
        type="button"
        className={'disclosure-toggle' + (open ? ' open' : '')}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? '收起说明' : '展开说明'}
        onClick={() => setOpen(!open)}
      >
        <Info size={12} />
      </button>
      <span id={id} className="disclosure-detail" hidden={!open}>
        {detail}
      </span>
    </>
  );
}
