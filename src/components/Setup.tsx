import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, Network, Play, Radio } from 'lucide-react';
import { api } from '../api';
import {
  GLM_MODEL,
  GUIDANCE_EXAMPLES,
  GUIDANCE_LIMITS,
  HAIKU_MODEL,
  MODEL_PRESETS,
  NATIONS,
  PROFILES,
  defaultConfigs,
  modelLabel,
  powerMap,
} from '../domain';
import { POWERS, type AgentConfig, type Match, type ModelInfo, type Power, type Profile } from '../types';
import type { RunOutcome } from '../watch/useWatch';
import { Crest, Modal } from './Shared';
import { Combobox, type ComboboxOption } from './ui/Combobox';
import { Select } from './ui/Select';
import { Field, Stepper, catalogPrice, tierNote } from './ui/Fields';

const PREFERRED = [GLM_MODEL, HAIKU_MODEL];
const STEPS = ['Players', 'Guidance', 'Length', 'Start'] as const;

/**
 * Guided setup for one new game: Players → Guidance → Length → Start. Every default works, so a
 * novice can press Start game on the first pass. Per-country models, instructions, and detailed
 * limits sit under Advanced. Nothing calls a model until the final Start game press.
 *
 * Start game makes two requests, in order: create the match (once), then run one phase through the
 * page's watch session. If the second fails, the created match is kept and "Try starting again"
 * repeats only the start. Closing the dialog (button, Escape, or backdrop) during a start cancels
 * whatever has not happened yet: no run is sent after a dismissal, and a run already sent is paused.
 */
