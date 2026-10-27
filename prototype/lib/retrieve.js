// Country-, audience- and version-aware BM25 retrieval over policy sections.
// Eligibility filtering happens BEFORE ranking, so another country's policy or a
// superseded version can never be retrieved, however well it matches the words.
const { chunks } = require("./generated/corpus");

const STOP = new Set(
  "a an the is are was were be been am i me my we our you your it its of to in on for at by with from as and or but if do does did can could would should will shall what whats which who whom how when where why this that these those there here have has had any some much many more most per about into than then so not no yes please tell know need want get got give okay ok hi hello thanks thank also just".split(" ")
);

// Hinglish / Hindi and HR synonym expansion. Keys are matched on normalised tokens.
const SYNONYMS = {
  chutti: ["leave"], chhutti: ["leave"], chuttiyan: ["leave"], chhuttiyan: ["leave"], chhuti: ["leave"], chuti: ["leave"],
  छुट्टी: ["leave"], छुट्टियां: ["leave"], छुट्टियाँ: ["leave"], अवकाश: ["leave"],
  tankhwah: ["salary", "pay"], tankha: ["salary", "pay"], vetan: ["salary", "pay"], वेतन: ["salary", "pay"], तनख्वाह: ["salary", "pay"],
  bimar: ["sick"], bimari: ["sick"], बीमार: ["sick"],
  kitni: ["entitlement"], kitne: ["entitlement"], कितनी: ["entitlement"], कितने: ["entitlement"],
  agle: ["next"], saal: ["year"], साल: ["year"],
  le: [], ja: [], sakta: [], sakte: [], sakti: [], hai: [], hain: [], kya: [], ke: [], ki: [], ka: [], mein: [], main: [], mera: [], meri: [], mujhe: [], kab: ["date"], kaise: [],
  holiday: ["leave", "holiday"], holidays: ["leave", "holiday"], vacation: ["leave", "pto"], pto: ["pto", "leave"], annual: ["annual", "privilege"], al: ["annual", "leave"],
  "carry": ["carry", "carryover", "forward"], carryover: ["carry", "carryover", "forward"], rollover: ["carry", "carryover", "forward"], "roll": ["carry", "forward"],
  encash: ["encashment"], encashment: ["encashment"], cash: ["encashment"],
  salary: ["salary", "pay"], paid: ["pay"], payday: ["pay", "date"], wages: ["pay"],
  payslip: ["payslips"], payslips: ["payslips"], paystub: ["payslips", "statements"],
  maternity: ["maternity"], paternity: ["paternity", "partner"], parental: ["parental", "maternity", "paternity"], baby: ["parental", "maternity", "paternity", "birth"],
  hotel: ["hotel"], stay: ["hotel"], accommodation: ["hotel"], per: [], night: ["night"], diem: ["allowance", "meals"], meal: ["meal", "meals"], food: ["meal", "meals"],
  flight: ["air"], fly: ["air"], flying: ["air"], train: ["rail"], mileage: ["mileage"], km: ["conveyance"], cab: ["conveyance", "taxi"], uber: ["conveyance", "taxi"],
  insurance: ["insurance", "medical"], health: ["medical"], medical: ["medical"], mediclaim: ["medical", "insurance"], pension: ["pension"], "401k": ["401", "pension", "retirement"], "401": ["401", "pension", "retirement"], retirement: ["401", "pension"],
  often: ["schedule", "biweekly", "monthly"], frequency: ["schedule"], frequently: ["schedule"], schedule: ["schedule"],
  married: ["marriage", "life", "event"], marry: ["marriage", "life", "event"], wedding: ["marriage", "life", "event"], getting: [],
  eligible: ["eligible", "covered", "apply"], eligibility: ["eligible", "covered"],
  enrollment: ["enrollment", "enrolment"], enrolment: ["enrollment", "enrolment"], enroll: ["enrollment", "enrolment"], enrol: ["enrollment", "enrolment"], oe: ["open", "enrollment"],
  hsa: ["hsa"], fsa: ["fsa"], gym: ["wellness", "wellbeing"], wellness: ["wellness", "wellbeing"],
  tax: ["tax"], proof: ["proofs"], proofs: ["proofs"], hra: ["hra"], regime: ["regime"], form16: ["form", "16"],
  bereavement: ["bereavement", "compassionate"], funeral: ["bereavement", "compassionate"], sick: ["sick"], sickness: ["sick"], ill: ["sick"],
};

