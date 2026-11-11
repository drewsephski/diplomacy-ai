# Design contract and visual review

## Direction

An illuminated war room: a geopolitical observatory, not a marketing page or a dashboard. The map is the center of gravity. The experience is a recomposition around one story loop: understand the stakes → follow a negotiation → anticipate the reveal → understand the consequences → explore a different decision. Guidance is quiet and progressive, and nothing forces a dialog before the observer can see the map.

Core tokens (defined in `src/styles.css`; the stage layout is in `src/stage.css`, conversations in `src/conversations.css`, the What-if dialog, comparison, and country details in `src/whatif.css`):

- Background `#10171c`; panels `#121b20`; muted text `#8f9a9e`; antique gold `#c7aa74`.
- Editorial type: locally served Cormorant Garamond for headings and narrative. Controls, labels, and dense data: locally served Inter. Order text and model ids: monospace.
- Country colors: Britain rose, France slate blue, Germany ochre, Italy sage, Austria terracotta, Russia lavender, Ottoman Empire muted gold.
- Outcome tones for moments: broken commitment terracotta, kept-but-failed gold, gain sage, loss terracotta, standoff grey, successful invasion lilac, quiet grey. Tones are always paired with a text label, never color alone.
- Motion is limited to state changes, replay, and brief unit travel. Reduced-motion preferences suppress unit travel and spinners’ animation.

## Information architecture

The observer should understand four things at a glance: what they are watching, where the record comes from, where in time they are, and what they can do next.

1. **Role.** A first-visit welcome panel (not a modal) says *You watch. Seven independent countries decide. Nothing waits for your orders.* Its one primary action, **Watch the first negotiation**, opens the free sample at moment 0, follows France, and starts the Spring 1901 walkthrough on the France–Britain stakes. *Explore on my own* and *Set up a game with AI countries* are secondary. Dismissal is remembered in this browser; **How to watch** brings it back. While a walkthrough is open the welcome steps aside so the card fits the screen.
2. **Provenance.** The match bar labels the mode as **RECORDED SAMPLE**, **LOCAL SANDBOX**, or **AI COUNTRIES**. The footer repeats it. Cost reads “No model calls” except in live mode.
3. **Time.** A moment is the board at the **start** of a phase. The match bar shows *Latest* or *Earlier moment* and the phase on the board. The dock names the last phase in plain words. The timeline reads *Start* and *Moment k of n · Latest / Earlier in the record*.
4. **Moment rule.** At moment *i*, talks of phases `0..i` are visible (plus pending talks at the live edge); orders, results, and promise outcomes are visible only for phases before *i*; a commitment made in phase *i* is *sealed · orders not revealed yet*. Every view implements this one rule (`src/conversations.ts`, `src/moment.ts`).
5. **Follow.** A strip of seven country chips (centers at this moment, change since the last phase) replaces the old country list. Following a country (France by default for the sample) is remembered; it orders threads and events and focuses the map, and never hides other developments. The followed country's card shows what it wants, its counts, who it is talking with, its promises and their status, and a short, sourced *Real history · not this game* note.
6. **Story panel.** *Watch for* lists the phase's questions (with the viewer's local guess). **Talks** shows the threads of the phase on screen, followed country first, the rest under *Elsewhere*; new live messages wait behind a pill and never move what the reader is on. **What happened** explains the last resolved phase: title and counts, moments in priority order with promised and submitted orders side by side, a summary, and every order in plain words with its exact engine text.
7. **Conversations** (top-level tab): threads keyed by their exact participants, so group threads keep all their members; per message a plain summary, the original words, the sender's recorded response, recorded or explicitly *inferred* reply links, places, open points, and each promise's status and outcome once revealed.
8. **Phase guide.** Above the map: *Earlier in the record*, *Happening now* (talks, sealed count, resolution, from recorded state only), *Next phase*, or the end screen.

### Truthfulness rules

