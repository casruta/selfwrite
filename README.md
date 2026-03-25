# Selfwrite

**A Claude Code skill that takes your draft and iterates it toward publication quality.**

You have a report, a feature piece, an opinion column, or an analysis that's 80% there. Selfwrite takes that draft and a time budget, then runs a structured revision loop -- questioning, scoring, rewriting, and scoring again -- until time runs out. Each iteration targets the weakest part of the text. Every change is measured. Nothing is kept unless it makes the piece better.

When the loop finishes, selfwrite distills what it learned into a reusable skill file: which questions exposed the real weaknesses, which revision patterns produced the biggest jumps, what to avoid next time. That skill file carries forward, so the next run on a similar piece starts from a higher baseline.

## The Problem It Solves

Ask an LLM to improve your draft and you get a single pass of edits. Ask it again and you get roughly the same thing rephrased. There's no mechanism for compound improvement -- no structured way to identify what's weakest, revise it, measure whether the revision worked, and build on what did.

Editors work differently. They read for the lede, then for structure, then for sourcing, then for voice. Each pass catches something the previous one missed. A draft that survives four rounds of editing is categorically different from one that got a single rewrite.

Selfwrite gives Claude that editorial process -- structured, time-boxed, and honest about what's working and what isn't.

## How It Works

Give selfwrite your draft (or a topic to write from scratch) and a time budget. It generates a scoring rubric tailored to the piece, scores your baseline, then enters the iteration loop.

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

### THINK

Selfwrite identifies the lowest-scoring dimension in the rubric and adopts the persona of a domain expert -- a senior editor for prose, a research director for analysis, a beat reporter for news pieces. It then generates 2-3 questions that reference *specific* content in the current draft.

These aren't generic prompts like "make it more engaging." They're editorial questions:

- "The lede buries the stakes behind two clauses of context -- can you open with the consequence and backfill?"
- "Paragraph 4 introduces a second source but doesn't explain why their perspective differs from the first. What's the tension between them?"
- "The data in the nut graph is raw dollar figures. What happens if you normalize per capita?"

Each question must target a different weakness, and answering it must change what's written. If the answer is "yes, that's already there," the question was too easy.

Selfwrite answers its own questions with specific, actionable revisions. Then it forms a testable hypothesis: "Restructuring the lede to lead with the consequence will improve Lede Quality from 5 to 6 because the current version makes the reader wait 35 words for the point."

### TEST

Selfwrite applies the revision and scores every dimension using the adversarial scoring protocol (see below). If the composite score improved, the revision is kept. If it stayed the same or dropped, the revision is reverted and the previous best version stands.

This is the discipline that makes the loop work. Not every revision is an improvement. Catching regressions early -- a structural change that improved flow but damaged voice, a sourcing addition that cluttered the narrative -- prevents the draft from drifting sideways.

### REFLECT

Selfwrite logs everything: the hypothesis, the revision, every dimension's score before and after, and the keep/revert decision with reasoning. It then checks for convergence signals:

- **Plateau**: three consecutive iterations with less than 0.3 gain? Try a structural rethink instead of incremental edits.
- **Over-optimization**: same dimension targeted three times without improvement? Move to a different dimension.
- **All dimensions at 7+**: switch from structural changes to sentence-level polish.

If time remains, it loops back to THINK. If not, it moves to distillation.

### Adversarial Scoring

Self-scoring is only useful if it's honest. Five safeguards prevent inflation:

1. **Pre-score weakness articulation** -- name the 2-3 biggest weaknesses *before* assigning any scores
2. **Comparative scoring** -- each dimension is scored relative to the previous best version, not in isolation
3. **Evidence requirement** -- every score must cite specific content from the draft
4. **Maximum +1 per dimension per iteration** -- no jumping from 4 to 8 in one pass
5. **Baseline anchor at 4-6** -- a first draft is competent, not excellent

### Rubric

The rubric is generated once at the start and locked for the entire run. Changing it mid-run would invalidate prior scores. Each rubric has 4-6 dimensions tailored to the piece. For editorial work, typical dimensions include:

| Dimension | What It Measures |
|-----------|-----------------|
| Lede Quality | Hook strength, type appropriateness, first 35 words |
| Narrative Architecture | Story structure, tension, pacing, section flow |
| Voice & Authority | Tonal range, confidence, distinctiveness |
| Evidence Integration | Sourcing, quote selection, data weaving |
| Explanatory Clarity | Complex topics made accessible without dumbing down |
| Anti-AI Quality | Absence of AI-tell markers, genuine editorial personality |

Each dimension carries a weight (summing to 1.0), with the dimension most tied to the piece's purpose weighted highest.

## Full Run Phases

| Phase | Time Share | What Happens |
|-------|-----------|--------------|
| Setup | -- | Parse task, create run directory, generate rubric |
| Baseline | -- | Score the draft (anchored at 4-6) |
| Iteration Loop | ~60% | THINK → TEST → REFLECT cycles until deadline |
| Distillation | ~30% | Analyze the log, extract patterns into a reusable skill file |
| Summary | ~10% | Score trajectory, key learnings, present results |

## What It Produces

Each run creates a self-contained directory with the full revision history:

