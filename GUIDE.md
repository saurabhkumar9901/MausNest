# MausNest: running OpenMausBot with Nango

This guide covers setting up the self-hosted Nango instance in `D:\BOTS\nango` and
pointing OpenMausBot (`D:\BOTS\OpenMausBot`) at it as the connected-apps runtime.

## Prerequisites

- Node.js 24 or newer
- pnpm 10 (`npm i -g pnpm@10`)
- Docker Desktop (for Nango)
- A free port for Nango (default `3003`) and its dashboard (default `3000`)

## 1. Start Nango (self-hosted)

```powershell
cd D:\BOTS\nango
```

Create a `.env` from the example and set the required values:

```powershell
Copy-Item .env.example .env
```

At minimum set these in `.env`:

```env
NANGO_ENCRYPTION_KEY=<base64 256-bit key>
NANGO_DB_USER=nango
NANGO_DB_PASSWORD=nango
NANGO_DB_NAME=nango
SERVER_PORT=3003
NANGO_SERVER_URL=http://localhost:3003
NANGO_PUBLIC_SERVER_URL=http://localhost:3000
FLAG_SERVE_CONNECT_UI=true
TZ=UTC
```

Generate the encryption key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

If port `5432` is already in use (for example by another Postgres), also set:

```env
NANGO_DB_PORT=5433
```

Start Nango:

```powershell
docker compose up -d
```

Wait for the containers to become healthy, then open the dashboard at
`http://localhost:3000` and create an account. Create at least one integration
(provider) and note the environment's secret key.

Nango's API is now reachable at `http://localhost:3003`.

## 2. Install OpenMausBot

```powershell
cd D:\BOTS\OpenMausBot
pnpm install
```

## 3. Configure OpenMausBot for Nango

Set the Nango credentials via environment variables (or in `config.json` under
`nango`):

```powershell
$env:NANGO_BASE_URL = "http://localhost:3003"
$env:NANGO_SECRET_KEY = "<your Nango environment secret key>"
# Optional: limit which integrations OpenMausBot may use
$env:NANGO_INTEGRATIONS = "github,slack"
```

`NANGO_SECRET_KEY` is required; without it the Nango integration stays disabled.

## 4. Authorize an app (Connect UI)

With Nango running and configured, print a Connect link:

```powershell
cd D:\BOTS\OpenMausBot
pnpm nango:connect
```

Open the printed URL in a browser and complete the authorization for the app you
want to use. The link expires after a short time; rerun the command for a new one.

## 5. Run OpenMausBot

Backend dev server:

```powershell
cd D:\BOTS\OpenMausBot
pnpm dev:server
```

Or the full app entry:

```powershell
pnpm omb
```

Or the desktop app:

```powershell
pnpm dev:desktop
```

For the web UI alongside the backend:

```powershell
pnpm dev
```

## 6. Verify

- A bot with Connected Apps enabled will mount the Nango bridge and its tools
  appear under the `nango` MCP server.
- Tool calls ride the engine's normal approval flow, so the approval card gates
  each call.
- Run the focused tests:

```powershell
cd D:\BOTS\OpenMausBot
pnpm exec vitest run server/nango.test.ts
```

- Typecheck the server:

```powershell
pnpm exec tsc -p tsconfig.server.json
```

## Troubleshooting

- **Nango containers fail to start on port 5432**: set `NANGO_DB_PORT=5433` in
  `.env` and rerun `docker compose up -d`.
- **"connected apps are not enabled for this bot"**: ensure `NANGO_SECRET_KEY`
  is set and the bot's Connected Apps toggle is on.
- **No tools listed**: Nango has no connected integration. Run
  `pnpm nango:connect`, open the link, and authorize an app. `mcpIntegration`
  degrades to `null` (with a warning) when Nango is unreachable or has no
  connections, so a turn still completes.
- **Network/Docker pull failures**: retry `docker compose up -d` after the
  network recovers; images are cached once pulled.