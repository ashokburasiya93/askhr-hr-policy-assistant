// AskHR prototype front end (no framework). Talks to /api/meta, /api/ask, /api/handoff.
const state = { meta: null, employeeId: null, history: {}, tickets: [], evalSet: "dev" };
const $ = (s) => document.querySelector(s);
const FLAG = { IN: "🇮🇳", UK: "🇬🇧", US: "🇺🇸" };
const CNAME = { IN: "India", UK: "UK", US: "US" };

const SUGGESTIONS = {
  E1001: [["How much privilege leave can I carry forward?", "Superseded v3.1 said 45 days"], ["How much can I spend on a hotel in Mumbai?", "Grade-aware table"], ["My father passed away last night, what do I do?", "Sensitive: hand-off"], ["What is the carry forward limit for UK employees?", "Wrong country"]],
  E1002: [["Agle saal kitni chutti carry forward kar sakta hu?", "Hinglish"], ["मैं कितनी छुट्टी encash कर सकता हूँ?", "Hindi"], ["Which tax regime is applied if I don't choose one?", "March peak topic"], ["Is there going to be a layoff in my team?", "Sensitive: hand-off"]],
  C2001: [["How many sick leaves do I get?", "Contractor terms"], ["Can I claim travel expenses?", "Contractor terms"]],
  E3001: [["What is the hotel limit in London?", "Two live versions"], ["Can you confirm I get 10 more days of holiday this year?", "Commitment bait"], ["Can I take the company to an employment tribunal over my holiday pay?", "Legal: no advice"], ["I've been diagnosed with cancer and need time off for chemo", "Medical: hand-off + redaction"]],
  E3002: [["How much company sick pay do I get?", "Length-of-service row"], ["How long do I have to submit an expense claim?", "Transition rule"], ["A colleague has been bullying me for months", "Confidential ER"]],
  E4001: [["When is open enrollment this year?", "November peak"], ["How much does the company put in my HSA?", ""], ["I live in California, do I lose unused vacation at year end?", "State rule"], ["My manager keeps making sexual comments about me", "Confidential ER"]],
  E4002: [["How much PTO do I accrue each year?", "Tenure table"], ["I was underpaid on my last paycheck", "Payroll ticket"], ["Can I bring my dog to the office?", "Not in library: no guess"]],
  C5001: [["Am I eligible for the 401k match?", "Contractor terms"], ["When is payday for me?", "Contractor terms"]],
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Minimal markdown: paragraphs, bullets, tables, **bold**, _italic_.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\s)_(.+?)_(?=\s|$|[.,])/g, "$1<em>$2</em>");
  const blocks = String(text || "").split(/\n{2,}/);
  return blocks.map((b) => {
    const lines = b.split("\n");
    if (lines.every((l) => l.trim().startsWith("|"))) {
      const rows = lines.filter((l) => !/^\|\s*-/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      return `<table><thead><tr>${rows[0].map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    if (lines.every((l) => /^\s*[-*] /.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

function initials(n) {
  return n.split(" ").map((x) => x[0]).join("").slice(0, 2);
}

// ---------- persona ----------
function renderPersonas() {
  $("#persona-list").innerHTML = state.meta.employees.map((e) => `
    <button class="persona ${e.id === state.employeeId ? "active" : ""}" data-id="${e.id}">
      <div class="avatar">${initials(e.name)}</div>
      <div><div class="p-name">${esc(e.name)} ${FLAG[e.country] || ""}</div>
      <div class="p-meta">${esc(e.location)} · ${e.employment_type === "contractor" ? '<span class="tag contractor">Contractor</span>' : `${e.grade} · ${e.service_years} yrs`}</div></div>
    </button>`).join("");
  document.querySelectorAll(".persona").forEach((b) => b.addEventListener("click", () => selectPersona(b.dataset.id)));
  $("#suggestions").innerHTML = (SUGGESTIONS[state.employeeId] || []).map(([q, why]) => `<button class="suggestion" data-q="${esc(q)}">${esc(q)}${why ? `<small>${esc(why)}</small>` : ""}</button>`).join("");
  document.querySelectorAll(".suggestion").forEach((b) => b.addEventListener("click", () => send(b.dataset.q)));
}

function selectPersona(id) {
  state.employeeId = id;
  renderPersonas();
  const e = state.meta.employees.find((x) => x.id === id);
  $("#chat-sub").textContent = `Signed in as ${e.name}: answers use ${CNAME[e.country]} ${e.employment_type} policies live on ${state.meta.today}.`;
  renderMessages();
  $("#why").className = "why-empty";
  $("#why").textContent = "Ask a question to see the profile used, what was searched, the sources and the safety checks.";
}

// ---------- chat ----------
function conv() {
  return (state.history[state.employeeId] = state.history[state.employeeId] || []);
}

function renderMessages() {
  const e = state.meta.employees.find((x) => x.id === state.employeeId);
  const msgs = conv();
  const hello = `<div class="msg"><div class="avatar bot">A</div><div class="bubble"><p>Hi ${esc(e.name.split(" ")[0])}, I'm AskHR. I answer questions about leave, pay dates, benefits and travel from Brightpath's ${CNAME[e.country]} policies, and show you the exact section. For anything personal or sensitive, I'll connect you with a person.</p></div></div>`;
  $("#messages").innerHTML = hello + msgs.map((m, i) => (m.role === "user" ? `<div class="msg user"><div class="avatar">${initials(e.name)}</div><div class="bubble">${esc(m.text)}</div></div>` : renderBot(m, i))).join("");
  bindBot();
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

const ROUTE_LABEL = { answer: "Answered from policy", handoff: "Handed to a person", payroll: "Payroll ticket", redirect: "Not an HR question", clarify: "Outside your policies", not_found: "Not in the policy library", refuse: "Can't help with that" };

function renderBot(m, i) {
  if (m.pending) return `<div class="msg"><div class="avatar bot">A</div><div class="bubble typing">Checking your policies…</div></div>`;
  if (m.error) return `<div class="msg"><div class="avatar bot">A</div><div class="bubble">${esc(m.error)}</div></div>`;
  const r = m.result;
  const cites = (r.citations || []).map((c, j) => `<button class="cite" data-i="${i}" data-j="${j}">${esc(c.title)} v${esc(c.version)} §${esc(c.section)}${c.applies_when ? " · " + esc(c.applies_when) : ""}</button>`).join("");
  let ticket = "";
  if (r.ticket) {
    const t = r.ticket;
    const sent = t.status.startsWith("Sent");
    ticket = `<div class="ticket">
      <div class="row"><b>${sent ? "Sent to" : "Ready to send to"}:</b> ${esc(t.queue)} · ${esc(t.priority)} · reply within ${t.sla_hours} working hours</div>
      <div class="row"><b>Who can see it:</b> ${esc(t.visibility)}</div>
      <div class="row"><b>Summary they'll get:</b> ${esc(t.summary)}</div>
      <div class="actions">${sent ? `<span class="btn done">Sent · ${esc(t.id)}</span>` : `<button class="btn primary" data-send="${i}">Send to HR</button>${/Employee Relations/.test(t.queue) ? `<button class="btn" data-speakup="${i}">Use the anonymous Speak Up line instead</button>` : ""}`}</div>
    </div>`;
  }
  const actions = r.route === "answer" ? `<div class="actions"><button class="btn" data-fb="${i}" data-v="up">👍 Helpful</button><button class="btn" data-fb="${i}" data-v="down">👎 Not right</button><button class="btn" data-human="${i}">Talk to an HR partner</button></div>` : "";
  return `<div class="msg"><div class="avatar bot">A</div><div class="bubble">
    <div class="route-label route-${r.route}">${ROUTE_LABEL[r.route] || r.route}</div>
    ${md(r.answer)}
    ${cites ? `<div class="cites">${cites}</div><div class="quote-slot" id="q-${i}"></div>` : ""}
    ${ticket}${m.feedback ? `<div class="actions"><span class="btn done">${m.feedback}</span></div>` : actions}
  </div></div>`;
}

function bindBot() {
  document.querySelectorAll(".cite").forEach((b) => b.addEventListener("click", () => {
    const m = conv()[b.dataset.i];
    const c = m.result.citations[b.dataset.j];
    $(`#q-${b.dataset.i}`).innerHTML = `<div class="quote">“${esc(c.quote)}”<br><a href="${esc(c.url)}" target="_blank" rel="noopener">Open ${esc(c.title)} v${esc(c.version)}, section ${esc(c.section)} ↗</a> <span class="mono">(${esc(c.owner)})</span></div>`;
  }));
  document.querySelectorAll("[data-send]").forEach((b) => b.addEventListener("click", () => {
    const m = conv()[b.dataset.send];
    m.result.ticket.status = "Sent";
    addTicket(m.result.ticket);
    renderMessages();
  }));
  document.querySelectorAll("[data-speakup]").forEach((b) => b.addEventListener("click", () => {
    const m = conv()[b.dataset.speakup];
    m.result.ticket = null;
    m.result.answer += "\n\nNo ticket was created. The **Speak Up line** is independent, open 24x7 and accepts anonymous reports.";
    renderMessages();
  }));
  document.querySelectorAll("[data-fb]").forEach((b) => b.addEventListener("click", () => {
    conv()[b.dataset.fb].feedback = b.dataset.v === "up" ? "Thanks for the feedback" : "Thanks. This goes to the policy owner's review list.";
    renderMessages();
  }));
  document.querySelectorAll("[data-human]").forEach((b) => b.addEventListener("click", async () => {
    const i = Number(b.dataset.human);
    const q = conv()[i - 1]?.text || "";
    const r = await fetch("/api/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, employeeId: state.employeeId }) }).then((x) => x.json());
    r.ticket.status = "Sent";
    addTicket(r.ticket);
    conv()[i].feedback = `Sent to ${r.ticket.queue} · ${r.ticket.id}`;
    renderMessages();
  }));
}

async function send(text) {
  const q = (text ?? $("#input").value).trim();
  if (!q) return;
  $("#input").value = "";
  const c = conv();
  const history = c.filter((m) => m.role === "user" || m.result).slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.role === "user" ? m.text : m.result.answer }));
  c.push({ role: "user", text: q });
  c.push({ role: "bot", pending: true });
  renderMessages();
  $("#send").disabled = true;
  try {
    const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, employeeId: state.employeeId, history }) });
    const r = await res.json();
    c[c.length - 1] = res.ok ? { role: "bot", result: r } : { role: "bot", error: r.error || "Something went wrong." };
    if (res.ok) {
      if (r.ticket && r.ticket.auto_sent) addTicket(r.ticket);
      renderWhy(r);
    }
  } catch {
    c[c.length - 1] = { role: "bot", error: "I couldn't reach the service. Please try again." };
  }
  $("#send").disabled = false;
  renderMessages();
}

