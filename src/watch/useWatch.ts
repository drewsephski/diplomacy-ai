import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Match } from '../types';
import { decideNext, noticeText, type WatchDecision } from './decide';

/** Gap between phases in a continuous (expert) watch, so each resolved board is visible. */
export const PACE_MS = 1600;
const POLL_MS = 1000;

/** Why a session ended. Only an explicit Start, Resume, Continue watching, or Play next phase begins one. */
export type StopReason =
  | 'paused'
  | 'hidden'
  | 'navigate'
  | 'dialog'
  | 'switch'
  | 'seek'
  | 'guide'
  | 'finished'
  | 'limit'
  | 'error'
  | 'step';

export type WatchPhase = 'idle' | 'watching' | 'reading' | 'stepping' | 'pausing';

export interface WatchNotice {
  matchId: string;
  kind: 'request' | 'connection' | 'pause';
  text: string;
}

/** The result of the first run request of a session, for callers that report it (Setup). */
export type RunOutcome = { kind: 'started'; match: Match } | { kind: 'cancelled' } | { kind: 'failed'; error: string };

interface Session {
  /** Identity of this session. Any response or timer carrying an older token is ignored. */
  token: number;
  matchId: string;
  kind: 'watch' | 'once';
  cleared: number;
  /** Phases recorded when the session last looked, to detect a phase that resolved during it. */
  seen: number;
  fired: boolean;
  /** Report a failed request in the banner. Setup reports its own first-start failure instead. */
  report: boolean;
}

interface Flight {
  token: number;
  matchId: string;
  ticket: string;
}

const newTicket = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * The watch session: the single owner of every run request the page sends.
 *
 * - One session at a time, for one match, with a fresh token. `stop()` invalidates the token
 *   unconditionally, so a late response, poll, or timer can never restart or continue it.
 * - Every run request carries a ticket. Pause sends the same ticket, which also cancels a run request
 *   that has not reached the server yet; once the run's response arrives the pause is sent again, so
 *   Pause always wins. The phase shows "Pausing" until the server reports it is idle.
 * - A phase that resolves during a guided session holds the session until Continue watching.
 */
