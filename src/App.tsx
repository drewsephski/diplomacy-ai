import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, CircleHelp, X } from 'lucide-react';
import { api, removeGame } from './api';
import { MODE_HINT, MODE_LABEL, phaseKind, phaseName } from './domain';
import { deriveGuidedPhase } from './guided/events';
import { guideReducer, initialGuide, pendingPhases } from './guided/reducer';
import { INTRO_KEY, readFlag, readGuided, writeFlag, writeGuided } from './guided/prefs';
import { type Match, type MatchSummary, type Power } from './types';
import { Dossier } from './components/Dossier';
import { Setup } from './components/Setup';
import { Branch } from './components/Branch';
import { Theater, type GuideActions } from './components/Theater';
import { Playback } from './components/Playback';
import { Help } from './components/Help';
import { HistoricalComparison } from './components/HistoricalComparison';
import { SavedGames } from './components/SavedGames';
import { Chronicle, Comparison, Diplomacy } from './components/Views';
import { Empty } from './components/Shared';
import { useWatch } from './watch/useWatch';

type Tab = 'Watch' | 'Messages' | 'Timeline' | 'Compared with history' | 'Alternate timeline' | 'History';

export default function App() {
  const [match, setMatch] = useState<Match>();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Power>('FRANCE');
  const [focus, setFocus] = useState<{ code: string; nonce: number }>();
  const [tab, setTab] = useState<Tab>('Watch');
  const [modal, setModal] = useState<'setup' | 'branch' | 'dossier' | 'help' | null>(null);
  const [setupMode, setSetupMode] = useState<'live' | 'sandbox'>();
  const [configured, setConfigured] = useState(false);
  const [parent, setParent] = useState<Match>();
  const [expertPlaying, setExpertPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [introHidden, setIntroHidden] = useState(() => readFlag(INTRO_KEY));
  const [guided, setGuided] = useState(readGuided);
  const [guide, dispatchGuide] = useReducer(guideReducer, undefined, () => initialGuide(0));
  const follow = useRef(true);
  const currentId = useRef('');
  const opener = useRef<HTMLElement | null>(null);

  const reading = guide.turn !== undefined;
  const watch = useWatch({
    match,
    reading,
    setMatch: (m) => {
      if (currentId.current === m.id) setMatch(m);
    },
  });

  /** The original of an alternate timeline. If it was deleted, the child still plays; only the comparison is unavailable. */
  const loadParent = useCallback(async (m: Match) => {
    if (!m.parent) return undefined;
    try {
      return await api<Match>(`/matches/${m.parent.id}`);
    } catch {
      return undefined;
    }
  }, []);

  const refreshList = useCallback(async () => {
    const list = await api<MatchSummary[]>('/matches');
    setMatches(list);
    return list;
  }, []);

  const load = useCallback(
    async (id: string, at?: number) => {
      setBusy(true);
      setError('');
      setExpertPlaying(false);
      try {
        const m = await api<Match>(`/matches/${id}`);
        currentId.current = m.id;
        setMatch(m);
        setIndex(at ?? (m.mode === 'sample' ? Math.min(1, m.turns.length) : m.turns.length));
        setParent(await loadParent(m));
        follow.current = true;
        dispatchGuide({ type: 'reset', resolved: m.turns.length });
        localStorage.setItem('seven-powers-match', id);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Opening the page loads the saved or sample record only. Nothing is run or billed on load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [health, list] = await Promise.all([api<{ liveConfigured: boolean }>('/health'), refreshList()]);
        if (cancelled) return;
        setConfigured(health.liveConfigured);
        const saved = localStorage.getItem('seven-powers-match');
        const initial = list.find((m) => m.id === saved) || list.find((m) => m.mode === 'sample') || list[0];
        if (initial) await load(initial.id);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshList]);

  // While the server is working on a phase, follow its progress.
  useEffect(() => {
    if (!match || match.status !== 'running') return;
    const id = match.id;
    let fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api<Match>(`/matches/${id}`);
        if (currentId.current !== id) return;
        setMatch(next);
        if (follow.current) setIndex(next.turns.length);
        if (next.status !== 'running') {
          setPauseRequested(false);
          void refreshList();
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        fetching = false;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [match?.id, match?.status, refreshList]);

  // Expert sample replay: a timer over recorded phases. Never a model call.
  useEffect(() => {
    if (!expertPlaying || !match) return;
    const timer = setTimeout(() => {
      if (index < match.turns.length) setIndex((i) => i + 1);
      else setExpertPlaying(false);
    }, 2200 / speed);
    return () => clearTimeout(timer);
  }, [expertPlaying, index, match, speed]);

  // Opening any other dialog ends the walkthrough: one overlay at a time, and no stale card.
  useEffect(() => {
    if (modal !== null) dispatchGuide({ type: 'close' });
  }, [modal]);

  const guidePhase = useMemo(
    () => (guide.turn !== undefined && match ? deriveGuidedPhase(match, guide.turn) : undefined),
    [match, guide.turn],
  );

  function restoreFocus() {
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }

  /** Opens the walkthrough of one resolved phase and shows the board after it. */
  function openTurn(turn: number, step = 0) {
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    setExpertPlaying(false);
    follow.current = false;
    setIndex(turn + 1);
    dispatchGuide({ type: 'open', turn, step });
  }

  const guideActions: GuideActions = {
    open: (turn, step) => {
      if (!match) return;
      const t = turn ?? (index > 0 ? index - 1 : 0);
      if (t < 0 || t >= match.turns.length) return;
      openTurn(t, step ?? 0);
    },
    step: (to) => {
      if (!guidePhase) return;
      dispatchGuide({ type: 'step', to, count: guidePhase.events.length });
    },
    close: (finished = false) => {
      dispatchGuide({ type: 'close', finished });
      follow.current = match ? index === match.turns.length : true;
      restoreFocus();
    },
    continueNext: () => {
      if (!match || !guidePhase) return;
      const next = guidePhase.turn + 1;
      if (next >= match.turns.length) return;
      dispatchGuide({ type: 'close', finished: true });
      openTurn(next, 0);
    },
    runNext: () => {
      dispatchGuide({ type: 'close', finished: true });
      restoreFocus();
      void playOnePhase();
    },
    guidanceOff: () => {
      setGuided(false);
      writeGuided(false);
      dispatchGuide({ type: 'close' });
      restoreFocus();
    },
    locate: (code) => setFocus((f) => ({ code, nonce: (f?.nonce ?? 0) + 1 })),
  };

  function seek(i: number) {
    setExpertPlaying(false);
    dispatchGuide({ type: 'close' });
    setIndex(i);
    follow.current = match ? i === match.turns.length : true;
  }

  /** Plays exactly one phase with the server, then stops. Live play is billed per model call. */
  async function playOnePhase() {
    if (!match || busy || watch.inFlight) return;
    setBusy(true);
    setError('');
    follow.current = true;
    setIndex(match.turns.length);
    try {
      const next = await api<Match>(`/matches/${match.id}/run`, { single: true });
      setMatch(next);
      setPauseRequested(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Primary control. Sample: replay. Live and sandbox: start, pause, or resume the watch session. */
  function onPrimary() {
    if (!match) return;
    const atEdge = index === match.turns.length;
    if (match.mode === 'sample') {
      if (guided) {
        if (atEdge) openTurn(0, 0);
        else openTurn(Math.max(0, index - 1), 0);
        return;
      }
      if (expertPlaying) {
        setExpertPlaying(false);
        return;
      }
      if (atEdge) {
        setIndex(0);
      }
      setExpertPlaying(true);
      return;
    }
    if (watch.playing || match.status === 'running') {
      void watch.pause();
      return;
    }
    if (match.checkpoints.at(-1)!.state.done || match.status === 'complete') return;
    if (!atEdge) {
      seek(match.turns.length);
    }
    follow.current = true;
    watch.begin(match.id);
  }

  function onStep() {
    if (!match) return;
    if (match.mode === 'sample') {
      if (index < match.turns.length) seek(index + 1);
      return;
    }
    if (index < match.turns.length) seek(index + 1);
    else void playOnePhase();
  }

  function created(m: Match) {
    currentId.current = m.id;
    setMatch(m);
    setIndex(m.turns.length);
    setTab(m.parent ? 'Alternate timeline' : 'Watch');
    void loadParent(m).then(setParent);
    follow.current = true;
    dispatchGuide({ type: 'reset', resolved: m.turns.length });
    localStorage.setItem('seven-powers-match', m.id);
    void refreshList();
  }

  /** The first phase was requested: watch the game from here until the viewer pauses it. */
  function started(m: Match) {
    created(m);
    setModal(null);
    watch.begin(m.id);
  }

  async function extend(maxPhases: number, budgetUsd?: number) {
    if (!match) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<Match>(`/matches/${match.id}/extend`, { maxPhases, budgetUsd });
      setMatch(next);
      setIndex(next.turns.length);
      follow.current = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Switching tabs never leaves a watch session running behind a page that is not showing it. */
  function switchTab(next: Tab) {
    if (next === 'History' && watch.playing) void watch.pause();
    setTab(next);
  }

  /** Loads a saved game. Opening never starts it: only the Resume control in Watch sends a request. */
  async function openGame(id: string, at?: number) {
    if (watch.playing) void watch.pause();
    setTab('Watch');
    await load(id, at);
  }

  /** Deletes a saved game. If it was on screen, the view moves to the sample (or the first remaining game). */
  async function deleteGame(game: MatchSummary) {
    setBusy(true);
    setError('');
    try {
      await removeGame(game.id);
      const list = await refreshList();
      if (currentId.current === game.id) {
        currentId.current = '';
        localStorage.removeItem('seven-powers-match');
        const next = list.find((m) => m.mode === 'sample') || list[0];
        if (next) await load(next.id);
        else setMatch(undefined);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSample() {
    const list = matches.length ? matches : await refreshList();
    const sample = list.find((m) => m.mode === 'sample');
    if (!sample) return;
    await openGame(sample.id, 1);
    if (guided) openTurn(0, 0);
  }

  function openSetup(mode?: 'live' | 'sandbox') {
    setSetupMode(mode);
    setModal('setup');
  }

  if (!match)
    return (
      <div className="loading-screen">
        <Brand />
        <div className="loading-compass">✧</div>
        <h1>{error ? 'The game could not load.' : 'Preparing the European board…'}</h1>
        <p>{error || 'Setting the board. Opening the saved games.'}</p>
        {error && (
          <button className="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
      </div>
    );

  const cp = match.checkpoints[Math.min(index, match.checkpoints.length - 1)];
  const atEdge = index === match.turns.length;
  const running = match.status === 'running';
  const complete = match.status === 'complete' || cp.state.done;
  const errorText = error || match.error;
  const sampleAvailable = matches.some((m) => m.mode === 'sample');
  const pending = match.mode === 'sample' ? 0 : pendingPhases(guide, match.turns.length);
  const pendingTurn = match.turns.length - pending;
  const pendingSeason = match.turns[pendingTurn] ? `${phaseName(match.turns[pendingTurn].phase)} · ${phaseKind(match.turns[pendingTurn].phase).toLowerCase()}` : undefined;

  let statusText: string;
  if (pauseRequested) statusText = 'Pausing after the current model calls…';
  else if (!watch.playing && watch.inFlight) statusText = 'Finishing the request already sent · nothing new will start';
  else if (watch.playing && running) statusText = 'Playing · a phase is in progress';
  else if (watch.playing) statusText = 'Playing · the next phase starts in a moment';
  else if (running) statusText = 'A phase is being played…';
  else if (expertPlaying) statusText = 'Replaying recorded phases · no model calls';
  else if (reading) statusText = 'Reading · the game waits while the guide is open';
  else if (!atEdge) statusText = 'Looking at an earlier moment';
  else if (complete) statusText = 'Game over';
  else if (match.status === 'error') statusText = 'Stopped by an error · see the banner';
  else if (match.mode === 'sample') statusText = 'Recorded sample · no model calls';
  else if (match.turns.length === 0) statusText = 'Ready · press Play first phase to begin';
  else statusText = 'Paused · press Resume game to keep playing';

  const usageText =
    match.mode === 'live'
      ? `${match.usage.calls} calls · $${match.usage.estimatedUsd.toFixed(3)} of $${match.limits.budgetUsd} budget`
      : match.mode === 'sandbox'
        ? 'Free · no model calls'
        : 'No model calls';

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav aria-label="Main navigation">
          {(['Watch', 'Messages', 'Timeline', 'Compared with history', ...(match.parent ? ['Alternate timeline'] : []), 'History'] as Tab[]).map((t) => (
            <button key={t} onClick={() => switchTab(t)} className={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined}>
              {t}
            </button>
          ))}
        </nav>
        <button className="button new-simulation" onClick={() => openSetup()}>
          Set up a game
          <ArrowRight size={14} />
        </button>
      </header>
      <div className="matchbar">
        <div className="match-identity">
          <button
            className="match-name"
            onClick={() => {
              void refreshList();
              switchTab('History');
            }}
            title="Open History to switch games"
          >
            {match.name}
            <ChevronDown size={13} />
          </button>
          <span className={`mode-label ${match.mode}`} title={MODE_HINT[match.mode]}>
            {MODE_LABEL[match.mode]}
          </span>
          <span className="phase-label">
            <small>{atEdge ? (match.pending ? 'In progress' : 'Latest') : 'Earlier moment'}</small>
            {phaseName(cp.state.board.name)}
            <i />
            {phaseKind(cp.state.board.name)}
          </span>
          <span className="created-on">
            {match.mode === 'sample' ? 'Teaching sample' : `Started ${new Date(match.createdAt).toLocaleDateString()}`}
          </span>
        </div>
        <div className="match-status">
          <span className={`status-dot ${running || watch.playing ? 'live' : ''}`} aria-hidden="true" />
          <span aria-live="polite">{statusText}</span>
          <span className="usage" title="Live cost includes reported usage plus conservative reservations for calls still awaiting provider usage.">
            {usageText}
          </span>
          <button
            role="switch"
            aria-checked={guided}
            className={`guide-switch ${guided ? 'on' : ''}`}
            onClick={() => {
              const next = !guided;
              setGuided(next);
              writeGuided(next);
              if (!next) dispatchGuide({ type: 'close' });
            }}
            aria-label="Guided view"
            title="Guided view explains each moment with a card. Turn it off for the full detailed view."
          >
            Guided view <b>{guided ? 'on' : 'off'}</b>
          </button>
          <button className="icon-button" aria-label="How to watch" onClick={() => setModal('help')}>
            <CircleHelp size={16} />
          </button>
        </div>
      </div>
      {errorText && (
        <div className="error-banner" role="alert">
          <span>{errorText}</span>
          {error && (
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {tab === 'Watch' ? (
        <Theater
          match={match}
          index={index}
          selected={selected}
          focus={focus}
          watching={watch.playing}
          guided={guided}
          guide={{
            phase: guidePhase,
            step: guide.step,
            open: reading && Boolean(guidePhase),
            pending,
            pendingSeason,
          }}
          actions={guideActions}
          showOrientation={!introHidden}
          sampleAvailable={sampleAvailable}
          endBusy={busy}
          onSelect={setSelected}
          onLocate={(code) => setFocus((f) => ({ code, nonce: (f?.nonce ?? 0) + 1 }))}
          onHistory={() => {
            void refreshList();
            switchTab('History');
          }}
          onDossier={() => setModal('dossier')}
          onDiplomacy={() => setTab('Messages')}
          onLiveEdge={() => seek(match.turns.length)}
          onSample={() => void openSample()}
          onSetup={() => openSetup()}
          onSandbox={() => openSetup('sandbox')}
          onDismissOrientation={() => {
            setIntroHidden(true);
            writeFlag(INTRO_KEY, true);
          }}
          onExtend={(maxPhases) => void extend(maxPhases)}
          onRaiseBudget={(budgetUsd) => void extend(match.limits.maxPhases, budgetUsd)}
          onReplay={() => {
            if (guided) openTurn(0, 0);
            else seek(1);
          }}
          onBranch={() => setModal('branch')}
        />
      ) : (
        <main className="secondary-content">
          {tab === 'Messages' && <Diplomacy match={match} index={index} />}{' '}
          {tab === 'Timeline' && (
            <Chronicle
              match={match}
              index={index}
              onSeek={(i) => {
                seek(i);
                setTab('Watch');
              }}
            />
          )}
          {tab === 'Compared with history' && <HistoricalComparison match={match} index={index} />}{' '}
          {tab === 'Alternate timeline' &&
            (parent ? (
              <Comparison match={match} parent={parent} index={index} />
            ) : (
              <Empty>
                The original game was deleted, so this alternate timeline has nothing to compare against. It keeps its own
                record and can still be watched or continued.
              </Empty>
            ))}
          {tab === 'History' && (
            <SavedGames
              games={matches}
              currentId={match.id}
              busy={busy}
              onOpen={(id, at) => void openGame(id, at)}
              onStart={() => openSetup()}
              onOpenSample={() => void openSample()}
              onDelete={deleteGame}
            />
          )}
        </main>
      )}
      <Playback
        match={match}
        index={index}
        guided={guided}
        expertPlaying={expertPlaying}
        speed={speed}
        busy={busy}
        pauseRequested={pauseRequested}
        watching={watch.playing}
        onPrimary={onPrimary}
        onStep={onStep}
        onSeek={seek}
        onBranch={() => setModal('branch')}
        onSpeed={setSpeed}
      />
      <div className="bottom-strip">
        <span>AN OBSERVATORY OF AMBITION</span>
        <span>
          {match.mode === 'sample'
            ? 'Recorded sample · a teaching replay checked by the rules engine'
            : match.mode === 'sandbox'
              ? 'Free local sandbox · simple policies, not AI-written diplomacy'
              : `${match.usage.calls} model calls · ${match.usage.inputTokens + match.usage.outputTokens} tokens · ${match.usage.unpricedCalls ? 'cost includes reservations awaiting provider usage' : 'provider-reported cost'}`}
        </span>
        <span>ALTERNATE HISTORY · STANDARD DIPLOMACY · 1901</span>
      </div>
      {modal === 'setup' && (
        <Setup
          key={setupMode ?? 'default'}
          configured={configured}
          initialMode={setupMode}
          onClose={() => setModal(null)}
          onCreated={created}
          onStarted={started}
        />
      )}{' '}
      {modal === 'branch' && (
        <Branch
          match={match}
          index={index}
          selected={selected}
          configured={configured}
          onClose={() => setModal(null)}
          onCreated={(m) => {
            setModal(null);
            created(m);
          }}
        />
      )}{' '}
      {modal === 'dossier' && (
        <Dossier
          match={match}
          index={index}
          power={selected}
          onClose={() => setModal(null)}
          onMoment={(step) => {
            setModal(null);
            openTurn(index - 1, step);
          }}
        />
      )}
      {modal === 'help' && (
        <Help
          onClose={() => setModal(null)}
          onShowIntro={() => {
            setIntroHidden(false);
            writeFlag(INTRO_KEY, false);
            setModal(null);
            setTab('Watch');
          }}
        />
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <path
          d="M28 2L32 22L49 9L36 25L54 28L34 32L47 48L31 36L28 54L24 34L8 47L21 31L2 28L22 24L9 8L25 21Z"
          fill="none"
          stroke="currentColor"
        />
        <path d="M28 2L28 28L22 24ZM54 28L28 28L32 22ZM28 54L28 28L34 32ZM2 28L28 28L24 34Z" fill="currentColor" />
      </svg>
      <span>SEVEN POWERS</span>
    </div>
  );
}

