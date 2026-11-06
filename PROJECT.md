# MausNest — Combined Architecture Plan

Nov 5, 2026

## Executive summary

OpenMausBot and Nango solve two different halves of the "team of AI employees" problem that Sintra.ai sells. OpenMausBot is a local-first, multi-agent chat shell: a roster of bots, each a real Claude/Codex/Grok agent with its own computer, its own model, an approval system, voice, triggers, and team-sharing — but its integrations run through Composio and it has no multi-tenant cloud backend. Nango is the opposite: a production-grade, multi-tenant auth and integration runtime for 1,000+ APIs, with managed OAuth, a proxy, typed TypeScript "functions," and two-way sync — but it has no chat UI, no agent orchestration, and no end-user-facing product at all.

The proposed product, working name **MausNest**, takes OpenMausBot's chat-of-agents front end and harness/orchestration layer and rebuilds its integration, auth, automation, and multi-tenancy backbone on Nango instead of Composio. The result is a hosted, multi-tenant "AI employees" platform — a roster of named, specialized bots per workspace, each backed by a real LLM agent, each able to authenticate into and act on 1,000+ third-party APIs through Nango, each schedulable and webhook-triggered, each gated by an approval/permission broker, and each shareable as a packaged "team" the way OpenMausBot already supports.

Against Sintra.ai (12 fixed helpers, a closed "Brain AI" memory layer, \~90 power-ups, $15.60–$97/mo per workspace), MausNest's differentiation is structural, not cosmetic: real coding/computer-use agents instead of prompt templates, open-source and self-hostable instead of closed SaaS, an auditable approval trail instead of silent automation, and an integration layer (Nango) that is already proven at production scale (Replit, Ramp, Mercor) rather than a bespoke connector shim.

## Competitive snapshot vs. Sintra.ai

| Dimension | Sintra.ai | MausNest (OpenMausBot + Nango) |
| --- | --- | --- |
| Agent roster | 12 fixed "helpers," prompt-template based | Unlimited custom bots, each a real Claude/Codex/Grok agent with tool use |
| What a helper can do | Chat + prompt-library "power-ups" (\~90) | Full coding/computer-use agent: shell, files, browser, cloud or local desktop |
| Brand/business memory | Brain AI — brand voice, ICP, docs, URLs | Workspace knowledge base (RAG) + per-bot instructions + Nango per-customer config |
| Third-party connections | Limited native integrations (Gmail, Calendar, Facebook, etc.) | 1,000+ APIs via Nango auth/proxy, same connector layer agents call as tools |
| Automation | Recurring tasks (weekly/monthly) | Schedules, webhooks, and inbound app events (Nango sync + OpenMausBot triggers) |
| Oversight | Largely autonomous, opaque | Inline Allow/Deny approval cards for every risky action |
| Workspaces | Up to 5 business profiles | Unlimited workspaces/departments, org-level template library |
| Openness | Closed SaaS only | Open-source core (Apache-2.0 + Elastic License), self-hostable, BYOC |
| Pricing shape | $15.60–$97/mo per workspace, helper-gated | Usage- and seat-based, free self-host tier, no per-helper upsell |
| Underlying infra maturity | Unknown/bespoke | Nango: production-proven (Replit, Ramp, Mercor), SOC 2 II / HIPAA / GDPR |

The wedge is simple: Sintra sells the *idea* of a team of AI employees through curated prompts and a lightweight integration layer. MausNest builds the same idea on top of agents that can actually execute multi-step work (write code, browse, operate a desktop) and an integration runtime that is already battle-tested at scale — the two pieces Sintra has not solved.

## Product vision and design principles

**Vision:** a chat app where every conversation is a real AI employee — not a chatbot wearing a job title, but an agent with a model, a computer, a memory of the business, and a defined set of systems it's allowed to touch.

**Design principles**

1. **Agents, not prompts.** A "helper" is a Claude/Codex/Grok-class agent that can plan, use tools, write and run code, and operate a browser or desktop — not a system prompt wrapped around a single LLM call.
2. **Integrations are infrastructure, not a feature.** Auth, token refresh, rate limits, and API shape-shifting are delegated entirely to Nango so the agent layer only ever calls clean `nango.proxy()` / `nango.action()` calls — this is the same separation Nango already enforces for its own customers.
3. **Humans stay in the loop by default.** Every state-changing action (send an email, push code, charge a card, modify a record) surfaces as an approval card unless a bot's trust level has been explicitly raised for that action type.
4. **Workspace-first multi-tenancy.** Every business is a workspace with its own bots, connections, knowledge base, and billing boundary — mirroring both OpenMausBot's "departments/channels" model and Nango's per-tenant "connections" model, which already map onto each other almost 1:1.
5. **Open core, hosted convenience.** The orchestration and integration layers stay open source (as both parent projects already are); the hosted product adds multi-tenant auth, billing, managed Nango Cloud, and a managed fleet of agent sandboxes — the same open-core shape Nango itself uses.

