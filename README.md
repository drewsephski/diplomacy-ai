# Seven Powers

An AI Diplomacy observatory: seven independent countries, private negotiations, simultaneous orders, and a continent whose history can branch.

![Seven Powers desktop](docs/desktop.png)

## Run locally

Requirements: Node **22.13+**, pnpm **10**, Python **3.12**, and [uv](https://docs.astral.sh/uv/).

```sh
pnpm install
pnpm setup:engine
cp .env.example .env
pnpm dev
```

Open **http://127.0.0.1:5173**. On first startup, the server creates an eleven-phase sample replay using the real adjudicator. No API key is required to explore it or run a sandbox.

For real agents, put your **OpenRouter** key in `.env`:

```dotenv
OPENROUTER_API_KEY=your-key
```

Restart the server and press **Set up a game**. The four steps are Players, Guidance (an optional shared briefing, plus optional instructions that only one country reads), Length (phase limit and budget ceiling), and Start. Every default works, so a novice can press **Start game** on the first pass. Nothing calls a model until that press. Model selection uses OpenRouter’s current catalog and lists only models that accept chat-completions requests, support structured output, and publish token prices. The key is server-side only and excluded from Git and replay exports.

The defaults are the economical pair **GLM 5.3 Flash** (`z-ai/glm-5.3-flash`) and **Claude Haiku 5.5** (`anthropic/claude-haiku-5.5`). Both run at low reasoning effort. Presets assign either model to all seats or alternate them.

For a built local app:

```sh
pnpm build
pnpm start
```

Open **http://127.0.0.1:3001**. Vite is development-only; Express serves the built application in this mode. Both services bind to loopback. This is a single-operator local application, not a publicly exposed multi-user service.

## Reading the observatory

**First visit.** A welcome panel (not a modal; the map stays visible) states the role in one line: *You watch. Seven independent countries decide. Nothing waits for your orders.* Its one primary action, **Watch the first negotiation**, opens the free sample at its opening, follows France, and walks through Spring 1901: the France–Britain stakes over the English Channel, their private talks, one question to watch (with an optional local guess), the sealed orders, the reveal, and what changed. **Explore on my own** and **Set up a game with AI countries** are secondary. The panel can be hidden, and **How to watch** brings it back. Short concept notes (why supply centers matter, promises versus orders, simultaneous resolution, a kept promise that still fails) appear the first time they are relevant.

**Provenance.** **Recorded sample** replays an authored game through the real rules engine, with no model calls. **Local sandbox** runs deterministic local policies. **AI countries** calls real models, and cost appears in the status bar.

**The moment rule.** A **moment** is the board at the **start** of a phase. At moment *i* every view (Watch, Conversations, country details, Timeline, Compared with history, the alternate-timeline comparison) shows the talks of phases up to and including *i*, but orders, results, and promise outcomes only for phases that resolved before *i*. A promise made in the phase on screen is shown as *sealed · orders not revealed yet*. The recorded past therefore behaves exactly like the live edge, and an earlier moment never shows a later fact.

**Watch stage.** Desktop: a **Follow a country** rail (seven chips with center counts, then the followed country's card: what it wants, its centers and units at this moment, who it is talking with, its promises and their status, and a clearly labelled *Real history* note), the map with the guide card over it, and a story panel with *Watch for* (the phase's questions), **Talks** (threads of the phase on screen, the followed country first, the rest under *Elsewhere*), and **What happened** (the last resolved phase). Phone (≤760px): a compact top bar with a **Menu** sheet (navigation, Guided view, How to watch, Set up a game), the country strip, the map, **Story · Talks · Country** tabs, and a fixed playback dock. The guide's bottom sheet takes the dock's place while it is open and can collapse to a peek bar. A one-finger drag over the map scrolls the page; zoom with the buttons or a pinch, or turn on **Move map with one finger**.

**Conversations** groups the dispatches into threads by their exact participants (group threads keep all their members), with a plain summary per message, the original words, recorded reply links (an inferred link says so), the places named, open questions, and each promise's status: sealed, kept, or broken, with what was ordered and how it resolved. Orders read in plain language first, with the exact engine text as detail.

**What happened** explains the last resolved phase in plain language: broken commitments (promised order beside the submitted one), kept commitments whose order still failed, supply centers that changed hands, bounced attacks, and successful moves into occupied provinces. Every submitted order is listed underneath, with its exact engine text.

### Watching a game

**Start game** creates the game and plays its first phase. From then on the page holds one *watch session* for that game, and the session is the only thing that ever asks the server for a phase, one at a time:

- **Guided view on (the default).** Each phase that resolves opens its walkthrough on its own: what happened, why it matters, and the province on the map, in beats: stakes, talks, a question, the sealed orders, **Reveal the orders**, the events, and a summary that answers the question and offers a supported *What if?*. **Back**, **Next**, and **Skip to phase summary** move at your pace. The next phase waits until you press **Continue watching** on the summary. The status line reads *Reading · the next phase waits for Continue watching*. The final phase offers **See the result** instead.
- **Guided view off.** The game plays on, one phase at a time with a short gap, until you pause it or it reaches its limit.
- **Pause game** always reaches the server, even while the request for a phase is still in transit, and shows **Pausing…** until the server is idle. A phase in progress stops after its current model call.
- **Closing, hiding, or leaving always pauses.** Closing the guide, turning guidance off, toggling Guided view, opening any dialog, switching to any other tab, scrubbing the timeline, hiding the browser tab, opening another game, and refreshing all end the session. Nothing resumes until you press **Resume game** (or Continue watching while a phase is held).
- **Play next phase** plays exactly one phase and stops.

Every order in a phase still resolves at the same moment; the beats after the reveal narrate that one resolution, in order of importance.

### Replaying a record

Any record (the sample, a sandbox game, or a live game, finished or paused) replays from any recorded moment with no request to the server and no cost. With Guided view on, **Watch with a guide** walks the phase on screen from its start (its board before the reveal, then after it) and continues through the recorded phases; with it off, **Play replay** advances them on a timer, and **Replay speed** sets its pace. Looking at the past of an unfinished game, **Resume at latest** is a separate, labelled control; the primary control never jumps to a billed phase. A dialog, tab switch, or hidden page also stops the free replay timer.

## What you can do

- Watch a selectable, pannable, zoomable standard-map Europe. Toggle revealed movement arrows and inspect supply centers and units.
- Inspect every country’s objective, its own explanation of its last orders, its stated trust in each neighbor (an assessment, not an alliance), its conversations, and its private notes, all as of the moment on screen.
- Read bilateral and group conversations, and compare promised orders with the orders actually issued. A kept promise can still fail tactically.
- Find every game you started in **History**: its mode, phases, cost, the question that started an alternate timeline, and its true result (a phase limit is never shown as a win). **Open** loads a game at its latest moment and **From the start** at its opening; neither plays anything. **Delete** asks first and removes a game for good; the sample cannot be deleted, a running game cannot be deleted, and an alternate timeline whose original was deleted keeps working.
- Replay saved phases, seek through the timeline, and export a JSON archive. Games are automatically persisted in SQLite under `data/`.
- Explore **What if?** After a consequential decision the phase summary offers a supported experiment, such as *What if France had kept its promise?*: the dialog opens at the checkpoint before the decision with the one change filled in, says what changes and what the original record shows, and states honestly what each continuation can show. **Try a different decision** offers the same at any nonterminal moment: replace one legal order, change a country's profile, or (with AI countries only) add a message. The free sandbox does not read messages or react strategically, so it does not offer them. The alternate timeline stores its question and change; **Alternate timeline** compares it with the original: the shared past, the first phase played differently (orders and centers), the standings, and a button back to the original at the branch moment.
- Use competitive, coalition-building, opportunistic, or historically informed profiles. Historical interests start in 1901; future alliances and events are not supplied to agents.
- Explore **Compared with history**, which combines current observations with linked museum and government sources and explains the game’s historical limitations.

### Three clearly separated modes

**Sample replay:** authored teaching dialogue and opening orders, followed by deterministic continuation. Every phase is adjudicated by the actual engine. It is not presented as an AI run.

**Local sandbox:** a deliberately simple deterministic policy selects legal orders. It is useful for exploring rules, playback, and order branches; it is not a strong Diplomacy player. Messages are recorded but do not influence this policy. Profiles alter deterministic order ranking rather than producing sophisticated historical behavior.

**AI countries:** each country receives an independent model call with its own objective, profile, memory, eligible messages, legal orders, and public board history. Real model outputs determine negotiation and orders; the adjudicator determines outcomes. Mixed models and a uniform-model setup are both supported. No benchmark or human-level play claim is made.

### Pause, costs, and recovery

Pause stops **after the current model request settles**, before sending another request or adjudicating. Every request for a phase carries a ticket, and the pause carries the same ticket: if the pause reaches the server before its request, the request is refused and no phase is played. A model request has a 120-second timeout. Each call uses low reasoning effort for the two economical models, with no retries. Completed requests and partial phases are saved, so resuming does not repeat already accepted negotiations or decisions. A restarted server recovers running matches as paused; it never resumes spending automatically.

The service reserves a conservative price allowance before every request using UTF-8 prompt bytes, a protocol/schema allowance, output limits, and current catalog prices. Where the catalog defines a higher long-prompt tier (Haiku 5.5 is priced higher from 100,000 prompt tokens), the reservation uses that tier once the prompt reaches its threshold. The advertised base rate alone is never used for such prompts. Completed calls use provider-reported cost where available; otherwise the UI labels estimates. Failed or interrupted calls retain their reservation because billing may have occurred. SDK retries are disabled. Budget limits stop additional calls; they are not a substitute for an account-level OpenRouter credit limit if upstream prices or billing behavior change.

The phase limit counts all resolved phases, including retreats and adjustments. Reaching it ends the *run*, not necessarily the Diplomacy game. An engine-declared solo or draw also ends play. Branching supplies a fresh continuation budget and limit. Only one match runs at a time.

Invalid model output or illegal/incomplete order sets pause with an explicit error. Invalid orders never silently become successful actions. Resuming may require fresh decision calls after a rejected order set. Saved, resolved turns remain intact.

## Architecture

| Layer | Implementation |
|---|---|
| Interface | React 19, TypeScript, Vite, local fonts, Lucide, SVG map |
| API | Express 5, Zod input validation, loopback-only access |
| Agents | Vercel AI SDK 6 + `@openrouter/ai-sdk-provider`, structured output |
| Rules | Python `diplomacy==1.1.2`, JSON subprocess boundary |
| Persistence | Node SQLite, WAL, durable serialized matches and partial phases |
| History | Immutable completed turns, per-phase engine/memory checkpoints, independent branches |

`server/privacy.ts` is the explicit allowlist boundary for model observations. Spectators can read all private diplomacy; model calls cannot. Sealed decisions and other countries’ memories never enter an agent observation. Private message content is treated as untrusted game communication by the system prompt.

The map uses jDip standard-map geometry, extracted from the engine package with `scripts/extract_map.py`. Province fill indicates a combination of starting national geography and recorded influence; **supply-center dots and center counts are authoritative ownership**, not the area of the colored land. Army and fleet tokens track engine positions. Coast-specific orders preserve the engine’s coast notation.

For design, source selection, verification evidence, and known limits, see:

- [Research and architectural decisions](docs/RESEARCH.md)
- [Design contract and visual verification](docs/DESIGN.md)
- [Verification record](docs/VERIFICATION.md)
- [Third-party sources and licenses](docs/THIRD_PARTY.md)

The adjudicator is AGPL-3.0 and the inherited map carries jDip GPL attribution. The applicable upstream notices are preserved. Distribution or public hosting must account for those terms; no public deployment is configured here.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:datc
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
```

Browser tests start a separate built server on port 3012 with a fresh database in a temporary folder, and with `OPENROUTER_API_KEY` set to an empty string, so a key in `.env` is never loaded and no test can bill (`tests/browser/no-billing.spec.ts` asserts it). Tests that need the live setup screens fake `/api/health` and the model catalog in the browser. The watch-session regressions are in `tests/browser/watch.spec.ts`, the guided-card layout checks in `tests/browser/layout.spec.ts`, and the newcomer journey (desktop and 360/390/430px phones, the moment rule, conversations, states, touch, keyboard, reduced motion, and billing) in `tests/browser/journey.spec.ts`. `tests/moment.test.ts` checks that earlier moments never read later facts. Provider-contract tests mock the HTTP boundary; the verification record separately identifies the earlier paid model runs.

To spend a small, capped amount on the economical models, run the bounded live proof once. It makes one phase with one diplomacy round, alternating GLM 5.3 Flash and Haiku 5.5, with a hard budget of $0.10. It writes its record to the local archive, and it prints transport facts only, never the key or headers. The records of earlier proof runs were deleted from the local archive at the owner's request; their results remain in the verification record as history:

```sh
pnpm exec tsx scripts/live-proof.ts
```

The most recent result, which is partial, is recorded in [VERIFICATION.md](docs/VERIFICATION.md).

The local tests cover full simulation flow, private projections, sealed orders, durable checkpoints, branching, budget refusal before sending, provider failure without retries, and standard rules including support cutting, convoys, retreats, builds, and disbands. The upstream DATC suite adds the engine’s specialized adjudication cases.

## Operating boundaries

- One Node process and a local SQLite database. Do not run multiple orchestration processes against one database. Multi-user hosting would require authentication, tenant isolation, and a durable job queue.
- A model’s requested order need not be strategically good. This app verifies legality, not strategic strength.
- Requests in a diplomacy round run sequentially; a later country can receive earlier countries’ messages from that round. Decision calls never see one another’s sealed orders.
- Saved JSON exports are readable archives. The UI replays the durable local archive; it does not currently import external match files.
- Branch comparisons match the original by phase name. When retreat phases make the timelines drift apart, the nearest checkpoint is shown with a warning that it is not a same-phase comparison.
- Historical profiles are bounded editorial interests, not recreations of specific leaders or factual forecasts.
# diplomacy-ai