- Every line of progress derives from recorded state. The Happening now counts come from `negotiated`, the number of active countries, and `sealedCount` from the spectator projection. The UI never shows timers, invented per-country thinking, or percentages that the record does not support.
- Sealed order contents never reach the browser before resolution. The spectator projection sends `decisions: {}` for a pending phase.
- The moment rule above: talks of the phase on screen are visible, its orders are not. Pending messages appear only at the latest moment (`index === turns.length`). Unit tests (`tests/moment.test.ts`, `tests/conversations.test.ts`) assert that earlier moments contain no later facts.
- A trust score is shown as one country's stated assessment (“Britain’s stated trust in France”), never as an alliance. A failed order is not called a betrayal; a kept promise whose move bounced is told as kept.
- Real history (sourced, fixed) is always labelled apart from the simulated timeline.
- A moment reads the checkpoints immediately before and after its phase, never later ones. A regression test changes later history and asserts the story is unchanged.
- Labels describe actual behavior. *Watch with a guide*, *Play replay*, and *Replay from start* never call a model. *Play first phase*, *Resume game*, *Resume at latest*, *Continue watching*, and *Play next phase* are the only controls that request a phase, and in a live game their accessible names say the calls are billed.
- The status line reports the session's real state, in this order of precedence: *Pausing*, *Reading · the next phase waits for Continue watching*, *Playing one phase*, *Playing*, *A phase is being played*, *Replaying recorded phases*, *Reading · nothing is playing*, *Looking at an earlier moment · nothing is playing*, then the idle states.
- Replay speed changes only how fast recorded moments advance.

### Watch session

One explicit press (Start game, Resume game, Resume at latest, or Play next phase) creates a session for one game. It is the only code that sends a run request (`src/watch/useWatch.ts`), and its decision is a pure function (`src/watch/decide.ts`).

- **Identity.** Each session has a token. Ending it invalidates the token, so a late response, poll, or timer from it can never continue or restart it. Showing any game (open, create, branch, delete fallback) ends the previous session first.
- **One phase at a time.** A request is sent only when nothing is in flight and the server reports the game idle. An expert (guidance off) watch leaves a short gap between phases.
- **Guided hold.** A phase that resolves during a guided session holds the session and opens that phase's walkthrough by itself. Only **Continue watching** (or **See the result** after the final phase) lifts the hold.
- **Stopping is central.** Pause, closing the guide, turning guidance off, the Guided view toggle, every dialog, every tab other than Watch, a hidden page, seeking, and switching games all call one function (`holdWatch` in `App.tsx`). It ends the session and the free replay timer, and pauses the server if this page may have started a phase. A close or a toggle is never a reason to resume.
- **Pause always wins.** Every run request carries a ticket. The pause carries the same ticket and is sent at once, even while the run request is in transit; the server refuses a run whose ticket was already paused. When a late run response arrives, the pause is sent again for the job that now exists. *Pausing…* stays on the button until the server reports the game idle.
- **Setup.** Closing the dialog during *Starting…* (button, Escape, or backdrop) cancels what has not happened: a game created after the dismissal is saved for History and not shown or started; a run already sent is paused with its ticket. No watch starts after the dialog is gone.

### Guided walkthrough

- One phase as beats (`src/guided/beats.ts`): stakes → talks → one question (with an optional local guess, never sent anywhere) → sealed → **Reveal the orders** → events → summary. Before the reveal the board is the start of the phase and no order is drawn; from the reveal the board is the position after it, the phase's arrows are drawn, and moved units travel (no travel with reduced motion). Quiet phases are short. The summary answers the question (“You guessed …”), says what changed and what remains uncertain, and puts a supported **What if?** right under *What changed*. Concept notes appear inline once, with *Got it*.
- *Watch with a guide* at moment *i* walks phase *i* from its start. Closing before the reveal leaves the view at the start of that phase.
- A non-modal card over the map on desktop. On a phone (≤760px) it is a bottom sheet rendered into `<body>`, at most about half the screen, that takes the playback dock's place (never two bottom overlays) and can collapse to a peek bar; the map scrolls above it so the province in focus stays visible. Controls are at least 44px tall. *Turn guidance off* lives in the menu on phones.
- The summary offers what is true for the session: **Continue watching**, **See the result**, **Continue** (next recorded phase), **Resume game · billed / (free)** beside **Done**, or **Done**. While a session is active, the close controls read **Pause and close guide** and **Turn guidance off and pause**.

### History

A top-level tab, separate from *Timeline* and *Compared with history*. It lists the viewer's games with mode, phases, cost, their true result, and, for alternate timelines, the question that started them. The current sample is listed apart; older sample editions are kept (alternate timelines may compare against them) and labelled *earlier edition*. *Open* and *From the start* only load a record. Opening a game never plays it, and Delete asks first.

