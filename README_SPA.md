# command-code-proxy

Proxy compatible con OpenAI para Command Code. Responde a `POST /v1/chat/completions`
y `GET /v1/models`, y traduce cada petición a
`https://api.commandcode.ai/alpha/generate`.

El modelo por defecto es `deepseek-v4.1-flash`.

## Por qué

`POST /provider/v1/chat/completions` requiere un plan Provider o superior:

```json
{ "error": { "message": "Your Go plan doesn't include API access.", "type": "permission_error", "code": "upgrade_required" } }
```

La CLI de Command Code usa `/alpha/generate` en cada turno. Cualquier plan puede
llamarlo. Este proxy usa el mismo endpoint.

## Instalación

```bash
npm install -g command-code-proxy
```

Tras la instalación, el comando `commandcode-api-proxy` queda en el PATH.

## Inicio rápido

1. Guarda tu key (consíguela en commandcode.ai/settings):

```bash
commandcode-api-proxy auth login
```

2. Arranca el servidor:

```bash
commandcode-api-proxy
```

3. Pruébalo:

```bash
curl -sS http://127.0.0.1:8787/health
```

## Comandos de autenticación

| Comando | Propósito |
| --- | --- |
| `auth login` | Guarda una nueva API key. La entrada se oculta al escribir. |
| `auth login --force` | Sobrescribe la key guardada. |
| `auth logout` | Elimina la key guardada. |
| `auth status` | Muestra el estado de la key, enmascarada. |

La key se guarda en `~/.commandcode-proxy/config.json` con permisos
restrictivos. Precedencia de la key: flag `--api-key`, luego la variable de
entorno `COMMANDCODE_API_KEY`, luego la key guardada, luego el header
`Authorization` de cada petición.

## Opciones

| Opción | Descripción | Por defecto |
| --- | --- | --- |
| `--host` | Dirección de escucha | `127.0.0.1` |
| `--port` | Puerto | `8787` |
| `--api-key` | API key de Command Code para esa ejecución (no se guarda) | — |
| `--setup-opencode` | Genera la configuración del provider para OpenCode | — |
| `--sufix <texto>` | Renombra el provider de OpenCode a `CC <texto>` | — |
| `-h, --help` | Muestra la ayuda | — |
| `-V, --version` | Muestra la versión | — |

## Configuración de OpenCode

```bash
commandcode-api-proxy --setup-opencode --port 8787
```

Este comando fusiona un bloque `provider.commandcode` en
`~/.config/opencode/opencode.json` (o `OPENCODE_CONFIG` si está definida). Los
providers y ajustes existentes no se modifican.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "commandcode": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CC",
      "options": {
        "baseURL": "http://127.0.0.1:8787/v1",
        "apiKey": "proxy-managed"
      },
      "models": {
        "deepseek-v4-pro": { "name": "DeepSeek V4 Pro" }
      }
    }
  }
}
```

### Renombrar el provider

El nombre base es `CC`. El flag `--sufix` añade un texto detrás:

```bash
commandcode-api-proxy --sufix beta
```

Eso deja `"name": "CC beta"` y arranca el servidor, mostrando el cambio en una
línea extra tras el mensaje `proxy on ...`. El sufijo se reemplaza en cada
ejecución, no se acumula: `--sufix dev` después de `--sufix beta` produce
`"CC dev"`. Requiere que la config ya exista (ejecuta `--setup-opencode` primero).

También puedes generarlo todo de una vez:

```bash
commandcode-api-proxy --setup-opencode --sufix beta
```

## Ejecución sin instalar

```bash
node server.js
```

o desde el repositorio:

```bash
node bin/cli.js serve --port 8787
```

El archivo `.env` se lee del directorio de trabajo actual si existe.

## Uso

Comprobar el servidor:

```bash
curl -sS http://localhost:8787/health
```

Enviar una petición de chat:

```bash
curl -s http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4.1-flash","messages":[{"role":"user","content":"hi"}]}'
```

Usar el proxy desde un cliente de OpenAI:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8787/v1", api_key="unused")
print(client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "hi"}],
).choices[0].message.content)
```

