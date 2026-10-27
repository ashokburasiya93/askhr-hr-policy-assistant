// Deterministic safety triage. Runs before any model call and cannot be overridden by
// the model: if a rule says "hand off", the question goes to a person. Rules are kept
// deliberately broad - a false hand-off costs an HR partner a few minutes; a missed
// sensitive question costs an employee's trust.

const RULES = [
  {
    category: "crisis", route: "handoff", queue: "ER", priority: "P1",
    patterns: [/suicid/i, /kill myself/i, /end my life/i, /self[- ]?harm/i, /don'?t want to (live|be alive)/i, /want to die/i, /marna chahta/i, /jeena nahi/i],
  },
  {
    category: "harassment", route: "handoff", queue: "ER", priority: "P1",
    patterns: [/harass/i, /bully/i, /bullied/i, /sexual/i, /discriminat/i, /assault/i, /inappropriate(ly)? (touch|comment|behaviou?r)/i, /hostile/i, /\babus/i, /retaliat/i, /racis/i, /uncomfortable around/i, /उत्पीड़न/, /pareshan kar (raha|rahe|rahi)/i],
  },
  {
    category: "legal", route: "handoff", queue: "HR", priority: "P2",
    patterns: [/lawyer/i, /solicitor/i, /attorney/i, /\bsue\b/i, /suing/i, /tribunal/i, /legal advice/i, /\blegally\b/i, /is (it|this|that) (even )?legal/i, /\billegal\b/i, /my (legal |statutory )?rights/i, /labou?r (court|law)/i, /lawsuit/i, /settlement agreement/i, /constructive dismissal/i, /\bclaim against\b/i, /\bwhistleblow/i],
  },
  {
    category: "medical", route: "handoff", queue: "HR", priority: "P2",
    patterns: [/medical leave/i, /diagnos/i, /surgery/i, /operation on my/i, /cancer/i, /chemo/i, /depress/i, /anxiety/i, /mental health/i, /hospitali[sz]ed/i, /disabilit/i, /long[- ]term sick/i, /burn ?out/i, /\bterminal(ly)? ill/i, /miscarriage/i, /\bivf\b/i, /reasonable adjustment/i],
  },
  {
    category: "bereavement", route: "handoff", queue: "HR", priority: "P2",
    patterns: [/passed away/i, /\bdied\b/i, /\bdeath\b/i, /funeral/i, /bereave/i, /lost my (mother|father|mom|mum|dad|wife|husband|son|daughter|brother|sister|child|baby|grand)/i, /compassionate/i, /guzar ga/i, /dehant/i, /\bmaut\b/i, /निधन/],
  },
  {
    category: "layoff", route: "handoff", queue: "HR", priority: "P2",
    patterns: [/lay ?off/i, /laid off/i, /redundan/i, /retrench/i, /job cuts?/i, /restructur/i, /\bfired\b/i, /terminat(e|ed|ion) (me|my)/i, /severance/i, /losing my job/i, /nikal (diya|denge)/i],
  },
  {
    category: "performance", route: "handoff", queue: "HR", priority: "P3",
    patterns: [/performance improvement/i, /\bpip\b/i, /performance (review|rating|issue)/i, /appraisal/i, /underperform/i, /warning letter/i, /disciplinary/i, /\bpromotion\b/i, /\bhike\b/i, /pay rise/i, /\braise\b.*\b(salary|pay)\b/i],
  },
  {
    category: "resignation", route: "handoff", queue: "HR", priority: "P3",
    patterns: [/resign/i, /notice period/i, /\bquit(ting)?\b/i, /leaving the company/i, /relieving letter/i, /exit interview/i, /full and final/i, /इस्तीफ/, /istifa/i, /naukri chhod/i],
  },
  {
    category: "grievance", route: "handoff", queue: "ER", priority: "P2",
    patterns: [/grievance/i, /complain(t)? (about|against)/i, /unfair(ly)? treat/i, /treated unfairly/i, /my manager (is|keeps|has been|always|never)/i, /toxic/i],
  },
  {
    category: "payroll_issue", route: "payroll", queue: "PAYROLL", priority: "P2",
    patterns: [/not (been )?paid/i, /haven'?t (been )?paid/i, /(not|never) (received|got|credited).*(salary|pay)/i, /(salary|pay) (not|hasn'?t|has not|is not|isn'?t) (been )?(credited|received|paid|come)/i, /wrong (deduction|tax|salary|pay|amount)/i, /underpaid/i, /overpaid/i, /missing (pay|salary)/i, /(salary|pay|payslip) (is|looks) (wrong|less|incorrect)/i, /deducted (extra|more|wrongly)/i, /salary nahi aay/i, /tankhwah nahi/i],
  },
  {
    category: "others_data", route: "refuse", queue: null, priority: null,
    patterns: [/\b(ceo|cfo|colleague|co-?worker|someone else|another employee|other employees|my manager|my boss|team ?mate|everyone)('?s)? (salary|salaries|pay|bonus|address|phone|leave balance|rating|medical)/i, /\bhow much does (he|she|they|[A-Z][a-z]+) (earn|make|get paid)/i, /salary of (the )?(ceo|my manager|my colleague|[A-Z][a-z]+)/i],
  },
  {
    category: "non_hr_it", route: "redirect", queue: "IT", priority: "P4",
    patterns: [/laptop/i, /\bvpn\b/i, /password/i, /\blog ?in\b/i, /\bwi-?fi\b/i, /outlook/i, /email account/i, /\bjira\b/i, /github/i, /install (software|an app)/i, /\bmonitor\b/i, /keyboard/i, /access to (the )?(system|tool|application|repo|drive|sharepoint)/i, /mfa|2fa|authenticator/i],
  },
];

const FLAGS = [
  { flag: "commitment_bait", patterns: [/\bconfirm\b/i, /guarantee/i, /\bpromise/i, /in writing/i, /\bassure/i, /the bot said/i, /you (said|told me)/i, /so i (will|am going to) get/i, /\bentitled to\b.*\?/i] },
  { flag: "personal_data_request", patterns: [/my (leave|pto|holiday) balance/i, /how many (days|hours).*(do i have|i have|left|remaining)/i, /\bremaining (leave|pto|holiday)/i, /\bmy balance\b/i, /kitni (chutti|chhutti) bachi/i, /my (current )?(benefits )?plan\b/i] },
  { flag: "prompt_injection", patterns: [/ignore (all |any |the )?(previous|prior|above|earlier)? ?(instructions|rules)/i, /system prompt/i, /developer mode/i, /jailbreak/i, /pretend (you|to be)/i, /you are now/i, /act as (a|an|my)/i, /reveal (your|the) (prompt|instructions)/i, /disregard/i, /answer as if/i] },
];

// Personal data that must not be stored in logs or analytics.
const REDACTIONS = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[PAN]"],
  [/\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi, "[NI number]"],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[ID number]"],
  [/(\+?\d[\d\s-]{8,}\d)/g, "[phone]"],
  [/\b(cancer|chemo\w*|depress\w*|anxiety|diagnos\w*|surgery|pregnan\w*|miscarriage|ivf|hiv|diabet\w*|disabilit\w*|mental health|therapy|medication|hospitali[sz]ed)\b/gi, "[health detail]"],
];

function redact(text) {
  let t = text || "";
  for (const [re, rep] of REDACTIONS) t = t.replace(re, rep);
  return t;
}

function detectLanguage(text) {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const hinglish = /\b(kya|kitni|kitne|chutti|chhutti|chuttiyan|hai|hain|mujhe|mera|meri|kab|kaise|sakta|sakti|nahi|agle|saal|bachi|tankhwah|batao|bataiye)\b/i;
  return hinglish.test(text) ? "hi-en" : "en";
}

function triage(question) {
  const matched = [];
  for (const r of RULES) {
    const hit = r.patterns.find((p) => p.test(question));
    if (hit) matched.push({ ...r, matched: String(hit) });
  }
  const flags = FLAGS.filter((f) => f.patterns.some((p) => p.test(question))).map((f) => f.flag);
  const primary = matched[0] || null; // RULES are ordered by severity
  return {
    route: primary ? primary.route : "answer",
    category: primary ? primary.category : "policy",
    queue: primary ? primary.queue : null,
    priority: primary ? primary.priority : null,
    matched_rules: matched.map((m) => m.category),
    flags,
    language: detectLanguage(question),
    redacted_question: redact(question),
  };
}

module.exports = { triage, redact, detectLanguage };
