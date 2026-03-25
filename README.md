# Selfwrite

Selfwrite is a Claude Code skill that turns a rough draft into publication-quality prose through structured, time-boxed iteration. You bring a report, a feature piece, an opinion column, or a data analysis summary. Selfwrite asks you a series of questions about what you're writing, who it's for, and what it needs to accomplish. Then it runs a revision loop, targeting the weakest element of the text on each pass, until the time budget runs out.

It doesn't rewrite blindly. Each revision is scored against a rubric locked at the start of the run. If a change improves the composite score, it stays. If it doesn't, it's reverted. Nothing drifts sideways.

When the loop finishes, selfwrite distills what worked into a reusable skill file: which editorial questions exposed real weaknesses, which revision patterns produced the biggest jumps, what to avoid next time. That skill file carries forward. The next run on a similar piece starts from a higher baseline.

## Why This Exists

Ask an LLM to improve your draft and you get a single pass of edits. Ask it again and you get roughly the same thing rephrased. There's no mechanism for compound improvement, no structured way to identify what's weakest, fix it, measure whether the fix worked, and build on what did.

Editors don't work that way. They read for the lede, then for structure, then for sourcing, then for voice. Each pass catches something the previous one missed. A draft that survives four rounds of focused editing is a different animal from one that got a single rewrite.

Selfwrite gives Claude that editorial process.

## The Questioning Phase

Before touching your draft, selfwrite asks clarifying questions. The specific questions depend on what you're writing, but they typically cover:

- **Audience**: Who reads this? What do they already know? What's their tolerance for jargon?
- **Purpose**: Is this informing, persuading, or explaining? What should the reader do or feel after reading?
- **Tone**: News analysis? Opinion? Technical explainer? Feature narrative?
- **Constraints**: Word count? House style? Required sections or data points to include?
- **Emphasis**: What's the one finding or argument the reader must walk away with?

These answers shape the rubric. A policy brief for cabinet ministers gets scored differently from a feature piece for a general audience. The questions aren't optional. Skipping them means the rubric defaults to generic dimensions, and generic rubrics produce generic revisions.

## How the Loop Works

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

**THINK.** Selfwrite identifies the lowest-scoring rubric dimension and adopts the persona of a domain expert: a senior editor for features, a beat reporter for news, a research director for analysis. It generates 2-3 questions aimed at specific content in the current draft.

These aren't generic prompts. They're editorial:

- "The lede buries the stakes behind two clauses of context. Can you open with the consequence and backfill?"
- "Paragraph 4 introduces a second source but doesn't explain why their perspective differs from the first. What's the tension between them?"
- "The nut graph uses raw dollar figures. What happens when you normalize per capita?"

Each question must change what's written. If the answer is "yes, it already does that," the question was too easy.

Selfwrite answers its own questions with specific revisions, then forms a hypothesis: "Restructuring the lede to lead with the consequence will improve Lede Quality from 5 to 6 because the current version makes the reader wait 35 words for the point."

**TEST.** Selfwrite applies the revision and scores every dimension using the adversarial scoring protocol. If the composite score improved, the revision stays. If it dropped, or if it improved one dimension but damaged two others, it's reverted.

This is the discipline that makes the loop work. Not every revision is an improvement. A structural change that improved flow but flattened voice. A sourcing addition that cluttered the narrative. Catching regressions early keeps the draft on an upward trajectory.

**REFLECT.** Everything gets logged: hypothesis, revision, scores before and after, keep or revert decision with reasoning. Then selfwrite checks for convergence signals. Three consecutive iterations with less than 0.3 gain? Time for a structural rethink, not more incremental edits. Same dimension targeted three times without improvement? Move on. All dimensions at 7+? Switch from structural changes to sentence-level polish.

If time remains, loop back to THINK.

### Adversarial Scoring

Self-scoring is only useful if it's honest. Five safeguards prevent inflation:

1. **Pre-score weakness articulation.** Name the 2-3 biggest weaknesses before assigning any scores.
2. **Comparative scoring.** Score each dimension relative to the previous best version, not in isolation.
3. **Evidence requirement.** Every score cites specific content from the draft. "Structure: 6. Paragraphs 2-3 cover the same ground and could be merged" is valid. "Structure: 7. Good organization" is not.
4. **Maximum +1 per dimension per iteration.** A mediocre revision can't jump from 4 to 8.
5. **Baseline anchor at 4-6.** A first draft is competent. It isn't excellent.

### Writing Principles

Selfwrite applies journalism-grade writing principles throughout the revision loop. The target voice is NYT/WSJ/Bloomberg: confident, specific, direct, narrative when the story demands it.

Core rules: point-first paragraphs (conclusion in the first sentence, context after). Active voice by default. Human conjunctions ("but" not "however," "so" not "therefore"). Contractions where natural. Sentence variety (short punches mixed with longer compounds). No em-dashes.

It enforces a kill list of AI-tell markers: "comprehensive," "robust," "notable," "it is worth noting," "delve into," "demonstrates," "multifaceted." These get replaced or deleted on every pass.

