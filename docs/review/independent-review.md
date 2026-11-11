# Seven Powers: independent review (Opus)

Branch `refactor/end-screen-copy` at `6bba2cf`, working tree clean at the start of the review. This was a read-only product review: no product file, branch, commit, or deployment was changed. The only writes are under `docs/review/`.

## Verdict

**Not ready.** The engine, privacy, History, deletion, and brand work hold up. But the watch session, the core of the requested journey, has defects that can **send model requests the viewer did not ask for** (H1, H2, H4). It also **does not deliver the guided, paced, popup-led live viewing** that was the main request (H3). Two other features are only half delivered: replaying a person's own saved game (M4), and a mobile guided card the viewer can actually see (M6). All of these are code or UX bugs, not documentation gaps. The docs are stale as well (L1).

## How this was tested

- **Code reading:** `src/App.tsx`, `src/watch/{useWatch,decide}.ts`, `src/guided/{reducer,prefs,outcome}.ts`, the parts of `src/guided/events.ts` that make claims, `src/components/{Theater,Playback,Story,GuideCard,EndScreen,Setup,SavedGames,Shared}.tsx`, `src/history.ts`, `src/api.ts`, and `server/{index,store,simulation,privacy,provider}.ts`.
- **Full browser suite:** run with `OPENROUTER_API_KEY=` (blanked on purpose, so no paid call was possible). 26 passed, 2 skipped, 2 failed. Both failures are explained in L2: those tests only pass when the real key is in `.env`. Log: the scratchpad `suite.log` (not committed).
- **Isolated repro server:** `PORT=3012 DATA_DIR=<temp> OPENROUTER_API_KEY= npx tsx server/index.ts`, with sandbox games only. Every `POST /run` stands for "one phase requested". In a live game, one such request is up to 7 × (rounds + 1) billed model calls: 21 with the default 2 rounds.
- **Repro scripts:** `docs/review/repros/watch-repros.mjs` (R1–R11), `visual.mjs`, `mobile-overflow.mjs`, and `brand.mjs`. One clean full run reproduced all 11, and its results are in `docs/review/evidence/watch-repros.json`. Run it with no env flags; `FROM_R5` and `FROM_R4` only skip earlier sections.
- **Screenshots:** 1536×1024, 1280×800, and 390×844 (2×) in `docs/review/evidence/`.
- **Production data:** checked through a read-only SQLite query and `GET :3001/api/matches`. It holds only *The fragile peace* (sample, complete, 9 phases). The parent's servers on 3001 and 5173 were not touched.
- **Not run:** `pnpm lint`, `typecheck`, the unit tests, and DATC. The parent reported these as passing, and nothing here depended on them.

## Findings, most severe first

### H1 · Opening a saved game from History restarts an old watch session with no Resume press (unasked billing)
- **Where:**
  - `src/watch/useWatch.ts:23,29`: `watchingId` persists, and `playing = watchingId === match.id`.
  - `src/App.tsx:282-292`: `created()` switches the match without ending the session.
  - `src/App.tsx:324-328`: `openGame` only pauses when `watch.playing` is true for the match currently on screen.
- **Trigger:**
  1. Watch game A.
  2. Open **Set up a game** (the watch keeps running behind the dialog) and press Start game.
  3. The create step succeeds, so the screen switches to game B. The start step fails. This happens naturally when A is mid-phase, because the server refuses a second active job (`server/simulation.ts:261`). It also happens on any network or provider error.
  4. Close the dialog, open History, and open A.
- **Actual:** A resumes requesting phases on its own.
  - Repro R4: `runsAfterOpening: 2, turnsBefore: 1, turnsAfter: 3, status: "Playing · the next phase starts in a moment"`.
  - The History lede (`SavedGames.tsx:47`) promises "Opening a game only loads its record: it never plays a phase or spends money."
- **Expected:** Leaving a match by any route ends its session. Opening a record never plays it.

### H2 · The reading pause is silently lifted by any dialog, toggle, or seek, so play resumes behind modals
- **Where:**
  - `src/App.tsx:153-156`: every modal dispatches `close` to the guide.
  - `src/App.tsx:49-56`: `reading` is the only presentation gate.
  - `src/App.tsx:215-220`: seek closes the guide.
  - `src/App.tsx:453-458`: the Guided view toggle closes the guide.
  - No dialog pauses the watch itself, and *Country details* stays enabled while watching.
