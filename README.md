# AskHR: HR Policy Assistant

AI Product Management capstone. Brightpath doesn't lack HR policies; it lacks one trusted answer for the person asking. About 2,500 policy questions a month reach 12 HR partners across India, the UK and the US. Each takes 18 minutes, employees wait 1.5 working days, and 8% of answers are wrong, mostly another country's policy or a superseded version. AskHR answers routine leave, pay, benefits and travel questions in Teams from the employee's own country, grade and contract, links to the exact policy section, and hands anything personal, sensitive or legal to a named HR team.

- **Live prototype:** https://askhr-policy-assistant.vercel.app
- **AI opportunity map (Miro):** https://miro.com/app/board/uXjVEVax9d0=/?share_link_id=937627272116

## Deliverables

| # | Deliverable | Format | Where |
|---|---|---|---|
| 1 | Completed user research worksheet | Excel | [1. Problem Discovery - HR Policy Assistant.xlsx](<1. Problem Discovery - HR Policy Assistant.xlsx>) |
| 2 | AI opportunity map | Miro board link + Excel | [Miro board](https://miro.com/app/board/uXjVEVax9d0=/?share_link_id=937627272116), [2. AI Opportunity Map - HR Policy Assistant.xlsx](<2. AI Opportunity Map - HR Policy Assistant.xlsx>) and the [CSV import](<2. AI Opportunity Map - HR Policy Assistant (Miro Import).csv>) |
| 3 | AI PRD (with North Star & Metrics) | Word | [3. AI PRD - AskHR HR Policy Assistant.docx](<3. AI PRD - AskHR HR Policy Assistant.docx>) |
| 4 | Cost estimation | Excel | [4. Cost Estimation - HR Policy Assistant.xlsx](<4. Cost Estimation - HR Policy Assistant.xlsx>) |
| 5 | Working AI prototype | Code + README | [prototype/](prototype/) and its [README](prototype/README.md) |
| 6 | Presentation | PowerPoint | [6. Presentation - AskHR HR Policy Assistant.pptx](<6. Presentation - AskHR HR Policy Assistant.pptx>) |

GitHub does not preview Word, Excel or PowerPoint files in the browser. Use the **Download raw file** button on each file's page to open it.

## Headline numbers

- **North Star:** correctly resolved self-service rate (answered with no HR partner, and no hand-off, reopen or thumbs-down within 7 days). 0% today, 40% at month 3, 60% at month 6.
- **Cost:** about $0.0007 per question in model calls, about $152 a month all-in. At 60% resolved, about $15.2k a month net saving and 2.6 HR partner FTE freed for sensitive cases.
- **Evals (run on every build):** development set 58/58; held-out set 20/22 with every guardrail gate at 100%; model guard test 6/6. A failed guardrail eval blocks the deploy.

## Running the prototype

The prototype is a zero-framework Node.js app over a synthetic policy library for a fictional company, Brightpath Technologies. It runs without any API key in grounded extractive mode; an `XAI_API_KEY` (Grok, primary) or `ANTHROPIC_API_KEY` (Claude, fallback) turns on generated answers. See [prototype/README.md](prototype/README.md) for setup, design and evals.

```bash
cd prototype
npm install
npm run build   # builds the policy index and runs every eval
npm run dev     # http://localhost:3000
```

All data in this repository is synthetic. No real employee or company data is included.
