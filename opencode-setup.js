import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export function opencodeConfigPath() {
  return process.env.OPENCODE_CONFIG || join(homedir(), ".config", "opencode", "opencode.json");
}

export const BASE_NAME = "CC";

// Build the provider display name: "CC" or "CC <suffix>".
export function providerName(suffix) {
  const s = (suffix || "").trim();
  return s ? `${BASE_NAME} ${s}` : BASE_NAME;
}

// Only the provider.commandcode block is generated. The caller merges it into
// whatever else the user already has in opencode.json.
export function providerBlock(host, port, suffix) {
  const shown = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return {
    commandcode: {
      npm: "@ai-sdk/openai-compatible",
      name: providerName(suffix),
      options: {
        baseURL: `http://${shown}:${port}/v1`,
        apiKey: "proxy-managed",
      },
      models: {
        "deepseek-v4-pro": { name: "DeepSeek V4 Pro" },
      },
    },
  };
}

function readConfigFile(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message})`);
  }
}

function writeConfigFile(file, cfg) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}

export function writeOpencodeConfig({ host = "127.0.0.1", port = 8787, suffix } = {}) {
  const file = opencodeConfigPath();
  const cfg = readConfigFile(file);
  cfg["$schema"] ??= "https://opencode.ai/config.json";
  cfg.provider ??= {};
  Object.assign(cfg.provider, providerBlock(host, port, suffix));
  writeConfigFile(file, cfg);
  return { file, baseURL: cfg.provider.commandcode.options.baseURL, name: cfg.provider.commandcode.name };
}

// Rename an already generated provider. Each call replaces the previous suffix
// instead of appending, so "CC beta" + --sufix dev becomes "CC dev".
export function setOpencodeSuffix(suffix) {
  const file = opencodeConfigPath();
  const cfg = readConfigFile(file);
  if (!cfg.provider || !cfg.provider.commandcode) {
    throw new Error(`no commandcode provider in ${file}. Run --setup-opencode first.`);
  }
  cfg.provider.commandcode.name = providerName(suffix);
  writeConfigFile(file, cfg);
  return { file, name: cfg.provider.commandcode.name };
}
