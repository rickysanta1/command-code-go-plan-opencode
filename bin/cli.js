#!/usr/bin/env node
import { createInterface } from "node:readline";
import { log } from "node:console";
import { startServer } from "../server.js";
import { getApiKey, setApiKey, clearApiKey, maskKey, configPath } from "../config.js";
import { writeOpencodeConfig } from "../opencode-setup.js";

const NAME = "commandcode-api-proxy";
const VERSION = "1.0.0";

function usage() {
  return `${NAME} — OpenAI-compatible proxy for Command Code

Usage:
  ${NAME} [serve] [options]      Start the proxy server
  ${NAME} auth login [--force]   Save the Command Code API key
  ${NAME} auth logout            Remove the saved API key
  ${NAME} auth status            Show whether a key is configured

Options:
  --host <addr>       Bind address (default 127.0.0.1)
  --port <n>          Port (default 8787)
  --api-key <key>     Command Code API key for this run (not saved)
  --setup-opencode    Write the OpenCode provider config and exit
  -h, --help          Show this help
  -V, --version       Show version

Key precedence: --api-key > COMMANDCODE_API_KEY env > saved key > Authorization header.

Examples:
  ${NAME} auth login
  ${NAME} auth login --force
  ${NAME} auth logout
  ${NAME} serve --host 127.0.0.1 --port 8787
  ${NAME} --setup-opencode`;
}

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

// Read a line without echoing it to the terminal. Falls back to visible input
// when stdout is not a TTY (piped input), which still works fine.
function readHidden(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        rl.close();
        resolve(line.trim());
      });
      return;
    }
    let out = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    const rl = createInterface({ input: process.stdin, escapeCodeTimeout: 50 });
    rl.on("line", () => {});
    const onData = (buf) => {
      const chars = buf.toString("utf8");
      for (const c of chars) {
        if (c === "\r" || c === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(out);
          return;
        }
        if (c === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") {
          if (out.length) {
            out = out.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (c < " ") continue;
        out += c;
        process.stdout.write("*");
      }
    };
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      rl.close();
    }
    process.stdin.on("data", onData);
  });
}

function parseArgs(argv, spec) {
  const seen = new Set(argv);
  const out = {};
  for (const [flag, opts] of Object.entries(spec)) {
    const idx = seen.has(flag) ? argv.indexOf(flag) : -1;
    if (idx === -1) continue;
    if (opts.value) {
      const v = argv[idx + 1];
      if (!v || v.startsWith("--")) fail(`missing value for ${flag}`);
      out[opts.as] = v;
    } else {
      out[opts.as] = true;
    }
  }
  for (const a of argv) {
    if (a.startsWith("-") && a !== "-h" && a !== "--help" && a !== "-V" && a !== "--version" && !Object.keys(spec).includes(a)) {
      fail(`unknown option ${a}`);
    }
  }
  return out;
}

const HOST_SPEC = { "--host": { value: true, as: "host" } };
const PORT_SPEC = { "--port": { value: true, as: "port" } };
const KEY_FLAG = "--api-key";
const SETUP_FLAG = "--setup-opencode";

function ask(argv, ...flags) {
  return flags.some((f) => argv.includes(f));
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
    log(usage());
    return;
  }
  if (argv.includes("--version") || argv.includes("-V") || argv.includes("-v")) {
    log(VERSION);
    return;
  }

  if (argv[0] === "auth") {
    const sub = argv[1];
    const rest = argv.slice(2);
    if (sub === "login") {
      const force = rest.includes("--force");
      const parsed = parseArgs(rest, { "--force": { as: "force" } });
      const existing = getApiKey();
      if (existing && !force) {
        fail(`a key is already saved (${maskKey(existing)}). Use --force to overwrite it.`, 2);
      }
      const key = await readHidden(existing ? `Overwrite save a new Command Code API key: ` : `Command Code API key: `);
      if (!key) fail("no key provided", 2);
      if (!key.startsWith("user_")) log("note: keys normally start with user_ — continuing anyway.");
      setApiKey(key);
      log(`key saved to ${configPath()}`);
      return;
    }
    if (sub === "logout") {
      parseArgs(rest, {});
      const removed = clearApiKey();
      log(removed ? `key removed (file updated at ${configPath()})` : "no key was saved");
      return;
    }
    if (sub === "status") {
      parseArgs(rest, {});
      const key = getApiKey();
      log(key ? `key saved: ${maskKey(key)}\nfile: ${configPath()}` : "no key saved");
      return;
    }
    log(usage());
    fail(`unknown auth subcommand ${sub || "(none)"}`);
  }

  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  for (const f of [KEY_FLAG, SETUP_FLAG, "--host", "--port"]) flags.delete(f);
  const leftover = [...flags].filter((f) => f !== "-h" && f !== "--help" && f !== "-V" && f !== "--version");
  if (leftover.length) fail(`unknown option ${leftover[0]}`);

  const args = argv.filter((a) => a !== "serve");
  const hostIdx = args.indexOf("--host");
  const host = hostIdx !== -1 ? args[hostIdx + 1] : undefined;
  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? Number(args[portIdx + 1]) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) fail(`invalid port`);

  const apiKeyIdx = args.indexOf(KEY_FLAG);
  const apiKey = apiKeyIdx !== -1 ? args[apiKeyIdx + 1] : undefined;

  if (ask(argv, SETUP_FLAG)) {
    try {
      const { file, baseURL } = writeOpencodeConfig({
        host: host || "127.0.0.1",
        port: port || 8787,
      });
      log(`OpenCode config written to ${file}`);
      log(`provider baseURL: ${baseURL}`);
      log(`model: deepseek-v4-pro (proxy-managed)`);
    } catch (err) {
      fail(err.message);
    }
    return;
  }

  startServer({ host, port, apiKey });
}

main().catch((e) => fail(e.message || String(e)));
