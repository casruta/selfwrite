# Selfwrite

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that takes your draft and iterates it toward publication quality. You give it text and a time budget. It asks what you're writing, who it's for, and what matters most. Then it runs a scored revision loop until time runs out.

## Install

```bash
cp selfwrite.md ~/.claude/skills/selfwrite.md
```

## Use

```
/selfwrite "task description" <duration>
```

Duration: `Nm` or `Nh`. Minimum 10 minutes.

```
/selfwrite "tighten this opinion column on housing policy" 20m
/selfwrite "rewrite the README as a summary of this analysis" 45m
/selfwrite "upgrade writing.md to NYT journalist quality" 6h
```

## What Happens

**1. Questions.** Selfwrite asks about audience, purpose, tone, constraints, and emphasis. Your answers shape the scoring rubric. Skip them and the rubric defaults to generic dimensions.

**2. Rubric.** It generates 4-6 scored dimensions tailored to your piece (lede quality, narrative structure, voice, evidence integration, etc.), locks them, and scores your baseline at 4-6.

**3. The loop.** Each iteration follows three phases:

- **THINK** -- identify the weakest dimension, adopt an expert persona (senior editor, beat reporter, research director), ask 2-3 questions that reference specific content in the draft, form a hypothesis
- **TEST** -- revise, score every dimension, keep only if the composite improved
- **REFLECT** -- log the result, check for plateau or over-optimization, adjust strategy

The loop uses the entire time budget.

**4. Distillation.** Selfwrite analyzes its log, extracts which questions and revision patterns produced the biggest score jumps, and writes a reusable skill file you can install for future runs.

## Scoring Safeguards

Self-scoring is honest: name weaknesses before scoring, compare to the previous best version, cite specific content for every score, cap improvement at +1 per dimension per iteration, and anchor the baseline at 4-6.

## Output

Each run produces a `selfwrite/runs/<run-id>/` directory with version snapshots, a scoring log, and the distilled skill file. See [`runs/nyt-upgrade/`](runs/nyt-upgrade/) for a complete example: 12 iterations, 4.95 to 8.15 composite, all six dimensions at 8+.

## Requirements

- Claude Code CLI
