# command-code-proxy

OpenAI-compatible proxy for Command Code. It answers `POST /v1/chat/completions`
and `GET /v1/models`, then it translates each request to
`https://api.commandcode.ai/alpha/generate`.

The default model is `deepseek-v4.1-flash`.

## Why

`POST /provider/v1/chat/completions` requires a Provider plan or higher:

```json
{ "error": { "message": "Your Go plan doesn't include API access.", "type": "permission_error", "code": "upgrade_required" } }
```

The Command Code CLI uses `/alpha/generate` for every turn. Every plan can call
it. This proxy uses the same endpoint.

## Install

```bash
npm install -g command-code-proxy
```

After that the command `commandcode-api-proxy` is on the PATH.

## Quick start

1. Save your key (get it from commandcode.ai/settings):

```bash
commandcode-api-proxy auth login
```

2. Start the server:

```bash
commandcode-api-proxy
```

3. Test it:

```bash
curl -sS http://127.0.0.1:8787/health
```

## Auth commands

| Command | Purpose |
| --- | --- |
| `auth login` | Save a new API key. Key input is hidden. |
| `auth login --force` | Overwrite the saved key. |
| `auth logout` | Remove the saved key. |
| `auth status` | Show key state, masked. |

The key is saved to `~/.commandcode-proxy/config.json` with restrictive
permissions. Key precedence: `--api-key` flag, then `COMMANDCODE_API_KEY`
env, then the saved key, then the per-request `Authorization` header.

## Options

| Option | Description | Default |
| --- | --- | --- |
| `--host` | Bind address | `127.0.0.1` |
| `--port` | Port | `8787` |
| `--api-key` | Command Code API key for this run (not saved) | — |
| `--setup-opencode` | Generate the OpenCode provider config (`opencode.jsonc`) | — |
| `--client-host <addr\|auto>` | Address opencode connects to; `auto`/`windows` resolves the Windows host IP from WSL | bind address |
| `--env-key <NAME>` | Env var interpolated into `apiKey` in the opencode config | `MI_PROXY_API_KEY` |
| `--sufix <text>` | Rename the OpenCode provider to `CC <text>` | — |
| `-h, --help` | Show help | — |
| `-V, --version` | Show version | — |

## OpenCode setup

```bash
commandcode-api-proxy --setup-opencode --port 8787
```

This merges a `provider.commandcode` block into
`~/.config/opencode/opencode.jsonc` (or `OPENCODE_CONFIG` if set). The file is
written as JSONC with a comment header. If the legacy `opencode.json` from
earlier versions exists, it is migrated into the new `.jsonc` file, keeping all
other providers and settings.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "commandcode": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CC",
      "options": {
        "baseURL": "http://127.0.0.1:8787/v1",
        "apiKey": "{env:MI_PROXY_API_KEY}"
      },
      "models": {
        "deepseek-v4-pro": { "name": "DeepSeek V4 Pro" }
      }
    }
  }
}
```

`apiKey` uses opencode env interpolation: export the variable before starting
opencode (`export MI_PROXY_API_KEY=x`). Its value does not matter upstream: the
real key is held by the proxy (`auth login`).

### Renaming the provider

The base name is `CC`. The `--sufix` flag appends a text after it:

```bash
commandcode-api-proxy --sufix beta
```

That sets `"name": "CC beta"` and starts the server, printing the change on an
extra line after the `proxy on ...` message. The suffix is replaced on each run,
not accumulated: `--sufix dev` after `--sufix beta` yields `"CC dev"`. The
config must already exist (run `--setup-opencode` first).

You can also generate everything in one go:

```bash
commandcode-api-proxy --setup-opencode --sufix beta
```

## OpenCode inside WSL

Two scenarios:

**Proxy inside WSL (recommended).** Install and run the proxy in the same WSL
and generate the config as usual:

```bash
commandcode-api-proxy auth login   # the key is saved inside WSL too
commandcode-api-proxy --setup-opencode
```

`--setup-opencode` detects WSL and points at `127.0.0.1`. Note: `auth login` on
Windows is not shared with WSL; the key lives in `~/.commandcode-proxy/` of each
environment.

**Proxy on Windows, OpenCode in WSL.** In WSL2 (NAT networking) `127.0.0.1` does
not reach Windows services. On Windows bind the proxy to all interfaces:

```bat
commandcode-api-proxy --host 0.0.0.0
```

and inside WSL:

```bash
commandcode-api-proxy --setup-opencode --client-host auto
```

`auto` resolves the Windows host IP (default gateway, or the `nameserver` in
`/etc/resolv.conf`) and writes it into `baseURL`. If your WSL runs in *mirrored*
networking mode, `127.0.0.1` works unchanged. You can also pass an explicit
address: `--client-host 172.18.144.1`.

## Run without installing

```bash
node server.js
```

or from the repo:

```bash
node bin/cli.js serve --port 8787
```

`.env` is read from the current working directory if present.

## Usage

Check the server:

```bash
curl -sS http://localhost:8787/health
```

Send a chat request:

```bash
curl -s http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4.1-flash","messages":[{"role":"user","content":"hi"}]}'
```

Use the proxy from an OpenAI client:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8787/v1", api_key="unused")
print(client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "hi"}],
).choices[0].message.content)
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check and model count |
| `GET` | `/v1/models` | Model list |
| `POST` | `/v1/chat/completions` | Chat completions, streaming or not |

## Models

| Model id | Status |
| --- | --- |
| `deepseek/deepseek-v4.1-flash` | default |
| `deepseek/deepseek-v4.1-flash-fast` | registered |
| `deepseek/deepseek-v4-flash` | registered |
| `deepseek/deepseek-v4-pro` | registered |

The proxy also accepts the short id. It maps `deepseek-v4.1-flash` to
`deepseek/deepseek-v4.1-flash`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMMANDCODE_API_KEY` | none | Upstream key. Or use `auth login`. |
| `PORT` | `8787` | Listen port |
| `CMD_VERSION` | `1.79.2` | CLI version sent upstream |

