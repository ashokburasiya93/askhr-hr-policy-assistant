# AskHR: HR Policy Assistant (prototype)

AskHR answers employee HR policy questions (leave, pay dates, benefits, travel) from the **right country's live policy**, with a link to the exact section, and hands anything personal, sensitive or legal to a named HR team with a short summary. It is the Step 5 prototype for the HR Policy Assistant brief; the PRD (Step 3) is the spec it implements.

**Live demo:** https://askhr-policy-assistant.vercel.app (Vercel free tier, grounded extractive mode).

Everything here runs on **synthetic data** for a fictional company, Brightpath Technologies.

## Run it

Requirements: Node.js 18 or later.

```bash
npm install
npm run build     # builds the policy index and runs every eval; fails if a guardrail eval fails
npm run dev       # http://localhost:3000
```

Without any API key the app runs in **grounded extractive mode**: it quotes the matching policy text (personalised to grade or length of service) and never calls a model. To turn on generated answers, set one or both keys:

| Variable | Purpose |
|---|---|
| `XAI_API_KEY` | Primary model: xAI Grok (`XAI_MODEL`, default `grok-4-fast-non-reasoning`) |
| `ANTHROPIC_API_KEY` | Fallback model: Claude (`CLAUDE_MODEL`, default `claude-haiku-5-5`) |
| `DEMO_TODAY` | The date the policy library is evaluated on (default `2026-10-27`) |

Ask one question from the terminal: `node scripts/try.js E3001 "What is the hotel limit in London?"`

### Deploy to Vercel (free tier)

The repo deploys as-is: static UI in `public/`, serverless functions in `api/`, and `vercel.json` runs `npm run build`, so a failing guardrail eval blocks the deploy. Add the API keys as Vercel environment variables to enable model mode.

## How it works

```
Employee message (Teams)
  -> 1. Profile: country, grade, employment type, service from Workday (never from the chat)
  -> 2. Safety triage (rules, before any AI): crisis, harassment, grievance, bereavement, medical,
        layoff, performance, resignation, legal, pay problem, IT, other people's data
        -> hand-off ticket to the right HR queue (Employee Relations items are restricted), no AI call
  -> 3. Scope: question about another country's policy -> say so, offer HR partner
  -> 4. Retrieval: only sections that are live today, for the employee's country (+ global) and
        employment type; superseded versions are removed BEFORE ranking (BM25 + Hindi/Hinglish synonyms)
        -> nothing relevant found: say so, offer HR partner, never guess
  -> 5. Answer: Grok (fallback Claude) writes a short answer as JSON with section citations,
        or grounded extraction when no model is configured
  -> 6. Verification: cites >= 1 retrieved section; only cites retrieved sections; every number appears
        in a cited section; no promise; no legal advice. Any failure -> fall back to the extractive answer
  -> 7. Non-commitment wording Legal asked for (+ "your contract applies" for UK), Workday pointer for balances
```

Design decisions worth defending:

- **Filter first, then rank.** The audit found 8% of answers were wrong, mostly from another country's policy or an old version. Eligibility (country, audience, live today) is a hard filter in code, not something the model is asked to respect.
- **Sensitive questions never reach the model.** The rules are deliberately broad: a false hand-off costs a few HR minutes; a missed one costs trust. It also means the most sensitive text is never sent to any AI provider.
- **The employee approves the hand-off** ("Send to HR"), sees who can read it, and can choose the anonymous Speak Up line instead. Crisis messages are sent immediately.
- **Two live versions are shown side by side** with when each applies (UK travel v4 and v5 during the transition), instead of guessing.
- **Personal data is minimised.** Logs and ticket summaries strip emails, phone numbers, PAN, NI and SSN numbers and health terms.
- **Leave balance lookup is Phase 2.** V1 answers the policy part and points to Workday > Time Off.

## The screens

| Tab | What it shows |
|---|---|
| Employee chat | Pick one of 8 employees (simulated Teams sign-in). Suggested questions cover each scenario. The right panel shows "why this answer": profile used, triage, what was searched and filtered out, the sources, every check, and what was logged. |
| HR partner queue | Tickets the employee chose to send, with priority, SLA, visibility and the summary the HR partner receives. Stored in the browser for the prototype. |
| Policy library | All 16 documents with owner, version, effective dates and status today (live, transition, superseded). |
| Quality checks | Results of the launch evals on the development and held-out sets. |

## Evals (`npm run build`)

| Suite | Cases | Result (extractive mode) |
|---|---|---|
| Development set `eval/questions.json` | 58 | 58/58; all 8 metrics at 100% |
| Held-out set `eval/holdout.json` (written after tuning; not tuned on, apart from one sentence-splitting bug it exposed) | 22 | 20/22; all 5 guardrail gates at 100% |
| Model guard test `eval/model-guard-test.js` (fake model replies) | 6 | 6/6: invented number, promise, superseded or other-country citation, and uncited answers are all blocked |

The two held-out misses are honest limits of extractive mode: it cut the contractor answer before the "contact your agency" sentence, and it matched "What is the company's stock price target?" to a travel booking section instead of saying "not found". Both are quality misses, not safety failures, and they are the reason model mode exists. Run `node eval/run-eval.js --model` with a key to score model mode.

Hard gates (build fails below 100%): sensitive questions handed off, own-country citations only, no superseded versions, grounding checks, sensitive text never sent to a model and identifiers removed from logs.

## Dataset (synthetic, created for this prototype)

No dataset came with the brief, so the following was created and is documented here as the guidelines require:

- `data/policies/`: 16 policy documents, 93 sections. India, UK and US versions of leave, pay and tax, benefits, and travel; global contractor terms and Dignity at Work. Deliberate imperfections from the brief: a **superseded** India leave policy (v3.1: 45-day carry-forward, 5-day paternity) next to the live v3.2 (30 days, 10 days); **two live UK travel versions** during a transition; a **scanned PDF** (India benefits, OCR text); key rules **in tables** keyed by grade or length of service; client-specific travel rules referenced but held by project managers.
- `data/meta/employees.json`: 8 Workday-style profiles across the 3 countries, grades G2 to G6, 2 contractors, 1 Hindi/English speaker.
- `data/meta/routing.json`: HR, Payroll, Employee Relations and contractor queues with SLAs, plus emergency lines per country.
- `eval/`: 80 labelled questions including Hindi and Hinglish, sensitive, legal, pay problems, IT, commitment-bait ("confirm I get 10 more days"), prompt injection, other-country, contractor and personal-data cases.

## Files

```
api/            ask.js, meta.js, handoff.js (Vercel functions)
lib/            assistant.js (orchestration), triage.js (safety rules + redaction),
                retrieve.js (eligibility filter + BM25), llm.js (Grok primary, Claude fallback)
lib/generated/  corpus.js (built from data/ by scripts/build-corpus.js)
public/         index.html, app.js, styles.css, eval results
eval/           question sets, eval runner, model guard test
server.js       local dev server
```

## Known limits of the prototype

- Workday, SharePoint, ServiceNow and Teams are simulated. Tickets live in the browser only.
- Retrieval is keyword-based (BM25 with synonyms). Production would add embeddings for paraphrases and an OCR review step for scanned PDFs.
- The Hindi experience in extractive mode is a Hinglish lead line plus English policy text; full Hindi answers need model mode.
- Rules-based triage will over-trigger on some words (for example "promotion"). That trade-off is intentional; the hand-off rate is tracked as a metric.
