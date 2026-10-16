import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from '@phosphor-icons/react';
import './Select.css';

export function Select({ label, value, options, onChange, disabled = false, className = '', menuWidth = 280 }) {
  const id = useId(),
    button = useRef(),
    menu = useRef(),
    optionRefs = useRef([]),
    typed = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState({}),
    [host, setHost] = useState(null);
  // The menu portals into the surrounding .app element, found once the button mounts.
  const buttonRef = useCallback((el) => {
    button.current = el;
    setHost(el?.closest('.app') || null);
  }, []);
  const selected = options.findIndex((o) => String(o.value) === String(value)),
    current = options[selected];
  const close = () => setOpen(false);
  function show(index = selected) {
    if (disabled) return;
    const r = button.current.getBoundingClientRect(),
      below = window.innerHeight - r.bottom - 12,
      above = r.top - 12,
      up = below < 200 && above > below,
      width = Math.min(Math.max(r.width, menuWidth), window.innerWidth - 24),
      height = Math.min(320, up ? above : below);
    setPosition({
      left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
      width,
      maxHeight: Math.max(80, height),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
    setActive(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  }
  function choose(index) {
    const option = options[index];
    if (option) {
      onChange(option.value);
      close();
      button.current?.focus();
    }
  }
  function keydown(e) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      }
      return;
    }
    if (e.key === 'Tab') {
      close();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const direction = e.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        show(e.key === 'End' ? options.length - 1 : e.key === 'Home' ? 0 : Math.max(0, selected));
        return;
      }
      setActive((i) =>
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? options.length - 1
            : Math.max(0, Math.min(options.length - 1, i + direction)),
      );
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open ? choose(active) : show();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + e.key : e.key, at: now };
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()));
      if (i >= 0) {
        e.preventDefault();
        open ? setActive(i) : show(i);
      }
    }
  }
  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!button.current?.contains(e.target) && !menu.current?.contains(e.target)) close();
    };
    const scroll = (e) => {
      if (!menu.current?.contains(e.target)) close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  const [shown, setShown] = useState({ disabled, value });
  if (shown.disabled !== disabled || shown.value !== value) {
    setShown({ disabled, value });
    setOpen(false);
  }
  return (
    <div className={`ui-select ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={keydown}
        onBlur={(e) => {
          if (!menu.current?.contains(e.relatedTarget)) close();
        }}
        title={current ? [current.label, current.description].filter(Boolean).join(' · ') : label}
      >
        <span>{current?.label || '请选择'}</span>
        <CaretDown size={13} className={open ? 'expanded' : ''} />
      </button>
      {open &&
        host &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            className="ui-select-menu"
            style={position}
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                ref={(el) => (optionRefs.current[i] = el)}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`ui-select-option ${i === active ? 'active' : ''} ${i === selected ? 'selected' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <div>
                  <span>{o.label}</span>
                  {o.description && <small>{o.description}</small>}
                </div>
                {i === selected && <Check size={14} />}
              </div>
            ))}
          </div>,
          host,
        )}
    </div>
  );
}
