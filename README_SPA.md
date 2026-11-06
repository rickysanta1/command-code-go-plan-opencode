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

Tras la instalación, el comando `command-code-proxy` queda en el PATH.

## Inicio rápido

1. Guarda tu key (consíguela en commandcode.ai/settings):

```bash
command-code-proxy auth login
```

2. Arranca el servidor:

```bash
command-code-proxy
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
restrictivos y se relee en cada petición, así que `auth login` surte efecto sin
reiniciar el proxy. Precedencia de la key por petición: flag `--api-key` /
variable `COMMANDCODE_API_KEY`, luego una key plausible enviada por el cliente
(header `user_…`, p. ej. la que escribes en el diálogo Connect de opencode),
luego la key guardada; los placeholders enviados por clientes (`proxy-managed`,
`{env:…}` sin resolver) nunca llegan al upstream mientras exista una key real.
Si Command Code rechaza la key igualmente, el proxy responde indicando la
fuente de la key usada (enmascarada) y cómo corregirla.

## Opciones

| Opción | Descripción | Por defecto |
| --- | --- | --- |
| `--host` | Dirección de escucha | `127.0.0.1` |
| `--port` | Puerto | `8787` |
| `--api-key` | API key de Command Code para esa ejecución (no se guarda) | — |
| `--setup-opencode` | Genera la config del provider para OpenCode (`opencode.jsonc`) | — |
| `--client-host <addr\|auto>` | Dirección a la que conecta opencode; `auto`/`windows` resuelve la IP del host Windows dentro de WSL | dirección de escucha |
| `--env-key <NAME>` | Variable de entorno interpolada en `apiKey` en la config de opencode | `MI_PROXY_API_KEY` |
| `--sufix <texto>` | Renombra el provider de OpenCode a `CC <texto>` | — |
| `-h, --help` | Muestra la ayuda | — |
| `-V, --version` | Muestra la versión | — |

## Configuración de OpenCode

```bash
command-code-proxy --setup-opencode --port 8787
```

Este comando fusiona un bloque `provider.commandcode` en
`~/.config/opencode/opencode.jsonc` (o `OPENCODE_CONFIG` si está definida). El
archivo se escribe como JSONC con cabecera de comentarios. Si existe el
`opencode.json` antiguo (versiones previas), se migra al nuevo `.jsonc` y se
conservan el resto de providers y ajustes.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "commandcode": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CC Rickysanta197",
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

`apiKey` usa interpolación de entorno de opencode: exporta la variable antes de
arrancar opencode (`export MI_PROXY_API_KEY=x`). El contenido no importa para el
upstream: la key real la guarda el proxy (`auth login`).

## OpenCode dentro de WSL

Hay dos escenarios:

**Proxy dentro de WSL (recomendado).** Instala y corre el proxy en la misma WSL
y genera el config igual que siempre:

```bash
command-code-proxy auth login   # guarda la key dentro de WSL también
command-code-proxy --setup-opencode
```

`--setup-opencode` detecta WSL y apunta a `127.0.0.1`. Nota: `auth login` en
Windows no se comparte con WSL; la key vive en `~/.commandcode-proxy/` de cada
entorno.

**Proxy en Windows, opencode en WSL.** En WSL2 (modo NAT) `127.0.0.1` no
alcanza los servicios de Windows. En Windows arranca el proxy en todas las
interfaces:

```bat
command-code-proxy --host 0.0.0.0
```

y dentro de WSL:

```bash
command-code-proxy --setup-opencode --client-host auto
```

`auto` resuelve la IP del host Windows (gateway de la ruta por defecto, o el
`nameserver` de `/etc/resolv.conf`) y la escribe en `baseURL`. Si tu WSL usa
redes en modo *mirrored*, `127.0.0.1` funciona sin cambios. También puedes pasar
una dirección concreta: `--client-host 172.18.144.1`.

### Renombrar el provider

El nombre base es `CC`. El flag `--sufix` añade un texto detrás:

```bash
command-code-proxy --sufix beta
```

Eso deja `"name": "CC beta"` y arranca el servidor, mostrando el cambio en una
línea extra tras el mensaje `proxy on ...`. El sufijo se reemplaza en cada
ejecución, no se acumula: `--sufix dev` después de `--sufix beta` produce
`"CC dev"`. Requiere que la config ya exista (ejecuta `--setup-opencode` primero).

También puedes generarlo todo de una vez:

```bash
command-code-proxy --setup-opencode --sufix Rickysanta197
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