function stem(t) {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/401\(k\)/g, "401")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !STOP.has(t));
}

function expand(tokens) {
  const out = [];
  for (const t of tokens) {
    if (SYNONYMS[t]) out.push(...SYNONYMS[t]);
    else out.push(t);
  }
  return out.map(stem);
}

function isEligible(chunk, profile, today) {
  if (chunk.status !== "live") return false;
  if (chunk.effective_from && chunk.effective_from > today) return false;
  if (chunk.effective_to && chunk.effective_to < today) return false;
  if (chunk.country !== profile.country && chunk.country !== "GLOBAL") return false;
  if (chunk.audience === "all") return true;
  return chunk.audience === profile.employment_type;
}

// Pre-compute BM25 statistics per chunk (title + section title + text).
const DOCS = chunks.map((c) => {
  const toks = expand(tokenize(`${c.title} ${c.section_title} ${c.section_title} ${c.text}`));
  const tf = {};
  for (const t of toks) tf[t] = (tf[t] || 0) + 1;
  return { chunk: c, tf, len: toks.length };
});
const AVG = DOCS.reduce((s, d) => s + d.len, 0) / DOCS.length;
const DF = {};
for (const d of DOCS) for (const t of Object.keys(d.tf)) DF[t] = (DF[t] || 0) + 1;
const N = DOCS.length;

function bm25(queryTokens, d) {
  const k1 = 1.2, b = 0.75;
  let s = 0;
  for (const q of new Set(queryTokens)) {
    const f = d.tf[q];
    if (!f) continue;
    const idf = Math.log(1 + (N - DF[q] + 0.5) / (DF[q] + 0.5));
    s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / AVG)));
  }
  return s;
}

function retrieve(query, profile, { today, k = 5 } = {}) {
  const q = expand(tokenize(query));
  const eligible = DOCS.filter((d) => isEligible(d.chunk, profile, today));
  const excluded = DOCS.length - eligible.length;
  const scored = eligible
    .map((d) => ({ chunk: d.chunk, score: bm25(q, d) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return { results: scored.slice(0, k), queryTokens: q, eligibleCount: eligible.length, excludedCount: excluded };
}

// Two live versions of the same document (e.g. UK travel v4 and v5 during transition).
// Only counts when the top-ranked document itself has a second live version near the top.
function findVersionConflict(results) {
  if (!results.length) return null;
  const topDoc = results[0].chunk.doc_id;
  const byDoc = {};
  for (const r of results.filter((x) => x.chunk.doc_id === topDoc && x.score >= 0.6 * results[0].score)) {
    byDoc[r.chunk.doc_id] = byDoc[r.chunk.doc_id] || new Set();
    byDoc[r.chunk.doc_id].add(r.chunk.version);
  }
  const docId = Object.keys(byDoc).find((d) => byDoc[d].size > 1);
  if (!docId) return null;
  const versions = chunks.filter((c) => c.doc_id === docId && c.status === "live" && c.applies_when);
  const uniq = {};
  for (const v of versions) uniq[v.version] = v.applies_when;
  return { doc_id: docId, versions: Object.entries(uniq).map(([version, applies_when]) => ({ version, applies_when })) };
}

function sectionsFor(docId, version, sectionNo, profile, today) {
  return chunks.filter((c) => c.doc_id === docId && c.version === version && c.section === sectionNo && isEligible(c, profile, today));
}

module.exports = { retrieve, tokenize, expand, isEligible, findVersionConflict, sectionsFor };
