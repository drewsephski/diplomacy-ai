# Research and architectural decisions

Reviewed November 10, 2026.

## Rules engines

The [diplomacy/diplomacy engine](https://github.com/diplomacy/diplomacy) provides standard-map initialization, legal order enumeration, state serialization, adjudication, and a DATC test suite. Its Python package covers simultaneous movement, support cutting, convoys, dislodgement, retreats, home-center builds, and disbands. This application pins version 1.1.2 and drives it through an isolated JSON/stdin adapter. We ran its 160-case standard DATC suite locally. Its older Python documentation is not taken as proof of current-runtime compatibility; this build and its tests use Python 3.12.

[zond/godip](https://github.com/zond/godip) was also considered. It is a Go adjudicator with variant support and a GPL-3.0 license. Python Diplomacy was chosen for the direct legal-order API, serializable game snapshots, packaged standard map, and immediately executable upstream conformance tests. No custom approximation of Diplomacy adjudication is used.

The adapter enforces complete, nonduplicated movement/retreat orders and legal adjustment counts before submitting all countries’ orders. The model never decides whether its own move succeeds.

## Prior AI work

[Meta’s CICERO](https://ai.meta.com/research/cicero/) combines strategic planning and language for negotiation. The useful architectural lesson is the separation between diplomatic communication and board-level consequences. This project is not a reproduction of CICERO, does not use its model weights or planning system, and makes no performance comparison with it.

[Diplomacy Research](https://github.com/diplomacy/research) supplies prior supervised and reinforcement-learning work for no-press Diplomacy. That distinction matters: a strong order policy and a persuasive conversation model are different capabilities. Seven Powers exposes the negotiation/action gap instead of assuming eloquent diplomacy means strong play.

## Model integration

[OpenRouter’s AI SDK guide](https://openrouter.ai/docs/guides/community/vercel-ai-sdk) documents the official `@openrouter/ai-sdk-provider`. The shipped provider is paired with AI SDK 6 according to its installed peer dependency. Structured responses are validated by Zod. The live catalog restricts selection to models with structured-output support and nonnegative, known token prices with no additional request fee.

Each power has a separate request context and durable memory. Different models may occupy different seats. The country’s observation consists of its current legal actions, the public board, revealed public orders, its own past memory, and only conversations it participates in. Spectator summaries, other countries’ profiles, sealed decisions, and unrelated diplomatic channels are excluded.

## Replay and branches

SQLite stores the entire match as an atomic durable record after each accepted request and resolved phase. This simple local architecture avoids introducing a distributed queue before there is a multi-user requirement. One in-process runner owns billable work. Snapshots include the engine’s serializable state, memories, trust assessments, and configurations. A branch copies only the prefix through its checkpoint; no later observations are inherited.

Completed turns are immutable in normal operation. Order interventions are applied before adjudication and logged in the issuing power’s decision summary and memory. Diplomatic interventions are delivered only to their selected audience. Trust is an agent belief, supplemented by deterministic penalties for promises broken to that country.

## Historical sources and interpretation

The comparison view uses:

1. [UK Government: Henry Petty-Fitzmaurice, Marquess of Lansdowne](https://www.gov.uk/government/history/past-foreign-secretaries/henry-petty-fitzmaurice), for Britain’s negotiated diplomatic realignment.
2. [National WWI Museum: Italy Enters World War I](https://www.theworldwar.org/learn/about-wwi/italy-enters-world-war-i), for the distinction between alliance membership and actual entry into war.
3. [Canadian War Museum: Origins and Early Phases](https://www.warmuseum.ca/firstworldwar/history/going-to-war/origins-and-early-phases/), for the changing composition of wartime coalitions, including the Ottoman Empire.

The historical page is spectator-only. Country profiles contain broad starting interests rather than later events. The mutual-trust threshold (+30 from both countries) is an explicit product heuristic, not a historical measure or a treaty detector. Exact promise checks concern issued orders, not tactical success. Supply-center trends measure the game, not population, wealth, territorial area, or human welfare.
