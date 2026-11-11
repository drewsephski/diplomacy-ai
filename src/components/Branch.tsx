import { useState } from 'react';
import { Check, GitBranch, Network, PenLine, Radio } from 'lucide-react';
import '../whatif.css';
import { api } from '../api';
import { NATIONS, PROFILES, phaseName } from '../domain';
import type { WhatIf } from '../guided/beats';
import { checkpointPhrase, clampMoment, describeIntervention, questionFor } from '../moment';
import { describeOrder } from '../story';
import { POWERS, type Intervention, type Match, type Power, type Profile } from '../types';
import { Modal } from './Shared';
import { Select } from './ui/Select';
import { Field, Stepper } from './ui/Fields';

type Kind = 'order' | 'message' | 'profile';
type Mode = 'live' | 'sandbox';
const KIND_LABELS: Record<Kind, string> = {
  order: 'Change one order',
  message: 'Add a message',
  profile: 'Change how a country plays',
};

/**
 * Honest notes for each continuation. The deterministic sandbox replays fixed rules: it records an
 * added message but never reads it, and its countries never react to a change strategically.
 */
const DEFAULT_CAVEAT: Record<Mode, string> = {
  sandbox:
    'The free sandbox continues with simple, fixed rules and makes no model calls. The other countries will not react to the change strategically.',
  live: 'AI countries continue from this moment and can react to what happens. Each phase makes billed model calls, up to the budget below.',
};
const SANDBOX_MESSAGE =
  'Messages need AI countries. The free sandbox would record the message but never read it or answer it, so it could not show any effect.';
const SANDBOX_PROFILE =
  'In the free sandbox a profile only changes which of its fixed-rule orders a country picks. It does not make the country negotiate differently.';

/**
 * "What if?": start an alternate timeline from one checkpoint with ONE change. With a `preset` (a
 * supported experiment from the phase summary) the dialog opens at `preset.at` with its change
 * prefilled and explained against the original record. Without one, the viewer picks a change at
 * the viewed moment. Orders of a phase the viewer has not reached yet stay behind a disclosure
 * (moment rule). The original record is never modified.
 */