## Endpoints

| Método | Ruta | Propósito |
| --- | --- | --- |
| `GET` | `/health` | Comprobación de vida y número de modelos |
| `GET` | `/v1/models` | Lista de modelos |
| `POST` | `/v1/chat/completions` | Chat completions, con o sin streaming |

## Modelos

| ID de modelo | Estado |
| --- | --- |
| `deepseek/deepseek-v4.1-flash` | por defecto |
| `deepseek/deepseek-v4.1-flash-fast` | registrado |
| `deepseek/deepseek-v4-flash` | registrado |
| `deepseek/deepseek-v4-pro` | registrado |

El proxy también acepta el ID corto. Mapea `deepseek-v4.1-flash` a
`deepseek/deepseek-v4.1-flash`.

## Configuración

| Variable | Por defecto | Propósito |
| --- | --- | --- |
| `COMMANDCODE_API_KEY` | ninguna | Key del upstream. O usa `auth login`. |
| `PORT` | `8787` | Puerto de escucha |
| `CMD_VERSION` | `1.79.2` | Versión de la CLI enviada al upstream |

## Archivos

| Archivo | Propósito |
| --- | --- |
| `server.js` | Servidor HTTP y respuesta en streaming |
| `upstream.js` | Traducción de peticiones y lector de stream |
| `stream.js` | Estado de eventos y mapeo de usage |
| `env.js` | Cargador de `.env` (desde el directorio de trabajo) |
| `bin/cli.js` | Entrada CLI: serve, auth, setup-opencode |
| `config.js` | Almacenamiento de la key en `~/.commandcode-proxy/config.json` |
| `opencode-setup.js` | Generador y fusionador de la config de OpenCode |

## Protocolo

El endpoint del upstream rechaza las peticiones sin estos headers:

| Header | Valor | Nota |
| --- | --- | --- |
| `Authorization` | `Bearer <key>` | Key de commandcode.ai/settings |
| `User-Agent` | `cli` | Otro valor devuelve `403` con `error code: 1010` |
| `x-cli-environment` | `production` | |
| `x-command-code-version` | `1.79.2` | Versión del paquete CLI |
| `x-session-id` | `<uuid>` | Un valor por petición |

La respuesta `403` es un bloqueo de Cloudflare. El gateway no lo envía.

### Cuerpo de la petición

El endpoint espera un sobre (envelope) envuelto. El campo `params` lleva la
petición.

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

`config` es estricto con el esquema. Todos los campos son obligatorios.

`messages` usa la forma `ModelMessage[]` del Vercel AI SDK, no la forma de
OpenAI:

```jsonc
{ "role": "user", "content": [{ "type": "text", "text": "hi" }] }
{ "role": "assistant", "content": [{ "type": "text", "text": "…" },
  { "type": "tool-call", "toolCallId": "call_1", "toolName": "read", "input": {} }] }
{ "role": "tool", "content": [{ "type": "tool-result", "toolCallId": "call_1",
  "toolName": "read", "output": { "type": "text", "value": "…" } }] }
```

`system` es una cadena simple en `params`, no un mensaje.

### Stream de respuesta

La respuesta del upstream es JSON delimitado por saltos de línea, no SSE:

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

El proxy mapea estos eventos a chunks de OpenAI. Reenvía texto, reasoning y
tool calls. Valores de `finishReason`: `stop`, `length`, `tool-calls`.

## Notas

- La respuesta de `/alpha/generate` es un formato interno del gateway. Puede
  cambiar sin previo aviso.
- El proxy no envía ningún valor de `max_tokens` a menos que el cliente envíe
  uno. El servicio upstream aplica su propio límite.
- El texto de reasoning llega tanto en el campo `reasoning` como en
  `reasoning_content`.

## Licencia

MIT. Ver `LICENSE`.
