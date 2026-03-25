---
name: selfwrite
description: >
  Self-improving iteration loop. Takes any task and a time budget, autonomously
  iterates to produce the best possible output, then distills learnings into a
  reusable skill file. Use when the user says /selfwrite, asks to "iterate on
  this with a time budget", "improve this for N minutes", or wants autonomous
  self-improving output on any task. Works for any domain: financial reports,
  code, data analysis, writing, strategy documents, or anything else.
command: selfwrite
argument-hint: '"task description" <duration>' (e.g., "financial report on Q4 budget data" 30m)
---

# Selfwrite: Autonomous Self-Improving Loop

You are running a time-boxed self-improvement loop. Each iteration follows a strict three-phase cycle: **THINK → TEST → REFLECT**. You will iterate on a task, score yourself honestly, ask expert-level questions to push quality higher, and distill what you learn into a reusable skill file.

**HARD RULE: Use the ENTIRE time budget. Never exit early. The time budget is an investment in depth, not a deadline to beat.**

## Argument Parsing

Parse `$ARGUMENTS` as: everything in quotes is the task description, the remaining token is the duration.

- Duration format: `Nm` (minutes) or `Nh` (hours). Examples: `30m`, `1h`, `90m`
- If no duration: ask "How long should I run? (e.g., 15m, 30m, 1h)"
- If no task: ask "What should I create?"
- Minimum duration: 10 minutes. Below this, warn and suggest longer.

## Setup

1. Parse task and duration
2. Record `start_time` via `date +%s`, calculate `deadline = start_time + (duration * 60)`
3. Create lab directory: `selfwrite/runs/YYYY-MM-DD_HHMMSS/` with subdirectories:
   ```
   selfwrite/runs/<run-id>/
     versions/          # v0.md, v1.md, ... (artifact snapshots)
     research/          # gathered sources, data, counterarguments (deep rewrite only)
     rubric.md          # scoring rubric (generated once, locked)
     log.md             # research journal (narrative log of each iteration)
     results.tsv        # structured data (iteration, scores, keep/revert, delta)
     skill.md           # distilled skill output (Phase 2)
     summary.md         # final metrics and learnings
   ```
4. Detect artifact type from task keywords:
   - "code", "function", "class", "script", "API" → code artifact (.py/.ts/.js)
   - "report", "summary", "analysis", "memo", "findings" → prose artifact (.md)
   - "pipeline", "workflow", "config" → config artifact (appropriate extension)
   - Default → prose artifact (.md)
5. Calculate phase boundaries:
   - Default: 60% iteration loop / 30% distill / 10% summarize
   - Short budget (<15m): 70% / 20% / 10%
   - Long budget (>60m): 55% / 35% / 10%
6. Initialize `log.md` and `results.tsv` (with header row: `iteration\ttarget\thypothesis\tcomposite_before\tcomposite_after\tdelta\tdecision\treason\tresearch_findings\tresearch_approved`)
7. **Rewrite mode decision.** Ask the user:
   > "Do you want me to research and add context as I revise, or focus purely on improving what's already here?"
   > 1. **Deep rewrite** — I'll research context, counterarguments, and missing evidence alongside each revision. You approve what gets added.
   > 2. **Simple rewrite** — I'll focus on prose quality, structure, and style. No new content added.

   - If **simple rewrite** (or artifact is code/config/changelog): skip all RESEARCH steps. The loop runs as THINK → TEST → REFLECT only.
   - If **deep rewrite**: activate the RESEARCH phase (see below). It runs alongside THINK every iteration.

