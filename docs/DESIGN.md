# Design contract and visual review

## Direction

An illuminated war room: a geopolitical observatory, not a marketing page or a dashboard. The map is the center of gravity. Guidance is quiet and progressive: one line of orientation, one strip for the phase in progress, and a story panel that explains the last resolved phase. Nothing forces a dialog before the observer can see the map.

Core tokens (defined in `src/styles.css`, reused by `src/guide.css`):

- Background `#10171c`; panels `#121b20`; muted text `#8f9a9e`; antique gold `#c7aa74`.
- Editorial type: locally served Cormorant Garamond for headings and narrative. Controls, labels, and dense data: locally served Inter. Order text and model ids: monospace.
- Country colors: Britain rose, France slate blue, Germany ochre, Italy sage, Austria terracotta, Russia lavender, Ottoman Empire muted gold.
- Outcome tones for moments: broken commitment terracotta, kept-but-failed gold, gain sage, loss terracotta, standoff grey, successful invasion lilac, quiet grey. Tones are always paired with a text label, never color alone.
- Motion is limited to state changes, replay, and brief unit travel. Reduced-motion preferences suppress unit travel and spinners’ animation.

## Information architecture

The observer should understand four things at a glance: what they are watching, where the record comes from, where in time they are, and what they can do next.

1. **Role.** The welcome card states the spectator role in one line: seven countries negotiate privately, seal secret orders that resolve together, and 18 of 34 supply centers wins. It offers two starting actions, *Watch the recorded sample* (no cost) and *Start a live match with AI agents*. It is dismissible, its dismissal is remembered in this browser, and **How to watch** restores it. No modal blocks the first view.
2. **Provenance.** The status bar labels the mode as **RECORDED SAMPLE**, **LOCAL SANDBOX**, or **LIVE AGENTS**, with a tooltip stating what that means. The footer repeats it. Cost reads “No model calls” except in live mode.
3. **Time.** A checkpoint is the board at the **start** of a phase. The matchbar shows “Checkpoint” and the phase on the board. The footer names the **last resolved** phase in plain words, for example *Last resolved: Spring 1901 movement · The price of a promise.* The timeline reads *Opening* and *Checkpoint k of n · Recorded history / Live edge*. Spring and autumn labels are never used for “before” and “after” the same moment.
4. **Progress.** The **phase guide** strip shows one of four states:
   - *Recorded history*: the past. It says that later dispatches and sealed orders stay hidden, and offers *Jump to the live edge*.
   - *Happening now*: a live phase in progress. Three steps: private talks (round and conversation count), sealed orders (count of seven), and resolution (waiting for every seal). The status line says whether agents are working, pausing, or paused.
   - *Next phase*: the live edge before anything runs. It explains what the next phase involves and that nothing runs until the observer presses Run.
   - *Match complete*: the final position, with replay, export, and branching named as the next steps.
5. **Story.** The right panel’s **What happened** tab explains the last resolved phase, in this order: the phase title and summary counts, then the moments, then a *Phase summary* paragraph, then a collapsed list of *every submitted order in plain language, with its exact engine text and outcome*. Moments are listed in priority order (broken commitments, supply centers gained and lost, kept commitments whose order still failed, dislodged units, bounced attacks, and successful moves into occupied provinces). Each moment has a plain headline and detail, the promised and submitted orders side by side where a commitment is involved, links to the country, the map location, and the dispatches where relevant. The first moment is placed directly under the title so the observer reads the pivotal event without scrolling.
6. **Watch next.** At the end of the story’s scroll area, one rule-derived line says what matters in the phase that comes next. These are statements about the rules, not predictions.
7. **Power balance.** The left rail lists centers out of 18 with the change across the last resolved phase, marks the leader, and labels each country’s model or policy. The country in focus drives the dossier and the map focus.
8. **In focus.** A compact strip at the foot of the right panel names the country in focus in one row. Its *National objective* is a disclosure (closed by default), and *Open country dossier* opens the full dossier. The strip never takes the height the story needs.

### Truthfulness rules

- Every line of progress derives from recorded state. The Happening now counts come from `negotiated`, the number of active countries, and `sealedCount` from the spectator projection. The UI never shows timers, invented per-country thinking, or percentages that the record does not support.
- Sealed order contents never reach the browser before resolution. The spectator projection sends `decisions: {}` for a pending phase.
- Checkpoints in the past show only resolved phases. Pending messages appear only at the live edge (`index === turns.length`).
- A moment reads the checkpoints immediately before and after its phase, never later ones. A regression test changes later history and asserts the story is unchanged.
- Labels describe actual behavior. *Play replay* never calls a model. *Run agents* and *Run one phase* are the only controls that bill calls, and their accessible names say so.
- Replay speed changes only how fast recorded checkpoints advance. The control is named *Replay speed*, with the note *agents run at model speed*.

### Map

