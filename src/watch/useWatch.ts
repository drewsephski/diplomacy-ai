import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Match } from '../types';
import { decideNext, type WatchDecision } from './decide';

/** Reading gap between phases so the viewer can follow the map. Requests stay one phase at a time. */
export const PACE_MS = 1600;

/**
 * The watch session. It is client state only: a page refresh, a closed tab, a toggle, or a
 * switch to another match ends it, and nothing resumes without a new Start or Resume press.
 */
export function useWatch({
  match,
  reading,
  setMatch,
}: {
  match?: Match;
  /** A guide card is open for this match: the viewer is reading, so the next phase waits. */
  reading: boolean;
  setMatch: (m: Match) => void;
}) {
  const [watchingId, setWatchingId] = useState<string>();
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState('');
  const [lastStop, setLastStop] = useState<'paused' | 'finished' | 'limit' | 'error'>();
  const flight = useRef(false);

  const playing = Boolean(match && watchingId === match.id);

  const fire = useCallback(
    async (id: string) => {
      if (flight.current) return;
      flight.current = true;
      setInFlight(true);
      try {
        // One phase per request. The server stops after it resolves, so each phase is visible.
        const next = await api<Match>(`/matches/${id}/run`, { single: true });
        setMatch(next);
      } catch (e) {
        setError((e as Error).message);
        setWatchingId(undefined);
        setLastStop('error');
      } finally {
        flight.current = false;
        setInFlight(false);
      }
    },
    [setMatch],
  );

  const decision: WatchDecision | undefined = match
    ? decideNext({
        playing,
        status: match.status,
        turns: match.turns.length,
        maxPhases: match.limits.maxPhases,
        finished: match.checkpoints.at(-1)!.state.done,
        reading,
        inFlight,
        error: error || undefined,
      })
    : undefined;

  useEffect(() => {
    if (!match || !decision) return;
    if (decision.type === 'stop') {
      if (decision.reason !== 'paused' && playing) setWatchingId(undefined);
      if (decision.reason !== 'paused' && playing) setLastStop(decision.reason);
      return;
    }
    if (decision.type !== 'run') return;
    const timer = window.setTimeout(() => void fire(match.id), PACE_MS);
    return () => window.clearTimeout(timer);
    // The decision inputs are listed explicitly so the timer restarts only when they change.
  }, [decision?.type, match?.id, match?.status, match?.turns.length, reading, playing, inFlight]);

  /** Begins watching a match that is already running its first phase, or starts the first run. */
  const begin = useCallback((id: string) => {
    setError('');
    setLastStop(undefined);
    setWatchingId(id);
  }, []);

  /** Pauses the session. A request already in flight settles; nothing new is sent. */
  const pause = useCallback(async () => {
    setWatchingId(undefined);
    if (match && match.status === 'running') {
      try {
        await api(`/matches/${match.id}/pause`, {});
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setLastStop('paused');
  }, [match]);

  const clearError = useCallback(() => {
    setError('');
    setLastStop(undefined);
  }, []);

  return { playing, inFlight, error, lastStop, begin, pause, clearError, setError };
}
