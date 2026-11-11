# Verification record

> **Archive note.** The saved archive records named in the sections below (the live proof runs, “A continent of possibilities”, the three-model runs, and the earlier sandbox records) were deleted from the local database at the owner's request. Their results are kept here as history only; they can no longer be opened in History. The local database now holds only the labelled sample, *The fragile peace*.

## Current verification: observer experience

November 11, 2026, local macOS, Chromium only, against an isolated build (port 3012, a fresh temporary database, `OPENROUTER_API_KEY` set to an empty string). No paid model call was made and no paid validation is claimed.

### What changed

- **One way in.** The first-visit welcome (*You watch. Seven independent countries decide. Nothing waits for your orders.*) offers **Watch the first negotiation**: the 11-phase sample (edition 2) at moment 0, following France, walking Spring 1901 as beats: stakes → talks → one question with an optional local guess → sealed → reveal → events → summary with answers and a supported *What if?*.
- **The moment rule everywhere.** At moment *i* talks of phases up to *i* are visible, orders and outcomes only for phases before *i*; commitments of phase *i* read *sealed*. Country details, Conversations, Timeline, Compared with history, and the comparison follow it (`src/conversations.ts`, `src/moment.ts`).
- **Conversations** replace the mixed message feed; the Watch stage has a Follow rail, a Talks / What happened panel, and on phones a menu sheet, Story · Talks · Country tabs, and a fixed dock that the guide sheet replaces while open.
- **What if?** opens prefilled at the checkpoint before the decision, says what changes and what the original record shows, and states each continuation's limits; the sandbox does not offer messages because it never reads them. The server stores the question and the change on the alternate timeline; the comparison shows them with the shared past and the first phase played differently.

### Bugs found in verification and fixed

- **Sideways overflow at 761–1099px.** The playback bar's extras pushed the page to 1105px wide. The timeline and extras now take their own row at those widths (`src/stage.css`).
- **Guide card under the playback bar on desktop.** With the welcome panel open, the card over the map extended below the screen (bottom at 1075px of 1024), hiding its actions. The welcome now steps aside while a walkthrough is open (`src/components/Theater.tsx`).
- **Small touch targets in the phone sheet.** *Skip to phase summary* and *Close guide* were 40px tall; now 44px (`src/stage.css`).
- **Watch for ignored the followed country.** The card asked about Russia while the walkthrough, following France, asked about France's promise. `questionsAt` now receives the followed country (`src/components/Theater.tsx`).

### Automated checks

| Check | Result |
|---|---|
| `pnpm lint` (`eslint .` and `ruff check engine`) | Exit 0 |
| `pnpm typecheck` | Exit 0 |
| `pnpm test` | 114 of 114 TypeScript tests (including `tests/moment.test.ts`, which scans earlier moments for later facts), 10 of 10 Python |
| `pnpm build` | Exit 0 |
| `pnpm test:browser` | 99 passed, 4 documentation captures skipped (run separately). `journey.spec.ts` and `layout.spec.ts` repeated twice: 36 of 36 |
| Documentation captures (`CAPTURE_SCREENSHOTS=1`) | 4 of 4 pass; images regenerated and inspected |

New browser coverage (`tests/browser/journey.spec.ts`): the beginner journey at 1536, 360, 390, and 430px from the welcome through France's broken promise, Russia and Turkey's kept-but-bounced promises, the summary with answers and *You guessed yes*, the prefilled What-if dialog with the sandbox caveat, to the comparison showing the question and the change, with no run request; a played alternate timeline compared with its original and *Open the original at the branch moment*; a quiet phase (Spring 1903) in two beats; bilateral and group threads (the group keeps its three participants) with a recorded reply link; sealed commitments at moment 0 and revealed ones at moment 1 in Conversations and country details; pause, resume, and a request-free replay on a sandbox game; loading, empty, and error states; a one-finger swipe over the map scrolling the page; the guide by keyboard with a visible focus ring; reduced motion with no unit travel or animation; and no billing across a whole session and reload. The existing specs were updated for the new labels and layout without weakening their watch-session and billing assertions; the phone layout test now checks that the guide sheet replaces the dock, stays within half the screen, keeps the focused province above it, collapses to a peek bar, and gives the dock back on close.

### Visual checks

