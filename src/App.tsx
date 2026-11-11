import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, CircleHelp, Menu, X } from 'lucide-react';
import { api, removeGame } from './api';
import { MODE_HINT, MODE_LABEL, phaseKind, phaseName } from './domain';
import { historyNoteFor } from './history-notes';
import { deriveWalkthrough, type WhatIf } from './guided/beats';
import type { ConceptId } from './guided/concepts';
import { guideReducer, initialGuide, pendingPhases } from './guided/reducer';
import { INTRO_KEY, readFlag, readFollow, readGuided, readSeenConcepts, writeFlag, writeFollow, writeGuided, writeSeenConcepts } from './guided/prefs';
import { type Match, type MatchSummary, type Power } from './types';
import { Dossier } from './components/Dossier';
import { Setup } from './components/Setup';
import { Branch } from './components/Branch';
import { Theater, type GuideActions, type SummaryAction } from './components/Theater';
import { Playback } from './components/Playback';
import { Help } from './components/Help';
import { HistoricalComparison } from './components/HistoricalComparison';
import { SavedGames } from './components/SavedGames';
import { MenuSheet } from './components/MenuSheet';
import { ConversationsPage } from './components/Conversations';
import { Chronicle, Comparison } from './components/Views';
import { Empty } from './components/Shared';
import { useWatch, type RunOutcome, type StopReason } from './watch/useWatch';

/** Approved in-page mark: transparent PNG, so it sits directly on the navy page with no tile or halo. */
const BRAND_MARK = '/brand/seven-powers-mark-256.png?v=2';

type Tab = 'Watch' | 'Conversations' | 'Timeline' | 'Compared with history' | 'Alternate timeline' | 'History';


/** The sample offered to newcomers: the newest authored version, else any sample record. */
function newestSample(list: MatchSummary[]) {
  const samples = list.filter((m) => m.mode === 'sample');
  return samples.reduce<MatchSummary | undefined>((best, m) => (!best || (m.sampleVersion ?? 0) > (best.sampleVersion ?? 0) ? m : best), undefined);
}

