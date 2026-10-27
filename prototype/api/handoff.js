// Employee taps "Talk to an HR partner" on an answer they are not happy with.
const { handoffOnRequest } = require("../lib/assistant");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { question, employeeId } = req.body || {};
  if (!question) return res.status(400).json({ error: "question required" });
  res.status(200).json({ ticket: handoffOnRequest({ question, employeeId }) });
};
