# Seven Powers: recheck after remediation (Opus)

> **Follow-up after this review:** N1 is fixed in `src/watch/useWatch.ts`. A rejected overlapping request clears only its own session and reports a retry message through Setup or the match banner. It never queues an automatic retry. Two browser regressions cover both entry points, holding the previous response until after the rejection, checking that no new phase plays when it arrives, and then verifying an explicit retry. The existing pending-response Pause test now returns a simulated `running` response and requires two pauses with the same ticket, covering the H4 test gap noted below. The original independent findings are preserved below; this follow-up was implemented by the parent agent.

Branch `refactor/end-screen-copy`, uncommitted remediation working tree (unchanged by this recheck). Read-only review: no product file, branch, commit, `.env`, or real `data/` was touched. New files are only under `docs/review/` (this file, `repros/recheck.spec.ts`, `repros/recheck.playwright.config.ts`, `evidence/recheck-*.png`). Parent servers on 3001/5173 were not touched; `GET :3001/api/matches` (read-only) still lists only the sample *The fragile peace*.

## Verdict

**Ready, with one low-severity defect to fix.** Every original finding (H1–H4, M1–M7, L1–L3) is resolved in code and holds under independent browser scenarios. No unintended `/run` was observed anywhere. One new defect from the refactor: a start that collides with a still-pending run leaves a **zombie session** that claims "Playing" while sending nothing (N1 below). It cannot bill on its own, but the status line and Setup's error are both wrong. The documented limits are real limits, not defects.

## Tests actually run

Every process ran with `OPENROUTER_API_KEY=` (empty), port 3012, and a fresh `mkdtemp` `DATA_DIR`.

| Check | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | exit 0 |
| `pnpm test` | 69/69 TS, 10/10 pytest |
| `npx playwright test` (full suite, includes `pnpm build`) | **83 passed, 3 skipped** (the opt-in screenshot captures), 7.4 min |
| Race subset (`Pause pressed`, `late`, `closing Setup`, `slow open`, `failed run`, `losing contact`, `refresh`, `survives nothing`) `--repeat-each=3` | **36/36 passed** |
| My scenarios, `docs/review/repros/recheck.spec.ts` (run with `npx playwright test --config docs/review/repros/recheck.playwright.config.ts`; that folder needs a `node_modules` symlink, or copy it into a scratch folder) | 7 scenarios, results below |

## Original findings

| # | Status | Independent evidence |
|---|---|---|
| H1 old session restarts on reopen | **Resolved** | No persisted watch identity. `present()`/`load()` call `holdWatch('switch')` (`src/App.tsx:96-97,117-119`), and a stale token is ignored (`src/watch/useWatch.ts:146`). The suite's *survives nothing* and *late run response for a game you left* tests pass 3/3 on repeat. |
| H2 dialogs/toggles/seek resume play | **Resolved** | `holdWatch` is called from `openModal`, `switchTab`, `seek`, the toggle, guide close, and guidance-off (`App.tsx:381,376,282`, the Guided-view toggle `onClick`, and `guideActions.close`/`guidanceOff`). N3: pressing *Continue watching* and then *How to watch* 150 ms later, inside the 1.6 s pace window, sent **0** runs (`runsLater: 1` = the first phase only). 23 interrupt tests pass. |
| H3 guided live play | **Resolved** | Hold-before-finish ordering is in `decide.ts:44`, and the hold effect opens the card (`App.tsx:206`). The status shows *Reading · the next phase waits…* first. The summary offers Continue watching / See the result / Resume, depending on real state (`App.tsx:499-506`). Exact run counts (1, then 2) are verified by the suite. |
| H4 pause during pending `/run` | **Resolved** | The ticket is honoured server-side (`server/simulation.ts:271-272`, HTTP 409). N2 faked a late `/run` response that reports `running`: the client sent a **second pause with the same ticket** (`pauses: 2, sameTicket: true`), no further run, and ended *Paused*. The suite's equivalent test cannot reach this path with a sandbox, because the phase has already finished by response time. Its assertion `toBeGreaterThanOrEqual(1)` (`watch.spec.ts:323`) is already true before the response, so it is weak. N2 covers the gap. |
| M1 other tabs / hidden page | **Resolved** | There is a `visibilitychange` listener (`App.tsx:158-164`), and `switchTab` holds for every tab other than Watch. Interrupt tests pass. |
| M2 seek keeps billing | **Resolved** | `seek()` calls `holdWatch('seek')`. Tests pass for guided and expert. |
| M3 Setup dismissal | **Resolved** | `alive` ref plus `onAbandoned` (`Setup.tsx:70-76,121-124`). `closeModal` pauses a start that was already sent (`App.tsx:438-444`). Tests pass 3/3 on repeat. |
| M4 replay own saved games | **Resolved** | N7: a finished sandbox game opened via History *From the start* shows **Play replay**, advances to *Moment 2 of 2*, and sends **0** runs. The suite has 10 replay tests (sample, sandbox, and fake live; paused and finished). |
| M5 swallowed errors | **Resolved** | Per-match `notice` (`useWatch.ts:160,264`) is rendered in the banner (`App.tsx:467`). One exception: see N1, where a collision error is not surfaced as a notice. |
| M6 mobile guide | **Resolved** | N6 at 390×844 and 360×640 (2×, touch), on a guided watch hold (not only the sample): the sheet is on screen (top 439/333), `scrollWidth == innerWidth`, the focused BRE→ENG move is visible above the sheet, every action button is visible, focus is in the card, and *Continue watching* sits fully on screen. See `evidence/recheck-m390-hold.png` and `recheck-m360-hold.png`. Minor docs-evidence issue: `docs/guided-watch-mobile.png` is captured after an artificial `scrollTo(0,0)` (`screenshots.spec.ts:133`), so it shows the intro card rather than the map focus that a real viewer sees. |
| M7 late responses overwrite | **Resolved** | `nav`/`currentId` guards in `load`, `present`, and `extend` (`App.tsx:117-128,364`). Tests pass on repeat. |
| L1 stale docs | **Resolved** | README, DESIGN, and VERIFICATION describe the session, tickets, replay, History, and the blank-key test server. The archive note is accurate against the live store. The claimed check counts match what I reproduced. |
| L2 tests need real key | **Resolved** | `playwright.config.ts` blanks the key inline and in `env`. The full suite passed with the key blank. `no-billing.spec.ts` asserts `liveConfigured: false`. |
| L3 dead button / replay timer | **Resolved** | The footer reads *Close guide* while a card is open, and `holdWatch` clears `expertPlaying`. |