// ---------- why panel ----------
function renderWhy(r) {
  const p = r.trace.profile_used;
  const ret = r.trace.retrieval;
  const used = new Set((r.citations || []).map((c) => c.id));
  const modeText = r.mode === "model" ? `${r.model.provider} ${r.model.model} · ${r.model.usage.input_tokens + r.model.usage.output_tokens} tokens · $${(r.model.cost_usd || 0).toFixed(5)}` : r.mode === "rules" ? "Safety rules (no AI model call)" : "Grounded extractive (quotes the policy; no AI model call)";
  $("#why").className = "";
  $("#why").innerHTML = `
    <div class="why-block"><h4>Profile used (from Workday)</h4><div class="kv">
      <div>Country</div><div>${p.country}</div><div>Grade</div><div>${p.grade}</div><div>Type</div><div>${p.employment_type}</div><div>Service</div><div>${p.service_years} years</div><div>Location</div><div>${esc(p.location)}</div></div></div>
    <div class="why-block"><h4>Safety triage</h4><div class="kv">
      <div>Route</div><div>${ROUTE_LABEL[r.route] || r.route}</div><div>Rules hit</div><div>${r.trace.triage.matched_rules.join(", ") || "none"}</div><div>Flags</div><div>${r.trace.triage.flags.join(", ") || "none"}</div><div>Language</div><div>${r.trace.triage.language}</div><div>Sent to AI</div><div>${r.trace.sent_to_model ? "Yes (redacted)" : "No"}</div></div></div>
    ${ret ? `<div class="why-block"><h4>What was searched</h4><div class="hint">${esc(ret.filter)}. ${ret.filtered_out} sections excluded before ranking, ${ret.eligible_sections} eligible.</div>
      ${ret.top.map((t) => `<div class="src ${used.has(t.id) ? "used" : ""}"><span class="mono">${esc(t.id)}</span><span>${t.score}${used.has(t.id) ? " · cited" : ""}</span></div>`).join("")}</div>` : ""}
    <div class="why-block"><h4>Checks before showing the answer</h4>${r.checks.map((k) => `<div class="check ${k.pass ? "" : "fail"}"><span class="ic">${k.pass ? "✓" : "!"}</span><div>${esc(k.name)}${k.detail ? `<small>${esc(k.detail)}</small>` : ""}</div></div>`).join("")}</div>
    <div class="why-block"><h4>How it was produced</h4><div class="hint">${esc(modeText)} · ${r.latency_ms} ms${r.fallback_reason ? `<br>Fallback: ${esc(r.fallback_reason)}` : ""}</div></div>
    <div class="why-block"><h4>What is logged</h4><div class="quote">${esc(r.trace.logged_question)}</div></div>`;
}

