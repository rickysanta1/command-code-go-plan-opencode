export function createState() {
  const tools = [];
  const toolIndex = new Map();
  return { text: "", reasoning: "", tools, toolIndex, finish: null, usage: null, error: null };
}

export function toolOf(state, id) {
  return state.toolIndex.get(id) || state.tools.find((t) => t.id === id);
}

export function applyEvent(state, e) {
  if (!e || typeof e !== "object") return;
  switch (e.type) {
    case "text-delta":
      state.text += e.text || "";
      return;
    case "reasoning-delta":
      state.reasoning += e.text || "";
      return;
    case "tool-input-start": {
      if (!toolOf(state, e.id)) {
        const t = { id: e.id, name: e.toolName, args: "", index: state.tools.length };
        state.tools.push(t);
        state.toolIndex.set(t.id, t);
      }
      return;
    }
    case "tool-input-delta": {
      const t = toolOf(state, e.id);
      if (t) t.args += e.delta || "";
      return;
    }
    case "tool-call": {
      const found = toolOf(state, e.toolCallId);
      const args = JSON.stringify(e.input ?? {});
      if (found) {
        found.name = e.toolName || found.name;
        found.args = args;
      } else {
        const t = { id: e.toolCallId, name: e.toolName, args, index: state.tools.length };
        state.tools.push(t);
        state.toolIndex.set(t.id, t);
      }
      return;
    }
    case "finish-step":
      if (e.usage) state.usage = e.usage;
      if (e.finishReason) state.finish = e.finishReason;
      return;
    case "finish":
      if (e.totalUsage) state.usage = e.totalUsage;
      if (e.finishReason) state.finish = e.finishReason;
      return;
    case "error":
      state.error = e.error || e;
      return;
    default:
      return;
  }
}

export function toToolCalls(state) {
  return state.tools.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.args } }));
}

export function toFinishReason(state) {
  if (state.tools.length) return "tool_calls";
  if (state.finish === "tool-calls") return "tool_calls";
  if (state.finish === "length") return "length";
  return "stop";
}

export function toUsage(u) {
  if (!u) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return {
    prompt_tokens: u.inputTokens || 0,
    completion_tokens: u.outputTokens || 0,
    total_tokens: u.totalTokens || 0,
    completion_tokens_details: { reasoning_tokens: u.reasoningTokens || 0 },
  };
}