export function Setup({
  configured,
  initialMode,
  onClose,
  onCreated,
  onStart,
  onAbandoned,
}: {
  configured: boolean;
  initialMode?: 'live' | 'sandbox';
  onClose: () => void;
  /** The match exists but has not started. The app may show it, nothing runs. */
  onCreated: (m: Match) => void;
  /** Requests the first phase through the watch session. Resolves once the server answers. */
  onStart: (m: Match) => Promise<RunOutcome>;
  /** The dialog was dismissed after the create request was sent: the game is saved, never started. */
  onAbandoned: (m: Match) => void;
}) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'live' | 'sandbox'>(initialMode ?? (configured ? 'live' : 'sandbox'));
  const [name, setName] = useState('My Seven Powers game');
  const [briefing, setBriefing] = useState('');
  const [configs, setConfigs] = useState(defaultConfigs);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [budget, setBudget] = useState(2);
  const [phases, setPhases] = useState(6);
  const [rounds, setRounds] = useState(2);
  const [outputTokens, setOutputTokens] = useState(1800);
  const [activePreset, setActivePreset] = useState<string | null>('glm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Match>();
  const [catalogError, setCatalogError] = useState('');
  const flight = useRef(false);
  /** False once the dialog is dismissed. Nothing continues a start after that. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    api<ModelInfo[]>('/models')
      .then((list) => {
        const rank = (id: string) => {
          const i = PREFERRED.indexOf(id);
          return i >= 0 ? i : PREFERRED.length;
        };
        setModels([...list].sort((a, b) => rank(a.id) - rank(b.id)));
      })
      .catch((e) => setCatalogError((e as Error).message));
  }, []);

  const live = mode === 'live';
  const catalog = new Map(models.map((m) => [m.id, m]));
  const modelOptions: ComboboxOption[] = models.map((m) => ({ value: m.id, label: m.name, detail: catalogPrice(m) }));
  const shared = briefing.trim();

  function change(p: Power, patch: Partial<AgentConfig>) {
    setConfigs((c) => ({ ...c, [p]: { ...c[p], ...patch } }));
    setActivePreset(null);
  }

  function body() {
    return {
      name: name.trim() || 'My Seven Powers game',
      mode,
      configs,
      briefing: live ? shared : undefined,
      limits: { maxPhases: phases, budgetUsd: budget, maxOutputTokens: outputTokens, diplomacyRounds: rounds },
    };
  }

  /** Create once, then start one phase. A failed start keeps the created match for a retry. */
  async function startGame() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      let match = created;
      if (!match) {
        match = await api<Match>('/matches', body());
        if (!alive.current) {
          onAbandoned(match);
          return;
        }
        setCreated(match);
        onCreated(match);
      }
      const outcome = await onStart(match);
      if (!alive.current) return;
      if (outcome.kind === 'failed') setError(outcome.error);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const calls = 7 * (rounds + 1);
  const ready = !(live && !configured);

  return (
    <Modal title="Set up a game" onClose={onClose} wide>
      <div className="modal-body wizard">
        <ol className="wizard-steps" aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : ''}>
              <button
                type="button"
                onClick={() => setStep(i)}
                disabled={Boolean(created) && i < 3}
              >
                <span aria-hidden="true">{i + 1}</span> {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="wizard-panel" aria-labelledby="step-players">
            <h3 id="step-players">Who plays?</h3>
            <p className="modal-lede">
              Seven countries compete for 18 of the 34 supply centers. Each one is played by a live AI model, or
              by a local policy that costs nothing.
            </p>
            <div className="mode-options" role="group" aria-label="Who plays">
              <button type="button" aria-pressed={live} className={live ? 'selected' : ''} onClick={() => setMode('live')} disabled={!configured}>
                <Radio size={20} />
                <strong>{configured ? 'AI countries (recommended)' : 'AI countries · needs a key'}</strong>
                <span>Each country is a language model that negotiates and orders. Costs are shown before you start.</span>
                {live && <Check size={16} />}
              </button>
              <button type="button" aria-pressed={!live} className={!live ? 'selected' : ''} onClick={() => setMode('sandbox')}>
                <Network size={20} />
                <strong>No-cost sandbox</strong>
                <span>Simple local policies play the game. No model calls. Guidance text is not used.</span>
                {!live && <Check size={16} />}
              </button>
            </div>
            {!configured && (
              <div className="info-note">
                <KeyRound size={16} />
                <div>
                  AI countries need <code>OPENROUTER_API_KEY</code> in the project’s <code>.env</code> file. Add it and
                  restart the server. The sandbox works now.
                </div>
              </div>
            )}
            <label className="field">
              <span className="field-label">Game name</span>
              <input data-autofocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <details className="advanced" open={undefined}>
              <summary>Advanced: models, behaviour, and each country</summary>
              <div className="advanced-body">
                <div className="preset-row" role="group" aria-label="Model presets">
                  <span className="preset-caption">Presets</span>
                  {MODEL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`preset-chip ${activePreset === preset.id ? 'active' : ''}`}
                      aria-pressed={activePreset === preset.id}
                      title={preset.description}
                      disabled={!live}
                      onClick={() => {
                        setConfigs(powerMap((p) => ({ ...configs[p], model: preset.modelFor(p, POWERS.indexOf(p)) })));
                        setActivePreset(preset.id);
                      }}
                    >
                      <strong>{preset.name}</strong>
                      <span>{preset.description}</span>
                    </button>
                  ))}
                </div>
                <p className="cost-status" aria-live="polite">
                  {!live
                    ? 'The sandbox does not use models or prices.'
                    : catalogError
                      ? `Model catalog unavailable (${catalogError}). Type any OpenRouter model id.`
                      : models.length
                        ? 'Prices come from the live OpenRouter catalog, per million tokens. Type to filter, or paste any id.'
                        : 'Loading the live model catalog…'}
                </p>
                <div className="agent-configs">
                  {POWERS.map((p) => {
                    const model = catalog.get(configs[p].model);
                    return (
                      <div className="agent-row" key={p}>
                        <Crest power={p} small />
                        <span className="agent-name">{NATIONS[p].name}</span>
                        <Combobox
                          aria-label={`${NATIONS[p].name} model`}
                          value={configs[p].model}
                          placeholder="Search models or paste an id"
                          options={modelOptions}
                          disabled={!live}
                          onChange={(model) => change(p, { model })}
                        />
                        <Select
                          aria-label={`${NATIONS[p].name} behavioral profile`}
                          value={configs[p].profile}
                          options={Object.entries(PROFILES).map(([key, v]) => ({ value: key as Profile, label: v.name }))}
                          onChange={(profile) => change(p, { profile })}
                        />
                        {live && (
                          <small className="agent-cost">
                            {model
                              ? `${modelLabel(model.id)} · ${catalogPrice(model)}${tierNote(model) ? ` · ${tierNote(model)}` : ''}`
                              : `${modelLabel(configs[p].model)} · ${models.length ? 'not in the live catalog' : 'price unavailable'}`}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          </section>
        )}

        {step === 1 && (
          <section className="wizard-panel" aria-labelledby="step-guidance">
            <h3 id="step-guidance">Guidance for the countries (optional)</h3>
            <p className="modal-lede">
              Write what you would like the countries to try. Every country reads this briefing before it decides. Guidance
              shapes strategy only: it cannot change the rules or legal orders, and it does not guarantee any result or any
              alliance.
            </p>
            {live ? (
              <>
                <label className="field">
                  <span className="field-label">Shared briefing, sent to all seven countries</span>
                  <textarea
                    data-autofocus
                    rows={4}
                    maxLength={GUIDANCE_LIMITS.briefing}
                    value={briefing}
                    onChange={(e) => setBriefing(e.target.value)}
                    aria-describedby="briefing-count"
                    placeholder={GUIDANCE_EXAMPLES.briefing}
                  />
                </label>
                <div className="field-row">
                  <small id="briefing-count">
                    {shared.length} of {GUIDANCE_LIMITS.briefing} characters. Plain text.
                  </small>
                  <div className="example-chips" role="group" aria-label="Example briefings">
                    <button type="button" className="preset-chip" onClick={() => setBriefing(GUIDANCE_EXAMPLES.briefing)}>
                      Try diplomacy first
                    </button>
                  </div>
                </div>
                <p className="muted small-copy">
                  Country-specific instructions, such as “Seek cooperation with France”, are set per country under Advanced on
                  the Players step.
                </p>
                <details className="advanced">
                  <summary>Advanced: instructions for each country only</summary>
                  <div className="advanced-body instruction-grid">
                    {POWERS.map((p) => (
                      <label className="field" key={p}>
                        <span className="field-label">
                          <Crest power={p} small /> {NATIONS[p].name}
                        </span>
                        <textarea
                          rows={2}
                          maxLength={GUIDANCE_LIMITS.country}
                          value={configs[p].instructions ?? ''}
                          placeholder={p === 'FRANCE' ? GUIDANCE_EXAMPLES.country : 'Optional, only this country reads it'}
                          onChange={(e) => change(p, { instructions: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                </details>
              </>
            ) : (
              <div className="info-note">
                <div>
                  The no-cost sandbox uses fixed local policies, which cannot read written guidance, so this step is off.
                  Choose AI countries on the Players step to use guidance.
                </div>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="wizard-panel" aria-labelledby="step-length">
            <h3 id="step-length">How long, and what may it cost?</h3>
            <p className="modal-lede">
              A game plays phase by phase. It stops when a country reaches 18 supply centers, when it reaches the phase limit, or
              when it reaches the budget ceiling.
            </p>
            <div className="limits-row">
              <Field label="Phase limit">
                {(labelId) => (
                  <Stepper label="Phase limit" labelId={labelId} value={phases} min={1} max={200} onChange={setPhases} />
                )}
              </Field>
              <Field label="Budget ceiling (USD)">
                {(labelId) => (
                  <Stepper label="Budget ceiling" labelId={labelId} value={budget} min={0.1} max={100} step={0.5} disabled={!live} onChange={setBudget} />
                )}
              </Field>
            </div>
            <p className="cost-status" aria-live="polite">
              {live
                ? `Live cost is metered per call and never exceeds the budget ceiling. An earlier recorded test phase with these models cost about $0.005. Each movement phase makes up to ${calls} model calls.`
                : 'The sandbox makes no model calls and costs nothing.'}
            </p>
            <details className="advanced">
              <summary>Advanced: detailed limits</summary>
              <div className="advanced-body limits-row">
                <Field label="Diplomacy rounds per phase">
                  {(labelId) => (
                    <Select aria-labelledby={labelId} value={rounds} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} onChange={setRounds} />
                  )}
                </Field>
                <Field label="Output tokens per call">
                  {(labelId) => (
                    <Stepper label="Output tokens" labelId={labelId} value={outputTokens} min={800} max={6000} step={100} disabled={!live} onChange={setOutputTokens} />
                  )}
                </Field>
              </div>
            </details>
          </section>
        )}

        {step === 3 && (
          <section className="wizard-panel" aria-labelledby="step-start">
            <h3 id="step-start">Ready to start</h3>
            <dl className="review">
              <div>
                <dt>Players</dt>
                <dd>{live ? 'AI countries, one model per country' : 'No-cost sandbox policies'}</dd>
              </div>
              <div>
                <dt>Guidance</dt>
                <dd>
                  {live
                    ? shared
                      ? `Shared briefing: “${shared.slice(0, 120)}${shared.length > 120 ? '…' : ''}”`
                      : 'None. Countries play from the rules and their own interests.'
                    : 'Not used in the sandbox'}
                </dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>Up to {phases} phases, or until a country holds 18 centers</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{live ? `Stops at a $${budget.toFixed(2)} ceiling. Nothing is spent until you press Start game.` : 'Free'}</dd>
              </div>
            </dl>
            <p className="muted small-copy">
              Pressing Start game creates the game and plays its first phase right away. With Guided view on, each phase then
              opens a short walkthrough, and the next phase waits until you press Continue watching. With it off, the game plays
              on one phase at a time until you pause it. Closing, hiding, or leaving the board always pauses.
            </p>
            {created && (
              <div className="info-note" role="status">
                <Check size={16} />
                <div>
                  <strong>{created.name}</strong> is saved but has not played yet. Press “Try starting again” to play its first phase. Nothing was created twice.
                </div>
              </div>
            )}
          </section>
        )}

        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer wizard-foot">
        <button type="button" className="button ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>
          <ArrowLeft size={15} /> Back
        </button>
        {step < 3 ? (
          <button type="button" className="button" onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" className="button primary start-game" onClick={startGame} disabled={busy || !ready}>
            <Play size={15} fill="currentColor" />
            {busy ? 'Starting…' : created ? 'Try starting again' : 'Start game'}
          </button>
        )}
      </div>
    </Modal>
  );
}