// ---------- queue ----------
function loadTickets() {
  try { state.tickets = JSON.parse(localStorage.getItem("askhr-tickets") || "[]"); } catch { state.tickets = []; }
}
function addTicket(t) {
  if (state.tickets.some((x) => x.id === t.id)) return;
  state.tickets.unshift({ ...t, status: t.status.startsWith("Sent") ? t.status : "Sent" });
  try { localStorage.setItem("askhr-tickets", JSON.stringify(state.tickets)); } catch {}
  renderQueue();
}
function renderQueue() {
  $("#queue-count").textContent = state.tickets.length;
  $("#queue").innerHTML = state.tickets.length ? state.tickets.map((t) => `
    <div class="card"><div class="card-head"><div><span class="prio ${t.priority}">${t.priority}</span> <b>${esc(t.category)}</b> · ${esc(t.employee.name)} (${t.employee.country}, ${esc(t.employee.employment_type)})</div><div class="mono">${esc(t.id)} · ${esc(t.queue)} · SLA ${t.sla_hours}h</div></div>
    <div>${esc(t.summary)}</div><div class="hint" style="margin-top:6px">Visibility: ${esc(t.visibility)} · Next step: ${esc(t.suggested_next_step)}</div></div>`).join("")
    : `<div class="empty">No hand-offs yet. Try a sensitive question in the chat, then tap “Send to HR”.</div>`;
}