### Map

- Province fill (tint) shows each power’s home area and influence, and a supply center takes its owner’s color. The **ring** on each center marker is its actual owner; a gold ring means neutral. The key says so in words. Tint is never presented as ownership.
- Army and fleet symbols mark engine positions. Movement arrows for the last resolved phase are optional, behind *Show revealed movement orders*.
- *Find … on map* in a moment centers and zooms on that province and opens its card.
- Touch: a one-finger drag scrolls the page unless the viewer zoomed in, pinched, or turned on *Move map with one finger*; page scrolling is never trapped.

### Timeline

Entries for phases the viewer has not reached keep their season for navigation but hide their title, recap, and broken-promise count, with *Show later outcomes* to reveal them on request.

### What if? and the comparison

- **Preset** (from a phase summary): the dialog is titled with the question (*What if France had kept its promise?*), opens at the checkpoint before the decision, names it in plain words (*from the start of Spring 1901, before the orders were sealed*), shows **What changes** beside **What the original record shows**, and offers *Choose a different change instead* at the same checkpoint.
- **Free form** (*Try a different decision*): change one order (plain-language picker, exact order as detail), change how a country plays, or add a message. The original orders of a phase the viewer has not reached sit behind a *reveals this phase’s orders* disclosure.
- **Continuation:** *Free sandbox* or *AI countries* (live only when configured), each with its honest caveat. The deterministic sandbox records a message but never reads it or responds strategically, so *Add a message* is disabled there with that reason. The request sends the question; the server stores it and the change in `parent`.
- **Comparison** (*Alternate timeline* tab): the question, the one change (older records without one say so), the shared past, the first phase played differently side by side (recaps, orders that differ, centers held differently; shown only once the viewed moment is past it), standings at the moment, and maps matched by phase name (with a warning when the timelines reached different phases). *Open the original at the branch moment* returns to the record. If the original was deleted, the tab says so.

### Empty, loading, error, and complete states

- **Loading:** “Preparing the European board…” Nothing is run or billed while loading. If the saved games cannot load, the page says *The game could not load.* with the reason and *Try again*.
- **Error:** the banner names the error, for the game on screen only. A failed request for a phase says *The next phase could not be requested … Nothing further was sent. Press Resume game to try again.* A lost connection while a phase plays says so and asks the server to pause. A game stopped by the server (for example at the budget ceiling) shows its own error and an end screen that names the reason. Resume resumes from the saved partial state.
- **Plain status:** a dismissed Setup reports *Start cancelled. The game is saved and paused.* or that the game *was saved without starting*.
- **Empty story (opening position):** “Nothing has happened yet,” with the next action named, and, when the record has phases, *Walk through the first phase with a guide*.
- **Empty talks:** explains whether nothing has been played yet, the phase type has no talks, or no messages were exchanged.
- **Complete:** the final position, with replay, export, and branching named.

## Controls and interaction

Every dropdown is a custom control. No native `<select>` remains in the product.

- **Select** (`src/components/ui/Select.tsx`): WAI-ARIA select-only combobox. Focus stays on the trigger, the highlighted option is announced through `aria-activedescendant`, and arrows, Home/End, Enter/Space, and type-ahead work. Escape closes only the list. Options can carry secondary detail text, used for exact orders in the branch picker.
- **Combobox** (`src/components/ui/Combobox.tsx`): filterable model picker. Any id can be committed, so models outside the catalog remain possible. Escape reverts an uncommitted edit.
- **Stepper** (`src/components/ui/Fields.tsx`): explicit −/+ controls with a text draft that clamps on blur.
- **Dialogs** (`Modal`): the native `<dialog>` keeps modal semantics. Escape closes the dialog only when no listbox is open. Focus moves to the first control and returns to the opener on close.
- **Side tabs:** *Talks* and *What happened* (desktop) and *Story · Talks · Country* (phone) are toggle buttons with `aria-pressed`.
- **Map focus** and **timeline seek** are keyboard reachable. The timeline buttons carry the checkpoint number and phase in their names.
- Focus rings use the gold token.

## Responsive behavior