export default function App() {
  const [match, setMatch] = useState<Match>();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [index, setIndex] = useState(0);
  /** The followed country: orders threads, events, and map emphasis. Remembered in this browser. */
  const [follow, setFollowState] = useState<Power>(readFollow);
  const [focus, setFocus] = useState<{ code: string; nonce: number }>();
  const [tab, setTab] = useState<Tab>('Watch');
  const [modal, setModal] = useState<'setup' | 'branch' | 'dossier' | 'help' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<'live' | 'sandbox'>();
  const [branchPreset, setBranchPreset] = useState<WhatIf>();
  const [initialThread, setInitialThread] = useState<string>();
  const [configured, setConfigured] = useState(false);
  const [parent, setParent] = useState<Match>();
  const [expertPlaying, setExpertPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [welcomeHidden, setWelcomeHidden] = useState(() => readFlag(INTRO_KEY));
  const [guided, setGuided] = useState(readGuided);
  const [seenConcepts, setSeenConcepts] = useState(readSeenConcepts);
  const [guide, dispatchGuide] = useReducer(guideReducer, undefined, () => initialGuide(0));
  /** Keep the view on the latest moment as new phases arrive. */
  const followEdge = useRef(true);
  /** The match on screen. Every async result for another match is dropped. */
  const currentId = useRef('');
  /** Increments on every navigation between matches; an async result from an older navigation is dropped. */
  const nav = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  /** The match whose first phase Setup is requesting right now, if any. */
  const starting = useRef<string | undefined>(undefined);
  /** Phases whose talks the viewer watched arrive live on the Watch stage (match id : turn). */
  const sawTalks = useRef(new Set<string>());

  const reading = guide.turn !== undefined;
  const watch = useWatch({
    match,
    guided,
    reading,
    onMatch: (m) => {
      if (currentId.current !== m.id) return;
      setMatch(m);
      if (followEdge.current) setIndex(m.turns.length);
      if (m.status !== 'running') void refreshList();
    },
  });

  function setFollow(p: Power) {
    setFollowState(p);
    writeFollow(p);
  }

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

  /**
   * The one way to stop automatic play: ends the watch session (pausing the server if this page may
   * have started it) and the free replay timer. Dialogs, other tabs, a hidden page, seeking, closing
   * the guide, the guided toggle, and switching games all call it. Nothing resumes on its own.
   */
  function holdWatch(reason: StopReason) {
    setExpertPlaying(false);
    watch.stop(reason, match?.status === 'running' ? match.id : undefined);
  }
  const holdRef = useRef(holdWatch);
  holdRef.current = holdWatch;

  /** Shows a match. Always ends the previous session first, so no old session can come back to life. */
  function present(m: Match, at?: number) {
    holdRef.current('switch');
    watch.clearNotice();
    const n = nav.current;
    currentId.current = m.id;
    setMatch(m);
    setIndex(at ?? (m.mode === 'sample' ? Math.min(1, m.turns.length) : m.turns.length));
    followEdge.current = at === undefined || at === m.turns.length;
    dispatchGuide({ type: 'reset', resolved: m.turns.length });
    setParent(undefined);
    void loadParent(m).then((p) => {
      if (nav.current === n) setParent(p);
    });
    try {
      localStorage.setItem('seven-powers-match', m.id);
    } catch {
      /* The choice then lasts only for this page view. */
    }
  }

  /** Loads and shows a saved game. Only the latest of several rapid opens is shown. Never runs it. */
  async function load(id: string, at?: number) {
    const n = ++nav.current;
    holdRef.current('switch');
    setBusy(true);
    setError('');
    try {
      const m = await api<Match>(`/matches/${id}`);
      if (nav.current !== n) return false;
      present(m, at);
      return true;
    } catch (e) {
      if (nav.current === n) setError((e as Error).message);
      return false;
    } finally {
      if (nav.current === n) setBusy(false);
    }
  }
  const loadRef = useRef(load);
  loadRef.current = load;

  // Opening the page loads the saved or sample record only. Nothing is run or billed on load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [health, list] = await Promise.all([api<{ liveConfigured: boolean }>('/health'), refreshList()]);
        if (cancelled) return;
        setConfigured(health.liveConfigured);
        const saved = localStorage.getItem('seven-powers-match');
        const initial = list.find((m) => m.id === saved) || newestSample(list) || list[0];
        if (initial) await loadRef.current(initial.id);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshList]);

  // A hidden page never keeps playing: the session ends, and coming back needs an explicit Resume.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') holdRef.current('hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Free recorded replay: a timer over recorded phases, for any game. Never a model call.
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

  const walkthrough = useMemo(
    () => (guide.turn !== undefined && match ? deriveWalkthrough(match, guide.turn, { follow, brief: guide.brief }) : undefined),
    [match, guide.turn, guide.brief, follow],
  );
  const beat = walkthrough ? walkthrough.beats[Math.min(guide.step, walkthrough.beats.length - 1)] : undefined;
  /**
   * The moment on screen. While the guide is open the board follows its beat: before the reveal it
   * is the start of the walked phase (checkpoint `turn`); from the reveal on, the board after it.
   */
  const shown = walkthrough && beat ? (beat.board === 'before' ? walkthrough.turn : walkthrough.turn + 1) : index;

  // Remember which phases' talks the viewer saw arrive live, so that phase's walkthrough can skip them.
  useEffect(() => {
    if (match && tab === 'Watch' && index === match.turns.length && match.pending?.messages.length) sawTalks.current.add(`${match.id}:${match.turns.length}`);
  }, [match, tab, index]);

  function restoreFocus() {
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }

  /** Opens the walkthrough of one resolved phase. The board then follows its beats. */
  function openTurn(turn: number, step = 0, brief = false) {
    if (!match || turn < 0 || turn >= match.turns.length) return;
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('.guide-card')) opener.current = document.activeElement;
    setExpertPlaying(false);
    followEdge.current = turn + 1 === match.turns.length;
    setIndex(turn + 1);
    dispatchGuide({ type: 'open', turn, step, brief });
  }

  // A phase that resolved during an explicit session opens its walkthrough by itself (guided view).
  // A watch session holds the next phase until the viewer presses Continue watching.
  useEffect(() => {
    if (!guided || !match || tab !== 'Watch' || modal) return;
    if (watch.holdTurn !== undefined && guide.turn !== watch.holdTurn) openTurn(watch.holdTurn, 0, sawTalks.current.has(`${match.id}:${watch.holdTurn}`));
  }, [watch.holdTurn, guided, match?.id, tab, modal]);
  useEffect(() => {
    const a = watch.arrival;
    if (!a || a.kind !== 'once' || !guided || !match || a.matchId !== match.id || tab !== 'Watch' || modal) return;
    openTurn(a.turn, 0, sawTalks.current.has(`${match.id}:${a.turn}`));
  }, [watch.arrival?.seq]);

  /** Starts (or resumes) watching from the latest phase. An explicit viewer press only. */
  function startWatching(opts: { report?: boolean } = {}) {
    if (!match) return Promise.resolve<RunOutcome>({ kind: 'cancelled' });
    setError('');
    setInfo('');
    setExpertPlaying(false);
    followEdge.current = true;
    setIndex(match.turns.length);
    if (reading) dispatchGuide({ type: 'close', finished: guide.turn === match.turns.length - 1 });
    return watch.begin(match.id, { cleared: match.turns.length, immediate: true, report: opts.report });
  }

  /** Plays exactly one phase with the server, then stops. Live play is billed per model call. */
  function playOnePhase() {
    if (!match) return;
    setError('');
    setInfo('');
    followEdge.current = true;
    setIndex(match.turns.length);
    dispatchGuide({ type: 'close' });
    void watch.begin(match.id, { kind: 'once', cleared: match.turns.length });
  }

  const guideActions: GuideActions = {
    open: (turn, step) => {
      if (!match) return;
      openTurn(turn ?? (index > 0 ? index - 1 : 0), step ?? 0);
    },
    step: (to) => {
      if (!walkthrough) return;
      dispatchGuide({ type: 'step', to, count: walkthrough.beats.length - 1 });
    },
    // Closing is never permission to keep playing: during a watch it pauses the game. Closed before
    // the reveal of a recorded phase, the view stays at the start of that phase, so closing reveals
    // nothing. The latest phase of the viewer's own unfinished game returns to the live edge, where
    // Resume game is.
    close: (finished = false) => {
      if (watch.phase !== 'idle') holdWatch('guide');
      const latestOwn = Boolean(match && walkthrough && match.mode !== 'sample' && walkthrough.turn === match.turns.length - 1 && !finishedGame);
      const stayBefore = Boolean(walkthrough && beat?.board === 'before' && !finished && !latestOwn);
      const at = stayBefore ? walkthrough!.turn : index;
      if (stayBefore) setIndex(at);
      dispatchGuide({ type: 'close', finished });
      followEdge.current = match ? at === match.turns.length : true;
      restoreFocus();
    },
    continueNext: () => {
      if (!match || !walkthrough) return;
      const next = walkthrough.turn + 1;
      if (next >= match.turns.length) return;
      dispatchGuide({ type: 'close', finished: true });
      openTurn(next, 0);
    },
    continueWatching: () => {
      dispatchGuide({ type: 'close', finished: true });
      followEdge.current = true;
      watch.continueWatching();
      restoreFocus();
    },
    resume: () => {
      dispatchGuide({ type: 'close', finished: true });
      restoreFocus();
      void startWatching();
    },
    guidanceOff: () => {
      holdWatch('guide');
      setGuided(false);
      writeGuided(false);
      dispatchGuide({ type: 'close' });
      restoreFocus();
    },
    locate: (code) => setFocus((f) => ({ code, nonce: (f?.nonce ?? 0) + 1 })),
  };

  /** The viewer moved through the record. Scrubbing always stops automatic play. */
  function seek(i: number) {
    holdWatch('seek');
    dispatchGuide({ type: 'close' });
    setIndex(i);
    followEdge.current = match ? i === match.turns.length : true;
  }

  const finishedGame = match ? match.status === 'complete' || match.checkpoints.at(-1)!.state.done : false;
  /** The latest edge of an unfinished game of the viewer's own: the only place that can play a phase. */
  const liveEdge = Boolean(match && match.mode !== 'sample' && index === match.turns.length && !finishedGame);
  const controlling = watch.phase !== 'idle' || match?.status === 'running';

  /** Primary control. At the live edge: start, pause, or resume. Anywhere else: free recorded replay. */
  function onPrimary() {
    if (!match || watch.phase === 'pausing') return;
    if (controlling) {
      holdWatch('paused');
      return;
    }
    if (liveEdge) {
      void startWatching();
      return;
    }
    // Recorded replay, for every mode. It never sends a run request.
    if (reading) {
      guideActions.close(false);
      return;
    }
    if (match.turns.length === 0) return;
    if (guided) {
      openTurn(index >= match.turns.length ? 0 : index, 0);
      return;
    }
    if (expertPlaying) {
      setExpertPlaying(false);
      return;
    }
    if (index >= match.turns.length) setIndex(0);
    setExpertPlaying(true);
  }

  function onStep() {
    if (!match || controlling) return;
    if (index < match.turns.length) seek(index + 1);
    else if (liveEdge) playOnePhase();
  }

  /** Explicitly leaves the recorded past for the latest phase and keeps playing from there. */
  function resumeAtLatest() {
    if (!match) return;
    dispatchGuide({ type: 'close' });
    void startWatching();
  }

  function created(m: Match) {
    ++nav.current;
    present(m);
    setTab(m.parent ? 'Alternate timeline' : 'Watch');
    void refreshList();
  }

  /** Setup's Start game: the created match is on screen, and its first phase is requested now. */
  async function startFirstPhase(m: Match) {
    if (currentId.current !== m.id) created(m);
    starting.current = m.id;
    try {
      const outcome = await watch.begin(m.id, { cleared: 0, immediate: true, report: false });
      if (outcome.kind === 'started' && currentId.current === m.id) setModal(null);
      return outcome;
    } finally {
      if (starting.current === m.id) starting.current = undefined;
    }
  }

  async function extend(maxPhases: number, budgetUsd?: number) {
    if (!match) return;
    const n = nav.current;
    const id = match.id;
    setBusy(true);
    setError('');
    try {
      const next = await api<Match>(`/matches/${id}/extend`, { maxPhases, budgetUsd });
      if (nav.current !== n || currentId.current !== id) return;
      setMatch(next);
      setIndex(next.turns.length);
      followEdge.current = true;
    } catch (e) {
      if (nav.current === n) setError((e as Error).message);
    } finally {
      if (nav.current === n) setBusy(false);
    }
  }

  /** Any view other than the board ends automatic play; coming back needs an explicit Resume. */
  function switchTab(next: Tab) {
    setMenuOpen(false);
    if (next !== 'Watch') holdWatch('navigate');
    if (next === 'Conversations' && reading) {
      // Leaving the board closes the walkthrough at the moment it was showing.
      setIndex(shown);
      dispatchGuide({ type: 'close' });
    }
    setTab(next);
  }

  function openModal(next: 'setup' | 'branch' | 'dossier' | 'help') {
    setMenuOpen(false);
    holdWatch('dialog');
    // A dialog reads the moment on screen; closing the walkthrough keeps that moment.
    if (reading) setIndex(shown);
    setModal(next);
  }

  /** Opens the branch dialog prefilled with one supported "What if?" from the walkthrough. */
  function openWhatIf(w: WhatIf) {
    setBranchPreset(w);
    openModal('branch');
  }

  /** Loads a saved game. Opening never starts it: only the Resume control in Watch sends a request. */
  async function openGame(id: string, at?: number) {
    setTab('Watch');
    return load(id, at);
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
        try {
          localStorage.removeItem('seven-powers-match');
        } catch {
          /* ignore */
        }
        const next = newestSample(list) || list[0];
        if (next) await load(next.id);
        else setMatch(undefined);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Opens the sample walkthrough once its record is on screen (after the load above settled).
  const [pendingGuide, setPendingGuide] = useState<{ id: string }>();
  useEffect(() => {
    if (!pendingGuide || !match || match.id !== pendingGuide.id) return;
    setPendingGuide(undefined);
    openTurn(0, 0);
  }, [pendingGuide, match?.id]);

  /** History's "Open the recorded sample": with Guided view on, its first phase opens with a guide. */
  async function openSample() {
    const list = matches.length ? matches : await refreshList();
    const sample = newestSample(list);
    if (!sample) return;
    const shownOk = await openGame(sample.id, guided ? 0 : 1);
    if (shownOk && guided) setPendingGuide({ id: sample.id });
  }

  /** The welcome's one way in: the newest sample at moment 0, following France, first beat of Spring 1901. */
  async function watchFirstNegotiation() {
    dismissWelcome();
    setFollow('FRANCE');
    const list = matches.length ? matches : await refreshList();
    const sample = newestSample(list);
    if (!sample) return;
    const shownOk = await openGame(sample.id, 0);
    if (shownOk) setPendingGuide({ id: sample.id });
  }

  function dismissWelcome() {
    setWelcomeHidden(true);
    writeFlag(INTRO_KEY, true);
  }

  function openSetup(mode?: 'live' | 'sandbox') {
    setSetupMode(mode);
    openModal('setup');
  }

  function toggleGuided() {
    const next = !guided;
    holdWatch('guide');
    setGuided(next);
    writeGuided(next);
    if (reading) setIndex(shown);
    dispatchGuide({ type: 'close' });
  }

  function conceptSeen(id: ConceptId) {
    setSeenConcepts((s) => {
      const next = new Set(s);
      next.add(id);
      writeSeenConcepts(next);
      return next;
    });
  }

  function locateOnBoard(code: string) {
    if (tab !== 'Watch') setTab('Watch');
    setFocus((f) => ({ code, nonce: (f?.nonce ?? 0) + 1 }));
  }

  /** Every way of closing a dialog (button, Escape, backdrop) ends here. Closing Setup cancels a start in progress. */
  function closeModal() {
    if (modal === 'setup' && starting.current) {
      starting.current = undefined;
      holdWatch('dialog');
      setInfo('Start cancelled. The game is saved and paused. Press Play first phase or Resume game when you are ready.');
    }
    setModal(null);
    setBranchPreset(undefined);
  }

  if (!match)
    return (
      <div className="loading-screen">
        <Brand />
        <img className="loading-mark" src={BRAND_MARK} alt="" width={96} height={96} />
        <h1>{error ? 'The game could not load.' : 'Preparing the European board…'}</h1>
        <p>{error || 'Setting the board. Opening the saved games.'}</p>
        {error && (
          <button className="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
      </div>
    );

  const view = tab === 'Watch' ? shown : index;
  const cp = match.checkpoints[Math.min(view, match.checkpoints.length - 1)];
  const atEdge = view === match.turns.length;
  const running = match.status === 'running';
  const complete = match.status === 'complete' || cp.state.done;
  const noticeText = watch.notice?.text;
  const errorText = error || noticeText || match.error;
  const sampleAvailable = matches.some((m) => m.mode === 'sample');
  const pending = match.mode === 'sample' ? 0 : pendingPhases(guide, match.turns.length);
  const pendingTurn = match.turns.length - pending;
  const pendingSeason = match.turns[pendingTurn] ? `${phaseName(match.turns[pendingTurn].phase)} · ${phaseKind(match.turns[pendingTurn].phase).toLowerCase()}` : undefined;

  let statusText: string;
  if (watch.phase === 'pausing') statusText = 'Pausing · the current model call finishes, then nothing new starts';
  else if (watch.phase === 'reading') statusText = 'Reading · the next phase waits for Continue watching';
  else if (watch.phase === 'stepping') statusText = 'Playing one phase · it stops when the phase resolves';
  else if (watch.phase === 'watching')
    statusText = running || watch.inFlight ? 'Playing · a phase is in progress' : 'Playing · the next phase starts in a moment';
  else if (running) statusText = 'A phase is being played · Pause game stops it';
  else if (expertPlaying) statusText = 'Replaying recorded phases · no model calls';
  else if (reading) statusText = 'Reading · nothing is playing';
  else if (!atEdge) statusText = 'Looking at an earlier moment · nothing is playing';
  else if (complete) statusText = 'Game over';
  else if (noticeText || match.status === 'error') statusText = 'Stopped · see the message above';
  else if (match.mode === 'sample') statusText = 'Recorded sample · no model calls';
  else if (match.turns.length === 0) statusText = 'Ready · press Play first phase to begin';
  else statusText = 'Paused · press Resume game to keep playing';

  const usageText =
    match.mode === 'live'
      ? `${match.usage.calls} calls · $${match.usage.estimatedUsd.toFixed(3)} of $${match.limits.budgetUsd} budget`
      : match.mode === 'sandbox'
        ? 'Free · no model calls'
        : 'No model calls';

  // What the phase summary card offers, from the session's real state.
  const lastTurn = match.turns.length - 1;
  const guideFinal = complete || match.turns.length >= match.limits.maxPhases;
  let summaryAction: SummaryAction = { kind: 'done' };
  if (walkthrough) {
    if (watch.phase === 'reading' && watch.holdTurn === walkthrough.turn)
      summaryAction = guideFinal ? { kind: 'finish' } : { kind: 'continue-watching', calls: 7 * (match.limits.diplomacyRounds + 1) };
    else if (walkthrough.turn < lastTurn) summaryAction = { kind: 'next-recorded', label: phaseName(match.turns[walkthrough.turn + 1].phase) };
    else if (match.mode !== 'sample' && !guideFinal && watch.phase === 'idle' && !running) summaryAction = { kind: 'resume' };
  }

  const tabs: { id: Tab; label: string; secondary?: boolean }[] = [
    { id: 'Watch', label: 'Watch' },
    { id: 'Conversations', label: 'Conversations' },
    { id: 'Timeline', label: 'Timeline' },
    { id: 'History', label: 'History' },
    { id: 'Compared with history', label: 'Compared with history', secondary: true },
    ...(match.parent ? [{ id: 'Alternate timeline' as Tab, label: 'Alternate timeline', secondary: true }] : []),
  ];

  return (
    <div className={`app-shell tab-${tab === 'Watch' ? 'watch' : 'page'}`}>
      <div className="masthead">
        <header className="topbar">
          <Brand />
          <nav aria-label="Main navigation" className="main-nav">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`${tab === t.id ? 'active' : ''} ${t.secondary ? 'secondary' : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button className="button new-simulation" onClick={() => openSetup()}>
            Set up a game
            <ArrowRight size={14} />
          </button>
          <button className="icon-button menu-button" aria-label="Menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu size={22} />
          </button>
        </header>
        <div className="matchbar">
          <div className="match-identity">
            <span className="match-name">{match.name}</span>
            <span className={`mode-label ${match.mode}`}>{MODE_LABEL[match.mode]}</span>
            <span className="phase-label">
              <small>{atEdge ? (match.pending ? 'In progress' : 'Latest') : 'Earlier moment'}</small>
              {phaseName(cp.state.board.name)}
              <i />
              {phaseKind(cp.state.board.name)}
            </span>
            <span className="created-on">{MODE_HINT[match.mode]}</span>
          </div>
          <div className="match-status" data-watch={watch.phase}>
            <span className={`status-dot ${controlling ? 'live' : ''}`} aria-hidden="true" />
            <span className="status-text" aria-live="polite">
              {statusText}
            </span>
            <span className="usage">{usageText}</span>
            <button
              role="switch"
              aria-checked={guided}
              className={`guide-switch ${guided ? 'on' : ''}`}
              onClick={toggleGuided}
              aria-label="Guided view"
            >
              Guided view <b>{guided ? 'on' : 'off'}</b>
            </button>
            <button className="icon-button help-button" aria-label="How to watch" onClick={() => openModal('help')}>
              <CircleHelp size={17} />
            </button>
          </div>
        </div>
      </div>
      {errorText && (
        <div className="error-banner" role="alert">
          <span>{errorText}</span>
          {(error || noticeText) && (
            <button
              aria-label="Dismiss error"
              onClick={() => {
                setError('');
                watch.clearNotice();
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {info && !errorText && (
        <div className="info-banner" role="status">
          <span>{info}</span>
          <button aria-label="Dismiss message" onClick={() => setInfo('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {tab === 'Watch' ? (
        <Theater
          match={match}
          index={shown}
          follow={follow}
          focus={focus}
          watching={controlling}
          guided={guided}
          guide={{
            walkthrough,
            step: guide.step,
            open: reading && Boolean(walkthrough),
            pending,
            pendingSeason,
            summaryAction,
            closePauses: watch.phase !== 'idle',
          }}
          actions={guideActions}
          showWelcome={!welcomeHidden}
          sampleAvailable={sampleAvailable}
          endBusy={busy}
          pausing={watch.phase === 'pausing'}
          seenConcepts={seenConcepts}
          historyNote={historyNoteFor}
          onConceptSeen={conceptSeen}
          onFollow={setFollow}
          onLocate={(code) => setFocus((f) => ({ code, nonce: (f?.nonce ?? 0) + 1 }))}
          onDossier={() => openModal('dossier')}
          onConversations={(id) => {
            setInitialThread(id);
            switchTab('Conversations');
          }}
          onLiveEdge={() => seek(match.turns.length)}
          onWelcomeWatch={() => void watchFirstNegotiation()}
          onWelcomeExplore={dismissWelcome}
          onSetup={() => openSetup()}
          onDismissWelcome={dismissWelcome}
          onExtend={(maxPhases) => void extend(maxPhases)}
          onRaiseBudget={(budgetUsd) => void extend(match.limits.maxPhases, budgetUsd)}
          onReplay={() => {
            if (guided) openTurn(0, 0);
            else {
              setIndex(0);
              followEdge.current = false;
              setExpertPlaying(true);
            }
          }}
          onBranch={() => openModal('branch')}
          onWhatIf={openWhatIf}
        />
      ) : (
        <main className="secondary-content">
          {tab === 'Conversations' && (
            <ConversationsPage
              key={`${match.id}:${initialThread ?? ''}`}
              match={match}
              index={index}
              follow={follow}
              initialThread={initialThread}
              onLocate={locateOnBoard}
              onOpenMoment={(i) => {
                seek(i);
                setTab('Watch');
              }}
            />
          )}
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
          {tab === 'Compared with history' && <HistoricalComparison match={match} index={index} />}
          {tab === 'Alternate timeline' &&
            (parent ? (
              <Comparison match={match} parent={parent} index={index} onOpenOriginal={(id, at) => void openGame(id, at)} />
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
        index={view}
        guided={guided}
        expertPlaying={expertPlaying}
        speed={speed}
        busy={busy}
        session={watch.phase}
        running={running}
        guideOpen={reading}
        onPrimary={onPrimary}
        onStep={onStep}
        onResumeLatest={resumeAtLatest}
        onSeek={seek}
        onBranch={() => openModal('branch')}
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
        <span>ALTERNATE HISTORY · STANDARD DIPLOMACY · FROM 1901</span>
      </div>
      {menuOpen && (
        <MenuSheet
          tabs={tabs}
          current={tab}
          guided={guided}
          onTab={switchTab}
          onGuided={toggleGuided}
          onHelp={() => openModal('help')}
          onSetup={() => openSetup()}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {modal === 'setup' && (
        <Setup
          key={setupMode ?? 'default'}
          configured={configured}
          initialMode={setupMode}
          onClose={closeModal}
          onCreated={created}
          onStart={startFirstPhase}
          onAbandoned={(m) => {
            void refreshList();
            setInfo(`“${m.name}” was saved without starting. Open it from History when you want to play it.`);
          }}
        />
      )}
      {modal === 'branch' && (
        <Branch
          match={match}
          index={branchPreset ? branchPreset.at : index}
          selected={branchPreset ? branchPreset.intervention.power : follow}
          configured={configured}
          preset={branchPreset}
          onClose={closeModal}
          onCreated={(m) => {
            setModal(null);
            setBranchPreset(undefined);
            created(m);
          }}
        />
      )}
      {modal === 'dossier' && (
        <Dossier
          match={match}
          index={index}
          power={follow}
          onClose={closeModal}
          onMoment={(step) => {
            setModal(null);
            // The dossier names an event of the last resolved phase; open the beat that tells it.
            const turn = index - 1;
            const w = deriveWalkthrough(match, turn, { follow });
            const events = w ? w.beats.map((b, i) => (b.kind === 'event' ? i : -1)).filter((i) => i >= 0) : [];
            openTurn(turn, events[step] ?? w?.revealAt ?? 0);
          }}
        />
      )}
      {modal === 'help' && (
        <Help
          onClose={closeModal}
          onShowIntro={() => {
            setWelcomeHidden(false);
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
      <img className="brand-mark" src={`${BRAND_MARK}`} alt="" width={38} height={38} decoding="async" />
      <span>SEVEN POWERS</span>
    </div>
  );
}
