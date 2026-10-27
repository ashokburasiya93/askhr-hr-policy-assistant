const { ask } = require("../lib/assistant");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { question, employeeId, history } = req.body || {};
  if (!question || typeof question !== "string" || question.length > 2000) {
    return res.status(400).json({ error: "Please send a question of up to 2,000 characters." });
  }
  try {
    const result = await ask({ question: question.trim(), employeeId, history: Array.isArray(history) ? history.slice(-6) : [] });
    res.status(200).json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong. Your question has not been stored." });
  }
};
