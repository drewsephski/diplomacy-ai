import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  detail?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string | number> {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name. Use `aria-labelledby` when a visible label exists (see Field). */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/**
 * Custom select-only combobox following the WAI-ARIA pattern: focus stays on the trigger,
 * the listbox is driven by aria-activedescendant, and Escape closes only the list so an
 * enclosing dialog stays open.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  ...labels
}: SelectProps<T>) {
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [flip, setFlip] = useState(false);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, active]);

  function openList() {
    if (disabled || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setFlip(rect.bottom + 300 > window.innerHeight && rect.top > 300);
    setActive(selectedIndex >= 0 ? selectedIndex : step(-1, 1));
    setOpen(true);
  }

  function step(from: number, dir: 1 | -1): number {
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function choose(i: number) {
    const option = options[i];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => step(i, 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => step(i, -1));
        return;
      case 'Home':
        event.preventDefault();
        setActive(step(-1, 1));
        return;
      case 'End':
        event.preventDefault();
        setActive(step(0, -1));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      case 'Tab':
        setOpen(false);
        return;
    }
    if (event.key.length === 1 && !event.altKey && !event.metaKey && !event.ctrlKey) {
      const now = Date.now();
      const buffer = now - typeahead.current.at > 600 ? '' : typeahead.current.text;
      typeahead.current = { text: buffer + event.key.toLowerCase(), at: now };
      const match = options.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(typeahead.current.text),
      );
      if (match >= 0) setActive(match);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`select ${open ? 'open' : ''} ${flip ? 'flip' : ''} ${className}`}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={labels['aria-labelledby'] ? undefined : labels['aria-label']}
        aria-labelledby={
          labels['aria-labelledby'] ? `${labels['aria-labelledby']} ${triggerId}` : undefined
        }
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={`select-value ${selected ? '' : 'placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} aria-hidden="true" className="select-chevron" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="select-list"
          aria-labelledby={labels['aria-labelledby'] ?? triggerId}
          aria-label={labels['aria-labelledby'] ? undefined : labels['aria-label']}
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <li
                key={String(option.value)}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={`select-option ${i === active ? 'active' : ''} ${option.disabled ? 'disabled' : ''}`}
                onMouseEnter={() => !option.disabled && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span className="select-option-text">
                  <span>{option.label}</span>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