It matches verb strength to the magnitude of change ("edged up" for 3%, "surged" for 25%, "doubled" for 100%). It presents key numbers in at least two forms: percentage, absolute, and comparison.

The full writing skill, distilled from the NYT upgrade run, is in [`runs/nyt-upgrade/writing-nyt.md`](runs/nyt-upgrade/writing-nyt.md).

## What the Output Looks Like

The best way to understand what selfwrite produces is to read the output at different stages. The `runs/nyt-upgrade/` directory contains a complete run: 12 iterations, same topic at each stage, so you can see exactly how the text changes.

### Cycle 1 (composite 4.95)

The baseline. Analytically sound, properly sourced. Reads like a wire service report.

> Canada's housing affordability crisis deepened in 2025, with the average home price reaching $782,000, a 6.3% year-over-year increase that outpaced wage growth by more than three to one. The gap between what Canadians earn and what they'd need to buy a home hasn't been this wide since Statistics Canada began tracking the ratio in 1976.
>
> The numbers are stark. A household earning the national median income of $74,600 can afford a mortgage of roughly $340,000, less than half the average purchase price. In Toronto and Vancouver, the ratio is worse: median earners can cover barely a third of the average home cost.

No scene. No people. No tension pulling the reader into the next paragraph.

### Cycle 6 (composite 7.00)

Six iterations in, the loop has added lede craft, story architecture, and a question engine that chains paragraphs through unanswered questions. The topic shifts to a climate scientist profile to test narrative range:

> The steel rod slides in too easily. Anya Petrova pulls it free, wipes the mud from the depth mark, and checks: 2.4 meters. She writes the number in her field notebook and doesn't say anything for a while.
>
> In 2014, her first summer in Tuktoyaktuk, the same rod stopped at 1.2 meters. The permafrost was solid below that line, frozen for roughly 10,000 years. Now the thaw reaches twice as deep. What took millennia to freeze is unfreezing in a decade.
>
> That would be alarming enough on its own. But the problem isn't the thaw. It's what the thaw releases.

Scene-setting with specific detail. The last line opens a question the reader needs answered. That unanswered question is what pulls them into the next paragraph.

### Cycle 12 (composite 8.15)

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

Multiple named sources. Quotes reserved for things that can't be paraphrased: Petrova's disbelief, Shakhova's metaphor. Data woven into the narrative rather than stacked in a paragraph. The kicker echoes the opening action with new weight:

> She caps the vial and seals it for the lab in Moscow, where someone else will run the numbers a third time.

### Score Trajectory

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

12 iterations. 11 kept, 0 reverted. All six scoring dimensions at 8+. The distilled skill file is in [`runs/nyt-upgrade/writing-nyt.md`](runs/nyt-upgrade/writing-nyt.md).

## Run Structure

Each run creates a self-contained directory:

```
selfwrite/runs/<run-id>/
  versions/          # v0.md, v1.md ... draft snapshots after each kept iteration
  samples/           # writing samples showing how output evolves
  research/          # topic research notes
  rubric.md          # scoring rubric, locked at start
  log.md             # iteration journal with hypotheses, scores, decisions
  results.tsv        # one row per iteration, structured data
  learnings.md       # expert questions and craft principles that worked
  skill.md           # distilled skill output, reusable for future runs
```

Three outputs matter:

**The revised draft.** Each kept iteration is saved as a version snapshot. You can trace exactly how the text evolved and pick the version you want.

**The skill file.** Distilled patterns from the run: which editorial questions exposed real weaknesses, which revision types produced the biggest score jumps, what to avoid. Install it as a Claude Code skill and every future piece in that domain starts stronger.

**The log.** Full iteration history with scores, hypotheses, and keep/revert decisions. If you want to understand why a particular revision worked, it's here.

## Usage

Selfwrite is a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill. Invoke it with a task description and a time budget:

```
/selfwrite "task description" <duration>
```

Duration format: `Nm` (minutes) or `Nh` (hours). Minimum 10 minutes.

**Improving a draft:**

```
/selfwrite "revise this feature piece on municipal broadband expansion" 30m
/selfwrite "tighten this opinion column on housing policy" 20m
/selfwrite "rewrite the README for this repo as a summary of the analysis" 45m
```

**Writing from scratch:**

```
/selfwrite "feature profile of a climate scientist studying permafrost thaw" 30m
/selfwrite "news analysis of Q4 provincial budget data" 20m
```

**Building reusable editorial skills:**

```
/selfwrite "upgrade writing.md to NYT journalist quality" 6h
/selfwrite "create a style guide for data-driven policy analysis" 2h
```

Selfwrite detects artifact type from task keywords and adapts the rubric, expert persona, and scoring dimensions to match. It uses the full time budget. It never exits early.

## Installation

Copy `selfwrite.md` to your Claude Code skills directory:

```bash
cp selfwrite.md ~/.claude/skills/selfwrite.md
```

Invoke with `/selfwrite` in any Claude Code session.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