- **Desktop (≥1100px):** Follow rail | map with the guide card | story panel, with a condensed playback bar. At 1536×1024 and 1280×800 (welcome dismissed) the first moment's headline and promise row are visible without scrolling the story panel.
- **Tablet (761–1099px):** the strip and map span the width; *Watch for*, the side tabs, and the story sit beside the followed country's card. The playback bar's timeline and extras take their own row so the page never scrolls sideways.
- **Phone (≤760px):** compact top bar with a Menu sheet; country strip; map; Story · Talks · Country; a fixed, safe-area-aware dock with the primary action, the step, and the moment, and *Timeline and more playback options* for the timeline, speed, branching, and export. No horizontal overflow at 360, 390, or 430px.
- **Reading size:** guide, talks, and conversation text at least 15px on phones; dialogs and country details at least 14px on desktop. Map labels keep their map-scale sizes.

## Model defaults, reasoning, and cost context

- New matches default every seat to `z-ai/glm-5.3-flash`. Presets offer **Haiku 5.5 only** (`anthropic/claude-haiku-5.5`) and **Economical mix** (GLM on even seats, Haiku on odd seats).
- The live catalog lists only models that accept chat-completions requests (batch-only entries are excluded), support structured output, and publish finite prices.
- Prices come only from the live catalog, shown per million tokens. When a model has a higher long-prompt tier, the setup row adds that tier (Haiku 5.5 above 100k prompt tokens) so the base rate is never shown alone.
- Both economical models run at **low reasoning effort** on the wire. Saved matches keep their stored configurations, and the theater shows readable labels (`GLM 5.3 Flash`, `Claude Haiku 5.5`) with a slug fallback for other ids.
- **Structured output contract, built per country and per phase.** Each negotiation schema limits a message’s `promise` to that country’s own legal orders for the phase (or `null`), and its `to` recipients to the other six powers. Each decision schema limits every order to that country’s legal orders, including build, waive, and retreat orders. The schema size is measured and included in the input reservation, so the budget covers what is actually sent. The engine still validates the full order set (duplicates and missing units are rejected), and the simulation still refuses a promise outside the legal set as a backstop.
- A live seat with no legal orders in a phase is not asked and does not receive scripted text. It records an empty decision that says no agent was asked. Scripted decisions remain only in the sample and sandbox.
- Promises are never dropped silently and the adjudicator is not loosened. An output that does not satisfy the schema stops the phase with its error, and the partial state is kept for a resumed run.

## Fidelity notes against the concept

- The map uses authoritative jDip standard-map geometry rather than generated coastlines. Generated cartography cannot guarantee adjacency or coast correctness.
- Units are army and fleet symbols rather than pictorial miniatures, so positions remain legible in small provinces.
- The 1901 start is enforced: Britain has three centers and Russia four. The concept image’s illustrative counts are not copied.
- Returning visitors see the sample at the first moment after its first resolved phase; the welcome's *Watch the first negotiation* starts at moment zero so the stakes come before the outcome.
- The UI chrome uses sans-serif for controls and data; serif type carries the map title, phase titles, moments, and quotations.
- Dialogs for configuration, branching, dossiers, and archive extend the composition to meet functional requirements.

## Verification method

Checks run from the project root. Current results are recorded in [VERIFICATION.md](VERIFICATION.md).

- Typecheck, ESLint, Ruff, production build, TypeScript unit tests, Python engine tests.
- Playwright browser flows against a production build with an isolated database and a blank provider key: the newcomer journey at desktop and 360/390/430px (`journey.spec.ts`); the sample explanation and exploration; the first-visit welcome; recorded-history guarantees; a broken commitment through the map to the full order list; the pivotal event through advancing and branching; sandbox labels and phase limit; no run on load; a live phase in progress with observed progress only; custom controls by keyboard and pointer; dialogs; mobile overflow and listbox placement; History and deletion; brand assets; and the watch-session regressions in `watch.spec.ts` and `layout.spec.ts`, which count run and pause requests.
- Screenshots were inspected at 1536×1024 and 390×844.

## Not verified here

- Earlier paid runs covered one phase with the economical models (see VERIFICATION.md; their archive records were later deleted at the owner's request). The watch session, guided hold, and pause race are verified with sandbox games and browser-side live fakes, not with paid calls. Multi-phase live play, long-game strategic quality, and results from other providers are not verified.
- Browser checks use Chromium only.
- The documentation capture spec (`CAPTURE_SCREENSHOTS=1`) regenerates the images in `docs/`.
