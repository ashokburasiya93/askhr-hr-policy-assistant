const { library, employees, DEMO_TODAY, getProfile } = require("../lib/assistant");
const llm = require("../lib/llm");

module.exports = async (req, res) => {
  const chain = llm.chain();
  res.status(200).json({
    today: DEMO_TODAY,
    mode: chain.length ? "model" : "extractive",
    models: { primary: chain[0] || null, fallback: chain[1] || null, chain },
    employees: employees.map((e) => getProfile(e.id, DEMO_TODAY)),
    library: library(),
  });
};
