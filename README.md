<p align="center">
  <img src="banner.png" alt="SELFWRITE" width="100%">
</p>

![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blue)

A Claude Code skill that polishes up the writing making it indistunguishable from human-written content by applying various linguistic, structural, and grammatical principles (and no, this segment was not written by this product). 

The skill is supposed to supplement dense, data-heavy text whilst utilizing point-first paragraph structure to optimize for maximum context and explanatory value while inserting minor fluff here and there to bamboozle the AI text detectors. 

#### note: AI-text detectors are evolving daily. At times, entire paragraphs get flagged as AI-generated due to a phrase thats currently over-used by various text models. Finding 2-3 fitting synonyms is generally enough to confuse the AI-detection tool. 

> This repo also ships three sibling skills: **`/selfresearch`** (cited academic research), **`/selfinvestigate`** (thesis-driven investigation), and **`/selfpost`** (browser-driven Twitter posting via the Claude for Chrome extension). Jump to [Siblings](#siblings) for install and usage. The first two share infrastructure with selfwrite (voice register, lexicon, `runs/` convention, four-tier citation verifier) but run their own pipelines; `/selfpost` is a distribution layer that turns short-form output into queued, human-approved posts.

## How to install it 

```bash
mkdir -p ~/.claude/skills
cp selfwrite.md selfresearch.md selfinvestigate.md selfpost.md ~/.claude/skills/
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). `/selfwrite`, `/selfresearch`, and `/selfinvestigate` have no other dependencies.

**`/selfpost` only.** If you plan to use `/selfpost`, also run `npm install` at the repo root to pull in its Node helpers (validators library, queue CLI, preflight). The skill works without them but falls back to less-reliable Claude-interpreted logic; the helpers give you deterministic char counting, duplicate detection, and selector-config validation.

```bash
npm install      # optional, only needed for /selfpost
npm test         # optional, runs the validators vitest suite
```

`/selfresearch` and `/selfinvestigate` read backend reference cards from `sources/*.md` and `sources/investigative/*.md` at runtime, resolved relative to your current working directory. `/selfpost` reads `config/selectors.twitter.yaml` and writes to `queue/twitter/` the same way. Either run the skills from this repo, or copy the relevant directories into whatever project you invoke them from.

Verify by running `/selfwrite`, `/selfresearch`, `/selfinvestigate`, or `/selfpost` in any project.

## How to use it 

```
/selfwrite "task description" <duration>
```

Duration uses `Nm` or `Nh` format. Minimum 10 minutes.

```
/selfwrite "tighten this opinion column on housing policy" 20m
/selfwrite "rewrite the README as a summary of this analysis" 45m
/selfwrite "upgrade writing.md to NYT journalist quality" 6h
```

**Recommended budgets:**

| Task | Budget |
|------|--------|
| Quick edits (tighten a column, polish a README) | 15-30m |
| Full rewrites (reports, memos, skill files) | 45m-2h |
| Deep research rewrites (add evidence, counterarguments) | 1-6h |

## Modes

Selfwrite asks which mode you want at the start of each run.

| | Simple Rewrite | Deep Rewrite |
|---|---|---|
| **Focus** | Style, structure, prose quality | All of simple, plus substance |
| **New content** | No. Works only with what's there | Yes. Surfaces missing context, counterarguments, evidence gaps |
| **User approval** | Not needed | Required before any new content is added |
| **Best for** | Drafts that need polish | Drafts that need both polish and substance |

## The Loop

Selfwrite opens with an intake: questions about your audience, purpose, genre, and tone. Your answers shape a scoring rubric with 4-6 weighted dimensions (each scored 1-10). The baseline is anchored at 4-6 by design, so scores have room to climb.

Before the first draft, selfwrite runs **Prompt Decomposition** — an agentic intake workflow modeled on IBM's Plan → Act → Observe → Adjust pattern. Your request is classified (analytical / creative / code / research / compound / ambiguous) and broken into a chain of 3-6 smaller sub-prompts that execute in order. Each sub-prompt inherits context from the prior one; the chain's final step synthesizes the outputs into v0, the baseline for the loop. You see the chain before it runs and can edit any step, or skip decomposition entirely. The goal is to replace the black-box "generate a draft" step with a transparent, editable plan that you can course-correct mid-run. Decomposition is skipped on budgets under 15 minutes. See `decomposition.md` in any run directory for the full chain and per-step outputs.

Then the loop begins:

```
       ┌──────────────────────────────────────────────────┐
       │                                                  │
       ▼                                                  │
  ┌─────────┐                                             │
  │  THINK  │  Read history, analyze, form hypothesis     │
  └────┬────┘                                             │
       │                                                  │
       ▼                                                  │
  ┌─────────┐                                             │
  │  DRAFT  │  Apply THINK insights, produce candidate    │
  └────┬────┘                                             │
       │                                                  │
       ▼                                                  │
  ┌──────────┐  ┌──────────┐                              │
  │  READER  │  │  VOICE   │  (parallel)                  │
  │  AGENT   │  │ AUDITOR  │                              │
  └────┬─────┘  └────┬─────┘                              │
       │             │                                    │
       ▼             ▼                                    │
  ┌──────────────────────────────────────┐                │
  │  REVISE  │  Incorporate annotations  │                │
  └────┬─────────────────────────────────┘                │
       │                                                  │
       ▼                                                  │
  ┌─────────┐                                             │
  │  SCORE  │  Adversarial Scoring Protocol               │
  └────┬────┘                                             │
       │                                                  │
       ▼                                                  │
  ┌─────────┐                                             │
  │ REFLECT │  Log result, check convergence signals      │
  └────┬────┘                                             │
       │                                                  │
       └──────────────────────────────────────────────────┘
```

Each step targets the weakest dimension:

- **THINK**: Identify the lowest-scoring dimension, adopt an expert persona, ask 2-3 questions that reference specific content, form a testable hypothesis
- **DRAFT**: Apply focused changes to test the hypothesis (not a wholesale rewrite)
- **REVIEW**: Two separate agents evaluate the draft in parallel (see [Review Agents](#review-agents))
- **REVISE**: Fold in agent annotations, triaging by severity
- **SCORE**: Adversarial scoring with 8 safeguards (see [Scoring](#scoring))
- **REFLECT**: Log the result, check for convergence or plateau, adjust strategy

Every version is kept. If a revision damages more than it improves, the loop reverts and tries a different angle.

In deep-rewrite mode, each iteration also runs a **query-decomposition research tree**. Gap Analysis identifies up to three substantive gaps, each spawns three level-1 sub-questions (factual, adversarial, contextual), and nodes expand only when the search result passes a mechanical 2-of-3 delta test (new entity, new number, or new source class). The tree defaults to depth 4 and reaches depths 5–6 only when a contradiction is found. A **Dependency Verifier** subagent runs on the deepest nodes and labels each finding as `surface-always`, `surface-if-draft-contains-X`, or `log-only` — so deep context only reaches the user when the current draft actually needs it. Everything is logged with auditable delta trails in `research/findings.md`.

Once all dimensions reach 7+ and gains stall, the loop shifts into the **Breakthrough Protocol**: reading as a skeptical member of the target audience, testing alternative document structures, and applying hard constraints (cut 30% of word count, rewrite the opening three ways, remove all hedging). These push past the plateau where incremental edits stop helping.

After the loop exits, a **Clean Slate Review** runs. A separate agent with zero context reads the final text cold and flags anything unclear, unsupported, or confusing to a first-time reader. Every question that agent raises gets resolved by editing the text before the run ends.

## Review Agents

Four agents review the text across three phases:

| Agent | Phase | What it catches |
|-------|-------|----------------|
| **Reader Agent** | Every iteration | Engagement drops, comprehension failures, too many technical terms in one sentence, references that force the reader to scroll back |
| **Voice Auditor** | Every iteration | AI-tell patterns, sentence template repetition, rhythm monotony, overuse of the same transition words, formality-level drift from the target register, words that appear in the active lexicon's avoided vocabulary |
| **Dependency Verifier** | RESEARCH, deep rewrite only | Reads cold. Labels each deep-tree (depth ≥ 4) research finding as `surface-always`, `surface-if-draft-contains-X`, or `log-only`, so deep context only reaches the user when the current draft actually depends on it |
| **Clean Slate Agent** | Once, after loop | Reads final text with zero context; flags anything unclear, unsupported, contradictory, or confusing to a first-time reader |

The per-cycle agents launch fresh each cycle with no memory of prior runs, so blind spots don't accumulate. Short budgets trigger automatic scaling: under 15 minutes, only the Voice Auditor runs; under 10, neither per-cycle agent runs and the coordinator does its own pass. The Clean Slate Agent always runs.

Word choice is not a separate review pass. The coordinator handles word-level substitution directly during REVISE, guided by the Voice Auditor's avoided-vocabulary flags and the active lexicon's preferred vocabulary.

## Lexicon System

A lexicon is a curated vocabulary and phrasing profile tied to a specific publication. It solves the problem of word choices that don't fit the target voice: instead of picking "less predictable" words at random, the coordinator reaches for words from a publication's actual vocabulary during REVISE.

**Built-in lexicons**: The Economist, Reuters, NYT News Analysis, FiveThirtyEight/Vox, Op-Ed/Newsletter, Institutional/Statistical Report.

Each lexicon defines: preferred vocabulary, avoided vocabulary, phrase patterns, sentence rhythm profile, and transition preferences. During intake, name a publication to load its lexicon, or let selfwrite pick one based on your register level.

The lexicon addresses AI detectability without sacrificing naturalness. AI detectors flag text that always picks the most probable word. Random word swaps break that pattern but can sound forced. A lexicon shifts word choices toward a specific human voice, so the output is both statistically varied (defeating detectors) and naturally consistent (sounding like a real publication).

Over multiple runs, the distillation phase refines the lexicon: tracking which preferred words were reached for, which were never used, and which new words emerged naturally during REVISE. Install the distilled skill file to carry these refinements forward.

## Scoring

Each cycle uses adversarial scoring with 8 safeguards against self-inflation:

1. Name weaknesses before assigning any scores
2. Compare each dimension to the previous best version
3. Cite specific content for every score (no vague "good organization")
4. Cap gains at +1 per dimension per iteration
5. Anchor baselines at 4-6 (a first draft isn't excellent)
6. Score against the audience identified during intake
7. Enforce register compliance (e.g., rhetorical questions and first-person are forbidden at institutional register levels)
8. If a review agent flagged an engagement drop or comprehension failure and the revision didn't fix it, that dimension's score can't increase

If a revision improves the composite score, it's kept. If it damages two or more dimensions, it's reverted regardless of gains elsewhere.

## Output

Each run creates a `selfwrite/runs/<run-id>/` directory:

```
versions/       # v0.md, v1.md, ... (every snapshot)
rubric.md       # scoring dimensions (locked after generation)
log.md          # narrative journal of each iteration
results.tsv     # structured scores per iteration
skill.md        # distilled skill file
summary.md      # final metrics and learnings
```

The **distilled skill file** is the lasting output. It records which questions, revision patterns, and writing techniques drove the largest score gains. Install it to carry those patterns into future runs:

```bash
cp selfwrite/runs/<run-id>/skill.md ~/.claude/skills/<domain>.md
```

## Tips

- **Answer intake questions honestly.** Vague answers ("general audience," "just make it better") yield vague rewrites. Specific answers ("skeptical CFO reading a one-pager," "cut 30% without losing data") yield precise ones.
- **Simple rewrite for polish, deep rewrite for substance.** If the draft has everything it needs and just reads poorly, use simple. If it's missing evidence, context, or counterarguments, use deep.
- **Longer budgets improve results, but returns diminish past 2h for short pieces.** A 20-minute column tightening often gains 2-3 points on the weighted composite (a 1-10 scale). A 6-hour deep rewrite of a long report can gain 4+.
- **Name a publication model during intake.** Saying "write like the Economist" or "Globe and Mail feature tone" loads a lexicon that constrains word choice, phrase patterns, and sentence rhythm to match that publication's voice. This is the single most effective setting for producing natural-sounding text that avoids AI detection. If unsure, skip — a default lexicon is chosen based on your register level.
- **Check the distilled skill file after each run.** If the patterns hold up, install it. Future runs in the same domain start stronger.

## Siblings

This repo also ships three sibling skills. **`/selfresearch`** and **`/selfinvestigate`** share selfwrite's infrastructure (voice register, lexicon, `runs/` convention, four-tier citation verifier) but run their own pipelines — one for academic research, one for investigative journalism. **`/selfpost`** is a different shape: a distribution skill that posts tweets and threads to Twitter/X by driving your logged-in Chrome browser. No API required.

### `/selfresearch` (cited academic research)

```
/selfresearch "research question" <duration>
```

Duration uses `Nm` or `Nh` format. Minimum 15 minutes.

```
/selfresearch "known failure modes of RLHF" 30m
/selfresearch "effects of SNAP benefits on food insecurity" 1h
/selfresearch "EU AI Act compliance pathways for US firms" 2h
```

Recommended budgets:

| Output | Budget |
|--------|--------|
| Evidence brief (1000-2000 words, 3-5 sections) | 20-30m |
| Focused report (2000-4000 words, 5-8 sections) | 30-60m |
| Literature review (3000-6000 words, 6-10 sections) | 1-2h |
| Exhaustive survey | 2h+ |

Queries Semantic Scholar, OpenAlex, arXiv, and (optionally) web search. Runs a five-phase pipeline: PLAN (sub-question DAG) → ITERATE (wave search with a reflector that decides whether to expand, deepen, or stop) → SYNTHESIZE (quote extraction, outlining, section writing) → VERIFY (per-claim verdict against the extracted quote) → SUMMARIZE. Every claim in the final report carries a four-tier tag (SRC, SYN, INF, UNV) anchored to a specific extracted quote; the verifier pass confirms each tag before the report is released.

### `/selfinvestigate` (thesis-driven investigation)

```
/selfinvestigate "thesis" <duration> [--stance=prove|disprove|investigate]
```

Duration uses `Nm` or `Nh` format. Minimum 30 minutes. Default stance: `investigate` (neutral).

```
/selfinvestigate "Donor networks shifted to funding Trump by 2020, coinciding with foreign-policy shifts" 2h --stance=investigate
/selfinvestigate "Company X's compliance failures were known at the board level" 90m --stance=prove
/selfinvestigate "The regulatory-capture narrative at Agency Y is overstated" 3h --stance=disprove
```

Recommended budgets:

| Output | Budget |
|--------|--------|
| Quick investigative brief | 45-60m |
| Standard investigation (3000-5000 words) | 1-2h |
| Deep investigation (5000-8000 words) | 2-4h |
| Book-chapter scope (8000-15000 words) | 4h+ |

Queries FEC (campaign finance), OpenSecrets (lobbying, dark money), SEC EDGAR (corporate filings), CourtListener (federal courts), Wayback Machine (deleted content), plus academic and web sources. Runs a five-stage pipeline: SCOPE (falsifiable thesis restatement, in/out/tangential boundaries) → QUESTION WEB (five layers: Direct, Actor, Chronology, Motive, Tangential) → RESEARCH (wave search with actor / timeline / financial-flow extractors running inline) → CONNECT (actor map, master timeline, causal chains, thesis assessment) → WRITE.

The `--stance` flag shapes how the scoper, wave-search, reflector, and thesis assessor behave. `prove` biases toward consolidating supporting evidence; `disprove` mirrors it for disconfirming evidence; `investigate` stays neutral. All three stances still run counter-queries during search and enforce a mandatory thesis-assessment user gate before writing, so `prove` can't produce a one-sided brief without the honest evidence moment.

### Stance quickguide

- **`investigate`** when you want a neutral read on a falsifiable claim.
- **`prove`** when you already have strong priors and want the agent to consolidate supporting evidence efficiently; the thesis assessor still surfaces contradicting evidence before the write.
- **`disprove`** when you want to stress-test a thesis by aggressively hunting counter-evidence.

### `/selfpost` (browser-driven Twitter posting)

```
/selfpost <subcommand> [args]
```

Subcommands: `new "topic" [type]`, `run`, `list`, `show <id>`, `cancel <id>`.

```
/selfpost new "why small models win at tight tasks"
/selfpost new "the 2026 state of personal AI tooling" thread
/selfpost run
/selfpost list
```

Drives Chrome via the [Claude for Chrome](https://claude.com/chrome) extension. `new` drafts a tweet or thread and saves it to `queue/twitter/<id>.md` with `status: draft`. You review the file, change the flag to `status: ready`, then `/selfpost run` posts everything marked ready (up to 5 per run, oldest first, with 30-120s jitter between). Before each final Post click, Claude screenshots the composer and waits for your 'send' — the Chrome extension then requires its own confirm on top of that, so there are two gates per tweet.

What you need:
- Claude for Chrome extension installed and connected (get it from `claude.com/chrome`).
- A Chrome profile logged into `x.com`.
- Node.js 20+ and `npm install` at the repo root (for the deterministic helpers — see below). Skill degrades gracefully if absent but cheap to install.
- No Twitter API key, no OAuth, no scheduler.

The skill caps at 5 posts per run and 10 per rolling 24 hours to keep cadence human. A duplicate guard rejects near-duplicates of items posted in the last 20 entries. Session expiry, CAPTCHA, and rate-limit responses all mark the current item `status: failed` with the error, stop the run, and tell you what to do.

**Node helpers** (installed by `npm install`; used by the skill via `Bash` at runtime):

- `config/selectors.twitter.yaml` — X.com DOM selectors, with primary natural-language queries, fallback CSS chains, and an append-only `rotationHistory` for tracking drift. Patch this one file when X redesigns instead of rewriting the skill.
- `lib/validate.mjs` — pure validators: character counting (via `twitter-text`), thread structure, frontmatter shape, status state machine, Jaccard-bigram duplicate detection, cadence, posting-hours.
- `lib/slug.mjs` — deterministic `slugify` and `generateId` (`YYYYMMDD-HHMM-<slug>`). Replaces the skill's old improvised slug rule.
- `scripts/selfpost-q.mjs` — queue CLI: `list`, `show`, `validate`, `status`, `stats`, `slug`, `id` subcommands. Status edits are line-level so inline YAML formatting survives.
- `scripts/check-env.mjs` — session preflight: Node, queue dir, selectors config (with `lastVerified` staleness), dep install, 24h cadence, git cleanliness. Exit 0 / 1 / 2 for skill consumption.
- `scripts/post_twitter.mjs` — **Tier 2** unattended poster. Playwright on a persistent profile. Opt-in via `/selfpost run --unattended` or explicit user request. Full posting flow, no per-post approval gates. Requires `npx playwright install chromium chromium-headless-shell`.
- `scripts/selectors-health.mjs` — selector smoke test. Probes the live x.com/compose/post DOM against `selectors.twitter.yaml` and reports which elements matched (primary / fallback / missing). Run before any Tier 2 batch, or schedule daily to catch X redesigns early. Exit codes: 0 healthy, 1 degraded, 2 critical, 3 session_expired.
- `tests/*.mjs` — vitest suite (112 cases across validators and slug). `npm test` runs green.

**Two tiers of posting:**

1. **Tier 1 (default): Chrome MCP, interactive.** The skill drives your real logged-in Chrome tab. Each tweet has two gates: an in-chat 'send' confirm and the Chrome extension's own Post-button approval. Use when you're at the keyboard.
2. **Tier 2 (opt-in): Playwright, unattended.** `scripts/post_twitter.mjs` drives a headless Playwright profile. No gates. Use for scheduled/batch posting when you've manually logged into the profile once. Trigger with `/selfpost run --unattended` or a clear phrase like "post the queue in the background". Requires the Playwright browser binaries.

Out of scope for this version: Substack, DMs, replies, scheduled cron-style automation (a scheduler can invoke Tier 2 but isn't shipped as part of the skill).

See [`selfpost.md`](selfpost.md) for the full skill spec.

## Example Runs

| Run | Iterations | Start | Final | Delta |
|-----|-----------|-------|-------|-------|
| [`nyt-upgrade/`](runs/nyt-upgrade/) | 12 | 4.95 | 8.15 | +3.20 |
| [`skill-upgrade/`](runs/skill-upgrade/) | 14 | 4.75 | 8.45 | +3.70 |

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