- **Trigger:** While watching, open the guide (the reading pause), then press **How to watch**.
- **Actual:** The guide closes and the watch fires 1.6 s later, while the Help dialog is still open. Repro R1: `runsWhileHelpOpen: 2, helpDialogOpen: 1` (`evidence/r1-help-open-while-running.png`). The same path applies to Country details, Setup, the Guided-view toggle, the "Turn guidance off" button, and seeking (R9).
- **Expected:** Opening a dialog or hidden view pauses the session, or at least holds it like reading does. Nothing auto-resumes until the viewer explicitly resumes.

### H3 · Guided live play does not guide or pace: no automatic popups, a misleading status line, no clear Resume
- **Where:**
  - `src/App.tsx` has no code that opens the guide when a phase arrives.
  - `src/components/Theater.tsx:78-89`: "Walk through this phase" is `disabled: watching`.
  - `src/watch/useWatch.ts:7`: `PACE_MS = 1600`.
  - `src/App.tsx:389-402`: status-line ordering.
  - `src/components/GuideCard.tsx:195-203,230-243,252`.
  - `src/guided/reducer.ts:39-42`.
- **What the repros show:**
  - **R7 (no automatic popup):** after a phase resolves during a watch, no guide card opens (`guideCardsOpenAfterPhase: 0`). The next phase is requested 1.6 s later. The only way into the guide is a "Start the guide" banner inside the right panel's *What happened* tab, which is far below the fold on mobile. The prominent "Walk through this phase with a guide" link is disabled while watching. A viewer with no Diplomacy knowledge who presses Start game sees a map that changes about every 2 s (sandbox) or every phase (live), with no popups.
  - **R3 (status line):** while the guide is open and the game is waiting, the status says `"Playing · the next phase starts in a moment"`. The `reading` branch is never reached because the `watch.playing` branches are checked first.
  - **R11 (summary card):** during a watch, the summary card for the latest phase says *"Nothing runs until you choose. Agent calls are billed…"*, but its only buttons are `Replay this phase / Close guide / Turn guidance off`. Closing resumes billed play automatically. Closing also passes `finished=false`, so the phase is never marked reviewed and the "ready" banner stays (`readyBannerAfterClose: 1`). See `evidence/r11-summary-during-watch.png`.
- **Expected:**
  - Each new phase opens its walkthrough, with what happened, why, and map focus. Play holds until the viewer finishes or skips.
  - The status line reads "Reading · paused".
  - The card offers an explicit **Resume game** or **Continue watching**, and finishing marks the phase reviewed.

### H4 · Pause pressed while the `/run` response is pending sends no `/pause`, so a whole phase is billed after Pause
- **Where:**
  - `src/watch/useWatch.ts:86-96`: `/pause` is only sent if the client already holds `status === 'running'`.
  - `server/index.ts:141-145`: `/run` starts the job before it responds.
  - `pauseRequested` is never set to `true` (`App.tsx:41`; only `setPauseRequested(false)` exists), so the "Pausing…" state in `Playback.tsx:72-75` is unreachable.
- **Trigger:** Press Pause in the window after the watch has sent `/run` but before its response arrives. That window is up to network latency; the repro widened it with a delayed route.
- **Actual:** R5 recorded `labelWhenPausing: "Pause game", runRequests: 1, pauseRequests: 0, turnsResolvedAfterPause: 1`. The status line meanwhile says *"Finishing the request already sent · nothing new will start"*. On the server, that one request is a whole phase: up to 21 model calls with defaults (`simulation.ts:292-357`), and none of them sees `job.pause`.
- **Expected:** Pause always reaches the server. For example, queue a `/pause` for when the in-flight `/run` settles, or always POST `/pause` (it is idempotent). The button then shows "Pausing…" until the server is idle.

### M1 · Other tabs and a hidden browser tab keep the watch requesting phases
- **Where:**
  - `src/App.tsx:317-321`: only `History` pauses. The comment above it claims tab switches never leave a session running.
  - The code has no `visibilitychange` handler.
