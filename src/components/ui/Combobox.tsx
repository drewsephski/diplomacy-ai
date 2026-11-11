import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
  detail?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Shown when typing matches nothing; free text is still allowed. */
  emptyText?: string;
  maxOptions?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/**
 * Filterable text combobox. Typing filters the list, and any text can be committed, so models
 * outside the live catalog remain possible. Enter commits the highlighted option or the typed
 * text; Escape closes the list first and then reverts an uncommitted edit.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  emptyText = 'No catalog match. The typed id is used as entered.',
  maxOptions = 80,
  className = '',
  ...labels
}: ComboboxProps) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!dirty) setText(value);
  }, [value, dirty]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        commitText(false);
      }
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, text, dirty]);

  const query = dirty ? text.trim().toLowerCase() : '';
  const filtered = (
    query
      ? options.filter(
          (o) =>
            o.value.toLowerCase().includes(query) || o.label.toLowerCase().includes(query),
        )
      : options
  ).slice(0, maxOptions);

  function commitText(keepOpen: boolean) {
    const next = text.trim();
    if (next && next !== value) onChange(next);
    else setText(value);
    setDirty(false);
    setOpen(keepOpen);
    setActive(-1);
  }

  function choose(option: ComboboxOption) {
    setText(option.value);
    setDirty(false);
    setOpen(false);
    setActive(-1);
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      if (!filtered.length) return;
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + delta + filtered.length) % filtered.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active >= 0 && filtered[active]) choose(filtered[active]);
      else commitText(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      // Close the list and drop the uncommitted edit; a closed list lets Escape reach the dialog.
      event.preventDefault();
      event.stopPropagation();
      setText(value);
      setDirty(false);
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={rootRef} className={`combobox ${open ? 'open' : ''} ${className}`}>
      <div className="combobox-field">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-label={labels['aria-labelledby'] ? undefined : labels['aria-label']}
          aria-labelledby={labels['aria-labelledby']}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          disabled={disabled}
          value={text}
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget as Node)) commitText(false);
          }}
        />
        <button
          type="button"
          className="combobox-toggle"
          tabIndex={-1}
          aria-label="Show catalog"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((o) => !o);
            setActive(-1);
          }}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="combobox-list" aria-label="Catalog models">
          {filtered.length === 0 && <li className="combobox-empty">{emptyText}</li>}
          {filtered.map((option, i) => (
            <li
              key={option.value}
              id={optionId(i)}
              role="option"
              aria-selected={option.value === value}
              className={`combobox-option ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
            >
              <span className="combobox-option-name">
                <span>{option.label}</span>
                <code>{option.value}</code>
              </span>
              {option.detail && <small>{option.detail}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
