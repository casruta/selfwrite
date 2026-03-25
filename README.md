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

## What the Output Looks Like

Each iteration produces a sample on the same topic so you can see exactly how the writing changes. Here's the NYT upgrade run (`runs/nyt-upgrade/`), which took a writing skill from WSJ/Bloomberg analytical style to NYT journalist quality over 12 iterations.

### Baseline (cycle 1, composite 4.95)

> Canada's housing affordability crisis deepened in 2025, with the average home price reaching $782,000, a 6.3% year-over-year increase that outpaced wage growth by more than three to one. The gap between what Canadians earn and what they'd need to buy a home hasn't been this wide since Statistics Canada began tracking the ratio in 1976.
>
> The numbers are stark. A household earning the national median income of $74,600 can afford a mortgage of roughly $340,000, less than half the average purchase price. In Toronto and Vancouver, the ratio is worse: median earners can cover barely a third of the average home cost.

Competent. Accurate. Reads like a Bloomberg terminal note. No scene, no people, no tension.

### After 6 iterations (composite 7.00)

The topic shifts to a climate scientist profile to test narrative craft. By cycle 6, the loop has added lede types, story architecture, and a question engine:

> The steel rod slides in too easily. Anya Petrova pulls it free, wipes the mud from the depth mark, and checks: 2.4 meters. She writes the number in her field notebook and doesn't say anything for a while.
>
> In 2014, her first summer in Tuktoyaktuk, the same rod stopped at 1.2 meters. The permafrost was solid below that line, frozen for roughly 10,000 years. Now the thaw reaches twice as deep. What took millennia to freeze is unfreezing in a decade.
>
> That would be alarming enough on its own. But the problem isn't the thaw. It's what the thaw releases.

Scene-setting. Specific detail (2.4 meters, 2014, Tuktoyaktuk). Tension that pulls the reader forward. The question engine chains paragraphs by leaving one question unanswered at the end of each.

### After 12 iterations (composite 8.15)

By cycle 12, the skill has added attribution patterns, source braiding, and evidence weaving. Same topic, rewritten under the upgraded guidance:

> Anya Petrova uncaps a vial of gas collected from two meters below the tundra and holds it under a portable spectrometer. The reading comes back in seconds. She doesn't flinch, but she writes the number twice, once on her field sheet and once on her phone.
>
> She has been measuring methane concentrations at this site for eleven years. For the first seven, the data tracked the IPCC's baseline projections within a comfortable margin. Then the line broke upward.
>
> "We kept recalibrating," Petrova said. "We assumed our instruments were drifting. They weren't."
>
> Her findings, published last year in Nature Geoscience, showed a 340% increase in methane flux at the Kolyma site between 2015 and 2024. The rate doesn't match any existing permafrost model. Yuri Shakhova, a biogeochemist at the University of Alaska who has studied Arctic methane for two decades, said Petrova's data is consistent with readings from three other Siberian monitoring stations, none of which were designed to detect changes this fast.
>
> "The monitoring infrastructure assumes gradual release," Shakhova said. "We're measuring with a ruler and the thing is moving in leaps."

Multiple named sources. Quotes used strategically (never for routine facts). Each piece of evidence resolves a tension the reader already feels. The kicker echoes the opening action with new meaning:

> She caps the vial and seals it for the lab in Moscow, where someone else will run the numbers a third time.

### Score trajectory

| Cycle | Topic | Composite | Delta |
|-------|-------|-----------|-------|
| 1 | Baseline | 4.95 | -- |
| 2 | Lede types | 5.35 | +0.40 |
| 3 | Lede execution | 5.85 | +0.50 |
| 4 | Nut graph | 6.25 | +0.40 |
| 5 | Story architecture | 6.75 | +0.50 |
| 6 | Narrative tension | 7.00 | +0.25 |
| 7 | Kicker endings | 7.10 | +0.10 |
| 8 | Consolidation | 7.10 | 0 |
| 9 | Scene-setting detail | 7.45 | +0.35 |
| 10 | Scene economy | 7.65 | +0.20 |
| 11 | Attribution patterns | 8.00 | +0.35 |
| 12 | Evidence weaving | 8.15 | +0.15 |

12 iterations. 11 kept, 0 reverted. All six scoring dimensions at 8+. The distilled skill file captures questions, not answers -- "Does each piece of evidence resolve a tension the reader already feels?" transfers better than "make evidence narratively necessary."

The full run -- every sample, every iteration log, every version snapshot -- is in [`runs/nyt-upgrade/`](runs/nyt-upgrade/).

## Installation

1. Copy `selfwrite.md` to your Claude Code skills directory:

   ```bash
   cp selfwrite.md ~/.claude/skills/selfwrite.md
   ```

2. That's it. Invoke with `/selfwrite` in any Claude Code session.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
