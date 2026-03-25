# Selfwrite

**Time-boxed autonomous iteration that turns Claude into its own editor.**

Selfwrite takes any task and a time budget, then autonomously iterates on the output -- drafting, scoring, questioning, revising -- until time runs out. It distills what it learns into a reusable skill file so every run makes future runs better.

It works for anything: prose, code, data analysis, strategy documents, financial reports. The domain doesn't matter. The loop does.

## The Problem

Single-pass LLM output plateaus at "competent but generic." Ask Claude to write a report and you get a serviceable draft. Ask it to write the report *again* and you get roughly the same thing. There's no mechanism for compound improvement.

Human experts don't work this way. They draft, step back, ask hard questions, revise, and repeat. Each pass catches something the last one missed. Quality compounds with iteration.

Selfwrite gives Claude that same loop -- structured, time-boxed, and honest about what's working and what isn't.

## How It Works

Every iteration follows a fixed three-phase cycle:

```
       ┌───────────────────────────────┐
       │                               │
       ▼                               │
  ┌─────────┐                          │
  │  THINK  │  Read history, analyze,  │
  │         │  form hypothesis         │
  └────┬────┘                          │
       │                               │
       ▼                               │
  ┌─────────┐                          │
  │  TEST   │  Revise, score, measure  │
  │         │  Keep or revert          │
  └────┬────┘                          │
       │                               │
       ▼                               │
  ┌─────────┐                          │
  │ REFLECT │  Log result, check       │
  │         │  convergence signals     │
  └────┬────┘                          │
       │                               │
       └───────────────────────────────┘
```

**THINK** -- Pick the weakest scoring dimension. Adopt a domain expert persona. Generate 2-3 questions that reference *specific* content in the artifact (not generic advice). Answer them with actionable insights. Form a testable hypothesis: "Adding X will improve dimension Y from N to M because..."

**TEST** -- Revise the artifact based on the hypothesis. Score every dimension using the adversarial scoring protocol. If the composite score improved, keep. If not, revert. No exceptions.

**REFLECT** -- Log everything: scores, hypothesis, decision, reasoning. Check for convergence signals (plateau, repeated reverts, over-optimization). Adjust strategy if needed. Check the clock. If time remains, loop back to THINK.

### Adversarial Scoring

Self-scoring is only useful if it's honest. Five safeguards prevent inflation:

1. **Pre-score weakness articulation** -- name the 2-3 biggest weaknesses *before* assigning any scores
2. **Comparative scoring** -- each dimension is scored relative to the previous best version, not in isolation
3. **Evidence requirement** -- every score must cite specific content from the artifact
4. **Maximum +1 per dimension per iteration** -- no jumping from 4 to 8 in one pass
5. **Baseline anchor at 4-6** -- first drafts are competent, not excellent

### Full Run Phases

| Phase | Time Share | What Happens |
|-------|-----------|--------------|
| Setup | -- | Parse task, create run directory, generate rubric |
| Baseline | -- | Produce v0, score it (anchored at 4-6) |
| Iteration Loop | ~60% | THINK → TEST → REFLECT cycles until deadline |
| Distillation | ~30% | Analyze the log, extract patterns into a reusable skill file |
| Summary | ~10% | Score trajectory, key learnings, present results |

## What It Produces

Each run creates a self-contained directory:

```
selfwrite/runs/<run-id>/
  versions/          # v0.md, v1.md, ... (artifact snapshots)
  rubric.md          # scoring rubric (locked at start)
  log.md             # iteration journal (hypotheses, scores, decisions)
  results.tsv        # structured data (one row per iteration)
  skill.md           # distilled skill output (reusable patterns)
  summary.md         # final metrics and learnings
```

Three kinds of output matter:

- **The artifact** -- the improved output itself. Each kept iteration is saved as a version snapshot, so you can trace exactly how it evolved.
- **The skill file** -- distilled meta-knowledge: what questions to ask, what patterns work, what to avoid. This is the compound interest -- it makes every future run on that domain start from a higher baseline.
- **The log** -- full iteration history with scores, hypotheses, and keep/revert decisions. Transparent reasoning at every step.

## Usage

Selfwrite is a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill. Invoke it with a task description and a time budget:

```
/selfwrite "task description" <duration>
```

Duration format: `Nm` (minutes) or `Nh` (hours). Minimum 10 minutes.

**Examples:**

```
/selfwrite "financial report analyzing Alberta's Q4 budget surplus" 30m
/selfwrite "Python function to merge overlapping intervals" 20m
/selfwrite "executive summary of Canada housing starts data" 45m
/selfwrite "upgrade writing.md to NYT journalist quality" 6h
```

The tool detects artifact type from task keywords (code, report, analysis, etc.) and adapts the rubric, expert persona, and scoring dimensions accordingly.

## Example Run: NYT Writing Upgrade

The `runs/nyt-upgrade/` directory contains a complete run that upgraded an analytical writing skill from WSJ/Bloomberg style to NYT journalist quality over 12 iterations.

**Starting point:** A competent writing guide scored at 4.95 composite (baseline range).

**After 12 iterations:**

| Cycle | Topic | Composite | Delta | Decision |
|-------|-------|-----------|-------|----------|
| 1 | Baseline | 4.95 | -- | -- |
| 2 | Lede types | 5.35 | +0.40 | Keep |
| 3 | Lede execution | 5.85 | +0.50 | Keep |
| 4 | Nut graph | 6.25 | +0.40 | Keep |
| 5 | Story architecture | 6.75 | +0.50 | Keep |
| 6 | Narrative tension | 7.00 | +0.25 | Keep |
| 7 | Kicker endings | 7.10 | +0.10 | Keep |
| 8 | Consolidation | 7.10 | 0 | Keep (19% smaller) |
| 9 | Scene-setting detail | 7.45 | +0.35 | Keep |
| 10 | Scene economy | 7.65 | +0.20 | Keep |
| 11 | Attribution patterns | 8.00 | +0.35 | Keep |
| 12 | Evidence weaving | 8.15 | +0.15 | Keep |

**Result:** 4.95 → 8.15 composite. All six dimensions at 8+. Evidence integration reached 9 -- the first dimension to break the 8 barrier. Zero reverts across 12 iterations.

Key breakthroughs: cycle 6 pushed all dimensions to 7+ (triggering a switch from structural changes to polish mode), and cycle 11's attribution patterns lifted every remaining dimension to 8 simultaneously.

The distilled skill file (`writing-nyt.md`) captures questions, not answers -- e.g., "Does each piece of evidence resolve a tension the reader already feels?" transfers better than "make evidence narratively necessary."

## Installation

1. Copy `selfwrite.md` to your Claude Code skills directory:

   ```bash
   cp selfwrite.md ~/.claude/skills/selfwrite.md
   ```

2. That's it. Invoke with `/selfwrite` in any Claude Code session.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