Regenerated and inspected at 390×844: `docs/mobile.png` (welcome), `docs/guided-mobile.png` (stakes), `docs/mobile-talks.png`, `docs/mobile-reveal.png`, `docs/mobile-broken-promise.png`, `docs/mobile-whatif.png`, `docs/mobile-conversations.png`, `docs/guided-watch-mobile.png`, `docs/history-mobile.png`, `docs/setup-mobile.png`. At 1536×1024: `docs/desktop.png`, `docs/guided-desktop.png`, `docs/reveal-desktop.png`, `docs/summary-desktop.png`, `docs/whatif-desktop.png`, `docs/comparison-desktop.png`, `docs/conversations-desktop.png`, `docs/guided-watch-desktop.png`, `docs/history-desktop.png`, `docs/setup-*.png`.

Noted, not changed:

- *What happened* lists Russia's and Turkey's kept-but-failed Black Sea promises as two moments, while the walkthrough tells them as one event.
- The Britain–France row in Conversations reports *2 open* even though Britain accepted France's proposal; the open points come from the conversation derivation and were not re-examined here.
- Story moment body text is 13px on desktop, below the 14px target used for the guide and conversations.

### Not verified

Live multi-phase play with real models, browsers other than Chromium, real touch hardware (touch was emulated through the Chrome DevTools protocol), and screen readers.

---

## Previous verification: watch-session remediation

Final review follow-up (November 11, 2026): the independent Opus recheck confirmed all 14 original findings resolved and reproduced the full suite (83 browser tests passed, 3 optional captures skipped; 69 TypeScript and 10 Python tests passed). Its one new low-severity overlapping-start defect was subsequently fixed by the parent agent. After that fix, lint, type checking, the 69 TypeScript and 10 Python tests, and the production build passed again. Both new overlapping-start browser regressions and the strengthened delayed-response Pause test passed three times each (9/9). These focused final checks used a fresh temporary store and a blank provider key; the full browser suite was not rerun after the small final fix. See [the recheck and follow-up](review/recheck.md).

Run on the local macOS machine against an isolated build (port 3012, a fresh temporary database, `OPENROUTER_API_KEY` set to an empty string). No paid model call was made for this work, and no claim of paid validation is made. Nothing was pushed, deployed, or committed, and the parent's servers on 3001 and 5173 were not touched.

This round fixes the findings of the independent review (`docs/review/independent-review.md`). The mapping from each finding to its fix and its regression test is in [`docs/review/remediation.md`](review/remediation.md).

### What changed

- **One watch session, with identity.** `src/watch/useWatch.ts` owns every run request. A session has a token; ending it invalidates the token, and showing any game ends the previous session first. Late responses, polls, and timers can no longer continue or restart a session.
- **Pause always wins.** Run and pause requests carry a shared ticket (`server/simulation.ts`, `server/index.ts`). A pause that reaches the server first cancels the late run; a pause after it stops the job between model calls, and is re-sent when the run's response arrives. The UI shows *Pausing…* until the server is idle.
- **Central stop.** Every dialog, every tab other than Watch, a hidden page, seeking, the guided toggle, closing the guide, and switching games call one function that ends the session and the free replay timer. Nothing resumes on its own.
- **Guided live play.** Each phase that resolves during a guided watch opens its walkthrough and holds the next phase until **Continue watching**; the final phase offers **See the result**. The status line puts *Reading* before *Playing*.
- **Replay for every record.** Sample, sandbox, and live records replay from any moment, guided or timed, with no run request. **Resume at latest** is separate and labelled.
- **Setup dismissal.** Closing Setup during a start cancels whatever has not happened, and pauses a run already sent.
- **Errors.** Request failures and lost connections are shown for the game on screen, stop automatic play, and clear on Resume.
- **Mobile guide.** A bottom sheet fixed to the viewport, with the map scrolled above it; the status line wraps at 390px.
- **Test server.** Runs with a blank key; tests fake the catalog where the live setup is needed.

### Automated checks

| Check | Result |
|---|---|
| `pnpm lint` (`eslint .` and `ruff check engine`) | Exit 0 |
| `pnpm typecheck` (`tsc -b`) | Exit 0 |
| `pnpm test`: `tsx --test tests/*.test.ts` | 69 of 69 pass (including the new `tests/watch.test.ts` and ticket tests in `tests/simulation.test.ts`) |
| `pnpm test`: `pytest engine` | 10 of 10 pass |
| `pnpm build` | Exit 0 |
| `OPENROUTER_API_KEY= pnpm test:browser` | 83 passed, 3 documentation captures skipped (run separately with `CAPTURE_SCREENSHOTS=1`, 3 of 3 pass) |
| Timing-sensitive race tests, `--repeat-each=3` | 42 of 42 pass |
| Documentation captures (`CAPTURE_SCREENSHOTS=1`) | Regenerated and inspected |

