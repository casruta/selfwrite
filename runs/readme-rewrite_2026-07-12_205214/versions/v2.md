<p align="center">
  <img src="banner.png" alt="SELFWRITE" width="100%">
</p>

![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blue)

Selfwrite turns Claude Code into three time-boxed, self-correcting writing and research pipelines. One polishes prose, one produces cited academic research, and one builds investigations from public records. Each pipeline is a single prompt file backed by small deterministic Node validators, so no LLM (large language model) grades its own homework. The validators re-derive counts, similarity, and grade levels outside the model, and no API keys are required by default.

*A note on AI-text detectors: they evolve daily, and a whole paragraph can get flagged over one phrase that current models overuse. Swapping in two or three fitting synonyms is usually enough to break the pattern — and no, this note was not written by the product.*

## The three skills

### `/selfwrite` — prose polish

Point `/selfwrite` at any prose — an opinion column, a memo, a README — and give it a task description and a time budget. Budgets are written `Nm` or `Nh`, with a 10-minute floor. At intake the skill asks a few questions about audience, purpose, and register, then generates a scoring rubric. From there it iterates THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT until the budget runs out. A score agent with fresh context grades every revision. The loop keeps a version when its score improves and reverts one that slips, and every version stays on disk under `versions/`, so an aggressive edit can never destroy work. Simple-rewrite mode polishes what is already on the page, while deep-rewrite mode runs a research tree to surface missing evidence and counterarguments. Naming a publication voice at intake (Economist, Reuters, NYT News Analysis) loads a lexicon that constrains word choice and sentence rhythm. Budget 15 to 30 minutes for quick edits, 45 minutes to 2 hours for full rewrites, and 1 to 6 hours when the piece needs new evidence.

### `/selfresearch` — cited academic research

Give `/selfresearch` a research question and at least 15 minutes, and it returns a cited report. Depending on the budget, that can be an evidence brief, a focused review, or a full literature survey. The loop runs PLAN → ITERATE → SYNTHESIZE → VERIFY → SUMMARIZE across Semantic Scholar, OpenAlex, and arXiv, with an optional web backend. Every claim carries one of four tier tags. SRC marks a claim backed by one quote from one source, and SYN a conclusion drawn across several sources. INF flags a stated reasoning step, and UNV the rare claim no retrieved source could confirm. Each tag anchors to a quote extracted from a stored source. VERIFY completes only after every quote checks out as a verbatim substring of its source text, and a fabricated citation fails the run with no appeal. Plan on 20 to 30 minutes for an evidence brief and 30 to 60 for a focused report. A literature review takes one to two hours; an exhaustive survey takes longer.

### `/selfinvestigate` — thesis-driven investigation

The most demanding skill, `/selfinvestigate`, takes a thesis and a budget of at least 30 minutes, then works the claim through public records. It queries FEC and OpenSecrets for campaign finance, SEC EDGAR for corporate filings, and CourtListener for court records. The Wayback Machine recovers pages that have since disappeared, and academic plus web sources round out the pool. The loop runs SCOPE → QUESTION WEB → RESEARCH → CONNECT → WRITE. An optional `--stance` flag sets the direction: `prove` when you hold strong priors, `disprove` to stress-test the thesis, or the neutral default `investigate`. Stance changes how evidence is weighted during triage, never whether counter-queries run. Before WRITE, a mandatory thesis-assessment gate presents the evidence for and against the thesis and asks you to confirm the direction. That check keeps a `prove` stance from shipping a one-sided brief. Expect 45 to 60 minutes for a quick brief, one to two hours for a standard investigation, and two to four hours or more for deep work.

## Install and quick start

Copy the three skill prompts into your Claude Code skills directory, then install the validator dependencies:

```bash
mkdir -p ~/.claude/skills
cp selfwrite.md selfresearch.md selfinvestigate.md ~/.claude/skills/
npm install
```

The research skills read backend reference cards from `sources/` at runtime, so run them from this repo or copy `sources/` into your working project. Skills still function without the npm dependencies, though they fall back to less reliable model-interpreted checks. Verify the install by typing `/selfwrite`, `/selfresearch`, or `/selfinvestigate` in any Claude Code session. Then invoke a skill with a task and a time budget:

```
/selfwrite "tighten this opinion column on housing policy" 30m
/selfresearch "known failure modes of RLHF" 1h
/selfinvestigate "Donor networks shifted to Trump by 2020" 2h --stance=investigate
```

Each skill opens with a few intake questions before the loop starts. Concrete answers pay off: "skeptical CFO reading a one-pager" produces sharper output than "general audience". The loops are engineered to spend the whole budget, and a longer budget buys deeper work rather than a faster finish.

## Auditing runs

Every run writes to `runs/<skill>_<timestamp>/`: numbered drafts under `versions/`, a narrative `log.md`, a `results.tsv` ledger with one row per attempted iteration, and a distilled `skill.md`. The `run-integrity.mjs` script reconciles that ledger against the artifact on disk. Its sibling `verify-quotes.mjs` re-checks every stored quote, and `readability-check.mjs` enforces a grade-12 readability gate conditioned on audience. One command runs the whole battery and returns a single verdict:

```bash
node scripts/run-audit.mjs runs/<run-dir> --json   # ledger + quotes + readability + dupes
npm test                                           # validator suite; real runs/ are the fixtures
```

The `skill.md` distillate is worth keeping around. Install it as a skill of its own to carry the run's lessons forward:

```bash
cp runs/<run-id>/skill.md ~/.claude/skills/<domain>.md
```

## Optional MCP upgrades

MCP (Model Context Protocol) servers are opt-in upgrades, documented in `sources/mcp-backends.md`, and the no-key default survives them: nothing ships preconfigured. Exa or Tavily supplies research-grade web search to `/selfresearch` and `/selfinvestigate`, replacing the least reliable retrieval link. Zotero mirrors a run's sources into a citation library. When a server is absent, every skill degrades to its WebFetch reference card. The skills treat MCP output as untrusted external content, exactly as they treat any fetched web page.

## Requirements

Selfwrite needs the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) and, for the validators, Node.js 20 or newer. Dependencies stay limited to what `npm install` pulls in: YAML parsing for the kill list and the vitest suite.
