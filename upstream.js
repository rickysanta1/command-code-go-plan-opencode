const MODEL_MAP = {
  "deepseek-v4.1-flash": "deepseek/deepseek-v4.1-flash",
  "deepseek-v4.1-flash-fast": "deepseek/deepseek-v4.1-flash-fast",
  "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
  "deepseek-v4-pro": "deepseek/deepseek-v4-pro",
};

export function resolveModel(m) {
  if (!m) return "deepseek/deepseek-v4.1-flash";
  if (MODEL_MAP[m]) return MODEL_MAP[m];
  return m;
}

export function toVercel(messages) {
  let system = "";
  const out = [];
  const names = new Map();

  for (const m of messages || []) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const t of m.tool_calls) {
        if (t.id && t.function?.name) names.set(t.id, t.function.name);
      }
    }
  }

  for (const m of messages || []) {
    if (m.role === "system") {
      const sysText = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      system += sysText + "\n";
      continue;
    }
    if (m.role === "tool") {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: m.tool_call_id,
            toolName: names.get(m.tool_call_id) || "unknown",
            output: { type: "text", value: String(m.content ?? "") }
          }
        ]
      });
      continue;
    }
    if (m.role === "assistant") {
      const parts = [];
      const text = Array.isArray(m.content)
        ? m.content.filter((p) => p.type === "text").map((p) => p.text).join("")
        : (typeof m.content === "string" ? m.content : "");
      if (text) {
        parts.push({ type: "text", text });
      }
      if (Array.isArray(m.tool_calls)) {
        for (const t of m.tool_calls) {
          parts.push({
            type: "tool-call",
            toolCallId: t.id,
            toolName: t.function?.name || "unknown",
            input: safeJson(t.function?.arguments)
          });
        }
      }
      if (parts.length > 0) {
        out.push({ role: "assistant", content: parts });
      } else {
        out.push({ role: "assistant", content: [{ type: "text", text: "" }] });
      }
      continue;
    }
    const text = Array.isArray(m.content)
      ? m.content.filter((p) => p.type === "text").map((p) => p.text).join("")
      : String(m.content ?? "");
    out.push({ role: "user", content: [{ type: "text", text }] });
  }
  return { system: system.trim(), messages: out };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

export function toUpstream({ model, messages, max_tokens, temperature, tools }) {
  const { system, messages: vercel } = toVercel(messages);
  const params = {
    model: resolveModel(model),
    system: system || "You are a helpful assistant.",
    messages: vercel,
    tools: (tools || []).map((t) => ({ name: t.function?.name || t.name, description: t.function?.description || "", input_schema: t.function?.parameters || { type: "object" } })),
    stream: true,
  };
  if (max_tokens) params.max_tokens = max_tokens;
  if (temperature !== undefined) params.temperature = temperature;
  return {
    config: { workingDir: "/tmp", date: new Date().toISOString().slice(0, 10), environment: "production", structure: [], isGitRepo: false, currentBranch: "", mainBranch: "", gitStatus: "", recentCommits: [] },
    memory: "",
    taste: null,
    skills: null,
    permissionMode: "standard",
    params,
  };
}

export async function* readNdjson(res) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (t) {
        try {
          yield JSON.parse(t);
        } catch {}
      }
    }
  }
  const t = buf.trim();
  if (t) {
    try {
      yield JSON.parse(t);
    } catch {}
  }
}
