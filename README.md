<p align="center">
  <img src="banner.png" alt="SELFWRITE" width="100%">
</p>

![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blue)

Four Claude Code skills for writing, research, investigation, and distribution. Each one runs a time-boxed, multi-agent pipeline that produces a sourced, cited, natural-sounding artifact. No API keys required for any of them (except whatever you already have for the backends they query).

#### note: AI-text detectors evolve daily. Entire paragraphs sometimes get flagged because of a phrase currently over-used by various models. Finding 2-3 fitting synonyms is usually enough to break the pattern (and no, this paragraph was not written by this product).

## What's in the box

| Command | Purpose |
|---|---|
| [`/selfwrite`](#selfwrite--prose-polish) | Rewrite prose through an iteration loop until it reads natural and passes AI detectors |
| [`/selfresearch`](#selfresearch--cited-academic-research) | Time-boxed academic research pipeline that returns a cited literature review |
| [`/selfinvestigate`](#selfinvestigate--thesis-driven-investigation) | Thesis-driven investigative pipeline across FEC, SEC, court, and news records |
| [`/selfpost`](#selfpost--twitterx-posting) | Browser-driven Twitter/X posting via the Claude for Chrome extension |

## Install

```bash
mkdir -p ~/.claude/skills
cp selfwrite.md selfresearch.md selfinvestigate.md selfpost.md ~/.claude/skills/
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). Verify with `/selfwrite`, `/selfresearch`, `/selfinvestigate`, or `/selfpost` in any project.

**Backend reference cards** (`sources/*.md`) are read at runtime by `/selfresearch` and `/selfinvestigate`. Either invoke the skills from this repo or copy `sources/` into whichever project you're working in.

**Node helpers** for `/selfpost`:

```bash
npm install      # deterministic char counting, queue CLI, preflight
npm test         # runs the validators vitest suite
```

The skill runs without them but falls back to less-reliable Claude-interpreted logic.

## Usage

### `/selfwrite` (prose polish)

```
/selfwrite "task description" <duration>
```

Duration is `Nm` or `Nh`, minimum 10m. Examples:

```
/selfwrite "tighten this opinion column on housing policy" 20m
/selfwrite "rewrite the README as a summary of this analysis" 45m
/selfwrite "upgrade writing.md to NYT journalist quality" 6h
```

Selfwrite picks up your audience, purpose, register, and tone at intake, then iterates THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT until convergence. Every version is kept. Revisions that damage more than they improve revert automatically. Simple-rewrite mode polishes what's there; deep-rewrite mode runs a research tree to surface missing evidence.

| Task | Budget |
|---|---|
| Quick edits (tighten a column, polish a README) | 15-30m |
| Full rewrites (reports, memos, skill files) | 45m-2h |
| Deep research rewrites (add evidence, counterarguments) | 1-6h |

### `/selfresearch` (cited academic research)

```
/selfresearch "research question" <duration>
```

Duration is `Nm` or `Nh`, minimum 15m. Examples:

```
/selfresearch "known failure modes of RLHF" 30m
/selfresearch "effects of SNAP benefits on food insecurity" 1h
/selfresearch "EU AI Act compliance pathways for US firms" 2h
```

Queries Semantic Scholar, OpenAlex, arXiv, and (optionally) web. Runs PLAN → ITERATE → SYNTHESIZE → VERIFY → SUMMARIZE. Every claim carries a four-tier tag (SRC, SYN, INF, UNV) anchored to a specific extracted quote. The verifier confirms each tag before `report.md` is released.

| Output | Budget |
|---|---|
| Evidence brief (1000-2000 words) | 20-30m |
| Focused report (2000-4000 words) | 30-60m |
| Literature review (3000-6000 words) | 1-2h |
| Exhaustive survey | 2h+ |

### `/selfinvestigate` (thesis-driven investigation)

```
/selfinvestigate "thesis" <duration> [--stance=prove|disprove|investigate]
```

Duration is `Nm` or `Nh`, minimum 30m. Default stance: `investigate` (neutral). Examples:

```
/selfinvestigate "Donor networks shifted to funding Trump by 2020" 2h
/selfinvestigate "Company X's compliance failures were known at the board level" 90m --stance=prove
/selfinvestigate "The regulatory-capture narrative at Agency Y is overstated" 3h --stance=disprove
```

Queries FEC, OpenSecrets, SEC EDGAR, CourtListener, Wayback Machine, plus academic and web sources. Runs SCOPE → QUESTION WEB → RESEARCH → CONNECT → WRITE. A mandatory thesis-assessment user gate fires before writing, so `prove` can't produce a one-sided brief without the honest evidence moment.

| Output | Budget |
|---|---|
| Quick investigative brief | 45-60m |
| Standard investigation (3000-5000 words) | 1-2h |
| Deep investigation (5000-8000 words) | 2-4h |
| Book-chapter scope | 4h+ |

Stance quickguide: `investigate` for a neutral read, `prove` when you have strong priors and want efficient consolidation of supporting evidence, `disprove` to stress-test the thesis by hunting counter-evidence.

### `/selfpost` (Twitter/X posting)

```
/selfpost new "topic" [tweet|thread]
/selfpost list
/selfpost run [--unattended]
/selfpost show <id>
/selfpost cancel <id>
```

Examples:

```
/selfpost new "why small models win at tight tasks"
/selfpost new "the 2026 state of personal AI tooling" thread
/selfpost list
/selfpost run
```

`new` drafts a tweet or thread and saves it to `queue/twitter/<id>.md` with `status: draft`. You review the file, flip to `status: ready`, then `/selfpost run` posts flagged items via your logged-in Chrome browser. Up to 5 posts per run, 30-120s jitter between, 10-per-24-hours rolling cap. Session expiry, CAPTCHA, and rate limits all stop the run and mark the item `failed` with the error.

**Requirements:**
- [Claude for Chrome](https://claude.com/chrome) extension installed and connected
- A Chrome profile logged into `x.com`
- Node.js 20+ (for the helpers)
- No Twitter API key, no OAuth, no scheduler

Two posting tiers:
1. **Tier 1 (default):** Interactive Chrome MCP. Two gates per tweet: an in-chat 'send' confirm and the Chrome extension's own Post-button approval. Use when you're at the keyboard.
2. **Tier 2 (opt-in via `--unattended`):** Playwright on a persistent profile. No gates. Use for scheduled or batch posting when you've manually logged the profile in once. Requires `npx playwright install chromium chromium-headless-shell`.

## Shared patterns

All four skills write to `runs/<skill>_<timestamp>/` with versioned outputs, a structured log, and a distilled `skill.md`. Install the distillate to carry learnings into future runs:

```bash
cp runs/<run-id>/skill.md ~/.claude/skills/<domain>.md
```

Tips that apply to all four:

- **Answer intake questions concretely.** "Skeptical CFO reading a one-pager" yields precise output; "general audience" yields vague output.
- **Name a publication voice** at `/selfwrite` intake (Economist, Reuters, NYT News Analysis). Loads a lexicon that constrains word choice and sentence rhythm.
- **Pick `/selfinvestigate` stance deliberately.** Neutral is the default; `prove` and `disprove` change how the reflector and wave-search weight evidence, not whether counter-queries run.
- **Use the full time budget.** The skills are engineered to keep going until the deadline. Longer budgets produce deeper output.

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- For `/selfpost`: [Claude for Chrome](https://claude.com/chrome) extension, Chrome profile logged into x.com, Node.js 20+