### Visual checks

Regenerated and inspected: `docs/guided-desktop.png`, `docs/guided-mobile.png` (opened from the footer after scrolling to the bottom: the sheet is on screen with Brest visible above it), `docs/guided-watch-desktop.png` and `docs/guided-watch-mobile.png` (a guided watch holding its first phase, with *Continue watching*), `docs/setup-*.png`, `docs/history-*.png`, `docs/desktop.png`, and `docs/mobile.png`. The layout spec measures the card at 390×844, 1280×800, and 1536×1024 at the real scroll position.

### Remaining limits

See [`docs/review/remediation.md`](review/remediation.md#remaining-limits).

---

## Previous verification: first-moment layout and cheap-model schema fix

Run on the local macOS machine, Node 26.3, Python 3.12. Nothing here was pushed, deployed, or committed. The local dev server on ports 5173 and 3001 was left running and was not restarted or stopped for this work.

### What changed

- **Desktop composition.** The right panel now shows the phase title and summary counts, then the moments (the first is the pivotal broken commitment), then the phase summary, the collapsed all-orders list, and *Watch for*, all inside one scrolling story region. The fixed country card that used to take 220px is now a compact *In focus* strip with a collapsed *National objective* disclosure and *Open country dossier*. Before this change the story region was 166px tall and the first moment's Promised/Submitted row was clipped. At 1536×1024 the region is now 335px tall and the whole first moment fits in it.
- **Readable type.** Story body text went from 9.5px to 12px. Moment labels, eyebrows, the in-focus label, and dossier promise labels went from 7px to 9px or more. Map labels are unchanged.
- **Legal-order schema for live agents.** A negotiation message's `promise` is an enum of that country's own legal orders (or `null`), and its `to` is an enum of the other six powers. Each sealed order is an enum of that country's legal orders, including build, waive, and retreat orders. The schema size is measured and included in the budget reservation, replacing the fixed 8192-byte allowance as the only overhead. The engine's full-set validation is unchanged. The simulation's own promise check stays as a backstop.
- **No scripted text for live seats.** A live seat with no legal orders records an empty decision and is not attributed scripted text.

### Automated checks (all passing)

| Check | Result |
|---|---|
| `pnpm lint` (`eslint .` and `ruff check engine`) | Exit 0 |
| `pnpm typecheck` (`tsc -b`) | Exit 0 |
| `pnpm test`: `tsx --test tests/*.test.ts` | 30 of 30 pass (provider contract 7, catalog and pricing 8, story 10, simulation 5) |
| `pnpm test`: `pytest engine` | 10 of 10 pass |
| `pnpm build` | Exit 0 |
| `pnpm test:browser` | 16 of 16 pass, 1 documentation capture skipped |
| Documentation captures (`CAPTURE_SCREENSHOTS=1`) | Regenerated from this build |

New unit and wire tests (`tests/provider.test.ts`):

- The emitted structured-output schema on the wire carries each country's exact legal set, and the recipient enum excludes the speaker, on all 14 calls of a phase.
- A promise of Austria's unit from Germany is refused by the schema. The phase stops with an error, and no message carrying that promise is saved. The test checks that the engine-side backstop was not the thing that refused it.
- Direct schema checks accept only Germany's legal promises, `null`, and other powers as recipients, and refuse self-messages and unknown recipients.

New browser tests (`tests/browser/app.spec.ts`), measured from element geometry:

- **Desktop 1536×1024, opening sample:** the story region is at least 320px tall and unscrolled. The broken commitment's headline, Promised/Submitted row, and action buttons lie inside it. The in-focus strip starts below it. Body text is at least 12px, headline at least 18px, and labels at least 9px.
- **Shorter desktop 1280×800:** the headline and promise row are inside the region, the region scrolls, and the action buttons become visible after scrolling it. The page has no horizontal overflow.
- **Phone 390×844:** the headline and promise row fit the screen width, the in-focus strip begins after the story ends, and there is still no horizontal overflow.

### Live proof: attempt 1 of 2, passed

`scripts/live-proof.ts`, using the configured `.env` key, which was not printed. One phase, one diplomacy round, a $0.10 budget cap, and alternating seats: GLM 5.3 Flash for England, Germany, Austria, and Turkey, and Claude Haiku 5.5 for France, Italy, and Russia. Catalog check: both ids were present and priced, and Haiku 5.5 showed its long-prompt tier.

| Evidence | Result |
|---|---|
| Status | complete, 1 resolved phase (Spring 1901 movement) |
| Model calls | 14 (7 negotiation and 7 sealed orders), each HTTP 200 on the requested model |
| Reasoning | every request sent `reasoning: { effort: 'low', exclude: true }` and `max_tokens: 1800` |
| Input and output tokens | 32,379 input and 6,228 output in total |
| Provider-reported cost | **$0.004798**, unpriced calls 0, budget $0.10 |
| Messages exchanged | 19 |
| Promises checked by the engine | 6 (3 kept, 3 broken). These are the models' actual outcomes, not failures of the run |
| Engine | every order set was accepted by the Diplomacy adjudicator and the phase resolved |
| Archive record | new record "Live verification · economical mix · GLM 5.3 Flash + Haiku 5.5 · one phase", id `b5fb5063-fc23-44e3-8721-a081e778ebaa`, status complete |

The previous partial record, "Live verification · economical mix · GLM 5.3 Flash + Haiku 5.5 · one phase" (status error, 0 phases, id `6c4bdd39-b95d-4ccf-b1f0-e7ec36f00226`), was preserved unchanged at the time, as were the earlier records: "A continent of possibilities", the three-model runs, and the sample. The archive then listed seven records. (All of these except the sample were later deleted at the owner's request; see the archive note above.)

The earlier failure was Germany's promise of an order it could not issue, after three calls. Under the new contract the same kind of output cannot be generated, as the wire and rejection tests show. The provider, not this repository, decides how strictly `json_schema` strict mode is honored. Here both models returned schema-conforming output in all 14 calls.

Only one proof attempt was used. No retry loop or correction call was added, because nothing in this run needed one.

### Visual checks

- `docs/desktop.png` (1536×1024) was regenerated and inspected directly. The broken commitment's headline, Promised `F BRE - MAO` against Submitted `F BRE - ENG`, and its actions are visible on first load. The map keeps its height.
- `docs/mobile.png` (390×844) was regenerated and inspected. The guidance and map stack first, as before, and there is no horizontal overflow.
- A 1280×800 capture was inspected directly. The headline and promise row are visible, the action buttons need one scroll inside the story, and the page scrolls to reach the playback footer. The theater keeps its 640px minimum on shorter screens.

### Remaining limits

- The live proof covers one phase and one diplomacy round with the two economical models. It does not show multi-phase play, the strategic quality of either model, or behavior with other providers.
- At heights under about 900px the page scrolls and the story's action buttons sit one scroll away. This is the sensible scrolling the design allows. It is not a shortcut that clips the story.
- The phone layout still places the story below the map, as it did before.
- Browser checks use Chromium only.
- Prettier reports pre-existing style warnings in files this work did not change. They were left as they were.

---

## Previous verification: guided experience and economical models

Run on the local macOS machine, Node 26.3, Python 3.12. Nothing here was pushed, deployed, or committed.

### Automated checks (all passing)

| Check | Result |
|---|---|
| `eslint .` (`pnpm lint`, JavaScript and TypeScript) | Exit 0, no findings |
| `ruff check engine` (`pnpm lint`, Python) | All checks passed |
| `tsc -b` (`pnpm typecheck`, and the first step of `pnpm build`) | Exit 0 |
| `tsx --test tests/*.test.ts` | 27 of 27 pass: provider contract 4, catalog and pricing 8, story derivations 10, simulation 5 |
| `pytest engine` | 10 of 10 pass |
| `vite build` (`pnpm build`) | Exit 0; 402 kB JavaScript, 60 kB CSS |
| `playwright test` (`pnpm test:browser`) | 14 of 14 pass; the documentation capture spec is skipped unless `CAPTURE_SCREENSHOTS=1` is set |

The browser suite runs against a production build with an isolated `.test-data/` database and never calls a model. Its specific coverage:

- **Role and start:** first visit states the observer role without a blocking modal; the card can be hidden, the choice persists in this browser, and **How to watch** restores it.
- **Provenance and time:** the sample is labelled *RECORDED SAMPLE*; checkpoint labels are *Start of …* and *Last resolved …* consistently.
- **No future leakage when seeking:** at checkpoint 0 the story reads “Nothing has resolved yet,” the dispatch list is empty, and the guide says recorded history; jumping to the live edge then shows the final position.
- **Replay vs. live:** opening the app runs nothing and changes nothing (the record stays at nine turns, status complete). Play labels say *Play replay*, *Pause replay*, *Run agents*, *Run sandbox*, or *Replay from start*, and their accessible names state whether a model call is billed.
- **Happening now:** a live phase in progress, served through the page’s own polling, shows only observed progress (“Round 1 of 2 · 4 of 14 conversations”, “2 of 7 sealed”) and no order text.
- **Pivotal event end to end:** a broken commitment (France promised `F BRE - MAO`, submitted `F BRE - ENG`) is shown with its promised and submitted orders side by side, linked to *Find Brest on map* (which opens the province card), and listed in *All 9 submitted orders*. The flow then advances a checkpoint and creates an alternate timeline from the same checkpoint; the branch dialog quotes France’s recorded orders and labels the **ORIGINAL** and **ALTERNATE** timelines.
- **Sandbox lifecycle:** a new sandbox shows the *NEXT PHASE* guide with talks listed; one phase runs; the phase limit completes the match; completion disables the step control, which is named *Match complete: no further phases to run*.
- **Controls:** keyboard listbox flow (arrows, Home, Enter, Escape closing only the list, focus kept on the trigger), dialog Escape and focus return, click-outside closure, model presets and free-text model entry, stepper clamping.
- **Mobile at 390×844:** no horizontal page overflow, the guide and story stack in reading order, and custom listboxes remain inside the viewport.

Unit tests cover the pure logic that the browser suite depends on:

- **Catalog:** batch-only endpoints are dropped; models without structured outputs, with per-request fees, or with non-finite prices are dropped; a malformed neighbor entry does not discard the catalog; a model with an unreadable tier is excluded rather than under-reserved.
- **Pricing:** prompt-size tiers apply at their threshold; time-window overrides apply conservatively at any hour; a reservation never falls below the base rate.
- **Transport:** GLM 5.3 Flash and Claude Haiku 5.5 send `reasoning: { effort: 'low', exclude: true }` on every chat-completions request; other models keep provider defaults. The provider contract test asserts this on all 14 calls of a phase.
- **Story:** orders read as plain actions with exact text kept; a broken commitment, a kept-but-failed order, a supply-center change, a bounced attack, and a successful move into an occupied province each produce distinct moments; a moment is unchanged when later history is altered.

### Live verification of the economical models: partial

A bounded live run was executed once with `scripts/live-proof.ts`: one phase, one diplomacy round, seats alternating GLM 5.3 Flash (England, Germany, Austria, Turkey) and Haiku 5.5 (France, Italy, Russia), a hard budget of **$0.10**, and the strategist profile.

- **Catalog:** both ids are present on the live OpenRouter catalog with chat-completions endpoints. GLM 5.3 Flash costs $0.0399 per million input tokens and $0.0784 per million output tokens. Haiku 5.5 costs $0.10 and $0.50 per million, with a long-prompt tier of $0.50 and $2.50 above 100,000 prompt tokens.
- **Wire:** each request carried `reasoning: { effort: 'low', exclude: true }` and `max_tokens: 1800`. Every response returned HTTP 200 with the requested model. Reasoning tokens were 30 and 13 for GLM and 0 for Haiku, so low effort was applied.
- **Outcome:** the run stopped after three negotiation calls (England/GLM, France/Haiku, Germany/GLM) with the explicit error *GERMANY promised an order it cannot issue*. The engine-side legality check rejected that message before it was saved, so the phase did not resolve. The partial record was saved in the local archive as “Live verification · economical mix · GLM 5.3 Flash + Haiku 5.5 · one phase” (status error, 0 resolved phases); it was later deleted at the owner’s request. No retry was made.
- **Spend:** 4,910 input and 652 output tokens; provider-reported cost **$0.000526** against the $0.10 budget.
- **Not reached:** sealed-order calls for either model, adjudication with live model output, and a completed live phase. Those steps remain unverified with these models.

An earlier attempt in the first run failed before any billable call, because the catalog parser rejected time-window tier entries. The parser now accepts both tier shapes, and the 469-entry live catalog parses to 309 usable models with no batch-only entries.

### Existing saved records

At the time of this record the archive kept every prior record unchanged, including the three-model proof runs described below, the sample, and an earlier errored economical-model record named “A continent of possibilities” (status error, 0 resolved turns, $0.0009). These records were later deleted at the owner's request; see the archive note at the top.

### Visual checks

- Desktop at 1536×1024: the map is the largest area. The status bar, one-row guide, labelled playback controls, and footer are visible without scrolling, and the page height matches the viewport.
- Phone at 390×844: no horizontal overflow. The welcome card, guide, map, story, and playback stack in reading order.
- Setup dialog: prices appear per seat, and the long-prompt tier is stated next to Haiku’s base rate.
- Screenshots in `docs/` were regenerated from this build with `CAPTURE_SCREENSHOTS=1`.

### Limits of this record

- The live proof is partial, as described above. It does not establish that either model completes a phase here, nor its strategic quality.
- Browser checks used Chromium only. No hosted, multi-user, or remote CI run occurred.
- The engine rejects an illegal negotiation promise and stops the phase. Whether to drop the promise and continue, or re-prompt the model, is a product decision that is not changed here.

---

## Earlier verification (previous model set)

November 10, 2026. Local macOS build, Node 26.3, Python 3.12.12. No deployment or remote CI run is implied.

## Automated checks

- TypeScript strict type check.
- ESLint and Ruff.
- Production Vite build.
- 8 TypeScript simulation/provider tests: private observation projection, sealed-order redaction, complete phase pipeline, persistence, promise evaluation, immutable branches, pause/resume, profile/message scoping, actual SDK wire contract with mocked HTTP, request budgeting, and no automatic provider retry.
- 10 Python adapter/rules tests: standard 1901 setup, equal-strength bounce, supported dislodgement, retreats, support cutting, convoy, autumn capture, winter build, disband validation, illegal/duplicate/missing orders, state round trip, and 18-center victory.
- 160 upstream standard DATC tests from the pinned Diplomacy engine.
- 4 production-build Playwright flows: sample exploration and map selection; dossiers, memories and private-channel filtering; promises and historical sources; playback; branch/order intervention and original preservation; side-by-side comparison; reload/export; sandbox setup and phase limits; mobile controls and nonoverlap.

The Python engine emits an upstream deprecation warning about `datetime.utcfromtimestamp`; the tested behavior passes on Python 3.12. This warning is not hidden or mistaken for a failure.

## Actual OpenRouter runs

These calls used real providers through `@openrouter/ai-sdk-provider` and AI SDK structured output. They are separate from the mocked provider-contract tests. Both runs were saved in the local match archive at the time; those records were later deleted at the owner's request.

| Evidence | Opening run | Branched continuation |
|---|---|---|
| Archive name | Live verification · three models | Live verification · three models · Branch 2 |
| Phase resolved | Spring 1901 movement | Autumn 1901 movement |
| Resulting phase | Autumn 1901 movement | Winter 1901 adjustments |
| Model calls | 14 | 14 |
| Input tokens | 23,360 | 40,488 |
| Output tokens | 10,887 | 9,749 |
| Provider-reported cost | $0.040553469 | $0.050058657 |
| Unknown-cost calls | 0 | 0 |
| Negotiation messages | 18 | 21, including the injected group message |
| Broken exact commitments | 2 | 3 |

The models were **Anthropic Claude Haiku 4.5**, **OpenAI GPT-5 Mini**, and **Google Gemini 2.5 Flash**, assigned across seven independent country contexts. The opening run was capped at $1. The branch used a separate $0.85 ceiling; total observed expenditure was **$0.090612126**.

The branch restored the opening run’s completed checkpoint, changed France to the coalition-building profile, and injected a private message to Britain and Germany. It carried each country’s own memory forward and reached winter after valid autumn adjudication. The parent remained at its original run limit with its original completed turn intact.

This establishes real provider integration and valid multi-agent continuation. It does not establish long-game model strength, universal compatibility with every OpenRouter model, or historical predictive validity.

## Visual checks

- Desktop: 1536×1024, the concept’s native viewport.
- Mobile: 390×844.
- Concept and rendered screenshots directly inspected with `view_image`.
- Corrected desktop map sizing, country-rail footer overlap, mobile dispatch overlap, replay status, and SVG click handling.
- All visible controls exercise real local or server state; no decorative fake playback or pretend AI calls.

See [DESIGN.md](DESIGN.md) for the comparison ledger and intentional deviations.

## Scope of proof

Full engine tests include retreats and adjustments; the two paid live phases cover negotiation, movement, promises, private memory, branching, capture, and the transition into winter. No paid long-duration match to a solo victory was required or claimed. No public deployment, hosted authentication, multi-process scaling, or remote CI execution has been tested. The included GitHub Actions workflow is ready for a future push.