## Files

| File | Purpose |
| --- | --- |
| `server.js` | HTTP server and streaming response |
| `upstream.js` | Request translation and stream reader |
| `stream.js` | Event state and usage mapping |
| `env.js` | `.env` loader (from the working directory) |
| `bin/cli.js` | CLI entry: serve, auth, setup-opencode |
| `config.js` | Key storage in `~/.commandcode-proxy/config.json` |
| `opencode-setup.js` | OpenCode config generator and merger |

## Protocol

The upstream endpoint rejects requests without these headers:

| Header | Value | Note |
| --- | --- | --- |
| `Authorization` | `Bearer <key>` | Key from commandcode.ai/settings |
| `User-Agent` | `cli` | Another value returns `403` with `error code: 1010` |
| `x-cli-environment` | `production` | |
| `x-command-code-version` | `1.79.2` | CLI package version |
| `x-session-id` | `<uuid>` | One value per request |

The `403` answer is a Cloudflare block. The gateway does not send it.

### Request body

The endpoint expects a wrapped envelope. The `params` field carries the request.

```jsonc
{
  "config": {
    "workingDir": "/tmp",
    "date": "2026-10-10",
    "environment": "production",
    "structure": [],
    "isGitRepo": false,
    "currentBranch": "",
    "mainBranch": "",
    "gitStatus": "",
    "recentCommits": []
  },
  "memory": "",
  "taste": null,
  "skills": null,
  "permissionMode": "standard",
  "params": {
    "model": "deepseek/deepseek-v4.1-flash",
    "system": "…",
    "messages": [],
    "tools": [],
    "stream": true
  }
}
```

`config` is schema-strict. Every field is required.

`messages` uses the Vercel AI SDK `ModelMessage[]` shape, not the OpenAI shape:

```jsonc
{ "role": "user", "content": [{ "type": "text", "text": "hi" }] }
{ "role": "assistant", "content": [{ "type": "text", "text": "…" },
  { "type": "tool-call", "toolCallId": "call_1", "toolName": "read", "input": {} }] }
{ "role": "tool", "content": [{ "type": "tool-result", "toolCallId": "call_1",
  "toolName": "read", "output": { "type": "text", "value": "…" } }] }
```

`system` is a plain string in `params`, not a message.

### Response stream

The upstream response is newline-delimited JSON, not SSE:

```jsonc
{"type":"start"}
{"type":"start-step","warnings":[]}
{"type":"reasoning-start","id":"reasoning-0"}
{"type":"reasoning-delta","id":"reasoning-0","text":"…"}
{"type":"reasoning-end","id":"reasoning-0"}
{"type":"text-start","id":"txt-0"}
{"type":"text-delta","id":"txt-0","text":"…"}
{"type":"text-end","id":"txt-0"}
{"type":"tool-input-start","id":"call_1","toolName":"read"}
{"type":"tool-input-delta","id":"call_1","delta":"{\"path\":"}
{"type":"tool-input-end","id":"call_1"}
{"type":"tool-call","toolCallId":"call_1","toolName":"read","input":{}}
{"type":"finish-step","finishReason":"stop","usage":{}}
{"type":"finish","finishReason":"stop","totalUsage":{}}
```

The proxy maps these events to OpenAI chunks. It forwards text, reasoning, and
tool calls. `finishReason` values: `stop`, `length`, `tool-calls`.

## Notes

- The `/alpha/generate` response is an internal gateway format. It can change
  without notice.
- The proxy sends no `max_tokens` value unless the client sends one. The
  upstream service applies its own limit.
- Reasoning text arrives in both `reasoning` and `reasoning_content` fields.

## License

MIT. See `LICENSE`.