export function Branch({
  match,
  index,
  selected,
  configured,
  preset,
  onClose,
  onCreated,
}: {
  match: Match;
  index: number;
  selected: Power;
  configured: boolean;
  /** A prepared experiment, such as "What if France had kept its promise?". */
  preset?: WhatIf;
  onClose: () => void;
  onCreated: (m: Match) => void;
}) {
  const [usePreset, setUsePreset] = useState(Boolean(preset));
  const fixed = usePreset ? preset : undefined;
  // A preset fixes the checkpoint; choosing a different change keeps that checkpoint.
  const at = clampMoment(match, preset ? preset.at : index);
  const [power, setPower] = useState<Power>(preset?.intervention.power ?? selected);
  const [kind, setKind] = useState<Kind>('order');
  const [order, setOrder] = useState(preset?.intervention.order ?? '');
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState<Power>(selected === 'ENGLAND' ? 'FRANCE' : 'ENGLAND');
  const [profile, setProfile] = useState<Profile>('diplomat');
  const [mode, setModeState] = useState<Mode>(
    match.mode === 'live' && configured ? 'live' : 'sandbox',
  );
  const [budget, setBudget] = useState(match.limits.budgetUsd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cp = match.checkpoints[at];
  const season = phaseName(cp.state.board.name);
  const terminal = cp.state.done;
  const legal = Object.values(cp.state.legal[power] ?? {}).flat();
  const recorded = match.turns[at];
  // Orders of phase `at` are part of the viewed past only once the viewer is past that phase.
  const revealed = at < index;
  const caveat = fixed?.caveat ?? DEFAULT_CAVEAT;

  function setMode(m: Mode) {
    setModeState(m);
    if (m === 'sandbox' && kind === 'message') setKind('order');
  }

  const intervention: Intervention | undefined = fixed
    ? fixed.intervention
    : kind === 'order'
      ? order
        ? { power, order }
        : undefined
      : kind === 'message'
        ? message.trim() && mode === 'live'
          ? { power, message: message.trim(), to: [recipient] }
          : undefined
        : { power, profile };
  // A message needs countries that read it; the sandbox never does (see SANDBOX_MESSAGE).
  const unreadMessage = Boolean(intervention?.message) && mode === 'sandbox';
  const ready = Boolean(intervention) && !terminal && !unreadMessage;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!intervention) return;
    setBusy(true);
    setError('');
    try {
      onCreated(
        await api<Match>(`/matches/${match.id}/branch`, {
          at,
          mode,
          intervention,
          question: fixed?.question ?? questionFor(intervention),
          limits: {
            ...match.limits,
            budgetUsd: budget,
            maxPhases: Math.max(at + 8, match.limits.maxPhases),
          },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const originalOrders = recorded ? (
    <>
      <p>
        In the original, {NATIONS[power].name} ordered{' '}
        {recorded.decisions[power].orders.length
          ? 'the following:'
          : 'nothing recorded for this phase.'}
      </p>
      <ul>
        {recorded.decisions[power].orders.map((o) => (
          <li key={o}>
            <span>{describeOrder(o).summary}</span>
            <code>{o}</code>
          </li>
        ))}
      </ul>
    </>
  ) : null;

  const timelines = (
    <div className="branch-pair" aria-label="Timelines">
      <div className="branch-checkpoint">
        <GitBranch size={20} />
        <div>
          <span className="eyebrow">ORIGINAL</span>
          <strong>{match.name}</strong>
          <span>Stays as recorded</span>
        </div>
      </div>
      <span className="branch-arrow" aria-hidden="true">
        →
      </span>
      <div className="branch-checkpoint alternate">
        <GitBranch size={20} />
        <div>
          <span className="eyebrow">ALTERNATE</span>
          <strong>Continues from {season}</strong>
          <span>Moment {at}, with positions and private notes as they were</span>
        </div>
      </div>
    </div>
  );

  return (
    <Modal title={fixed ? fixed.question : 'What if one decision changed?'} onClose={onClose} wide>
      <form onSubmit={submit} className="whatif-form">
        <div className="modal-body">
          <p className="modal-lede">
            Start an alternate timeline from {checkpointPhrase(cp.state.board.name)}. Your original
            record stays as it is.
          </p>
          {!fixed && timelines}

          {terminal && (
            <p className="info-note" role="status">
              This is the final position, so nothing can continue from it. Choose an earlier moment
              on the timeline to try a different decision.
            </p>
          )}

          {fixed ? (
            <>
              <section className="whatif-compare" aria-label="The change">
                <div>
                  <span className="eyebrow">WHAT CHANGES</span>
                  <p>{fixed.change}</p>
                </div>
                <div>
                  <span className="eyebrow">WHAT THE ORIGINAL RECORD SHOWS</span>
                  <p>{fixed.original}</p>
                </div>
                <p className="whatif-exact">
                  Exact change:{' '}
                  <code>
                    {fixed.intervention.order ?? describeIntervention(fixed.intervention)}
                  </code>
                  . Only this one change is made; everything before {season} stays the same.
                </p>
                {unreadMessage && <p className="info-note">{SANDBOX_MESSAGE}</p>}
                <button type="button" className="text-button" onClick={() => setUsePreset(false)}>
                  <PenLine size={13} /> Choose a different change instead
                </button>
              </section>
              {timelines}
            </>
          ) : (
            <>
              {recorded &&
                (revealed ? (
                  <div className="branch-context">
                    <span className="eyebrow">
                      WHAT THE ORIGINAL RECORD SHOWS · {season.toUpperCase()}
                    </span>
                    {originalOrders}
                  </div>
                ) : (
                  <details className="branch-context branch-spoiler">
                    <summary>
                      Show what {NATIONS[power].name} ordered in the original {season} (reveals this
                      phase’s orders)
                    </summary>
                    {originalOrders}
                  </details>
                ))}
              {!recorded && !terminal && (
                <p className="muted small-copy">
                  This phase has not been resolved in the original, so no original orders exist yet.
                  Your change will be the first decision recorded for it.
                </p>
              )}
              <div className="segmented whatif-kinds" role="group" aria-label="Kind of change">
                {(Object.keys(KIND_LABELS) as Kind[]).map((k) => {
                  const off = k === 'message' && mode === 'sandbox';
                  return (
                    <button
                      type="button"
                      key={k}
                      aria-pressed={kind === k}
                      className={kind === k ? 'active' : ''}
                      disabled={off}
                      title={off ? SANDBOX_MESSAGE : undefined}
                      onClick={() => setKind(k)}
                    >
                      {KIND_LABELS[k]}
                    </button>
                  );
                })}
              </div>
              {mode === 'sandbox' && <p className="muted small-copy">{SANDBOX_MESSAGE}</p>}
              <Field label="Country">
                {(labelId) => (
                  <Select
                    aria-labelledby={labelId}
                    value={power}
                    options={POWERS.map((p) => ({ value: p, label: NATIONS[p].name }))}
                    onChange={(p) => {
                      setPower(p);
                      setOrder('');
                      if (recipient === p) setRecipient(p === 'ENGLAND' ? 'FRANCE' : 'ENGLAND');
                    }}
                  />
                )}
              </Field>
              {kind === 'order' &&
                (legal.length ? (
                  <>
                    <Field label="Replace one legal order">
                      {(labelId) => (
                        <Select
                          aria-labelledby={labelId}
                          value={order || null}
                          placeholder="Choose what this unit does instead…"
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
                      This order replaces {NATIONS[power].name}’s own choice for that unit when{' '}
                      {season} resolves. The other countries cannot see the change before the
                      reveal.
                    </p>
                  </>
                ) : (
                  <p className="info-note">
                    {NATIONS[power].name} has no unit that can be given an order at this moment.
                  </p>
                ))}
              {kind === 'message' && mode === 'live' && (
                <>
                  <Field label="Recipient">
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
                    <span className="field-label">Message, sent as {NATIONS[power].name}</span>
                    <textarea
                      required
                      maxLength={1200}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="We will keep the Channel empty. Can we rebuild our trust?"
                    />
                  </label>
                  <p className="muted small-copy">
                    The message is delivered before this phase’s talks and is labelled as an
                    observer intervention in the record.
                  </p>
                </>
              )}
              {kind === 'profile' && (
                <>
                  <Field label="New way of playing">
                    {(labelId) => (
                      <Select
                        aria-labelledby={labelId}
                        value={profile}
                        options={Object.entries(PROFILES).map(([key, v]) => ({
                          value: key as Profile,
                          label: v.name,
                          detail: v.description,
                        }))}
                        onChange={setProfile}
                      />
                    )}
                  </Field>
                  {mode === 'sandbox' && <p className="muted small-copy">{SANDBOX_PROFILE}</p>}
                </>
              )}
            </>
          )}

          <fieldset className="whatif-modes">
            <legend>How the alternate timeline continues</legend>
            <div className="mode-options">
              <button
                type="button"
                aria-pressed={mode === 'sandbox'}
                className={mode === 'sandbox' ? 'selected' : ''}
                onClick={() => setMode('sandbox')}
              >
                <Network size={20} />
                <strong>Free sandbox</strong>
                <span>{caveat.sandbox}</span>
                {mode === 'sandbox' && <Check size={16} />}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'live'}
                className={mode === 'live' ? 'selected' : ''}
                onClick={() => setMode('live')}
                disabled={!configured}
              >
                <Radio size={20} />
                <strong>AI countries</strong>
                <span>
                  {configured
                    ? caveat.live
                    : 'Not available: the server has no OpenRouter key. The free sandbox works now.'}
                </span>
                {mode === 'live' && <Check size={16} />}
              </button>
            </div>
          </fieldset>
          {mode === 'live' && (
            <Field label="Budget for this alternate timeline (USD)">
              {(labelId) => (
                <Stepper
                  label="Alternate timeline budget"
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
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>
            {mode === 'sandbox'
              ? 'Free. Nothing plays until you press Play in Watch.'
              : 'Nothing is billed until you press Play in Watch.'}
          </span>
          <button className="button primary" disabled={busy || !ready}>
            {busy ? 'Creating alternate timeline…' : 'Create alternate timeline'}
            <GitBranch size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
