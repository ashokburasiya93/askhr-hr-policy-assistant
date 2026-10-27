// Model access, tried in order: xAI Grok, then Groq (both OpenAI-compatible REST), then
// Claude via the Anthropic SDK. Only providers with a key set are used. With no keys the
// app runs in "grounded extractive" mode, which never calls a model. Only these providers
// are wired in, matching the "approved providers only" constraint.
const Anthropic = require("@anthropic-ai/sdk");

const XAI_MODEL = process.env.XAI_MODEL || "grok-4-fast-non-reasoning";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
// Second Groq model, tried when the first is rate-limited (the free tier allows only a few
// answers a minute per model). Set GROQ_FALLBACK_MODEL to "" to turn this off.
const GROQ_FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL ?? "llama-3.3-70b-versatile";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-5-5";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 12000);

// USD per 1M tokens, used for the per-answer cost shown in the UI and the cost sheet.
const PRICES = {
  [XAI_MODEL]: { input: 0.2, output: 0.5 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
};

function available() {
  return {
    grok: Boolean(process.env.XAI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}

function any() {
  const a = available();
  return a.grok || a.groq || a.claude;
}

// The configured chain in order, for the UI badge: e.g. ["openai/gpt-oss-120b", "claude-haiku-5-5"].
function chain() {
  const a = available();
  return [a.grok && XAI_MODEL, a.groq && GROQ_MODEL, a.groq && GROQ_FALLBACK_MODEL, a.claude && CLAUDE_MODEL].filter(Boolean);
}

function costOf(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1e6;
}

async function callOpenAICompatible({ url, key, model, provider, extra = {} }, system, user) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...extra,
      }),
    });
    if (!res.ok) throw new Error(`${provider} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const usage = { input_tokens: data.usage?.prompt_tokens || 0, output_tokens: data.usage?.completion_tokens || 0 };
    return { model, provider, text: data.choices?.[0]?.message?.content || "", usage };
  } finally {
    clearTimeout(t);
  }
}

const callGrok = (system, user) =>
  callOpenAICompatible({ url: "https://api.x.ai/v1/chat/completions", key: process.env.XAI_API_KEY, model: XAI_MODEL, provider: "xAI" }, system, user);

const callGroq = (system, user, model = GROQ_MODEL) =>
  callOpenAICompatible(
    {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model,
      provider: "Groq",
      extra: model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {},
    },
    system,
    user
  );

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

// Try Grok, then Groq, then Claude. Returns null when neither is configured or both fail, so the
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
  if (avail.groq) {
    for (const model of [GROQ_MODEL, GROQ_FALLBACK_MODEL].filter(Boolean)) {
      try {
        const r = await callGroq(system, user, model);
        return { ...r, cost_usd: costOf(r.model, r.usage), errors };
      } catch (e) {
        errors.push(`groq ${model}: ${e.message}`);
      }
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

module.exports = { complete, parseJson, available, any, chain, XAI_MODEL, GROQ_MODEL, GROQ_FALLBACK_MODEL, CLAUDE_MODEL, PRICES };