// ---------- library ----------
function renderLibrary() {
  const docs = state.meta.library;
  const liveCount = {};
  docs.filter((d) => d.live_today).forEach((d) => (liveCount[d.doc_id] = (liveCount[d.doc_id] || 0) + 1));
  $("#library").innerHTML = `<div class="table-wrap"><table class="grid"><thead><tr><th>Country</th><th>Document</th><th>Version</th><th>Status today</th><th>Effective</th><th>Applies to</th><th>Owner</th><th>Source</th></tr></thead><tbody>
    ${docs.sort((a, b) => (a.country + a.doc_id).localeCompare(b.country + b.doc_id) || b.version.localeCompare(a.version)).map((d) => {
      const st = !d.live_today ? `<span class="status superseded">${d.status === "superseded" ? "Superseded: never searched" : "Not live"}</span>` : liveCount[d.doc_id] > 1 ? `<span class="status transition">Live · transition</span>` : `<span class="status live">Live</span>`;
      return `<tr><td>${FLAG[d.country] || "🌐"} ${d.country}</td><td><b>${esc(d.title)}</b><div class="hint">${d.sections} sections${d.applies_when ? " · " + esc(d.applies_when) : ""}</div></td><td>v${esc(d.version)}</td><td>${st}</td><td>${esc(d.effective_from)}${d.effective_to ? " to " + esc(d.effective_to) : ""}</td><td>${esc(d.audience)}</td><td>${esc(d.owner)}</td><td>${esc(d.source_format)}</td></tr>`;
    }).join("")}</tbody></table></div>
    <p class="hint" style="margin-top:12px">In production, a country lead publishes a new version through a short publishing form (owner, effective date, what changed). The previous version is superseded automatically, so the assistant can never mix versions. Scanned PDFs are OCR'd and the extracted text is reviewed by the owner before going live.</p>`;
}

