// Model access. Primary: xAI Grok (OpenAI-compatible REST). Fallback: Claude via the
// Anthropic SDK. With no keys configured the app runs in "grounded extractive" mode,
// which never calls a model. Only these two providers are wired in, matching the
// "approved providers only" constraint; nothing else receives employee data.
const Anthropic = require("@anthropic-ai/sdk");

const XAI_MODEL = process.env.XAI_MODEL || "grok-4-fast-non-reasoning";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 12000);

// USD per 1M tokens, used for the per-answer cost shown in the UI and the cost sheet.
const PRICES = {
  [XAI_MODEL]: { input: 0.2, output: 0.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
};

function available() {
  return { grok: Boolean(process.env.XAI_API_KEY), claude: Boolean(process.env.ANTHROPIC_API_KEY) };
}

function costOf(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1e6;
}

async function callGrok(system, user) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const usage = { input_tokens: data.usage?.prompt_tokens || 0, output_tokens: data.usage?.completion_tokens || 0 };
    return { model: XAI_MODEL, provider: "xAI", text: data.choices?.[0]?.message?.content || "", usage };
  } finally {
    clearTimeout(t);
  }
}

let claudeClient = null;
async function callClaude(system, user, schema) {
  claudeClient = claudeClient || new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const response = await claudeClient.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system,
    output_config: { effort: "low", ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { model: CLAUDE_MODEL, provider: "Anthropic", text, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } };
}

// Try Grok, then Claude. Returns null when neither is configured or both fail, so the
// caller falls back to the extractive answer instead of failing the employee.
async function complete(system, user, schema) {
  const errors = [];
  const avail = available();
  if (avail.grok) {
    try {
      const r = await callGrok(system, user);
      return { ...r, cost_usd: costOf(r.model, r.usage), errors };
    } catch (e) {
      errors.push(`grok: ${e.message}`);
    }
  }
  if (avail.claude) {
    try {
      const r = await callClaude(system, user, schema);
      return { ...r, cost_usd: costOf(r.model, r.usage), errors };
    } catch (e) {
      errors.push(`claude: ${e.message}`);
    }
  }
  return errors.length ? { failed: true, errors } : null;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = (text || "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

module.exports = { complete, parseJson, available, XAI_MODEL, CLAUDE_MODEL, PRICES };