## Source repo breakdown

**From OpenMausBot (keep, adapt from local-first to multi-tenant cloud):**

| Component | Repo location | Role in MausNest |
| --- | --- | --- |
| Chat shell (React + Vite + Tailwind) | `src/` | Bot roster UI, channels, approval/question cards, model picker |
| Harness server | `server/harness/` | Driver registry + fan-in SSE event bus → becomes a multi-tenant service |
| Drivers (Claude/Codex/Grok CLIs, cloud computer) | `server/drivers/` | One driver per agent engine; add a driver interface for hosted sandboxes |
| Permission broker | `server/harness/` (broker) | Approval/Deny flow for every risky tool call |
| Triggers (schedules, webhooks, app events) | docs/decision-model, trigger executor | Rebuilt on Nango's sync + webhook-processing primitives |
| Voice (TTS/STT) | `server/tts/` | ElevenLabs/Fish/Grok/local — kept largely as-is |
| Team/department sharing, BotMRR import | docs/team-sharing, presets | Becomes the "install a team" onboarding flow |
| MCP server | docs/mcp-server | External control plane (Claude Desktop, Cursor, etc.) |
| Electron desktop shells | `electron/` | Optional thick client; web app is primary for the hosted product |

**From Nango (replace Composio as the integration backbone):**

| Component | Role | Role in MausNest |
| --- | --- | --- |
| Auth | Managed OAuth/API-key/token-refresh for 1,000+ APIs | Replaces Composio's connected-apps OAuth; backs the "Connect an app" UI |
| Proxy | Authenticated pass-through requests per connection | What agent tool calls hit when acting on a connected app |
| Functions | Typed TypeScript integration logic, AI-generated or hand-written | How bots get well-typed "actions" (send email, create ticket) instead of raw API calls |
| Sync | One/two-way data sync engine | Powers RAG ingestion (CRM, docs, tickets) and the knowledge base |
| Webhook processing | Reliable inbound webhook handling | Backs app-event triggers ("whenever a new Stripe charge fails") |
| Per-customer config | Customize integration behavior per tenant | Maps directly onto MausNest's per-workspace settings |
| Multi-tenant connection management | Thousands of end-customer connections per integration | The reason Nango — not Composio — is the right backbone for a multi-tenant SaaS |