```
selfwrite/runs/<run-id>/
  versions/          # v0.md, v1.md, ... (draft snapshots after each kept iteration)
  samples/           # writing samples showing how output evolves
  rubric.md          # scoring rubric (locked at start)
  log.md             # iteration journal (hypotheses, scores, decisions)
  results.tsv        # structured data (one row per iteration)
  learnings.md       # expert questions and craft principles that worked
  skill.md           # distilled skill output (reusable for future runs)
```

Three outputs matter:

- **The revised draft** -- each kept iteration is saved as a version snapshot, so you can trace exactly how the text evolved and pick the version you want.
- **The skill file** -- distilled patterns from the run: which editorial questions exposed real weaknesses, which revision types produced the biggest score jumps, what to avoid. Install this as a Claude Code skill and every future piece in that domain starts stronger.
- **The log** -- full iteration history with scores, hypotheses, and keep/revert decisions. If you want to understand *why* a particular revision worked, it's here.

## What the Output Looks Like

The `runs/nyt-upgrade/` directory contains a complete run that took a writing guide from analytical report style to NYT journalist quality over 12 iterations. Each cycle produced a sample on the same topic so you can see exactly how the text changes.

### Baseline (cycle 1, composite 4.95)

> Canada's housing affordability crisis deepened in 2025, with the average home price reaching $782,000, a 6.3% year-over-year increase that outpaced wage growth by more than three to one. The gap between what Canadians earn and what they'd need to buy a home hasn't been this wide since Statistics Canada began tracking the ratio in 1976.
>
> The numbers are stark. A household earning the national median income of $74,600 can afford a mortgage of roughly $340,000, less than half the average purchase price. In Toronto and Vancouver, the ratio is worse: median earners can cover barely a third of the average home cost.

Accurate. Well-sourced. Reads like a Bloomberg terminal note. No scene, no people, no tension pulling the reader forward.

### After 6 iterations (composite 7.00)

By cycle 6, the loop has added lede types, story architecture, and a question engine that chains paragraphs through unanswered questions. The topic shifts to a climate scientist profile to test narrative craft:

> The steel rod slides in too easily. Anya Petrova pulls it free, wipes the mud from the depth mark, and checks: 2.4 meters. She writes the number in her field notebook and doesn't say anything for a while.
>
> In 2014, her first summer in Tuktoyaktuk, the same rod stopped at 1.2 meters. The permafrost was solid below that line, frozen for roughly 10,000 years. Now the thaw reaches twice as deep. What took millennia to freeze is unfreezing in a decade.
>
> That would be alarming enough on its own. But the problem isn't the thaw. It's what the thaw releases.

Scene-setting with specific detail (2.4 meters, 2014, Tuktoyaktuk). The last line opens a question the reader needs answered. That question drives them into the next paragraph.

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

Multiple named sources. Quotes reserved for things that can't be paraphrased -- Petrova's disbelief, Shakhova's metaphor. Data woven into the narrative rather than stacked in a paragraph. The kicker echoes the opening action with new weight:

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

12 iterations. 11 kept, 0 reverted. All six scoring dimensions at 8+. The distilled skill file captures questions rather than rules -- "Does each piece of evidence resolve a tension the reader already feels?" transfers better across pieces than "make evidence narratively necessary."

The full run -- every sample, every iteration log, every version snapshot -- is in [`runs/nyt-upgrade/`](runs/nyt-upgrade/).

## Skill Distillation

After the iteration loop, selfwrite spends ~30% of the time budget analyzing its own log. It groups successful revisions by type (structural changes, sourcing additions, voice adjustments, cuts) and extracts the patterns that produced the biggest score jumps.

The output is a standalone skill file that works as a Claude Code skill. Install it, and Claude applies those patterns automatically on future pieces in the same domain. The NYT upgrade run, for example, produced a 426-line writing guide covering lede craft, story architecture, attribution patterns, scene-setting, evidence weaving, and a kill list of AI-tell phrases.

The key design choice: the skill file captures **questions, not answers**. "Would the reader lose something if this quote were paraphrased?" forces engagement with the specific text. "Use quotes strategically" can be applied mechanically without thinking.

## Usage

Selfwrite is a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill. Invoke it with a task description and a time budget:

```
/selfwrite "task description" <duration>
```

Duration format: `Nm` (minutes) or `Nh` (hours). Minimum 10 minutes.

**Improving a draft you already have:**

```
/selfwrite "revise this feature piece on municipal broadband expansion" 30m
/selfwrite "tighten this opinion column on housing policy" 20m
/selfwrite "improve the sourcing and narrative structure of this investigative draft" 45m
```

**Writing from scratch:**

```
/selfwrite "feature profile of a climate scientist studying permafrost thaw" 30m
/selfwrite "news analysis of Q4 provincial budget data" 20m
/selfwrite "opinion piece on the gap between housing starts and immigration targets" 45m
```

**Building reusable editorial skills:**

```
/selfwrite "upgrade writing.md to NYT journalist quality" 6h
/selfwrite "create a style guide for data-driven policy analysis" 2h
```

The tool detects artifact type from task keywords and adapts the rubric, expert persona, and scoring dimensions accordingly.

## Installation

1. Copy `selfwrite.md` to your Claude Code skills directory:

   ```bash
   cp selfwrite.md ~/.claude/skills/selfwrite.md
   ```

2. Invoke with `/selfwrite` in any Claude Code session.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