8. **Intake questions.** For prose artifacts, ask the user these questions before generating the rubric. Their answers shape the rubric weights and the revision approach. The user can skip any question (defaults apply).

   **Core questions** (always ask):
   - **Audience**: Who is reading this? What do they already know about the topic?
   - **Purpose**: What should the reader know, believe, or do after reading? (inform, persuade, explain, entertain)
   - **Genre**: What kind of piece is this? (news report, feature, opinion/op-ed, explainer, data analysis, memo, executive summary)
   - **Tone**: How should it sound? (formal, conversational, urgent, reflective, authoritative) Name a publication or writer as a model if possible

   **Scoping questions** (ask if not obvious from the task):
   - **Length**: Target word count or length constraint?
   - **Key claim**: In one sentence, what is the main point?
   - **Evidence type**: What kind of support matters most? (data, expert quotes, anecdotes, policy examples)
   - **Known weaknesses**: What's wrong with the current draft? Where does it lose the reader?

   **How answers change the approach**:
   | Answer | Changes |
   |--------|---------|
   | Audience = experts | Allow jargon, skip definitions, increase information density |
   | Audience = general public | Define terms, use analogies, lower information density |
   | Purpose = persuade | Lead with thesis, handle counterarguments, emotional hooks |
   | Purpose = inform | Lead with finding, complete coverage, neutral tone |
   | Genre = opinion | Commit to a position, crisp evidence, kicker with conviction |
   | Genre = explainer | Layered explanation (analogy → mechanism), accessible vocabulary |
   | Tone = conversational | More contractions, shorter sentences, colloquialisms OK |
   | Tone = formal | Fewer contractions, complex nominals, measured cadence |

   **Follow-up questions** (ask based on initial answers):
   - If audience = experts: "What's the one thing they don't already know?" (This is your lede)
   - If purpose = persuade: "What's the strongest counterargument? Should I address it directly or preempt it?"
   - If genre = data analysis: "What's the finding that surprised you most?" (Lead with it)
   - If tone model named: "Should I match their sentence rhythm too, or just the overall register?"
   - If known weakness = "it's boring": "Where exactly does interest drop? After the opening? In the middle? During the data sections?"

   **Diagnostic questions** (ask when editing existing text):
   - "What would the worst version of this piece look like?" (Negative anchors clarify what to avoid)
   - "Is there a sentence or section you already know is weak?" (Writers usually know; they just haven't fixed it)
   - "What reaction do you want from the reader at the end? Trust? Alarm? Clarity? Action?"
   - "If you could keep only one paragraph, which one?" (This reveals the core)

   If the user skips all questions, default to: general audience, informative purpose, explainer genre, conversational-but-authoritative tone.

## Rubric Generation

Generate 4-6 scoring dimensions specific to the task. Each dimension needs:
- **Name**: concise label
- **Definition**: one sentence explaining what this measures
- **Observable markers**: what score 1-2, 5-6, and 9-10 look like (concrete, not vague)
- **Weight**: between 0.10 and 0.35, all weights sum to 1.0

The dimension most tied to the task's PURPOSE gets the highest weight.

### Domain Templates (customize per task)

**Prose / Reports / Analysis:**
- Specificity: concrete details, numbers, named examples vs. vague generalities
- Structure: logical flow, clear sections, point-first paragraphs vs. meandering
- Audience calibration: tone and complexity match the target reader
- Actionability: reader knows what to do next / "so what?" is answered
- Evidence quality: claims backed by specific data vs. unsupported assertions

**Code:**
- Correctness: handles stated inputs and produces correct outputs
- Edge cases: handles empty, null, oversized, malformed, concurrent inputs
- Readability: understandable without comments, clear naming, single-purpose functions
- Efficiency: appropriate algorithmic complexity for the problem

**Financial / Data Analysis:**
- Analytical depth: surface description vs. causal/structural analysis
- Data integrity: real numbers, proper sourcing, no fabrication
- Contextual framing: numbers in context (temporal, relative, tangible comparisons)
- Intellectual honesty: limitations acknowledged, uncertainty stated

**The rubric locks once generated. No mid-run changes.** If a dimension turns out to be wrong, log it as a learning for distillation.

Save rubric to `rubric.md`.

## Baseline

1. Produce the initial artifact (v0) — competent first draft, no over-investment
2. Save to `versions/v0.md` (or appropriate extension)
3. Score using the **Adversarial Scoring Protocol** (see below)
4. **ANCHOR BASELINE AT 4-6** — hard rule. A first draft is not excellent. No dimension above 7.
5. Log scores with evidence to `log.md`, write first row to `results.tsv`

## The Loop: THINK (+ RESEARCH) → TEST → REFLECT

Run until the iteration phase deadline. Minimum 3 iterations per run.

**Simple rewrite** (no RESEARCH):
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

**Deep rewrite** (with RESEARCH):
```
       ┌────────────────────────────────────────┐
       │                                        │
       ▼                                        │
  ┌──────────┐    ┌──────────┐                  │
  │  THINK   │    │ RESEARCH │  (parallel)      │
  │ (style)  │    │(substance)│                 │
  └────┬─────┘    └────┬─────┘                  │
       │               │                        │
       ▼               ▼                        │
  ┌──────────────────────────┐                  │
  │  SURFACE findings to user │                 │
  │  User approves/rejects    │                 │
  └────────────┬─────────────┘                  │
               │                                │
               ▼                                │
          ┌─────────┐                           │
          │  TEST   │  Revise (style +          │
          │         │  approved research)       │
          └────┬────┘                           │
               │                                │
               ▼                                │
          ┌─────────┐                           │
          │ REFLECT │  Log, check convergence   │
          └────┬────┘                           │
               │                                │
               └────────────────────────────────┘
```

---

### THINK

Read the iteration history. Analyze what has worked and what has not. Form a testable hypothesis.

**1. Target Selection**
Pick the lowest-scoring rubric dimension. If the same dimension was targeted for 2 consecutive iterations with no improvement, switch to the second-lowest.

**2. Expert Question Generation**
Adopt the persona of a deep domain expert reviewing this artifact. Generate 2-3 questions that:
- Reference SPECIFIC content in the current artifact (not generic)
- Target the weakest dimension
- Frame as "why" or "what if" (not "did you consider")
- Each probes a DIFFERENT weakness
- Would change what's written (if the answer is "yes it does," the question was too easy)

**3. Answer the Questions**
Answer thoroughly with SPECIFIC, ACTIONABLE insights.
Bad: "make the analysis deeper"
Good: "the revenue growth claim in paragraph 2 lacks a base year comparison — add YoY growth rate and compare to sector median"

**4. Form Hypothesis**
State a single, testable hypothesis:
> "Hypothesis: Adding per-capita normalization to the spending table will improve Contextual Framing from 4 to 5 because raw dollar figures without population context mislead the reader about intensity."

The hypothesis must name: the change, the target dimension, the expected score delta, and the reasoning. Write it to `log.md` before proceeding.

**Thought experiments:** If reasoning alone can resolve the hypothesis (no artifact change needed), record the conclusion and move to the next hypothesis. This conserves iterations for changes that require actual revision.

---

### RESEARCH (deep rewrite only)

**Skip this section entirely in simple-rewrite mode.** RESEARCH runs in parallel with THINK. While THINK diagnoses the weakest stylistic dimension, RESEARCH diagnoses substantive gaps.

**1. Gap Analysis** — Read the current artifact and identify:
- Claims that lack evidence or sourcing
- Counterarguments the piece ignores or underweights
- Context a knowledgeable reader would expect (historical, comparative, causal)
- Numbers presented without framing (no base year, no per-capita, no comparison)

**2. Gather** — Use available tools to fill gaps:
- Web search for supporting data, contradicting data, and context
- Read referenced documents or repos for additional detail
- Check whether claims are current and accurate
- Identify the strongest counterargument to the piece's central claim
- Save gathered sources to `research/` directory

**3. Surface to User** — Present max 3 findings before TEST:
> **Research findings (iteration N):**
> 1. [Factual] The piece claims X, but Y source says Z. Include?
> 2. [Adversarial] Strongest counterargument: ... Address it?
> 3. [Contextual] Missing comparison to ... Add?
>
> **Which findings should I incorporate? (numbers, "all", or "none")**

**4. Incorporate** — Approved findings feed into the TEST revision alongside THINK's stylistic hypothesis. Rejected findings are logged but not added.

**RESEARCH rules:**
- Never add content without user approval. Zero autonomous additions.
- Max 3 findings per iteration: one factual, one contextual, one adversarial. Don't overwhelm.
- Findings must be specific and cite-able. "Consider adding context" is not a finding.
- **Decay**: Early iterations surface substantive gaps. Past score 7, narrow to fact-checking and counterargument stress-testing. Past 8.5, verification only.
- Log all findings (approved and rejected) to `log.md` with the user's decision.

---

### TEST

Execute the hypothesis. Revise the artifact. Measure the result.

**1. Revise**
Apply the insights from THINK to produce a new version. In deep-rewrite mode, also incorporate user-approved RESEARCH findings. Address the specific weaknesses identified — do not rewrite everything. Save to `versions/v{N}.md`.

**2. Score**
Follow the full **Adversarial Scoring Protocol** (below).

**3. Decide: Keep or Revert**

| Outcome | Action |
|---------|--------|
| Composite score improved | **KEEP** — v{N} becomes the new best |
| Score equal but artifact is simpler/cleaner | **KEEP** — simpler is better at equal quality |
| Score equal or worse | **REVERT** — best_version stays, log what went wrong |
| Improved target but damaged 2+ other dimensions | **REVERT** — even if composite rose, collateral damage is unacceptable |

---

### REFLECT

Log the result. Check convergence signals. Decide what to do next.

**1. Log to `log.md`** (narrative):
- Iteration number and timestamp
- Target dimension
- Hypothesis (verbatim)
- Questions asked and answers (summarized)
- Per-dimension scores before and after
- KEEP/REVERT decision with reasoning
- (Deep rewrite only) RESEARCH findings surfaced, user's approval/rejection, and how approved findings were incorporated

**2. Log to `results.tsv`** (structured):
Append one row: `{iteration}\t{target}\t{hypothesis_summary}\t{composite_before}\t{composite_after}\t{delta}\t{keep|revert}\t{one-line reason}\t{research_findings|none}\t{approved_numbers|none}`

**3. Check Convergence Signals**

| # | Signal | Meaning | Response |
|---|--------|---------|----------|
| 1 | **3+ consecutive reverts** | Current approach exhausted | Pivot: different dimension, different angle, or structural rethink |
| 2 | **Score plateau (<0.3 gain over 3 keeps)** | Incremental gains diminished | Try a radical change: restructure, reframe, change audience lens |
| 3 | **Same dimension targeted 3+ times without improvement** | Over-optimization in one area | Move to a different dimension entirely |
| 4 | **Alternating keep/revert** | Variables conflated | Isolate: change only ONE thing per iteration |
| 5 | **Hypothesis contradicts prior results** | Mental model incorrect | Re-read the full artifact fresh; rethink fundamentally |
| 6 | **All dimensions at 7+** | Approaching ceiling | Switch to polish mode: sentence-level refinement, not structural changes |

These are advisory signals, not rigid rules. Use judgment. Log which signal triggered and the response chosen.

**4. Time Check**
Run `date +%s`. If remaining time < 1.5x average iteration time, exit the loop and proceed to distillation. If time remains, return to THINK.

---

## Adversarial Scoring Protocol

Five safeguards against self-inflation:

### 1. Pre-Score Weakness Articulation
BEFORE assigning ANY scores, state the 2-3 biggest weaknesses in the current version. Write them down. This forces honest assessment before scoring begins.

### 2. Comparative Scoring
For each dimension, compare to the previous best version:
> "Dimension X: v{N} is [better/same/worse] than v{best} because [specific reason]"

Adjust the score accordingly. Scores CAN go down if the revision damaged a dimension.

### 3. Evidence Requirement
Every score must cite specific content from the artifact:
> "Structure: 6/10 — paragraphs 2-3 cover the same ground and could be merged; the transition from methodology to findings is abrupt"

NOT: "Structure: 7/10 — good organization"

### 4. Maximum Increment Rule
No dimension increases by more than +1 per iteration. A mediocre revision cannot jump from 4 to 8.

### 5. Baseline Anchor
The baseline (v0) scores in the 4-6 range. This is calibration, not false modesty — a first draft is adequate, not excellent.

### 6. Audience-Anchored Assessment
Score against the audience identified in intake, not against abstract quality. A piece written for general public readers should be scored on whether a general reader would follow it, not whether it's technically rigorous. A piece for experts should be scored on analytical depth, not accessibility. Reference the audience profile targets (sentence length, jargon level, evidence type) from the writing skill when scoring.

### Composite Score
```
composite = sum(weight_i * score_i) for all dimensions
```

## Distillation Phase

Time allocation: ~30% of total budget.

### Step 1: Analyze the Iteration Log
Read `results.tsv` and `log.md` end-to-end. For each KEPT iteration: what dimension improved? What hypothesis was correct? What revision pattern worked? For each REVERTED iteration: why did it fail? What should be avoided?

### Step 2: Extract Patterns
Group successful revisions by type:
- Content additions (added data, examples, specificity)
- Structural changes (reordering, splitting, merging sections)
- Framing adjustments (audience calibration, tone, emphasis)
- Removal (cutting fluff, redundancy, weak claims)

Identify which question patterns produced the biggest score deltas.

**(Deep rewrite only)** Also extract research patterns:
- Which finding types did the user consistently approve? (factual, contextual, adversarial)
- Which did they reject? Why?
- At what score threshold did research findings stop being useful?
- What sources or data types were most valuable?

### Step 3: Generate the Skill File
Write to `runs/<id>/skill.md`:

```markdown
# [Domain] Quality Guide

## Scoring Rubric
[The refined rubric — adjusted based on what was learned during iteration]

## Common Weaknesses and Fixes
[Top 3-5 patterns from successful iterations, with before/after examples]

## Expert Questions to Ask
[The most productive questions from this run, GENERALIZED for reuse]
[Capture the QUESTIONS, not the answers — questions transfer better]

## Anti-Patterns
[What to avoid, derived from reverted iterations]

## Convergence Notes
[Which convergence signals fired? What triggered pivots? What worked after pivoting?]

## Revision Protocol
[Step-by-step process derived from what worked, in order of impact]
```

### Step 4: Meta-Improvement
Read the skill file as if seeing it for the first time:
- Is it actionable without context from this run?
- Are patterns specific enough to be useful, general enough to transfer?
- Run 1-2 revision passes on the skill text itself.

## Summary Phase

Time allocation: ~10% of total budget. Write `summary.md`.

### Score Trajectory Table
```
| Version | Dim1 | Dim2 | Dim3 | Dim4 | Composite | Status   |
|---------|------|------|------|------|-----------|----------|
| v0      | 5    | 4    | 5    | 4    | 4.5       | baseline |
| v1      | 6    | 4    | 5    | 5    | 5.1       | kept     |
| ...     |      |      |      |      |           |          |
```

### Metrics
- Total iterations: N attempted, M kept, K reverted
- Starting composite → final composite (delta)
- Total elapsed time, time per phase
- Convergence signals that fired

### Key Learnings (top 3)
### Hypotheses That Worked (top 2-3 that led to biggest score deltas)
### What Didn't Work (reverted approaches and why)
### Convergence Behavior (did the score plateau? where? what broke through?)

Present the summary to the user. Offer to install the generated skill to `~/.claude/skills/`.

## Expert Personas Reference

| Domain | Persona | Question style |
|---|---|---|
| Financial analysis | Senior equity analyst | "What's the margin trend? Cyclical or structural?" |
| Data analysis | Research director | "Correlation or causation? What confounders?" |
| Engineering | Senior code reviewer | "What happens at N=0? What's the complexity?" |
| Writing | Publication editor | "Can I cut paragraph 1? Where's the lead?" |
| Strategy | Board advisor | "What's the downside case? What was rejected?" |

Adapt the persona to the task domain. These are starting points, not rigid templates.
