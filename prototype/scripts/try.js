// Ask one question from the command line: node scripts/try.js E3001 "How many holiday days can I carry over?"
const { ask } = require("../lib/assistant");
(async () => {
  const [emp, ...q] = process.argv.slice(2);
  const r = await ask({ question: q.join(" "), employeeId: emp });
  console.log(`route=${r.route} category=${r.category} mode=${r.mode}`);
  console.log(r.answer);
  console.log("citations:", r.citations.map((c) => c.id).join(", "));
  for (const c of r.checks) console.log(` ${c.pass ? "PASS" : "FAIL"} ${c.name}${c.detail ? " - " + c.detail : ""}`);
  if (r.trace.retrieval) console.log("top:", JSON.stringify(r.trace.retrieval.top));
  if (r.ticket) console.log("ticket:", r.ticket.id, r.ticket.queue, r.ticket.status);
})();