- Province fill (tint) shows each power’s home area and influence, and a supply center takes its owner’s color. The **ring** on each center marker is its actual owner; a gold ring means neutral. The key says so in words. Tint is never presented as ownership.
- Army and fleet symbols mark engine positions. Movement arrows for the last resolved phase are optional, behind *Show revealed movement orders*.
- *Find … on map* in a moment centers and zooms on that province and opens its card.

### Branching

The branch dialog is titled *What if one decision changed?* It shows two labelled timelines (**ORIGINAL**, which stays as recorded, and **ALTERNATE**, which continues from the chosen checkpoint). It quotes the country’s original recorded orders for the next phase, so the observer sees what would change. The order picker shows plain-language labels with the exact order as secondary text. Sandbox versus live continuation is explained before submission, and the create action reads *Create alternate timeline*.

### Empty, loading, error, and complete states

- **Loading:** “Preparing the European theater…” Nothing is run or billed while loading.
- **Error:** the banner names the error. A failed load offers *Try again*. A stopped live phase says so in the status line and tells the observer to press Run to continue, which resumes from the saved partial state.
- **Empty story (opening position):** “Nothing has resolved yet,” with the next action named.
- **Empty dispatches:** explains whether the phase is pending, the opening, or quiet.
- **Complete:** the final position, with replay, export, and branching named.

## Controls and interaction

Every dropdown is a custom control. No native `<select>` remains in the product.

- **Select** (`src/components/ui/Select.tsx`): WAI-ARIA select-only combobox. Focus stays on the trigger, the highlighted option is announced through `aria-activedescendant`, and arrows, Home/End, Enter/Space, and type-ahead work. Escape closes only the list. Options can carry secondary detail text, used for exact orders in the branch picker.
- **Combobox** (`src/components/ui/Combobox.tsx`): filterable model picker. Any id can be committed, so models outside the catalog remain possible. Escape reverts an uncommitted edit.
- **Stepper** (`src/components/ui/Fields.tsx`): explicit −/+ controls with a text draft that clamps on blur.
- **Dialogs** (`Modal`): the native `<dialog>` keeps modal semantics. Escape closes the dialog only when no listbox is open. Focus moves to the first control and returns to the opener on close.
- **Side tabs:** *What happened* and *Dispatches* are toggle buttons with `aria-pressed`. The dispatch count is announced in the button name.
- **Map focus** and **timeline seek** are keyboard reachable. The timeline buttons carry the checkpoint number and phase in their names.
- Focus rings use the gold token.

## Responsive behavior

- **Desktop (≥1001px):** three columns under a guidance band. The power rail scrolls within its own column when long. The map keeps the largest share of the height. The playback footer stays visible without scrolling at 1536×1024.
- **First moment at 1536×1024:** on the opening sample the story region is about 335px tall, and the first broken commitment's headline, its Promised/Submitted row, and its actions all sit inside that region without scrolling. The in-focus strip starts below the story.
- **Shorter desktop (1280×800 and 1366×768):** the theater keeps its 640px minimum, so the page scrolls to reach the playback footer. The story region scrolls rather than clipping. The headline and promise row stay in view, and the action buttons are one scroll away inside the story.
- **Tablet and phone (≤1000px):** the theater stacks in reading order: orientation, phase guide, map, story and dispatches, then the in-focus strip, then playback. The phase guide and branch context collapse to a single column at ≤760px. The orientation actions wrap to full width. There is no horizontal page overflow at 390px, the first moment's headline and promise row fit the screen width, and the custom listboxes stay within the viewport.
- **Reading size:** story body text is 12px and moment labels, eyebrows, and the in-focus label are at least 9px. Map labels and coordinates keep their smaller map-scale sizes.

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
- The sample opens at the first checkpoint after its first resolved phase, so the observer sees a real betrayal immediately. Checkpoint zero remains available.
- The UI chrome uses sans-serif for controls and data; serif type carries the map title, phase titles, moments, and quotations.
- Dialogs for configuration, branching, dossiers, and archive extend the composition to meet functional requirements.

## Verification method

Checks run from the project root. Current results are recorded in [VERIFICATION.md](VERIFICATION.md).

- Typecheck, ESLint, Ruff, production build, TypeScript unit tests, Python engine tests.
- Playwright browser flows against a production build with an isolated database: the sample explanation and exploration; the first-visit role card; recorded-history guarantees; a broken commitment through the map to the full order list; the pivotal event through advancing and branching; sandbox labels and phase limit; no run on load; a live phase in progress with observed progress only; custom controls by keyboard and pointer; dialogs; mobile overflow and listbox placement.
- Screenshots were inspected at 1536×1024 and 390×844.

## Not verified here

- Live runs cover one phase with the economical models (one proof run, see VERIFICATION.md). Multi-phase live play, long-game strategic quality, and results from other providers are not verified.
- Browser checks use Chromium only.
- The documentation capture spec (`CAPTURE_SCREENSHOTS=1`) regenerates the images in `docs/`.
