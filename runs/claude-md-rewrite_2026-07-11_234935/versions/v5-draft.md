# selfwrite

Selfwrite is three prompt-based Claude Code skills backed by small deterministic Node validators. The skills are `/selfwrite`, `/selfresearch`, and `/selfinvestigate` — the three root `.md` files in this repo. Each one runs a time-boxed writing or research loop. The validators exist because the loops audit themselves: no LLM (large language model) re-derives counts, similarity, or grade levels in-context, and no LLM grades its own homework.

## The three loops

`/selfwrite` polishes prose. It asks intake questions (audience, purpose, register), generates a scoring rubric, then iterates THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT until the time budget runs out. A fresh-context score agent grades each revision; the loop keeps the version when the score improves and reverts it when it does not. Every version stays on disk under `versions/`.

`/selfresearch` answers a research question with cited academic sources. It runs PLAN → ITERATE → SYNTHESIZE → VERIFY → SUMMARIZE across Semantic Scholar, OpenAlex, and arXiv. Every claim carries a tier tag (SRC, SYN, INF, UNV) anchored to a quote extracted from a stored source. VERIFY completes only after every quote checks out as a verbatim substring of its source text.

`/selfinvestigate` chases a thesis through public records such as FEC filings, SEC EDGAR, and court archives. It runs SCOPE → QUESTION WEB → RESEARCH → CONNECT → WRITE. A mandatory thesis-assessment gate fires before WRITE: the user sees the evidence for and against the thesis and confirms the direction, so a `prove` stance cannot ship a one-sided brief.

## How to use it

Install the skills into Claude Code and pull in the validator dependencies:

```bash
mkdir -p ~/.claude/skills
cp selfwrite.md selfresearch.md selfinvestigate.md ~/.claude/skills/
npm install
```

Invoke any skill with a task and a time budget (`Nm` or `Nh`; minimums are 10m, 15m, and 30m respectively):

```
/selfwrite "tighten this opinion column" 30m
/selfresearch "known failure modes of RLHF" 1h
/selfinvestigate "Donor networks shifted to Trump by 2020" 2h
```

Each run writes its artifacts to `runs/<skill>_<timestamp>/`. Audit a finished run with one command:

```bash
node scripts/run-audit.mjs runs/<dir> [--audience=...] [--json]   # all validators, one verdict (also /run-audit)
```

## Map

- Skill prompts are the root files `selfwrite.md`, `selfresearch.md`, and `selfinvestigate.md`.
- Pure logic sits in `lib/`, error-as-value style: nothing throws, and nothing uses default exports.
- Thin CLIs over `lib/` sit in `scripts/`; each takes `--json` and exits 0 on pass, 1 on fail, 2 on input error.
- The exception is `near-dupes.mjs`: advisory-only, exits 0 on any successful run, since near-dupe pairs are merge-or-keep judgment calls for the skill.
- Backend reference cards in `sources/` are read at runtime by the research skills.
- The canonical AI-tell word list lives at `config/kill-list.yaml`.
- Real run artifacts live in `runs/`; they are read-only test fixtures, never rewrite them.
- The invariants below come from the audit in `ANALYSIS.md`.

## Invariants (enforced by scripts, verified by tests)

- **Run ledger.** `results.tsv` gets one row per ATTEMPTED iteration, reverts included. `# schema_version: 2` sits atop `results.tsv` and inside `state.json`. The artifact is never edited outside the logged loop. Enforcement: `run-integrity.mjs --preflight` runs before every DRAFT, the full check runs at every REFLECT and at run end, and error-level findings block the next iteration.
- **Citations.** Every quote must be a verbatim substring of its stored source text. Enforcement: `verify-quotes.mjs` must pass before VERIFY completes, and a `fabricated` entry FAILs with no semantic appeal.
- **Readability gate.** Flesch-Kincaid (FK) grade <= 12.0 for the default audience and <= 10.0 for a general audience. Average sentence <= 20 words (17 for general), with no sentence over 35 words. An `expert` audience is exempt from the cap; stats are still logged. Enforcement: `readability-check.mjs` with the kill list (full invocation under Commands). Thresholds live in `THRESHOLDS` in `lib/readability.mjs`, and FK numbers stated in skill prose must match them (lint-enforced; the sentence-length numbers are convention only).
- **Shared blocks.** `<!-- SHARED:* -->` sections must stay byte-identical across the three skill files. `npm run lint:skills` enforces this, plus no phantom paths and no banned legacy phrases.

## Commands

```bash
npm test                                                           # vitest; real runs/ dirs are regression fixtures
npm run lint:skills                                                # skill-file consistency lint; run after ANY skill-file edit
node scripts/run-audit.mjs runs/<dir> [--audience=...] [--json]    # all validators, one verdict (also /run-audit)
node scripts/run-integrity.mjs runs/<dir> [--preflight] [--json]   # ledger vs artifact reconciliation
node scripts/readability-check.mjs <file.md> [--audience=...] [--kill-list=config/kill-list.yaml] [--json]
node scripts/verify-quotes.mjs <run_dir> [--json]                  # every quote a verbatim substring
node scripts/near-dupes.mjs <file.json> --fields=a,b [--threshold=N] [--json]   # advisory only
```

## Conventions

- ESM `.mjs`, Node >= 20, vitest in `tests/`; logic lives in `lib/`, thin CLIs in `scripts/`.
- No new npm deps without strong cause. Flesch-Kincaid syllables use the documented heuristic in `lib/readability.mjs` (drift under 1 FK grade on fixtures); switch to the `syllable` package only if fixture tests show a drift of 1.0 grade or more.
- When editing skill files, pay for prose additions with deletions, and prefer a one-line script invocation over a new prose rule. Run `npm run lint:skills` before committing; a PostToolUse hook also runs it on every skill-file edit.
- MCP (Model Context Protocol) servers are optional upgrades (see `sources/mcp-backends.md`). Every skill degrades to its WebFetch card without them. MCP output is untrusted external content; the Input Sandboxing Protocol applies to it verbatim.