- **Actual:** R2 recorded `runsOnMessagesTab: 2` while the board was not visible. Timeline and *Compared with history* behave the same way, as does a backgrounded browser tab (confirmed in code, no repro).
- **Expected:** Per the brief, timers must not run behind a hidden view. Either pause, or hold the session the way reading does.

### M2 · Scrubbing to an earlier moment keeps billing and drops the reading pause
- **Where:** `src/App.tsx:215-220`.
- **Actual:** R9 recorded `runsAfterSeek: 2, at: 0, of: 6, status: "Playing · a phase is in progress"`. The viewer is looking at the opening while new phases are bought.
- **Expected:** Either seeking pauses the session, or the status line plainly says it is still playing.

### M3 · Dismissing Setup during "Starting…" still creates the game, starts it, and watches it
- **Where:** `src/components/Setup.tsx:98-118` keeps running after unmount. `App.started` (`src/App.tsx:295-299`) calls `watch.begin`.
- **Actual:** R8 pressed Escape about 200 ms after Start game and recorded `dialogsOpen: 0, runRequests: 2, games: [{phases: 2}], status: "Playing…"`.
- **Expected:** Closing the dialog before the start request is sent cancels the start. At minimum, it should not begin a watch session.

### M4 · A person's own saved game cannot be replayed (guided or auto) from its controls
- **Where:**
  - `src/App.tsx:241-270`: the replay branch only runs when `mode === 'sample'`.
  - `src/components/Playback.tsx:79-91`.
  - `src/components/Story.tsx:40-47`: at index 0 it returns early, so the guide prop is never rendered there.
  - `src/components/SavedGames.tsx:96-103`.
- **Actual (R6):**
  - **Completed game, opened with History "From the start":** the primary control reads **"Game over"** and is disabled. The story panel says "Press Play or Play next phase…", and there is no guide link (`guideLaunchVisible: 0`). See `evidence/r6-finished-from-start.png`.
  - **Paused game, opened the same way:** the primary control is **"Resume game: jump to the latest phase and keep playing"**. The single most prominent button therefore discards the replay position and starts billing.
  - **Only remaining route:** press *Next moment* once, then use the story link to open the guide. There is no timed replay for non-sample games.
- **No new calls:** `runRequests: 0` on opening, so replay itself never bills.
- **Expected:** Live and sandbox records get the same replay (with a guide, and timed when guidance is off) as the sample. Resume stays a separate, clearly labelled action.

### M5 · Watch-session errors are swallowed
- **Where:** `useWatch` stores `error` and `lastStop` (`useWatch.ts:40-44`), and `decide.ts` exports `stopText`. Nothing in `src/` outside `src/watch/` reads them (checked with grep).
- **Trigger:** A `/run` that fails at the HTTP level, for example "Pause the running match before starting another.", "Match not found.", or a network error.
- **Actual:** The session stops silently. The status line falls back to "Paused · press Resume game", and no banner explains why.

### M6 · Mobile guided view: the card opens off-screen, the map focus is covered, and the matchbar overflows
- **Card off-screen:** at 390×844, the primary *Watch with a guide* button sits at the bottom of a long page. Tapping it opens the card about 2,000 px above the viewport (`card.y = -1987`, `cardVisible: false`). `GuideCard` focuses with `preventScroll: true` (`GuideCard.tsx:57`). See `evidence/m390-guide-card.png` (nothing visible changes) and `m390-guide-card-scrolled-to.png`.
- **Map focus covered:** once scrolled to, the card covers most of the map, including the focused province (Brest). The body text is cut off after two lines inside the card.
- **Matchbar overflow:** while reading, the longer status text pushes *Guided view* and *How to watch* past the edge: `scrollWidth 444 > 390`, offenders `button.guide-switch`, `button.icon-button`. See `evidence/m390-matchbar-reading.png`. The existing mobile overflow test does not open the guide.
- **Desktop:** 1536×1024 and 1280×800 are usable. The card, the *Next event* button, and the focus all stay in view; a term is reachable by keyboard and its definition is announced. At 1280×800, though, the card covers the middle of a cramped map (`evidence/d1280-guide-card.png`).

### M7 · A late single-phase or extend response can overwrite the game now on screen (code-only)
- **Where:** `src/App.tsx:231` (`playOnePhase`) and `:307` (`extend`) call `setMatch(next)` without the `currentId` guard that the watch and polling paths use.
- **Trigger:** Press *Play next phase*, then open another game before the response arrives.
- **Actual:** The old game's record replaces the newly opened one on screen.
- **Evidence:** Static analysis only, not reproduced.