export function useWatch({
  match,
  guided,
  reading,
  onMatch,
}: {
  /** The match on screen. */
  match?: Match;
  guided: boolean;
  /** A guide card is open. */
  reading: boolean;
  /** A fresher record of a match. The caller keeps it only if that match is still on screen. */
  onMatch: (m: Match) => void;
}) {
  const [session, setSessionState] = useState<Session>();
  const [flight, setFlightState] = useState<Flight>();
  const [pausing, setPausing] = useState<{ matchId: string; ticket?: string }>();
  const [notice, setNotice] = useState<WatchNotice>();
  const [arrival, setArrival] = useState<{ matchId: string; turn: number; kind: Session['kind']; seq: number }>();
  const sessionRef = useRef<Session>(undefined);
  const flightRef = useRef<Flight>(undefined);
  const tokens = useRef(0);
  const arrivals = useRef(0);
  const lastTicket = useRef(new Map<string, string>());
  const matchRef = useRef(match);
  matchRef.current = match;
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  const setSession = useCallback((s: Session | undefined) => {
    sessionRef.current = s;
    setSessionState(s);
  }, []);
  const setFlight = useCallback((f: Flight | undefined) => {
    flightRef.current = f;
    setFlightState(f);
  }, []);

  const sendPause = useCallback(async (matchId: string, ticket?: string) => {
    try {
      await api(`/matches/${matchId}/pause`, { ticket });
      return true;
    } catch (e) {
      const text = noticeText('pause', (e as Error).message);
      setNotice((n) => (n?.matchId === matchId && n.kind === 'connection' ? n : { matchId, kind: 'pause', text }));
      setPausing((p) => (p?.matchId === matchId ? undefined : p));
      return false;
    }
  }, []);

  /** Ends any session and asks the server to pause whatever this page may have started. Always safe. */
  const stop = useCallback(
    (_reason: StopReason, runningId?: string) => {
      const s = sessionRef.current;
      if (s) setSession(undefined);
      const target = s?.matchId ?? runningId;
      if (!target) return;
      const f = flightRef.current;
      const m = matchRef.current;
      const inFlight = f?.matchId === target;
      const serverBusy = inFlight || (m?.id === target && m.status === 'running') || runningId === target;
      if (!serverBusy) return;
      const ticket = inFlight ? f!.ticket : lastTicket.current.get(target);
      setPausing({ matchId: target, ticket });
      void sendPause(target, ticket);
    },
    [sendPause, setSession],
  );

  const fire = useCallback(
    async (s: Session): Promise<RunOutcome> => {
      if (flightRef.current) {
        const error = 'The previous request is still finishing. Try again in a moment.';
        if (sessionRef.current?.token !== s.token) return { kind: 'cancelled' };
        setSession(undefined);
        if (s.report) setNotice({ matchId: s.matchId, kind: 'request', text: noticeText('request', error) });
        return { kind: 'failed', error };
      }
      const ticket = newTicket();
      setFlight({ token: s.token, matchId: s.matchId, ticket });
      lastTicket.current.set(s.matchId, ticket);
      if (sessionRef.current?.token === s.token) setSession({ ...sessionRef.current, fired: true });
      try {
        // One phase per request. The server stops after it resolves, so each phase is visible.
        const next = await api<Match>(`/matches/${s.matchId}/run`, { single: true, ticket });
        if (sessionRef.current?.token !== s.token) {
          // The session ended while the request was in transit. The job now exists, so pause it again.
          if (next.status === 'running') await sendPause(s.matchId, ticket);
          return { kind: 'cancelled' };
        }
        // Only the first request of a Setup start is reported by Setup; later ones use the banner.
        const current = sessionRef.current;
        if (!current.report) setSession({ ...current, report: true });
        onMatchRef.current(next);
        return { kind: 'started', match: next };
      } catch (e) {
        const error = (e as Error).message;
        if (sessionRef.current?.token !== s.token) return { kind: 'cancelled' };
        setSession(undefined);
        if (s.report) setNotice({ matchId: s.matchId, kind: 'request', text: noticeText('request', error) });
        return { kind: 'failed', error };
      } finally {
        if ((flightRef.current as Flight | undefined)?.ticket === ticket) setFlight(undefined);
      }
    },
    [sendPause, setFlight, setSession],
  );

  /**
   * Starts a session for one match. Any previous session ends first (and its match is paused if
   * this page may have started it). `immediate` sends the first request now instead of after a pace.
   */
  const begin = useCallback(
    (matchId: string, opts: { kind?: 'watch' | 'once'; cleared: number; immediate?: boolean; report?: boolean }) => {
      const previous = sessionRef.current;
      if (previous && previous.matchId !== matchId) stop('switch');
      const m = matchRef.current;
      const s: Session = {
        token: ++tokens.current,
        matchId,
        kind: opts.kind ?? 'watch',
        cleared: opts.cleared,
        seen: m?.id === matchId ? m.turns.length : opts.cleared,
        fired: false,
        report: opts.report ?? true,
      };
      setSession(s);
      setNotice((n) => (n?.matchId === matchId ? undefined : n));
      if (opts.immediate || s.kind === 'once') return fire(s);
      return Promise.resolve<RunOutcome>({ kind: 'cancelled' });
    },
    [fire, setSession, stop],
  );

  /** The viewer finished reading the held phase and chose to keep watching. */
  const continueWatching = useCallback(() => {
    const s = sessionRef.current;
    const m = matchRef.current;
    if (!s || !m || s.matchId !== m.id) return;
    setSession({ ...s, cleared: m.turns.length, seen: m.turns.length });
  }, [setSession]);

  const clearNotice = useCallback(() => setNotice(undefined), []);

  // A phase that resolved during the session: tell the page, so a guided view can open its walkthrough.
  useEffect(() => {
    const s = sessionRef.current;
    if (!match || !s || s.matchId !== match.id || match.turns.length <= s.seen) return;
    setSession({ ...s, seen: match.turns.length });
    setArrival({ matchId: match.id, turn: match.turns.length - 1, kind: s.kind, seq: ++arrivals.current });
  }, [match?.id, match?.turns.length, setSession]);

  const active = session && match && session.matchId === match.id ? session : undefined;
  const inFlight = Boolean(flight && match && flight.matchId === match.id);
  const decision: WatchDecision | undefined =
    active && match
      ? decideNext({
          kind: active.kind,
          fired: active.fired,
          status: match.status,
          turns: match.turns.length,
          maxPhases: match.limits.maxPhases,
          finished: match.checkpoints.at(-1)!.state.done,
          guided,
          cleared: active.cleared,
          reading,
          inFlight,
        })
      : undefined;

  useEffect(() => {
    if (!active || !decision) return;
    if (decision.type === 'stop') {
      if (sessionRef.current?.token === active.token) setSession(undefined);
      return;
    }
    if (decision.type !== 'run') return;
    const token = active.token;
    const timer = window.setTimeout(() => {
      const s = sessionRef.current;
      if (s?.token === token) void fire(s);
    }, PACE_MS);
    return () => window.clearTimeout(timer);
    // The decision inputs are listed explicitly so the timer restarts only when they change.
  }, [decision?.type, active?.token, active?.cleared, match?.status, match?.turns.length, reading, guided]);

  // Follow the current match while the server works on it. Polling is a free read.
  const pollCurrent =
    match && match.status === 'running' && !inFlight && pausing?.matchId !== match.id ? match.id : undefined;
  useEffect(() => {
    if (!pollCurrent) return;
    let busy = false;
    let reported = false;
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await api<Match>(`/matches/${pollCurrent}`);
        onMatchRef.current(next);
      } catch (e) {
        if (reported) return;
        reported = true;
        // Lost contact while a phase plays: end automatic play and ask the server to pause it.
        setNotice({ matchId: pollCurrent, kind: 'connection', text: noticeText('connection', (e as Error).message) });
        stop('error', pollCurrent);
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pollCurrent]);

  // "Pausing" lasts until the paused match's request has settled and the server reports it idle.
  const pausingId = pausing?.matchId;
  const pausingFlight = Boolean(flight && flight.matchId === pausingId);
  useEffect(() => {
    if (!pausingId || pausingFlight) return;
    let busy = false;
    let cancelled = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await api<Match>(`/matches/${pausingId}`);
        if (cancelled) return;
        onMatchRef.current(next);
        if (next.status !== 'running') setPausing((p) => (p?.matchId === pausingId ? undefined : p));
      } catch {
        /* Keep showing Pausing; the next check retries. A lost connection is reported by the poll above. */
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pausingId, pausingFlight]);

  let phase: WatchPhase = 'idle';
  if (match && pausing?.matchId === match.id) phase = 'pausing';
  else if (active?.kind === 'once') phase = 'stepping';
  else if (active) phase = decision?.type === 'wait' && decision.reason === 'hold' ? 'reading' : 'watching';

  return {
    phase,
    /** The held phase index, while a guided session waits for the viewer to read it. */
    holdTurn: phase === 'reading' && active ? active.cleared : undefined,
    inFlight,
    notice: match && notice?.matchId === match.id ? notice : undefined,
    arrival,
    begin,
    stop,
    continueWatching,
    clearNotice,
  };
}
