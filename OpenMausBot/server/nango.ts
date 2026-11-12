// Nango as the connected-apps runtime: the harness mints one Nango agent session per set of connections and hands the
// agent a stdio bridge pointed at it. The Nango secret key stays here; the bridge carries only the turn's loopback token.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "./config.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";

export const DEFAULT_BASE_URL = "http://localhost:3003";

const CONNECTIONS_CACHE_MS = 30_000;
const SESSION_REFRESH_MARGIN_MS = 5 * 60_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export interface NangoMcpIntegration {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface IntegrationContext {
  harnessUrl: string;
  commsToken: string;
  botId: string;
  threadId: string;
}

interface PinnedConnection {
  integrationId: string;
  connectionId: string;
}

const connectionsResponseSchema = z.object({
  connections: z.array(z.object({
    connection_id: z.string(),
    provider_config_key: z.string(),
  })).default([]),
});

const agentSessionSchema = z.object({
  data: z.object({
    session_id: z.string(),
    session_token: z.string(),
    mcp_url: z.string().url(),
    expires_at: z.string(),
  }),
});

const connectSessionSchema = z.object({
  data: z.object({
    token: z.string(),
    connect_link: z.string().url(),
    expires_at: z.string(),
  }),
});

export function baseUrl(cfg: AppConfig): string {
  return (cfg.nango?.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function secretKey(cfg: AppConfig): string {
  return cfg.nango?.secretKey?.trim() ?? "";
}

export function configured(cfg: AppConfig): boolean {
  return Boolean(secretKey(cfg));
}

/** Caches and sessions are kept per credential without holding another plaintext copy. */
function identity(cfg: AppConfig): string {
  return createHash("sha256").update(baseUrl(cfg)).update("\0").update(secretKey(cfg)).digest("hex");
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const error = (body as { error?: unknown }).error;
      if (typeof error === "string" && error) return error;
      if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message) return message;
      }
    }
  } catch {
  }
  return fallback;
}

async function api(cfg: AppConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${secretKey(cfg)}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl(cfg)}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(await errorMessage(response, `Nango ${path}: HTTP ${response.status}`));
  return response;
}

let connectionsCache: { at: number; identity: string; pinned: PinnedConnection[] } | null = null;
let connectionsRequest: { identity: string; pinned: Promise<PinnedConnection[]> } | null = null;

/** One connection per integration, in the order Nango lists them; a configured `integrations` list narrows it. */
export async function connections(cfg: AppConfig, options: { fresh?: boolean } = {}): Promise<PinnedConnection[]> {
  if (!configured(cfg)) return [];
  const key = identity(cfg);
  if (!options.fresh && connectionsCache?.identity === key && Date.now() - connectionsCache.at < CONNECTIONS_CACHE_MS) {
    return connectionsCache.pinned;
  }
  if (connectionsRequest?.identity === key) return connectionsRequest.pinned;
  const read = (async () => {
    const response = await api(cfg, "/connections");
    const body = connectionsResponseSchema.parse(await response.json());
    const wanted = cfg.nango?.integrations?.length ? new Set(cfg.nango.integrations) : null;
    const byIntegration = new Map<string, string>();
    for (const connection of [...body.connections].sort((a, b) => a.connection_id.localeCompare(b.connection_id))) {
      const integrationId = connection.provider_config_key;
      if (wanted && !wanted.has(integrationId)) continue;
      if (!byIntegration.has(integrationId)) byIntegration.set(integrationId, connection.connection_id);
    }
    const pinned = [...byIntegration].map(([integrationId, connectionId]) => ({ integrationId, connectionId }));
    connectionsCache = { at: Date.now(), identity: key, pinned };
    return pinned;
  })();
  connectionsRequest = { identity: key, pinned: read };
  try {
    return await read;
  } finally {
    if (connectionsRequest?.pinned === read) connectionsRequest = null;
  }
}

interface AgentSession {
  sessionId: string;
  token: string;
  mcpUrl: string;
  expiresAt: number;
}

let agentSessions: { key: string; session: AgentSession } | null = null;
let agentSessionRequest: { key: string; session: Promise<AgentSession> } | null = null;

function sessionKey(cfg: AppConfig, pinned: readonly PinnedConnection[]): string {
  return `${identity(cfg)}\0${pinned.map((pin) => `${pin.integrationId}:${pin.connectionId}`).join(",")}`;
}

function sessionExpiry(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now() + 60 * 60_000;
}

async function createAgentSession(cfg: AppConfig, pinned: readonly PinnedConnection[]): Promise<AgentSession> {
  const response = await api(cfg, "/sessions", {
    method: "POST",
    body: JSON.stringify({
      tenant: { connections: { pinned: pinned.map((pin) => ({ integration_id: pin.integrationId, connection_id: pin.connectionId })) } },
      // Without a toolset Nango compiles the session from what is connected, so proxy works before anything is deployed.
      meta_tools: { nango_proxy: true, nango_execute: true, nango_tool_search: true },
      expires_in: "1d",
    }),
  });
  const body = agentSessionSchema.parse(await response.json());
  return {
    sessionId: body.data.session_id,
    token: body.data.session_token,
    mcpUrl: body.data.mcp_url,
    expiresAt: sessionExpiry(body.data.expires_at),
  };
}

