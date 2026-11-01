import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const DIR = join(homedir(), ".commandcode-proxy");
const FILE = join(DIR, "config.json");

export function configPath() {
  return FILE;
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(cfg) {
  mkdirSync(DIR, { recursive: true });
  // 0600: only the owner reads/writes. Windows maps this to the user's ACL.
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export function getApiKey() {
  const cfg = loadConfig();
  return typeof cfg.apiKey === "string" && cfg.apiKey ? cfg.apiKey : null;
}

export function setApiKey(key) {
  const cfg = loadConfig();
  cfg.apiKey = key;
  saveConfig(cfg);
}

export function clearApiKey() {
  const cfg = loadConfig();
  if (typeof cfg.apiKey !== "string" || !cfg.apiKey) return false;
  delete cfg.apiKey;
  if (Object.keys(cfg).length === 0) {
    try {
      unlinkSync(FILE);
    } catch {}
  } else {
    saveConfig(cfg);
  }
  return true;
}

export function maskKey(key) {
  return key.length <= 9 ? "****" : key.slice(0, 7) + "…" + key.slice(-4);
}
