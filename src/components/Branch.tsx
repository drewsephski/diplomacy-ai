import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { api } from '../api';
import { NATIONS, PROFILES, phaseKind, phaseName } from '../domain';
import { describeOrder } from '../story';
import { POWERS, type Match, type Power, type Profile } from '../types';
import { Modal } from './Shared';
import { Select } from './ui/Select';
import { Field, Stepper } from './ui/Fields';

type Kind = 'order' | 'message' | 'profile';
const KIND_LABELS: Record<Kind, string> = {
  order: 'Change an order',
  message: 'Send diplomacy',
  profile: 'Change profile',
};

export function Branch({
  match,
  index,
  selected,
  configured,
  onClose,
  onCreated,
}: {
  match: Match;
  index: number;
  selected: Power;
  configured: boolean;
  onClose: () => void;
  onCreated: (m: Match) => void;
}) {
  const [power, setPower] = useState<Power>(selected);
  const [kind, setKind] = useState<Kind>('order');
  const [order, setOrder] = useState('');
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState<Power>(selected === 'ENGLAND' ? 'FRANCE' : 'ENGLAND');
  const [profile, setProfile] = useState<Profile>('diplomat');
  const [mode, setMode] = useState<'live' | 'sandbox'>(match.mode === 'live' ? 'live' : 'sandbox');
  const [budget, setBudget] = useState(match.limits.budgetUsd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cp = match.checkpoints[index];
  const legal = Object.values(cp.state.legal[power]).flat();
  const ready =
    kind === 'order' ? Boolean(order) : kind === 'message' ? message.trim().length > 0 : true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const intervention = {
        power,
        ...(kind === 'order'
          ? { order }
          : kind === 'message'
            ? { message, to: [recipient] }
            : { profile }),
      };
      onCreated(
        await api<Match>(`/matches/${match.id}/branch`, {
          at: index,
          mode,
          intervention,
          limits: {
            ...match.limits,
            budgetUsd: budget,
            maxPhases: Math.max(index + 8, match.limits.maxPhases),
          },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="What if one decision changed?" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="modal-body">
          <p className="modal-lede">
            Start an alternate timeline at the beginning of {phaseName(cp.state.board.name)} ·{' '}
            {phaseKind(cp.state.board.name).toLowerCase()}. Your original record stays unchanged.
          </p>
          <div className="branch-pair" aria-label="Timelines">
            <div className="branch-checkpoint">
              <GitBranch size={20} />
              <div>
                <span className="eyebrow">ORIGINAL</span>
                <strong>{match.name}</strong>
                <span>Moment {index} · notes and positions restored</span>
              </div>
            </div>
            <span className="branch-arrow" aria-hidden="true">
              →
            </span>
            <div className="branch-checkpoint alternate">
              <GitBranch size={20} />
              <div>
                <span className="eyebrow">ALTERNATE</span>
                <strong>Continues from here</strong>
                <span>Created with the settings below</span>
              </div>
            </div>
          </div>
          {match.turns[index] ? (
            <div className="branch-context">
              <span className="eyebrow">
                RECORDED ORDERS · {phaseName(match.turns[index].phase).toUpperCase()}
              </span>
              <p>
                In the original, {NATIONS[power].name} ordered{' '}
                {match.turns[index].decisions[power].orders.length
                  ? 'the following:'
                  : 'nothing recorded for this phase.'}
              </p>
              <ul>
                {match.turns[index].decisions[power].orders.map((o) => (
                  <li key={o}>
                    <span>{describeOrder(o).summary}</span>
                    <code>{o}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="muted small-copy">
              This phase has not been resolved yet, so no original orders exist. Your alternate
              decision will be the first one recorded for it.
            </p>
          )}
          <div className="segmented" role="group" aria-label="Kind of intervention">
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <button
                type="button"
                key={k}
                aria-pressed={kind === k}
                className={kind === k ? 'active' : ''}
                onClick={() => setKind(k)}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <Field label="Intervene as">
            {(labelId) => (
              <Select
                aria-labelledby={labelId}
                value={power}
                options={POWERS.map((p) => ({ value: p, label: NATIONS[p].name }))}
                onChange={(p) => {
                  setPower(p);
                  setOrder('');
                }}
              />
            )}
          </Field>
          {kind === 'order' && (
            <>
              <Field label="Replace one legal order">
                {(labelId) => (
                  <Select
                    aria-labelledby={labelId}
                    value={order || null}
                    placeholder="Select a legal order…"
                    options={legal.map((o) => ({
                      value: o,
                      label: describeOrder(o).summary,
                      detail: o,
                    }))}
                    onChange={setOrder}
                  />
                )}
              </Field>
              <p className="muted small-copy">
                This order replaces {NATIONS[power].name}’s choice when the phase resolves. The
                other countries cannot see the change before the reveal.
              </p>
            </>
          )}
          {kind === 'message' && (
            <>
              <Field label="Private recipient">
                {(labelId) => (
                  <Select
                    aria-labelledby={labelId}
                    value={recipient}
                    options={POWERS.filter((p) => p !== power).map((p) => ({
                      value: p,
                      label: NATIONS[p].name,
                    }))}
                    onChange={setRecipient}
                  />
                )}
              </Field>
              <label className="field">
                <span className="field-label">Diplomatic decision</span>
                <textarea
                  required
                  maxLength={1200}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="We will keep the Channel empty. Can we rebuild our trust?"
                />
              </label>
            </>
          )}
          {kind === 'profile' && (
            <Field label="New behavioral profile">
              {(labelId) => (
                <Select
                  aria-labelledby={labelId}
                  value={profile}
                  options={Object.entries(PROFILES).map(([key, v]) => ({
                    value: key as Profile,
                    label: v.name,
                  }))}
                  onChange={setProfile}
                />
              )}
            </Field>
          )}
          <Field label="Continuation">
            {(labelId) => (
              <Select
                aria-labelledby={labelId}
                value={mode}
                options={[
                  {
                    value: 'sandbox' as const,
                    label: 'Local sandbox · deterministic · no cost',
                  },
                  {
                    value: 'live' as const,
                    label: configured
                      ? 'AI countries'
                      : 'AI countries · requires an OpenRouter key',
                    disabled: !configured,
                  },
                ]}
                onChange={setMode}
              />
            )}
          </Field>
          {mode === 'live' && (
            <Field label="New branch budget (USD)">
              {(labelId) => (
                <Stepper
                  label="New branch budget"
                  labelId={labelId}
                  value={budget}
                  min={0.1}
                  max={100}
                  step={0.5}
                  onChange={setBudget}
                />
              )}
            </Field>
          )}
          {mode === 'sandbox' && kind === 'message' && (
            <p className="info-note">
              Sandbox policies record messages but do not interpret language. Choose AI countries to
              measure the diplomatic effect of this intervention.
            </p>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>The original timeline stays as recorded.</span>
          <button className="button primary" disabled={busy || !ready}>
            {busy ? 'Creating alternate timeline…' : 'Create alternate timeline'}
            <GitBranch size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
