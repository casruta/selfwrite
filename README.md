<p align="center">
  <img src="banner.png" alt="SELFWRITE" width="100%">
</p>

![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blue)

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that turns drafts into publication-quality text through scored, time-boxed, multi-agent iteration.

Give it an opinion column and 20 minutes. A data report and an hour. A skill file and 6 hours. It asks a few questions, then rewrites until time runs out, with four independent review agents catching blind spots, breaking AI-detectable patterns, and verifying the final output makes sense to a first-time reader.

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

## How It Works

**1. Intake.** Selfwrite asks about audience, purpose, genre, and tone. Follow-ups adapt based on your answers: writing for experts, it asks what they don't already know; editing existing text, it asks where interest drops. Your answers shape the rubric and revision approach. Skip them and it defaults to general audience, explainer genre, authoritative journalism tone (register level 3).

**2. Rubric.** It generates 4-6 scored dimensions calibrated to your genre (news, feature, opinion, explainer, investigation), locks them, and scores your baseline at 4-6.

**3. The loop.** You choose the mode:

- **Simple rewrite**: THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT. Prose quality, structure, style
- **Deep rewrite**: adds a RESEARCH phase alongside THINK, surfacing missing context, counterarguments, and evidence gaps. You approve what gets incorporated

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
  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
  │  READER  │  │  VOICE   │  │ SYNONYM  │  (parallel)   │
  │  AGENT   │  │ AUDITOR  │  │  AGENT   │               │
  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
       │              │             │                     │
       ▼              ▼             ▼                     │
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

- **THINK**: identify the weakest dimension, adopt an expert persona (senior editor, beat reporter, research director), ask 2-3 questions that reference specific content in the draft, form a hypothesis
- **DRAFT**: apply THINK insights to produce a candidate revision (targeted changes only, not wholesale rewrite)
- **REVIEW**: three independent agents evaluate the draft in parallel:
  - **Reader Agent**: reads as the target audience, flags engagement drops, comprehension failures, concept stacking, scroll-back dependencies
  - **Voice Auditor**: hunts for AI-tell patterns (sentence template repetition, rhythm monotony, hedge clustering, transition monotony, register violations, em-dash usage)
  - **Synonym Agent**: suggests less-predictable synonym substitutions (1 per 2 sentences, max 2 per paragraph) to break AI detection's statistical signature
- **REVISE**: coordinator incorporates review annotations, triaging by severity (engagement drops first, AI-tell patterns second, synonym substitutions third)
- **SCORE**: adversarial scoring protocol with 8 safeguards
- **REFLECT**: log the result, check for plateau or over-optimization, adjust strategy

The loop uses the entire time budget. When all dimensions reach 7+ and gains stall, the loop shifts into the **Breakthrough Protocol**, cycling through red team reading, structural rethinks, and constraint-based revision to push past the ceiling that incremental improvement can't reach.

**4. Clean Slate Review.** After the iteration loop exits, a separate agent with **zero context** reads the final artifact cold. It has never seen the rubric, the iteration log, or any prior version. It flags anything that doesn't make sense to a first-time reader: unclear sentences, unsupported claims, unexplained jargon, internal contradictions, data that doesn't add up. Every question it raises must be resolved by editing the text before committing.

**5. Distillation.** Selfwrite analyzes its log, extracts which questions and revision patterns produced the biggest score jumps, captures humanization techniques (which synonym substitutions worked, which AI-tell patterns were hardest to eliminate, which transition strategies produced the most natural flow), and writes a reusable skill file you can install for future runs.

## Review Agents

Four independent agents review the text across two phases:

**During iteration (every cycle):** Three agents evaluate each draft in parallel, with no context carryover between iterations.

| Agent | What it catches | Why it matters |
|-------|----------------|----------------|
| **Reader Agent** | Engagement drops, comprehension failures, credibility gaps, pacing issues, concept stacking (3+ technical terms in one sentence), scroll-back dependencies (terms used without inline reminder) | A separate reader perspective catches where real humans would stop reading or lose the thread |
| **Voice Auditor** | AI-tell patterns (10-pattern catalog), sentence template repetition, rhythm monotony, transition diversity violations, register drift, em-dash usage (zero tolerance) | Directly targets the detectable patterns that make text identifiable as machine-generated |
| **Synonym Agent** | Default/predictable word choices that AI detection tools flag | Suggests less-predictable synonyms at reduced density (1 per 2 sentences, max 2 per paragraph, max 8 total) to avoid awkward over-substitution |

**After iteration (once, before distillation):**

| Agent | What it checks | Why it matters |
|-------|----------------|----------------|
| **Clean Slate Agent** | Reads the final text with zero context (no rubric, no log, no history). Flags anything unclear, unsupported, contradictory, or dependent on definitions the reader may have forgotten | Iterative agents develop blind spots from watching the text evolve. A cold reader catches what they cannot |

On short budgets (<15m), iteration agents scale down automatically: under 15m only Voice Auditor and Synonym Agent run; under 10m only Synonym Agent runs. The Clean Slate Agent always runs.

## Writing Quality

The writing skill powering selfwrite is grounded in research, not heuristics:

- **Sentence architecture** (Gopen & Swan, Pinker): topic-stress positioning, given-new contract, right-branching, dependency distance
- **Information flow** (Halliday & Hasan): thematic progression, head-to-tail echo transitions, the curiosity loop
- **Voice** (Clark, Poynter): six controllable dimensions, not a mysterious quality
- **Explanatory craft**: zoom technique, layered explanation (analogy → mechanism → implication), jargon management
- **Audience profiles**: measurable targets per audience type (sentence length, jargon, evidence, density)
- **Detection-resistant patterns**: multi-agent review (Reader, Voice Auditor, Synonym agents), synonym probability shifting, transition diversity enforcement, rhythm breaking, plus burstiness, productive imperfection, rhetorical devices, idioms, syntactic controls
- **12-pass revision protocol**: point-first → kill-list → verb → hedge → voice → so-what → rhythm → selectivity → template-break → AI-tell → human-signal → register check

## Scoring Safeguards

Eight safeguards: name weaknesses before scoring, compare to previous best, cite specific content for every score, cap gains at +1 per dimension per iteration, anchor baselines at 4-6, score against the audience from intake, enforce register compliance (editorial anti-patterns are forbidden at formal register levels), and external review integration (unaddressed high-severity review agent annotations cap the relevant dimension).

## Output

Each run produces a `selfwrite/runs/<run-id>/` directory with version snapshots, a scoring log (including per-iteration review agent annotation counts and synonym acceptance rates), and a distilled skill file with a Humanization Techniques section.

- [`runs/nyt-upgrade/`](runs/nyt-upgrade/): 12 iterations, 4.95 → 8.15 composite, all six dimensions at 8+
- [`runs/skill-upgrade/`](runs/skill-upgrade/): 14 iterations, 4.75 → 8.45 composite, research-grounded writing skill upgrade

## Requirements

- Claude Code CLI
