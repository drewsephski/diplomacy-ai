import { useEffect, useId, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ModelInfo } from '../../types';

/** Labelled form row. Children receive the id of the visible label for aria-labelledby. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="field">
      <span className="field-label" id={labelId}>
        {label}
      </span>
      {children(labelId)}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/** Numeric input with explicit −/+ controls; native spinners are hidden. */
export function Stepper({
  label,
  labelId,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange,
}: {
  label: string;
  labelId: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  // The text draft lets people clear and retype a number; the value is clamped on blur.
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);
  return (
    <div className={`stepper ${disabled ? 'disabled' : ''}`}>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        type="text"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        aria-labelledby={labelId}
        autoComplete="off"
        value={draft}
        disabled={disabled}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) {
            onChange(clamp(n));
          }
        }}
        onBlur={() => {
          setEditing(false);
          const n = Number(draft);
          onChange(draft.trim() !== '' && Number.isFinite(n) ? clamp(n) : value);
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

/** Long-prompt rates from the live catalog. Shown so the base rate is never presented alone. */
export function tierNote(model: Pick<ModelInfo, 'tiers'>) {
  // Only prompt-size tiers are described here; time-window overrides apply at any hour.
  const tier = model.tiers?.find((t) => t.minPromptTokens > 0);
  if (!tier) return '';
  return `above ${Math.round(tier.minPromptTokens / 1000)}k prompt tokens ${usd.format(tier.input * 1_000_000)} in · ${usd.format(tier.output * 1_000_000)} out`;
}

/** Catalog pricing per one million tokens, from the live OpenRouter response. Never estimated. */
export function catalogPrice(model: Pick<ModelInfo, 'input' | 'output'>) {
  return `${usd.format(model.input * 1_000_000)} in · ${usd.format(model.output * 1_000_000)} out / 1M tokens`;
}
