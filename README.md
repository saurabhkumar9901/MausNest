# MausNest

**MausNest** is an open-source, self-hostable "team of AI employees" platform: a chat shell of named, specialized bots (each a real Claude/Codex/Grok-class agent with its own computer, model, and approval flow) backed by **Nango** as the multi-tenant integration, auth, and automation backbone.

It combines two projects:

- **[OpenMausBot](./OpenMausBot)** — local-first, multi-agent chat shell: bot roster, channels/departments, inline approval cards, voice, triggers, MCP server, Electron desktop shells.
- **[Nango](./nango)** — production-grade auth/proxy/sync/webhook runtime for 1,000+ APIs (managed OAuth, token refresh, rate limits, two-way sync).

MausNest replaces Composio (OpenMausBot's previous connector layer) with Nango as the system of record for credentials and API execution, so the same agent layer can act on Gmail, Slack, GitHub, and 1,000+ other services through a single auditable integration runtime.

> See [`PROJECT.md`](./PROJECT.md) for the full architecture plan and competitive analysis vs. Sintra.ai, and [`GUIDE.md`](./GUIDE.md) for the step-by-step Nango setup guide.

## Repository layout

```
D:\BOTS
├── OpenMausBot/   # Agent chat shell + harness server (React/Vite + Node)
├── nango/         # Self-hosted Nango instance (Docker compose + dashboard)
├── PROJECT.md     # Combined architecture plan
├── GUIDE.md       # Nango + OpenMausBot setup guide
└── README.md      # This file
```

## Features

- **Real agents, not prompts** — each bot runs a Claude/Codex/Grok-class agent with shell, files, browser, and (optional) cloud/local desktop access.
- **Human-in-the-loop by default** — every risky action (send email, push code, charge a card) surfaces as an inline Allow/Deny card unless a bot's trust level is explicitly raised.
- **1,000+ integrations via Nango** — managed OAuth, token refresh, rate limits, and a proxy; agents never hold raw credentials. Connect apps once per workspace, every bot can use them.
- **Automation** — schedules, webhooks, and inbound app events (Nango sync + OpenMausBot triggers) with run history and per-task kill switches.
- **Knowledge base / RAG** — Nango sync keeps CRM, tickets, and docs mirrored into the workspace store.
- **Voice** — ElevenLabs / Fish / Grok / local TTS and STT, plus phone pairing (QR/Tailscale/managed relay).
- **Team sharing** — bots and channels can be packaged and shared across a team or organization.
- **Open core** — self-hostable; hosted tier adds multi-tenant auth, billing, and managed sandboxes.

## Quick start

### Prerequisites

- Node.js 24+
- pnpm 10 (`npm i -g pnpm@10`)
- Docker Desktop (for Nango)
- Free ports: Nango `3003` (API) and `3000` (dashboard)

### 1. Start Nango (self-hosted)

```powershell
cd D:\BOTS\nango
Copy-Item .env.example .env
```

Set the required values in `.env` (see `GUIDE.md` §1 for the full list), then:

```powershell
docker compose up -d
```

Open the dashboard at http://localhost:3003/ and create an account. Add at least one integration (e.g. Gmail, Slack, GitHub) and note the environment's secret key.

### 2. Install and configure OpenMausBot

```powershell
cd D:\BOTS\OpenMausBot
pnpm install
```

Set the Nango credentials (environment variables or `~/.openmausbot/config.json` under `nango`):

```powershell
$env:NANGO_BASE_URL = "http://localhost:3003"
$env:NANGO_SECRET_KEY = "<your Nango environment secret key>"
```

`NANGO_SECRET_KEY` is required; without it the Nango integration stays disabled.

### 3. Authorize an app

```powershell
cd D:\BOTS\OpenMausBot
pnpm nango:connect
```

Open the printed URL, complete OAuth, and the connection is stored in Nango.

### 4. Run OpenMausBot

Backend dev server:

```powershell
cd D:\BOTS\OpenMausBot
pnpm dev:server
```

Or the full app / desktop:

```powershell
pnpm omb          # full app entry
pnpm dev:desktop  # desktop (Electron)
pnpm dev          # web UI + backend
```

### 5. Verify

- A bot with Connected Apps enabled mounts the Nango bridge; its tools appear under the `nango` MCP server.
- Tool calls ride the engine's normal approval flow (approval card gates each call).
- Run the focused tests:

```powershell
cd D:\BOTS\OpenMausBot
pnpm exec vitest run server/nango.test.ts
```

## Configuration reference

| Variable / field | Required | Description |
| --- | --- | --- |
| `NANGO_BASE_URL` / `nango.baseUrl` | No (default `http://localhost:3003`) | Nango server URL |
| `NANGO_SECRET_KEY` / `nango.secretKey` | Yes (for Nango to be active) | Environment secret key from the Nango dashboard |
| `NANGO_INTEGRATIONS` / `nango.integrations` | No | Comma-separated list limiting which integrations OpenMausBot may use |
| `bot.composio` | No (default on) | Per-bot master switch for connected apps (governs both Composio and Nango) |

## Development

```powershell
cd D:\BOTS\OpenMausBot
pnpm typecheck        # TypeScript
pnpm lint             # oxlint
pnpm dev              # Vite web UI + backend
pnpm dev:server       # backend only
```

```powershell
cd D:\BOTS\nango
docker compose up -d  # start Nango
docker compose down   # stop
```

## Testing

```powershell
cd D:\BOTS\OpenMausBot
pnpm exec vitest run server/nango.test.ts          # Nango client tests
pnpm exec vitest run src/components/keys/           # API keys UI tests
pnpm exec tsc -p tsconfig.server.json             # server typecheck
```

## Architecture (short version)

Five layers, top to bottom (see `PROJECT.md` for the full plan):

1. **Client experience** — bot roster, channels, approval cards, computer panel, model picker, voice.
2. **Orchestration / harness** — driver registry (Claude/Codex/Grok), SSE event bus, decision model ("Jev"), triggers.
3. **Integration & auth backbone (Nango)** — auth, proxy, functions, sync, webhooks, per-customer config. Replaces Composio.
4. **Automation** — schedules, webhooks, app events, run history with kill switches.
5. **Knowledge & memory** — RAG over synced data, per-bot instructions, per-workspace settings.

Agents never hold raw third-party credentials; every call goes through Nango's proxy with the workspace's `connectionId`.

## Troubleshooting

- **Nango containers fail on port 5432** — set `NANGO_DB_PORT=5433` in `nango/.env` and rerun `docker compose up -d`.
- **"connected apps are not enabled for this bot"** — ensure `NANGO_SECRET_KEY` is set and the bot's Connected Apps toggle is on.
- **No tools listed** — Nango has no connected integration. Run `pnpm nango:connect`, open the link, and authorize an app.
- **Gmail 403 "API not enabled"** — enable the Gmail API in the Google Cloud project that owns the OAuth client.
- **Data-dir lease conflict** — another instance holds `~/.openmausbot/openmausbot-server.lease`; stop it (or delete the stale lease file) before starting.

## License

OpenMausBot and Nango are open source (see each subproject's license). MausNest inherits their licensing. See `OpenMausBot/` and `nango/` for details.