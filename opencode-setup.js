import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export function opencodeConfigPath() {
  return process.env.OPENCODE_CONFIG || join(homedir(), ".config", "opencode", "opencode.json");
}

// Only the provider.commandcode block is generated. The caller merges it into
// whatever else the user already has in opencode.json.
export function providerBlock(host, port) {
  const shown = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return {
    commandcode: {
      npm: "@ai-sdk/openai-compatible",
      name: "Command Code V3",
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

export function writeOpencodeConfig({ host = "127.0.0.1", port = 8787 }) {
  const file = opencodeConfigPath();
  let cfg = {};
  if (existsSync(file)) {
    try {
      cfg = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      throw new Error(`${file} is not valid JSON (${err.message})`);
    }
  }
  cfg["$schema"] ??= "https://opencode.ai/config.json";
  cfg.provider ??= {};
  Object.assign(cfg.provider, providerBlock(host, port));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return { file, baseURL: cfg.provider.commandcode.options.baseURL };
}
