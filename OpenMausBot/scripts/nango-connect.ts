#!/usr/bin/env -S node --experimental-strip-types
// Prints a Nango Connect UI link; opening it lets the person authorize apps for this workspace.
import { loadConfig } from "../server/config.ts";
import * as nango from "../server/nango.ts";

const integrationIds = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const cfg = loadConfig();
if (!nango.configured(cfg)) {
  console.error("Set NANGO_SECRET_KEY (or nango.secretKey in config.json) first.");
  process.exit(1);
}

try {
  const session = await nango.createConnectSession(cfg, { integrationIds });
  console.log(session.connectLink);
  console.error(`Open the link above and connect an app. It expires at ${session.expiresAt}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