// ---------- quality ----------
async function renderQuality() {
  const file = state.evalSet === "dev" ? "eval-results.json" : "eval-holdout.json";
  let e;
  try { e = await fetch(file).then((x) => x.json()); } catch { $("#quality").innerHTML = `<div class="empty">No eval results yet. Run npm run build.</div>`; return; }
  $("#quality").innerHTML = `
    <div class="seg"><button data-set="dev" class="${state.evalSet === "dev" ? "active" : ""}">Development set (58)</button><button data-set="holdout" class="${state.evalSet === "holdout" ? "active" : ""}">Held-out set (22)</button></div>
    <p class="hint">${esc(e.set || "development")} · mode: ${esc(e.mode)} · ${e.passed}/${e.cases} cases fully passed · run ${esc(e.run_at.slice(0, 16).replace("T", " "))} UTC</p>
    <div class="metrics">${e.metrics.map((m) => `<div class="metric ${m.pass ? "pass" : "fail"}">${m.gate ? '<div class="gate">Launch gate</div>' : ""}<div class="v">${m.value}${m.unit}</div><div class="n">${esc(m.name)}<br>Threshold ${m.threshold}${m.unit}</div></div>`).join("")}</div>
    <div class="table-wrap"><table class="grid"><thead><tr><th>ID</th><th>Who</th><th>Question</th><th>Expected</th><th>Got</th><th>Cited</th><th>Result</th></tr></thead><tbody>
    ${e.rows.map((r) => `<tr><td class="mono">${r.id}</td><td class="mono">${r.employee}</td><td>${esc(r.question)}<div class="hint">${esc(r.answer_preview)}</div></td><td>${r.expected_route}</td><td>${r.route}</td><td class="mono">${r.cited.join("<br>")}</td><td>${r.pass ? '<span class="status live">Pass</span>' : '<span class="status superseded">Miss</span>'}</td></tr>`).join("")}
    </tbody></table></div>`;
  document.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => { state.evalSet = b.dataset.set; renderQuality(); }));
}

// ---------- boot ----------
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${t.dataset.tab}`));
  if (t.dataset.tab === "quality") renderQuality();
}));
$("#composer").addEventListener("submit", (ev) => { ev.preventDefault(); send(); });

(async () => {
  state.meta = await fetch("/api/meta").then((r) => r.json());
  $("#mode-badge").textContent = state.meta.mode === "model" ? `AI: ${state.meta.models.primary || state.meta.models.fallback}${state.meta.models.primary && state.meta.models.fallback ? " → fallback " + state.meta.models.fallback : ""}` : "Mode: grounded extractive (no AI key set)";
  loadTickets();
  renderQueue();
  renderLibrary();
  selectPersona(state.meta.employees[0].id);
})();
