const { library, employees, DEMO_TODAY, getProfile } = require("../lib/assistant");
const llm = require("../lib/llm");

module.exports = async (req, res) => {
  const avail = llm.available();
  res.status(200).json({
    today: DEMO_TODAY,
    mode: avail.grok || avail.claude ? "model" : "extractive",
    models: { primary: avail.grok ? llm.XAI_MODEL : null, fallback: avail.claude ? llm.CLAUDE_MODEL : null },
    employees: employees.map((e) => getProfile(e.id, DEMO_TODAY)),
    library: library(),
  });
};