## New defect

### N1 (Low) · Starting a game while another game's run response is in transit leaves a zombie "Playing" session

- **Where:**
  - `src/watch/useWatch.ts:138`: `fire()` returns `{kind:'failed'}` when any flight exists, but leaves the session that `begin()` just set (`:187`, `fired:false`) in place.
  - `useWatch.ts:231-245`: the pace-timer effect does not depend on `flight`, so it never re-arms once the old flight settles.
  - `fire()`'s early return also skips `setNotice`.
- **Repro** (`recheck.spec.ts` N1, deterministic):
  1. Delay game A's `/run` response by 5 s.
  2. Press *Play first phase* on A.
  3. Open Setup (A is paused with its ticket, which is correct), create sandbox game B, and press **Start game** while A's response is pending.
- **Actual:**
  - Setup shows "A request is already being sent." and *Try starting again*.
  - Behind the dialog, and still **after closing it**, the status reads *Playing · the next phase starts in a moment* and the primary control reads **Pause game**.
  - For 17 s, `runsB: 0`, B stays `paused` with 0 phases, and no notice is shown (`evidence/recheck-n1-stuck.png`).
  - No unasked run was sent. Pressing Pause clears the state.
- **Exposure:** the window is only the network round trip of a `/run` response. That is milliseconds on localhost, but real on a slow link. The same path applies to Resume on another game pressed inside that window.
- **Fix sketch:**
  - In `fire()`'s early-return branch, clear the session if `sessionRef.current?.token === s.token`, and report it (or make `begin()` wait for the old flight to settle).
  - Give Setup a plain message such as "The previous game is still finishing its request; try again in a moment."
  - Add a regression test modelled on N1.

## Observations (not defects)

- **Double-click on Play first phase (N4):** 1 run, then a pause. The second click is read as Pause because the control toggles. No extra phase was played. This is acceptable.
- **Two pages showing the same game (N5):** inconclusive with sandbox games, because a sandbox phase is never `running` long enough. By code, `holdWatch` pauses any match shown as `running` (`App.tsx:88-90`), even one started by another page. The watching page's session then sees `paused` and requests the next phase. The worst case is one interrupted-then-resumed phase, not a duplicate one. Worth a note only.
- **Accepted limits, confirmed as limits:**
  - A provider call that has already been sent is not aborted.
  - A live pause stops between calls.
  - A sandbox phase that reached the server completes (seen in the suite: `turns <= 1`).
  - No real-provider latency was tested.
  - Chromium only, with no screen-reader pass.
