import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

export const BASE_NAME = "CC";
// Env var whose value opencode interpolates into apiKey. Override with --env-key.
export const DEFAULT_ENV_KEY = "MI_PROXY_API_KEY";

const LEGACY_FILE = join(homedir(), ".config", "opencode", "opencode.json");

export function opencodeConfigPath() {
  return process.env.OPENCODE_CONFIG || join(homedir(), ".config", "opencode", "opencode.jsonc");
}

// Build the provider display name: "CC" or "CC <suffix>".
export function providerName(suffix) {
  const s = (suffix || "").trim();
  return s ? `${BASE_NAME} ${s}` : BASE_NAME;
}

// --- WSL helpers -----------------------------------------------------------

export function isWsl() {
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

// IP of the Windows host as seen from WSL2 (NAT networking): the default
// gateway first, then the auto-generated DNS in /etc/resolv.conf. Returns null
// when neither lookup applies (WSL1 or mirrored networking), where
// 127.0.0.1 reaches Windows services without changes.
export function windowsHostIp() {
  try {
    const route = execFileSync("ip", ["route", "show", "default"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const via = route.match(/via\s+(\S+)/);
    if (via) return via[1];
  } catch {}
  try {
    const m = readFileSync("/etc/resolv.conf", "utf8").match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m && !m[1].startsWith("127.")) return m[1];
  } catch {}
  return null;
}

// Decide the address opencode should dial. Priority:
// - explicit --client-host value (addr, `auto` or `windows`),
// - else the proxy bind host as before (0.0.0.0/:: shown as 127.0.0.1).
// With `auto`: inside WSL it resolves the Windows host IP (proxy runs on
// Windows); everywhere else it is plain localhost.
export function resolveClientHost({ host = "127.0.0.1", clientHost } = {}) {
  const explicit = (clientHost || "").trim();
  if (explicit) {
    if (explicit === "auto" || explicit === "windows") {
      if (isWsl()) {
        const ip = windowsHostIp();
        if (ip) return { addr: ip, fromWindowsHost: true };
      }
      return { addr: "127.0.0.1", fromWindowsHost: false };
    }
    return { addr: explicit, fromWindowsHost: false };
  }
  const h = (host || "127.0.0.1").trim();
  const addr = h === "0.0.0.0" || h === "::" ? "127.0.0.1" : h;
  return { addr, fromWindowsHost: false };
}

// --- JSONC -----------------------------------------------------------------

// Strip // and /* */ comments, string-aware, then drop trailing commas.
function stripJsonComments(text) {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return dropTrailingCommas(out);
}

function dropTrailingCommas(s) {
  let out = "";
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        out += s[i + 1] ?? "";
        i++;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c !== ",") {
      out += c;
      continue;
    }
    let j = i + 1;
    while (j < s.length && /\s/.test(s[j])) j++;
    if (s[j] === "}" || s[j] === "]") continue; // trailing comma
    out += c;
  }
  return out;
}

// Prefer the .jsonc target; fall back to the legacy .json written by earlier
// versions so --setup-opencode migrates it instead of starting from scratch.
function readConfig(file) {
  const tryParse = (path) => {
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch (err) {
      throw new Error(`${path} cannot be read (${err.message})`);
    }
    const path_ = raw.trim() ? stripJsonComments(raw) : "{}";
    try {
      return JSON.parse(path_);
    } catch (err) {
      throw new Error(`${path} is not valid JSON/JSONC (${err.message})`);
    }
  };
  if (existsSync(file)) return { cfg: tryParse(file), legacyFrom: null };
  if (!process.env.OPENCODE_CONFIG && existsSync(LEGACY_FILE)) {
    return { cfg: tryParse(LEGACY_FILE), legacyFrom: LEGACY_FILE };
  }
  return { cfg: {}, legacyFrom: null };
}

function writeConfigFile(file, cfg) {
  mkdirSync(dirname(file), { recursive: true });
  const header = [
    "// OpenCode provider for the Command Code proxy (commandcode-api-proxy).",
    "// Regenerated by: commandcode-api-proxy --setup-opencode [--client-host <addr|auto>] [--env-key <NAME>]",
    "// Other providers and settings you add here are kept.",
  ];
  writeFileSync(file, header.join("\n") + "\n" + JSON.stringify(cfg, null, 2) + "\n");
}

// Only the provider.commandcode block is generated. The caller merges it into
// whatever else the user already has in the opencode config.
export function providerBlock(hostAddr, port, suffix, envKey = DEFAULT_ENV_KEY) {
  return {
    commandcode: {
      npm: "@ai-sdk/openai-compatible",
      name: providerName(suffix),
      options: {
        baseURL: `http://${hostAddr}:${port}/v1`,
        // opencode interpolates {env:NAME} at startup; the proxy itself uses
        // its saved key unless the client sends one.
        apiKey: `{env:${envKey || DEFAULT_ENV_KEY}}`,
      },
      models: {
        "deepseek-v4-pro": { name: "DeepSeek V4 Pro" },
      },
    },
  };
}

export function writeOpencodeConfig({
  host = "127.0.0.1",
  port = 8787,
  suffix,
  envKey,
  clientHost,
} = {}) {
  const resolved = resolveClientHost({ host, clientHost });
  const file = opencodeConfigPath();
  const { cfg, legacyFrom } = readConfig(file);
  cfg["$schema"] ??= "https://opencode.ai/config.json";
  cfg.provider ??= {};
  Object.assign(cfg.provider, providerBlock(resolved.addr, port, suffix, envKey));
  writeConfigFile(file, cfg);
  return {
    file,
    baseURL: cfg.provider.commandcode.options.baseURL,
    name: cfg.provider.commandcode.name,
    envKey: cfg.provider.commandcode.options.apiKey.replace(/^\{env:|\}$/g, ""),
    fromWindowsHost: resolved.fromWindowsHost,
    legacyFrom,
  };
}

// Rename an already generated provider. Each call replaces the previous suffix
// instead of appending, so "CC beta" + --sufix dev becomes "CC dev".
export function setOpencodeSuffix(suffix) {
  const file = opencodeConfigPath();
  const { cfg, legacyFrom } = readConfig(file);
  if (!cfg.provider || !cfg.provider.commandcode) {
    throw new Error(`no commandcode provider in ${file}. Run --setup-opencode first.`);
  }
  cfg.provider.commandcode.name = providerName(suffix);
  writeConfigFile(file, cfg);
  return { file, name: cfg.provider.commandcode.name, legacyFrom };
}