async function ensureAgentSession(cfg: AppConfig, options: { fresh?: boolean } = {}): Promise<AgentSession | null> {
  const pinned = await connections(cfg, options);
  if (!pinned.length) return null;
  const key = sessionKey(cfg, pinned);
  if (!options.fresh && agentSessions?.key === key && agentSessions.session.expiresAt - SESSION_REFRESH_MARGIN_MS > Date.now()) {
    return agentSessions.session;
  }
  if (agentSessionRequest?.key === key) return agentSessionRequest.session;
  const created = createAgentSession(cfg, pinned).then((session) => {
    agentSessions = { key, session };
    return session;
  }).finally(() => {
    if (agentSessionRequest?.session === created) agentSessionRequest = null;
  });
  agentSessionRequest = { key, session: created };
  return created;
}

function forgetAgentSession(): void {
  agentSessions = null;
}

export async function mcpIntegration(cfg: AppConfig, context: IntegrationContext): Promise<NangoMcpIntegration | null> {
  if (!configured(cfg)) return null;
  const pinned = await connections(cfg).catch((error) => {
    console.warn(`[nango] connections are unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [] as PinnedConnection[];
  });
  if (!pinned.length) return null;
  return {
    command: process.execPath,
    args: [SPAWNED_PROXIES.connectors],
    env: {
      ELECTRON_RUN_AS_NODE: "1",
      OMB_CONNECTOR_UPSTREAM_URL: `${context.harnessUrl}/api/internal/connectors/nango/mcp`,
      OMB_CONNECTOR_UPSTREAM_HEADERS: JSON.stringify({ authorization: `Bearer ${context.commsToken}` }),
      OMB_HARNESS_URL: context.harnessUrl,
      OMB_CONNECTOR_TOKEN: context.commsToken,
      OMB_BOT_ID: context.botId,
      OMB_THREAD_ID: context.threadId,
    },
  };
}

export interface RelayResult {
  status: number;
  bytes: Uint8Array;
  contentType: string;
  transportSessionId?: string;
}

export async function relayMcp(
  cfg: AppConfig,
  payload: unknown,
  transportSessionId?: string,
  beforeSend?: () => void,
  signal?: AbortSignal,
): Promise<RelayResult> {
  let session = await ensureAgentSession(cfg);
  if (!session) throw new Error("No Nango connection is available");
  // Discovery may await I/O: check turn authority right before dispatch.
  beforeSend?.();
  let response = await send(session, payload, transportSessionId, signal);
  if (response.status === 401 || response.status === 404) {
    // The session ended or expired: mint another once, then resend the same frame.
    forgetAgentSession();
    session = await ensureAgentSession(cfg, { fresh: true });
    if (!session) throw new Error("No Nango connection is available");
    beforeSend?.();
    response = await send(session, payload, transportSessionId, signal);
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) throw new Error("Nango response exceeded 20 MB");
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength > MAX_RESPONSE_BYTES) throw new Error("Nango response exceeded 20 MB");
  return {
    status: response.status,
    bytes: raw,
    contentType: response.headers.get("content-type") ?? "application/json",
    transportSessionId: response.headers.get("mcp-session-id") ?? undefined,
  };
}

function send(session: AgentSession, payload: unknown, transportSessionId: string | undefined, signal: AbortSignal | undefined): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${session.token}`,
  };
  if (transportSessionId) headers["mcp-session-id"] = transportSessionId;
  return fetch(session.mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: signal ?? AbortSignal.timeout(10 * 60_000),
  });
}

/** The self-hosted Connect UI defaults to api.nango.dev; `apiURL` points it at the server that minted the token. */
function connectLinkWithApi(link: string, cfg: AppConfig): string {
  const url = new URL(link);
  url.searchParams.set("apiURL", baseUrl(cfg));
  return url.toString();
}

/** A Connect UI link for the person to authorize apps; no MausNest page is needed to complete it. */
export async function createConnectSession(
  cfg: AppConfig,
  options: { integrationIds?: readonly string[] } = {},
): Promise<{ connectLink: string; token: string; expiresAt: string }> {
  const allowed = options.integrationIds?.length ? [...options.integrationIds] : undefined;
  const response = await api(cfg, "/connect/sessions", {
    method: "POST",
    body: JSON.stringify({
      // Nango needs a tag or an end user to create a session; the tag is not read by the agent session.
      tags: { omb_workspace: cfg.profile?.name?.trim() || "default" },
      ...(allowed ? { allowed_integrations: allowed } : {}),
    }),
  });
  const body = connectSessionSchema.parse(await response.json());
  return { connectLink: connectLinkWithApi(body.data.connect_link, cfg), token: body.data.token, expiresAt: body.data.expires_at };
}
