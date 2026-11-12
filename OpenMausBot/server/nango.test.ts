import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "./config.ts";
import * as nango from "./nango.ts";

interface Call {
  url: string;
  init: RequestInit;
}

function config(secretKey: string, over: Partial<NonNullable<AppConfig["nango"]>> = {}): AppConfig {
  return { nango: { baseUrl: "http://nango.test/", secretKey, ...over } };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function stubFetch(route: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return route(call);
  }));
  return calls;
}

function sessionResponse(token: string) {
  return json({
    data: {
      session_id: `session-${token}`,
      session_token: token,
      mcp_url: `http://nango.test/session/${token}/mcp`,
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nango configuration", () => {
  it("needs a secret key and normalizes the base URL", () => {
    expect(nango.configured({ nango: {} })).toBe(false);
    expect(nango.configured(config("sk"))).toBe(true);
    expect(nango.baseUrl(config("sk"))).toBe("http://nango.test");
    expect(nango.baseUrl({})).toBe(nango.DEFAULT_BASE_URL);
  });
});

describe("nango mcpIntegration", () => {
  it("pins one connection per integration, sorted, and creates one cached session", async () => {
    const calls = stubFetch(({ url }) => {
      if (url === "http://nango.test/connections") {
        return json({
          connections: [
            { connection_id: "gmail-b", provider_config_key: "gmail" },
            { connection_id: "gmail-a", provider_config_key: "gmail" },
            { connection_id: "slack-a", provider_config_key: "slack" },
          ],
        });
      }
      if (url === "http://nango.test/sessions") return sessionResponse("first");
      return json({ error: "unexpected" }, 500);
    });

    const context = { harnessUrl: "http://127.0.0.1:8799", botId: "bot-1", threadId: "thread-1", commsToken: "cap-1" };
    const bridge = await nango.mcpIntegration(config("sk-pins"), context);

    expect(bridge?.env.OMB_CONNECTOR_UPSTREAM_URL).toBe("http://127.0.0.1:8799/api/internal/connectors/nango/mcp");
    expect(bridge?.env.OMB_CONNECTOR_UPSTREAM_HEADERS).toBe(JSON.stringify({ authorization: "Bearer cap-1" }));

    await nango.mcpIntegration(config("sk-pins"), context);
    expect(calls.map((call) => call.url)).toEqual([
      "http://nango.test/connections",
    ]);
  });

  it("narrows to the configured integrations", async () => {
    stubFetch(({ url }) => {
      if (url === "http://nango.test/connections") {
        return json({
          connections: [
            { connection_id: "gmail-a", provider_config_key: "gmail" },
            { connection_id: "slack-a", provider_config_key: "slack" },
          ],
        });
      }
      return sessionResponse("narrow");
    });

    const bridge = await nango.mcpIntegration(config("sk-narrow", { integrations: ["slack"] }), {
      harnessUrl: "http://127.0.0.1:8799", botId: "bot-1", threadId: "thread-1", commsToken: "cap-1",
    });
    expect(bridge).not.toBeNull();
  });

  it("mounts nothing when no app is connected", async () => {
    const calls = stubFetch(({ url }) => {
      expect(url).toBe("http://nango.test/connections");
      return json({ connections: [] });
    });

    await expect(nango.mcpIntegration(config("sk-empty"), {
      harnessUrl: "http://127.0.0.1:8799", botId: "bot-1", threadId: "thread-1", commsToken: "cap-1",
    })).resolves.toBeNull();
    expect(calls.some((call) => call.url === "http://nango.test/sessions")).toBe(false);
  });
});

describe("nango relayMcp", () => {
  it("mints an agent session from the pinned connections and meta tools", async () => {
    const calls = stubFetch(({ url }) => {
      if (url === "http://nango.test/connections") {
        return json({ connections: [{ connection_id: "gmail-a", provider_config_key: "gmail" }] });
      }
      if (url === "http://nango.test/sessions") return sessionResponse("session");
      return json({ jsonrpc: "2.0", id: 1, result: {} });
    });

    await nango.relayMcp(config("sk-session-body"), { jsonrpc: "2.0", id: 1, method: "tools/list" });

    const sessionCall = calls.find((call) => call.url === "http://nango.test/sessions")!;
    expect(JSON.parse(String(sessionCall.init.body))).toEqual({
      tenant: { connections: { pinned: [{ integration_id: "gmail", connection_id: "gmail-a" }] } },
      meta_tools: { nango_proxy: true, nango_execute: true, nango_tool_search: true },
      expires_in: "1d",
    });
  });

  it("mints another session once when the first one is gone, then resends the frame", async () => {
    let sessions = 0;
    const calls = stubFetch(({ url, init }) => {
      if (url === "http://nango.test/connections") {
        return json({ connections: [{ connection_id: "gmail-a", provider_config_key: "gmail" }] });
      }
      if (url === "http://nango.test/sessions") {
        sessions += 1;
        return sessionResponse(sessions === 1 ? "stale" : "fresh");
      }
      const authorization = (init.headers as Record<string, string>).authorization;
      if (authorization === "Bearer stale") return json({ error: "session expired" }, 401);
      return json({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }, 200, { "mcp-session-id": "transport-1" });
    });

    let sends = 0;
    const result = await nango.relayMcp(config("sk-retry"), { jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, () => { sends += 1; });

    expect(sessions).toBe(2);
    expect(sends).toBe(2);
    expect(result.status).toBe(200);
    expect(result.transportSessionId).toBe("transport-1");
    expect(result.contentType).toBe("application/json");
    expect(new TextDecoder().decode(result.bytes)).toContain('"ok"');
    expect(calls.at(-1)?.init.headers).toMatchObject({ authorization: "Bearer fresh" });
  });

  it("forwards a transport session id", async () => {
    const calls = stubFetch(({ url }) => {
      if (url === "http://nango.test/connections") {
        return json({ connections: [{ connection_id: "gmail-a", provider_config_key: "gmail" }] });
      }
      if (url === "http://nango.test/sessions") return sessionResponse("session");
      return json({ jsonrpc: "2.0", id: 1, result: {} });
    });

    await nango.relayMcp(config("sk-transport"), { jsonrpc: "2.0", id: 1, method: "tools/list" }, "transport-given");
    expect(calls.at(-1)?.init.headers).toMatchObject({ "mcp-session-id": "transport-given" });
  });
});

describe("nango connect sessions", () => {
  it("returns the Connect UI link and tags the session with the workspace", async () => {
    const calls = stubFetch(({ url }) => {
      expect(url).toBe("http://nango.test/connect/sessions");
      return json({
        data: { token: "connect-token", connect_link: "http://nango.test/connect/ui?token=connect-token", expires_at: "2030-01-01T00:00:00.000Z" },
      });
    });

    const session = await nango.createConnectSession(
      { ...config("sk-connect"), profile: { name: "Work" } },
      { integrationIds: ["gmail"] },
    );

    expect(session).toEqual({
      connectLink: "http://nango.test/connect/ui?token=connect-token&apiURL=http%3A%2F%2Fnango.test",
      token: "connect-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      tags: { omb_workspace: "Work" },
      allowed_integrations: ["gmail"],
    });
  });
});