Composio is not discarded outright in the short term (OpenMausBot's existing marketplace UI can stay as a fallback/comparison), but Nango becomes the system of record for auth, token lifecycle, and API execution because it is the piece purpose-built for multi-tenant, agent-callable integrations at the scale a Sintra competitor needs.

## High-level system architecture

&#91;embedded content: layered architecture · client → harness → drivers/Nango/automation → knowledge & external APIs\]

Five layers, top to bottom. The client shell talks only to the harness over HTTP + one SSE stream. The harness fans work out to agent drivers (Claude/Codex/Grok/cloud computer); those drivers call out to Nango for any action that touches a third-party system, so agents never hold raw API credentials themselves. Nango's sync engine also feeds the workspace knowledge base, and its webhook processing feeds the automation layer, which can itself start new agent turns through the harness — closing the loop from "something happened in Stripe" to "a bot drafted a reply" to "a human approved it."

## Layer 1 — Client experience

Kept close to OpenMausBot's existing shell, moved from a 127.0.0.1-only app to a hosted multi-tenant web app (Electron/mobile wrappers remain optional thick clients):

- **Bot roster as contacts.** Each bot is a named, specialized employee ("Soshie — Social", "Milli — Sales") with a picture, a model, a voice, and a connected-apps list — a direct analogue to Sintra's 12 helpers, except user-defined and unlimited.
- **Channels/departments.** Work, client accounts, and projects stay in separate channels without cloning bots — this already exists in OpenMausBot and maps directly onto Sintra's "workspaces."
- **Approval and question cards.** Every risky tool call (shell command, file edit, send email, spend money) renders inline with Allow/Deny/answer-in-chat, streamed over the same SSE event bus OpenMausBot already uses.
- **Computer panel.** A live preview of a bot's cloud or local desktop, so people can watch (or take over) long-running work — a feature Sintra has no equivalent of.
- **Model picker.** Claude, Codex, Grok (and later OpenRouter/Fireworks/etc.) side by side per bot, switchable mid-conversation.
- **Mobile and voice.** Phone pairing (QR/Tailscale/managed relay) and spoken replies/calls carry over largely unchanged from OpenMausBot; this is the one experiential area Sintra does not match today.

## Layer 2 — Orchestration / harness

The harness is OpenMausBot's existing `server/harness/` and `server/drivers/`, re-platformed for multi-tenancy:

- **Driver registry.** One driver per agent engine (Claude CLI/SDK, Codex, Grok, plus a hosted-sandbox driver for cloud execution). Unknown or unavailable drivers degrade gracefully rather than crashing the fleet — kept as-is from OpenMausBot's design.
- **Event bus.** A canonical runtime event stream that normalizes each provider's native protocol (stream-JSON, JSON-RPC, ACP) into one format, fanned out over SSE per workspace/tenant instead of a single local process.
- **Decision model ("Jev").** In rooms set to Auto, an un-mentioned message is routed to the bot that fits it in a few hundred milliseconds, falling back to a room lead — this becomes the mechanism that makes a *team* of bots feel coordinated rather than a flat bot list, which is exactly where Sintra's 12 helpers currently require the user to pick manually.
- **Multi-tenancy change required.** OpenMausBot's harness currently assumes one user, one machine (`~/.openmausbot`, 127.0.0.1:8799). For MausNest this becomes a stateless, horizontally-scaled service: driver instances run in per-tenant isolated sandboxes (containers or microVMs), transcripts and keys move from local disk to a tenant-partitioned datastore, and the event bus becomes a per-workspace SSE/WebSocket channel behind auth.

## Layer 3 — Integration and auth backbone (Nango)

This is the layer Sintra has not solved at depth, and it is Nango's entire purpose. Every bot action that touches a third-party system goes through one of Nango's three primitives rather than a bespoke per-app integration:

- **Auth.** `nango.openConnectUI()` is embedded directly in MausNest's "Connect an app" flow inside each workspace; Nango owns OAuth, API-key, and token-refresh for 1,000+ APIs, so MausNest never stores or refreshes a third-party credential itself.
- **Proxy.** When a bot needs to make a live call ("look up this contact," "check this ticket"), the agent's tool layer issues `nango.get/post/...()` with the workspace's `connectionId` — Nango resolves the provider, injects credentials, and handles retries/rate limits.
- **Functions.** Higher-level actions ("send an email," "create a Linear issue," "log a deal") are written as typed Nango Functions — either hand-written or generated by Nango's AI builder from a natural-language description — and exposed to agents as clean, reviewable tools instead of raw API surfaces. This is also how an agent in the harness gets a stable tool schema regardless of which upstream API changed underneath.
- **Sync.** Two-way sync functions keep a workspace's data (CRM contacts, support tickets, docs) mirrored into MausNest's own store, which is what the RAG/knowledge layer (Layer 5) and the decision model read from, instead of hitting live APIs on every agent turn.
- **Per-customer config.** Nango's per-tenant configuration maps directly onto MausNest's per-workspace settings — different rate limits, field mappings, or enabled actions per business, without forking integration code.

Composio, which OpenMausBot currently uses for its "connected apps" marketplace, is replaced by Nango as the system of record for credentials and execution; OpenMausBot's existing marketplace UI pattern (one-click connect, OAuth once, every bot can use it) is kept, just re-pointed at Nango's Connect UI and Proxy.

## Layer 4 — Automation (triggers, schedules, webhooks, app events)

OpenMausBot's trigger model ("when something happens, a bot does something") is kept as the user-facing concept, but its execution backbone moves onto Nango where it overlaps:

- **Schedules.** "Every weekday at 9, summarize my inbox" — set up conversationally with `create_trigger`, shown live with Edit/Pause/Undo. Interval schedules stay aligned to their start time and skip an occurrence if the previous run is still active, exactly as OpenMausBot already does.
- **Webhooks.** Rather than OpenMausBot's local-only receiver on `127.0.0.1:8800`, MausNest runs an always-on, multi-tenant webhook endpoint backed by Nango's webhook-processing primitive, which already handles reliable inbound delivery, retries, and per-connection routing at production scale.
- **App events.** "Whenever I get an email from Acme, draft a reply" is powered by Nango's sync engine instead of Composio's event queue: Nango syncs detect new/changed records (new email, new Slack message, failed charge) and fire a trigger through the harness, which starts (or messages) the relevant bot.
- **Reliability model kept from OpenMausBot:** a webhook secret shown once at creation/rotation, bearer auth preferred over URL secrets, and a calendar of run history (Triggers page) with Pause/Edit/Undo on every automation — this auditability is a meaningful gap in Sintra's "recurring tasks," which offer no equivalent run history or kill switch per task.

## Layer 5 — Knowledge and memory (the "Brain AI" equivalent)

Sintra's standout retention feature is Brain AI: a persistent memory of brand voice, ICP, product catalog, and past campaigns, trained once and reused by every helper. MausNest needs an equivalent, built from pieces both source repos already imply:

- **Per-workspace knowledge base.** A vector store scoped to the workspace (never cross-tenant), populated from (a) files and URLs the person uploads directly, and (b) Nango sync functions pulling structured data — CRM records, support tickets, docs — from connected apps.
- **Per-bot instructions.** Each bot keeps its own system prompt/personality/skills (already supported in OpenMausBot's bot profiles), layered on top of the shared workspace knowledge so a sales bot and a support bot draw on the same brand facts but act differently.
- **Retrieval at agent-turn time.** Before a bot's turn, relevant knowledge-base chunks are retrieved and injected as context, the same pattern OpenMausBot's existing skills/instructions system already uses for per-bot customization.
- **Freshness via sync, not scraping.** Because Nango's sync keeps the knowledge base current from live systems (not a one-time upload), MausNest's "Brain" stays accurate as the underlying CRM/ticketing data changes — something Sintra's document-upload-based Brain AI does not do automatically.

## Layer 6 — Permission broker, approvals, and trust

This is OpenMausBot's permission broker, essentially unchanged, and it is the single biggest trust differentiator against Sintra, which runs "largely autonomous" with no visible per-action gate:

- **Every risky action is a decision, not a surprise.** Shell commands, file edits, and any Nango Function flagged as state-changing (send, pay, delete, post) surface as an inline Allow/Deny card before execution, for cloud and local computers alike.
- **Trust levels per action type.** A workspace admin can raise a bot's trust for a specific, narrow action ("always allow replying to support tickets under $0 value") without granting blanket autonomy — this is new relative to OpenMausBot's current binary ask/no-ask model, needed because a multi-tenant product can't require a human to approve every single email at scale.
- **Nango Functions as the audit boundary.** Because every external action routes through a typed Nango Function rather than a raw API call, every approval card can show exactly what will happen (the function name, its inputs) in human terms — not an opaque HTTP request.
- **Full audit trail.** Every approval decision, trigger firing, and Nango Function execution is logged per workspace, giving admins a complete record of what every bot did and who approved it — required for any business (and especially regulated ones) considering giving an AI employee real system access.

## Layer 7 — Multi-tenancy, workspaces, teams, billing boundary

Sintra's "up to 5 business profiles" model and Nango's "connections per integration" model already point at the same shape; MausNest standardizes on it:

- **Workspace = tenant.** Every workspace has its own bots, channels, knowledge base, Nango connections, and billing — the natural unit for both a solo founder and a department inside a larger org.
- **Departments and channels inside a workspace,** carried over from OpenMausBot: Work, Personal, and each client/project stay in separate channels without cloning bots.
- **Team sharing.** OpenMausBot's "Share a whole department" export (bots, instructions, pictures, skills, routines, connection *slots* — never credentials or chat history) becomes the mechanism for an agency or consultant to package and resell a pre-built MausNest team, directly analogous to a productized Sintra setup but open and portable.
- **Install-from-Markdown.** OpenMausBot's BotMRR-style "install a complete team from one Markdown file" becomes MausNest's onboarding fast path: browse a marketplace of outcome-driven teams, review before creating, connections stay off until explicitly approved.
- **Org library.** For larger customers, an Admin can publish an org-wide template library ("Templates → From {Organization}") so every new workspace in the org starts from approved bots and skills — this is the enterprise upsell lever Sintra does not currently offer.

## Layer 8 — Voice and multimodal

Carried over from OpenMausBot largely unchanged, this is already ahead of Sintra's text-only helpers:

- **Text-to-speech on any reply,** or a bot set to always read its answers aloud, so overnight work can be reviewed by ear.
- **Calls.** A bot that hears you, narrates what it's doing mid-task, and asks for approvals out loud — built on the same on-device dictation used for the composer mic.
- **Provider choice per bot:** ElevenLabs, Fish Audio, Grok (xAI), built-in OS voices, or a self-hosted Chatterbox server, so a channel with several bots doesn't sound like one person.
- **Multimodal input carried forward:** screenshots of a bot's work folded into the transcript, streaming replies with tool-activity chips, and (where platform policy allows) desktop/computer-use screen sharing in the Computer panel.

## End-to-end sequence: a billing recovery example

&#91;embedded content: end-to-end sequence · 6 steps from a failed charge to a logged, approved reply\]

This is the pattern every automation in MausNest follows, whichever app or workspace it runs in: an external event arrives through Nango (webhook or sync), the harness fires a trigger that starts or messages a bot, the bot drafts the action using its model and the workspace's knowledge base, a human approves it through the same card UI OpenMausBot already ships, and the approved action executes as a typed Nango Function — with every step recorded. The same six-step shape covers a Slack reply, a CRM update, or a scheduled report; only the first and fourth boxes change.

## Tech stack recommendation

| Layer | Technology | Source |
| --- | --- | --- |
| Client | React, Vite, Tailwind CSS; Electron for desktop, Expo/web for mobile | OpenMausBot (kept) |
| Orchestration/harness | Node/TypeScript service, SSE event bus, driver SPI | OpenMausBot (kept, re-platformed for multi-tenancy) |
| Agent engines | Claude (Agent SDK/CLI), Codex CLI, Grok Build CLI, plus any ACP-compatible or OpenAI-compatible custom engine | OpenMausBot (kept) |
| Agent sandboxes | Cloud Linux desktops (Boat-style) + isolated Local VM/container per tenant | OpenMausBot pattern, re-hosted multi-tenant |
| Integration & auth | Nango (self-hosted or Nango Cloud/BYOC): Auth, Proxy, Functions, Sync | Nango (new backbone, replaces Composio) |
| Automation | Nango webhook processing + sync-triggered events; OpenMausBot trigger/scheduler UX | Combined |
| Knowledge/RAG | Vector store (e.g., pgvector/Qdrant) populated by Nango sync + uploads | New, using Nango as the data pipe |
| Voice | ElevenLabs, Fish Audio, Grok (xAI) TTS, local Chatterbox | OpenMausBot (kept) |
| Datastore | Postgres (tenant-partitioned) for transcripts, approvals, audit log, workspace config | New |
| Auth (platform) | Workspace/org auth (SSO/OAuth) separate from Nango's third-party auth | New |
| Deployment | Docker/Kubernetes; Nango already ships Dockerfiles and a docker-compose stack to build on | Nango (kept) |

## Deployment model

Three tiers, mirroring how both parent projects already ship:

1. **Hosted (MausNest Cloud).** The default for a Sintra-equivalent audience — sign up, no infrastructure. Runs Nango Cloud underneath (or BYOC in MausNest's own cloud account), multi-tenant harness, managed agent sandboxes. This is the product that competes head-on with Sintra.ai on ease of use.
2. **BYOC (bring your own cloud).** For larger or compliance-sensitive customers: MausNest's control plane runs in the vendor's cloud, but agent sandboxes and the Nango runtime execute inside the customer's own cloud account — the same model Nango already offers.
3. **Self-hosted (open core).** Both OpenMausBot and Nango are already self-hostable (`docker-compose.yaml` in both repos); MausNest's open-source edition lets a technical team run the full stack — chat shell, harness, and a self-hosted Nango — on their own infrastructure, free, with a reduced feature set (matching Nango's existing free self-hosting tier) relative to the hosted product.

This three-tier structure is itself a differentiator: Sintra is closed SaaS only, so a security-conscious buyer has no self-hosted or BYOC option at all.

## Security, compliance, and multi-tenant data isolation

- **Third-party credentials never touch MausNest's own database.** Nango owns OAuth token storage and refresh for every connected app; MausNest's harness only ever holds a `connectionId` reference, which is the same isolation model Nango already provides SOC 2 Type II, HIPAA, and GDPR coverage for.
- **Per-tenant sandbox isolation.** Each workspace's agent processes run in their own isolated sandbox (container/microVM), never sharing filesystem or network namespace with another tenant — required because agents in this product can execute shell commands and browse the web, unlike Sintra's templated helpers.
- **Approval broker as a security control, not just UX.** Every externally-visible or state-changing action requires either an explicit human approval or a narrowly-scoped, admin-granted trust rule (Layer 6) — this bounds the blast radius of a misbehaving or manipulated agent.
- **Secrets handling kept from OpenMausBot's model:** credentials are write-only in the UI (the interface only ever shows a "configured" flag, never the value), and a bot-created webhook never reveals its own secret to the bot.
- **Audit log as a compliance artifact.** Every trigger firing, approval decision, and Nango Function execution is retained per workspace, giving MausNest the evidence trail regulated customers (finance, healthcare, legal) require before they will grant an AI system real access — a gap Sintra's closed, un-auditable automation does not address.

## Packaging and monetization vs. Sintra pricing

Sintra charges per workspace with helper-gated tiers ($15.60 for a single helper up to $97/mo for "Sintra X," all 12+ helpers and 90+ power-ups, up to 5 Brain AI profiles). MausNest's packaging avoids per-helper gating, since bots are user-defined rather than a fixed catalog:

| Tier | Price shape | What's included |
| --- | --- | --- |
| Self-host (open source) | Free | Full chat shell + harness; self-hosted Nango free tier (limited connections/throughput) |
| Starter (hosted) | Flat per-workspace monthly | Unlimited bots, Nango Cloud with usage-based connection limits, shared agent sandboxes, standard support |
| Team | Per-seat + usage | Multiple workspaces, department sharing, org template library, priority sandboxes |
| Enterprise / BYOC | Custom | BYOC deployment, SSO, dedicated Nango capacity, SLA, audit export, custom compliance review |

The meter that actually matters — and the one Sintra's flat tiers obscure — is agent compute and Nango API call volume, so usage-based add-ons (extra agent-minutes, extra connected-app calls) sit on top of each tier rather than being bundled flat, keeping the entry price competitive with Sintra's $15.60 single-helper tier while scaling fairly for heavy users.

## Phased roadmap

&#91;embedded content: roadmap · 3 phases, 2 gates, from a single-workspace MVP to BYOC-ready V2\]

**Phase 1 (MVP, \~6–8 weeks):** fork OpenMausBot's harness, strip Composio, wire bot tool calls to a single Nango project's Auth + Proxy for a handful of high-value apps (Gmail, Slack, a CRM). Single tenant, manual approval on every action, Claude-only driver — enough to validate that "real agent + Nango-backed actions" beats a Sintra helper on a real task.

**Phase 2 (V1, \~3 months):** multi-tenant harness and auth, Nango Functions and Sync powering app-event triggers, OpenMausBot's schedule/webhook UX, department sharing, voice, and billing — this is the first version that can take self-serve signups and compete directly with Sintra on breadth of helpers and automations.

**Phase 3 (V2, \~3–4 months):** workspace knowledge base (RAG) as the Brain AI equivalent, admin-configurable trust levels so not every action needs a human click, org-wide template libraries for agencies/enterprises, and a BYOC deployment option — this is where MausNest's openness and auditability become a sellable advantage over Sintra for compliance-sensitive buyers.

## Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| OpenMausBot's harness is local-first by design; multi-tenancy is a rewrite, not a config change | Underestimating this collapses the Phase 1 timeline | Treat Phase 1 as single-tenant on purpose; don't multi-tenant until the agent-plus-Nango loop is proven |
| Agent CLIs (Claude/Codex/Grok) assume a logged-in local account, not server-side API billing per tenant | A hosted product can't ask every customer to bring their own CLI login | Move agent access to API-key/Agent SDK-based billing per workspace for the hosted tiers; keep "bring your own CLI login" only for self-host |
| Composio-to-Nango migration touches every existing tool-call site in OpenMausBot | Easy to underscope as "swap one SDK for another" | Scope Phase 1 narrowly to a handful of apps end-to-end before migrating the full marketplace |
| Giving agents shell/computer access multiplies the blast radius of a mistake vs. Sintra's templated helpers | A single bad approval could be costly | Keep the permission broker mandatory in the hosted product; trust-level relaxation (Phase 3) stays opt-in and scoped per action type |
| Nango's Elastic License and self-host feature limits constrain the fully-free self-host tier | Community edition expectations vs. actual limits | Be explicit in docs about what the free self-host tier includes vs. Nango Cloud/BYOC, matching Nango's own disclosure |
| Sintra's simplicity (12 fixed helpers, no setup) is itself a feature for non-technical buyers | A fully general "bring your own bot" product can feel harder to start with | Ship curated, pre-built "starter teams" (sales, support, ops) via the BotMRR-style install flow so day-one feels as guided as Sintra, while leaving the full agent power underneath |