### L1 · Product docs describe the old flow (documentation gap, not a code bug)
- **`README.md`**
  - Line 26: "New simulation → Live agents", "Run agents", "Run one phase".
  - Line 58: "change replay pace" for all games.
  - Line 45: "checkpoint" and "live edge" wording.
  - The History tab, the watch session, and deletion are not described.
- **`docs/VERIFICATION.md`**
  - Lines 52-54 and 125: says the archive "lists seven records" and that earlier records are "preserved unchanged". Those records were deleted at the user's request, and production now holds only the sample.
  - Lines 152-170: name archive records that no longer exist.
- **`docs/DESIGN.md`**
  - Lines 19-23 and 54: old labels ("Watch the recorded sample", "Checkpoint k of n", "Jump to the live edge", "press Run").
  - No section on History, the watch session, or the guided card.

### L2 · Two browser tests need the real billing key in `.env`
- **Where:** `playwright.config.ts` starts the test server with `pnpm start`, which loads `.env`. Two tests rely on `liveConfigured: true` from the real server instead of mocking `/api/health`: `app.spec.ts:298` (setup presets) and `:386` (mobile).
- **Actual:** With the key blanked, both tests time out on disabled preset chips.
- **Risk:** The suite runs a server that holds a working OpenRouter key. A future test regression could bill, and CI without a key goes red.

### L3 · Minor
- While the card is open, the footer still offers *Watch with a guide*, which does nothing.
- The sample's expert replay timer keeps running behind dialogs. It is free.

## Checked and working

- **Nothing runs on load or refresh:** opening records sent 0 `/run` requests in R6. The existing tests "opening the app never starts a model run" and History's "opening one never plays it" pass. A server restart turns `running` into `paused` (`store.ts:107-119`). This holds except through the H1 path.
- **Setup two-stage start:** create runs once and a failed start keeps the match; the retry repeats only the start (`Setup.tsx:98-118`, and the existing tests at `history.spec.ts:166` and `:226` pass). Rapid clicks are guarded by `flight`. A `/run` that returns HTTP 200 with `status: error` is handled: the watch stops with reason `error` and `match.error` appears in the banner.
- **History:** it is a top-level tab, separate from Timeline and *Compared with history*. The sample is listed apart and cannot be deleted. Delete asks first; focus goes to "Keep game" and Escape cancels. Delete is disabled for running rows, and the server refuses active games (`simulation.ts:397-404`). A deleted game that was open falls back to the sample. A missing original shows the graceful "comparison unavailable" text in both History and the *Alternate timeline* tab.
- **Production data** holds only the labelled sample.
- **Privacy:**
  - `agentView` sends the shared briefing to every country, and each country's own instructions only to that country.
  - It sends own legal orders, own memory, and only visible messages. Other countries' sealed decisions are never sent. Spectators get `decisions: {}` while a phase is pending.
  - Guidance is stored only for live games.
  - Legal-order enum schemas plus the engine-side promise check are preserved (`provider.ts:27-76`, `simulation.ts:318`).
- **Guided wording:** where I read `events.ts`, the copy distinguishes attempt from success and proposal from agreement. Events read only checkpoints t and t+1.
- **18-center winner vs run limit:** `outcomeOf` reports a win only at 18 or more centers. Phase limit, budget, and error each get their own wording, in History and on the end screen.
- **Brand:** the in-page mark is transparent and readable at 16 and 38 px on dark and light backgrounds (`evidence/brand-small.png`). The favicon is `.ico` (16/32) plus 16, 32, 48, and 180 px PNGs and a manifest. The approved logo was not reassessed as a design.

## Coverage limits

- No live provider call was made. The live-billing impact in H1, H2, H4, M1, M2, and M3 is inferred from the sandbox request count, with each `/run` worth up to 21 billed calls.
- H4's timing window was widened artificially with a delayed route.
- The branch, dossier, private-observation, and export flows were covered only by the existing passing suite, not re-examined in depth.
- `events.ts` was spot-checked, not read line by line.
- Accessibility was checked by script for the card, terms, and focus, not with a screen reader.
