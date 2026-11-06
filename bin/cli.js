#!/usr/bin/env node
import { createInterface } from "node:readline";
import { log } from "node:console";
import { startServer } from "../server.js";
import { getApiKey, setApiKey, clearApiKey, maskKey, configPath } from "../config.js";
import {
  writeOpencodeConfig,
  setOpencodeSuffix,
  isWsl,
} from "../opencode-setup.js";

const NAME = "command-code-proxy";
const VERSION = "1.0.0";

function usage() {
  return `${NAME} — OpenAI-compatible proxy for Command Code

Usage:
  ${NAME} [serve] [options]      Start the proxy server
  ${NAME} auth login [--force]   Save the Command Code API key
  ${NAME} auth logout            Remove the saved API key
  ${NAME} auth status            Show whether a key is configured

Options:
  --host <addr>       Bind address (default 127.0.0.1, use 0.0.0.0 for WSL->Windows)
  --port <n>          Port (default 8787)
  --api-key <key>     Command Code API key for this run (not saved)
  --setup-opencode    Write the OpenCode provider config (opencode.jsonc) and exit
  --client-host <a>   Address opencode connects to: addr, or 'auto'/'windows'
                      (WSL: resolves the Windows host IP)
  --env-key <NAME>    Env var name interpolated as apiKey in the config
                      (default MI_PROXY_API_KEY)
  --sufix <text>      Rename the OpenCode provider to "CC <text>"
  -h, --help          Show this help
  -V, --version       Show version

Key precedence: --api-key/COMMANDCODE_API_KEY > plausible request key (user_...) > saved key (re-read per request).

Examples:
  ${NAME} auth login
  ${NAME} auth login --force
  ${NAME} auth logout
  ${NAME} serve --host 127.0.0.1 --port 8787
  ${NAME} --setup-opencode                        proxy runs in the same WSL
  ${NAME} --setup-opencode --client-host auto     proxy runs on the Windows host
  ${NAME} --setup-opencode --sufix beta --env-key MI_PROXY_API_KEY
  ${NAME} --sufix dev             Rename the provider, then start the server

WSL notes:
  - Proxy in WSL:     ${NAME} --setup-opencode   (defaults to 127.0.0.1)
  - Proxy on Windows: run it there with ${NAME} --host 0.0.0.0, then inside WSL
                      run ${NAME} --setup-opencode --client-host auto`;
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

    const SUFFIX_FLAG = "--sufix";
    const CLIENT_HOST_FLAG = "--client-host";
    const ENV_KEY_FLAG = "--env-key";

  const flags = new Set(argv.filter((a) => a.startsWith("-")));
  for (const f of [KEY_FLAG, SETUP_FLAG, SUFFIX_FLAG, CLIENT_HOST_FLAG, ENV_KEY_FLAG, "--host", "--port"]) flags.delete(f);
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

  const suffixIdx = args.indexOf(SUFFIX_FLAG);
  let suffix;
  if (suffixIdx !== -1) {
    suffix = args[suffixIdx + 1];
    if (!suffix || suffix.startsWith("--")) fail(`missing value for ${SUFFIX_FLAG}`);
    suffix = suffix.trim();
    if (!suffix) fail(`${SUFFIX_FLAG} needs a non-empty text`);
  }

  const clientHostIdx = args.indexOf(CLIENT_HOST_FLAG);
  let clientHost;
  if (clientHostIdx !== -1) {
    clientHost = args[clientHostIdx + 1];
    if (!clientHost || clientHost.startsWith("--")) fail(`missing value for ${CLIENT_HOST_FLAG}`);
    clientHost = clientHost.trim();
    if (!clientHost) fail(`${CLIENT_HOST_FLAG} needs an address, 'auto' or 'windows'`);
  }

  const envKeyIdx = args.indexOf(ENV_KEY_FLAG);
  let envKey;
  if (envKeyIdx !== -1) {
    envKey = args[envKeyIdx + 1];
    if (!envKey || envKey.startsWith("--")) fail(`missing value for ${ENV_KEY_FLAG}`);
    envKey = envKey.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envKey)) fail(`${ENV_KEY_FLAG} must be a valid env var name`);
  }

  if (ask(argv, SETUP_FLAG)) {
    try {
      const {
        file,
        baseURL,
        name,
        envKey: usedEnvKey,
        fromWindowsHost,
        legacyFrom,
      } = writeOpencodeConfig({
        host: host || "127.0.0.1",
        port: port || 8787,
        suffix,
        clientHost,
        envKey,
      });
      log(`OpenCode config written to ${file} (JSONC)`);
      log(`provider name: ${name}`);
      log(`provider baseURL: ${baseURL}`);
      log(`provider apiKey: {env:${usedEnvKey}} (export ${usedEnvKey}=... before starting opencode)`);
      log(`model: deepseek-v4-pro`);
      if (!suffix) log(`tip: --sufix <text> renames the provider (e.g. "CC Rickysanta197")`);
      if (fromWindowsHost) {
        log(`WSL detected: baseURL points at the Windows host (${baseURL}).`);
        log(`Make sure the proxy runs on Windows with: command-code-proxy --host 0.0.0.0 --port ${port || 8787}`);
      } else if (isWsl()) {
        log(`WSL detected: baseURL points at 127.0.0.1, expecting the proxy inside this WSL.`);
        log(`Run 'command-code-proxy auth login' inside WSL (or run --setup-opencode --client-host auto to target the Windows proxy).`);
      }
      if (legacyFrom) {
        log(`migrated existing config from ${legacyFrom}; you can remove that legacy file.`);
      }
    } catch (err) {
      fail(err.message);
    }
    return;
  }

  if (suffix !== undefined) {
    let notice;
    try {
      const { file, name } = setOpencodeSuffix(suffix);
      notice = `provider name updated to "${name}" in ${file}`;
    } catch (err) {
      fail(err.message);
    }
    startServer({ host, port, apiKey, notice });
    return;
  }

  startServer({ host, port, apiKey });
}

main().catch((e) => fail(e.message || String(e)));
