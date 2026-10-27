// Checks the model path without spending tokens: fake model replies go through the same
// verification. A grounded reply must be shown; an invented number, a promise or a
// citation to another country's policy must be blocked and replaced by the extractive answer.
process.env.XAI_API_KEY = process.env.XAI_API_KEY || "test";
const llm = require("../lib/llm");
const { ask } = require("../lib/assistant");

const CASES = [
  { name: "Grounded reply is shown", reply: { answerable: true, answer: "You can carry forward privilege leave up to a maximum balance of **30 days**. Anything above that lapses on 31 March unless encashed.", citations: ["IN-LEAVE-v3.2-s3"], confidence: "high" }, expectMode: "model" },
  { name: "Invented number is blocked", reply: { answerable: true, answer: "You can carry forward up to 45 days.", citations: ["IN-LEAVE-v3.2-s3"], confidence: "high" }, expectMode: "extractive" },
  { name: "Promise is blocked", reply: { answerable: true, answer: "I can confirm you will definitely get 30 days carried forward.", citations: ["IN-LEAVE-v3.2-s3"], confidence: "high" }, expectMode: "extractive" },
  { name: "Superseded-version citation is blocked", reply: { answerable: true, answer: "Up to 45 days can be carried forward.", citations: ["IN-LEAVE-v3.1-s3"], confidence: "high" }, expectMode: "extractive" },
  { name: "Other-country citation is blocked", reply: { answerable: true, answer: "You can carry over 5 days.", citations: ["UK-LEAVE-v6.0-s3"], confidence: "high" }, expectMode: "extractive" },
  { name: "Uncited reply is blocked", reply: { answerable: true, answer: "You can carry forward 30 days.", citations: [], confidence: "high" }, expectMode: "extractive" },
];

(async () => {
  let failed = 0;
  for (const c of CASES) {
    llm.complete = async () => ({ model: "fake", provider: "test", text: JSON.stringify(c.reply), usage: { input_tokens: 900, output_tokens: 80 }, cost_usd: 0.0002, errors: [] });
    const r = await ask({ question: "How much privilege leave can I carry forward?", employeeId: "E1001" });
    const ok = r.mode === c.expectMode;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (mode=${r.mode}${r.fallback_reason ? `; ${r.fallback_reason}` : ""})`);
  }
  process.exit(failed ? 1 : 0);
})();
