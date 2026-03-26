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

You are running a time-boxed self-improvement loop. Each iteration follows a multi-agent cycle: **THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT**. You will iterate on a task, score yourself honestly, ask expert-level questions to push quality higher, and distill what you learn into a reusable skill file. Three independent review agents — a **Reader Agent**, a **Voice Auditor**, and a **Synonym Agent** — evaluate every draft from distinct cognitive perspectives before revisions are finalized, catching blind spots that self-evaluation misses and breaking the statistical patterns that make AI-generated text detectable.

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
   - Default: 55% iteration loop / 5% clean slate review / 30% distill / 10% summarize
   - Short budget (<15m): 65% / 5% / 20% / 10%
   - Long budget (>60m): 50% / 5% / 35% / 10%

   **Review agent scaling for short budgets**: On budgets under 15 minutes, the three-agent REVIEW step consumes a larger fraction of each iteration. To ensure the minimum 3 iterations:
   - **Under 15m**: Run only the Voice Auditor and Synonym Agent (skip Reader Agent — the coordinator's own reading suffices for short pieces). Re-enable Reader Agent if any dimension drops below 5.
   - **Under 10m**: Run only the Synonym Agent (minimal overhead, still breaks detection patterns). Voice Auditor and Reader Agent are skipped entirely.
   - **15m and above**: All three agents run every iteration (default behavior).
6. Initialize `log.md` and `results.tsv` (with header row: `iteration\ttarget\thypothesis\tcomposite_before\tcomposite_after\tdelta\tdecision\treason\tmode\tresearch_findings\tresearch_approved\treader_annotations\tvoice_audit_count\tsynonym_applied\tsynonym_rejected`). The `mode` column is `regular` for standard iterations or `red_team`/`structural`/`constraint` for Breakthrough Protocol iterations
7. **Rewrite mode decision.** Ask the user:
   > "Do you want me to research and add context as I revise, or focus purely on improving what's already here?"
   > 1. **Deep rewrite** — I'll research context, counterarguments, and missing evidence alongside each revision. You approve what gets added.
   > 2. **Simple rewrite** — I'll focus on prose quality, structure, and style. No new content added.

   - If **simple rewrite** (or artifact is code/config/changelog): skip all RESEARCH steps. The loop runs as THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT (no RESEARCH phase).
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
   | Tone = conversational | More contractions, shorter sentences, colloquialisms OK. Register level 4-5 |
   | Tone = formal | Fewer contractions, complex nominals, measured cadence. Register level 2 |
   | Tone = institutional | Register level 1. Third-person throughout. Zero rhetorical questions. Zero direct address. Passive acceptable. "The index declined 46%" not "Crime is falling." See Voice Register Spectrum |
   | Genre = data analysis | Lead with finding, not narrative. Data speaks first. Charts introduced by what they show, not by dramatic framing. No hooks or kickers |
   | Genre = news report | Inverted pyramid: most important finding first. Attribution to sources. Third-person. No editorial commentary |

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

   If the user skips all questions, default to: general audience, informative purpose, explainer genre, authoritative tone (register level 3).

## Voice Register Spectrum

When the user specifies a tone, map it to a register level. The register constrains every revision -- it is not a suggestion but a hard boundary. Every iteration must comply.

| Level | Label | Characteristics | Examples |
|-------|-------|----------------|----------|
| 1 | Institutional | Third-person only. No rhetorical questions. No direct address. Passive acceptable. Data states itself. Hedged where uncertain. No narrative devices. | StatsCan reports, WHO briefs, central bank statements |
| 2 | Formal analytical | Third-person. Controlled analytical observations allowed ("This suggests..."). No rhetorical questions. No scene-setting. Minimal narrative. | The Economist data briefs, OECD policy notes |
| 3 | Authoritative journalism | Third-person dominant. Occasional "we" for shared context. Findings-first but analytical voice shapes framing. Short punches allowed sparingly. | NYT news analysis, Reuters long-form |
| 4 | Accessible journalism | First/second person allowed. Rhetorical questions allowed sparingly. Scene-setting hooks. Narrative arc. Short punches for emphasis. | NYT Upshot, FiveThirtyEight, Vox explainers |
| 5 | Conversational/op-ed | Direct address. Rhetorical questions freely. Strong editorial voice. Punchy one-liners. Dramatic pacing. Opinion-adjacent framing. | Opinion columns, blog posts, newsletters |

**Default: Level 3** (Authoritative journalism). Override via intake tone answer.

**Mapping from intake:**
- Tone = formal / institutional → Level 1-2
- Tone = authoritative → Level 3
- Tone = conversational → Level 4
- Tone = casual / editorial → Level 5
- If user names a publication or institution: match that source's register level

### Editorial Anti-Patterns (enforce when register ≤ 2)

These techniques are appropriate at register 4-5 but **forbidden** at register 1-2 and **restricted** at register 3. The scoring protocol deducts points when they appear at the wrong register level.

| Anti-pattern | Example | Why it's editorial | Fix |
|-------------|---------|-------------------|-----|
| Rhetorical questions | "So why does nearly half the province believe the opposite?" | Implies the author knows the answer and is building suspense | State the finding directly: "Five data-traceable factors explain the divergence." |
| Direct address | "Ask British Columbians..." | Creates intimacy between author and reader; inappropriate for institutional voice | "Survey data indicates that 42% of BC residents..." |
| Scene-setting hooks | "In Chilliwack, a city of 100,000..." | Narrative device that prioritizes engagement over information density | "Chilliwack's per-capita crime rate (11,352/100k) is 2.1x Vancouver's." |
| Punchy one-liners for emphasis | "That's not a rounding error. It's a structural divide." | Editorial judgment disguised as observation | "The 2.1x differential reflects structural factors including..." |
| Opinion-adjacent framing | "This isn't a capacity gap. It's a design limitation." | Presents interpretation as settled fact | "This pattern is consistent with structural constraints rather than capacity limitations." |
| Dramatic pacing | "Now the pieces come together." | Narrative device; presumes the reader is following a story arc | Omit. Let the analysis section speak for itself. |
| Kicker closings | "It is whether the institutions can earn the credibility to be believed." | Rhetorical flourish that belongs in an opinion piece | State the conclusion plainly: "Addressing these five factors would narrow the gap between reported crime trends and public perception." |

---

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
- Audience calibration: tone and complexity match the target reader. Every sentence is self-sufficient: a reader encountering it mid-scroll understands the claim without referring to a glossary or earlier section. Technical terms used more than 2 paragraphs after their definition include a brief inline reminder (parenthetical or appositive). For scores above 7, no sentence should stack 3+ unfamiliar concepts without inline clarification. Target grade 12 reading level. Every sentence must be parseable on first read. No more than one subordinate clause per sentence. All pronouns and demonstratives ('this,' 'these,' 'such') must have an unambiguous referent within the same sentence or the immediately preceding one
- Actionability: reader knows what to do next / "so what?" is answered
- Evidence quality: claims backed by specific data vs. unsupported assertions
- Register discipline: voice stays within the target register level throughout; no drift toward editorial at inappropriate register levels (see Voice Register Spectrum)

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

## The Loop: THINK (+ RESEARCH) → DRAFT → REVIEW → REVISE → SCORE → REFLECT

Run until the iteration phase deadline. Minimum 3 iterations per run.

**Simple rewrite** (no RESEARCH):
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

**Deep rewrite** (with RESEARCH):
```
       ┌──────────────────────────────────────────────────┐
       │                                                  │
       ▼                                                  │
  ┌──────────┐    ┌──────────┐                            │
  │  THINK   │    │ RESEARCH │  (parallel)                │
  │ (style)  │    │(substance)│                           │
  └────┬─────┘    └────┬─────┘                            │
       │               │                                  │
       ▼               ▼                                  │
  ┌──────────────────────────┐                            │
  │  SURFACE findings to user │                           │
  │  User approves/rejects    │                           │
  └────────────┬─────────────┘                            │
               │                                          │
               ▼                                          │
          ┌─────────┐                                     │
          │  DRAFT  │  Revise (style + approved research) │
          └────┬────┘                                     │
               │                                          │
               ▼                                          │
  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
  │  READER  │  │  VOICE   │  │ SYNONYM  │  (parallel)   │
  │  AGENT   │  │ AUDITOR  │  │  AGENT   │               │
  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
       │              │             │                     │
       ▼              ▼             ▼                     │
  ┌──────────────────────────────────────┐                │
  │  REVISE  │  Incorporate annotations  │                │
  └────┬─────────────────────────────────┘                │
               │                                          │
               ▼                                          │
          ┌─────────┐                                     │
          │  SCORE  │  Adversarial Scoring Protocol       │
          └────┬────┘                                     │
               │                                          │
               ▼                                          │
          ┌─────────┐                                     │
          │ REFLECT │  Log, check convergence             │
          └────┬────┘                                     │
               │                                          │
               └──────────────────────────────────────────┘
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

**3. Surface to User** — Present max 3 findings before DRAFT:
> **Research findings (iteration N):**
> 1. [Factual] The piece claims X, but Y source says Z. Include?
> 2. [Adversarial] Strongest counterargument: ... Address it?
> 3. [Contextual] Missing comparison to ... Add?
>
> **Which findings should I incorporate? (numbers, "all", or "none")**

**4. Incorporate** — Approved findings feed into the DRAFT revision alongside THINK's stylistic hypothesis. Rejected findings are logged but not added.

**RESEARCH rules:**
- Never add content without user approval. Zero autonomous additions.
- Max 3 findings per iteration: one factual, one contextual, one adversarial. Don't overwhelm.
- Findings must be specific and cite-able. "Consider adding context" is not a finding.
- **Decay**: Early iterations surface substantive gaps. Past score 7, narrow to fact-checking and counterargument stress-testing. Past 8.5, verification only.
- Log all findings (approved and rejected) to `log.md` with the user's decision.

---

### DRAFT

Apply THINK insights to produce a candidate revision. In deep-rewrite mode, also incorporate user-approved RESEARCH findings. Save the draft to `versions/v{N}-draft.md`.

**Drafting rules:**
- **Targeted changes only**: Address the specific weaknesses identified by THINK. Do not rewrite everything — surgical revision beats wholesale replacement. Change as little as possible to test the hypothesis cleanly.
- **Scope**: Limit changes to the paragraphs and sentences named in the hypothesis and expert questions. If THINK identified paragraph 3's transition as weak, fix paragraph 3's transition — don't also reorganize paragraphs 5-7.
- **Preserve what works**: Sections that scored well in prior iterations should not be modified unless the hypothesis specifically targets them.
- **One hypothesis per draft**: Test one change at a time. If multiple changes are needed, pick the one with the highest expected impact and save the rest for the next iteration.

The draft is a candidate, not the final version. It will be reviewed by three independent agents before finalization.

---

### REVIEW

Launch three review agents **in parallel** against the draft. Each agent is a fresh subagent with no context carryover from previous iterations — this prevents them from developing the same blind spots as the main loop.

Each agent receives: the draft text, the rubric, the target audience profile (from intake), the current scores, and the specific dimension being targeted this iteration.

Each agent returns structured annotations (location + issue + severity). See the **Review Agents** section below for full specifications.

| Agent | Focus | Runs in parallel? |
|-------|-------|--------------------|
| **Reader Agent** | Engagement, comprehension, credibility, pacing — reads as the target audience | Yes |
| **Voice Auditor** | AI-tell patterns, sentence template repetition, rhythm monotony, register violations, transition diversity | Yes |
| **Synonym Agent** | Suggests 2nd/3rd-most-probable synonym substitutions to break AI detection statistical signatures | Yes |

---

### REVISE

Incorporate review annotations into a final version. The coordinator (not the agents) makes all decisions about which annotations to apply.

**Triage order:**
1. **Engagement drops** (Reader Agent) — highest priority, these are where readers stop reading
2. **AI-tell patterns** (Voice Auditor) — second priority, these make the text detectable
3. **Synonym substitutions** (Synonym Agent) — apply selectively, only where the substitution reads naturally
4. **Transition diversity** (Voice Auditor) — vary paragraph connectors
5. **Pacing and comprehension** (Reader Agent) — lower priority but still address
6. **Rhythm fixes** (Voice Auditor) — break monotonous sentence length sequences

**Rules:**
- If an annotation conflicts with the iteration's target dimension, prioritize the target dimension but log the conflict
- If an annotation can't be addressed without damaging another dimension, defer it to a future iteration
- Apply synonym substitutions only where the replacement preserves meaning and register — reject any that sound forced
- Save the final revised version to `versions/v{N}.md`

---

### SCORE

Follow the full **Adversarial Scoring Protocol** (below). Score `v{N}.md` (the revised version, not the draft).

**Decide: Keep or Revert**

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
- Reader Agent annotations (summarized): count, top issues flagged
- Voice Auditor annotations (summarized): patterns detected, rhythm analysis
- Synonym Agent substitutions: count applied, count rejected, examples of each
- (Deep rewrite only) RESEARCH findings surfaced, user's approval/rejection, and how approved findings were incorporated

**2. Log to `results.tsv`** (structured):
Append one row: `{iteration}\t{target}\t{hypothesis_summary}\t{composite_before}\t{composite_after}\t{delta}\t{keep|revert}\t{one-line reason}\t{mode}\t{research_findings|none}\t{approved_numbers|none}\t{reader_annotations}\t{voice_audit_count}\t{synonym_applied}\t{synonym_rejected}`

**3. Check Convergence Signals**

| # | Signal | Meaning | Response |
|---|--------|---------|----------|
| 1 | **3+ consecutive reverts** | Current approach exhausted | Pivot: different dimension, different angle, or structural rethink |
| 2 | **Score plateau (<0.3 gain over 3 keeps)** | Incremental gains diminished | Try a radical change: restructure, reframe, change audience lens |
| 3 | **Same dimension targeted 3+ times without improvement** | Over-optimization in one area | Move to a different dimension entirely |
| 4 | **Alternating keep/revert** | Variables conflated | Isolate: change only ONE thing per iteration |
| 5 | **Hypothesis contradicts prior results** | Mental model incorrect | Re-read the full artifact fresh; rethink fundamentally |
| 6 | **All dimensions at 7+ AND <0.3 gain over 2 keeps** | Ceiling reached | Enter **Breakthrough Protocol** (see below) |
| 7 | **Breakthrough iteration produced no gain** | Structural ceiling confirmed | Cycle to next breakthrough technique; if all 3 exhausted, accept plateau |
| 8 | **Voice Auditor flags same pattern 3+ iterations after first detection** | Drafter can't eliminate this AI-tell | Try Constraint-Based Revision targeting that specific pattern; if still persistent, accept it |
| 9 | **Voice Auditor annotation count not decreasing over 4+ iterations** | Drafter isn't learning to avoid AI patterns | Switch to aggressive synonym substitution and structural rethink focused on breaking sentence templates |
| 10 | **Reader Agent finds 0 engagement drops for 2 consecutive iterations** | Reader perspective exhausted | Skip Reader Agent for next iteration to save time; re-enable if score drops |

These are advisory signals, not rigid rules. Use judgment. Log which signal triggered and the response chosen.

**4. Time Check**
Run `date +%s`. If remaining time < 1.5x average iteration time, exit the loop and proceed to **Clean Slate Review**. If time remains, return to THINK.

---

## Review Agents

Three independent agents review every draft during the REVIEW step. Each runs as a fresh subagent (no context carryover between iterations) to provide genuine cognitive separation from the main loop. All three launch **in parallel**.

### Reader Agent

**Purpose**: Read the draft as the target audience. Flag where a real reader would stop reading, get confused, lose interest, or push back. This catches failures that self-evaluation misses — the same way a writer can't proofread their own work because they read what they meant, not what they wrote.

**Input** (provided in agent prompt):
- The full draft text
- Target audience description (from intake)
- Voice register level (1-5)
- Current rubric with scores
- The specific dimension being targeted this iteration

**Output format** (structured annotations):
```
## Reader Review

### Engagement Drops
- [Para N, sentence M]: Reader loses thread because [specific reason]
- [Para N]: Attention drops here — [why]

### Comprehension Failures
- [Para N]: Assumes knowledge of [X] that target audience lacks
- [Para N, sentence M]: Ambiguous referent, "it" could mean [A] or [B]
- [Para N]: Sentence stacks 3+ technical concepts without inline explanation: [list concepts]
- [Para N]: Term "[X]" was defined in Key Terms / paragraph M but is used here without reminder; reader must scroll back

### Credibility Gaps
- [Para N]: Claim [X] unsupported — reader would ask "says who?"
- [Para N]: Hedge weakens what should be a confident assertion

### Pacing Issues
- [Section X]: Drags — information density too low for 3 paragraphs
- [Para N-M]: Three consecutive paragraphs start with same structure
```

**Behavioral rules**:
- Read linearly, as a human would; don't skip around
- Flag the FIRST point where you'd stop reading (highest priority annotation)
- Flag any sentence that stacks 3 or more unfamiliar or technical concepts simultaneously. If a sentence needs a glossary to parse, it needs inline clarification or splitting into shorter claims
- Flag any sentence that depends on a definition from a Key Terms section or earlier paragraph that the reader may not remember. Technical terms used more than 2 paragraphs after their definition need a brief inline reminder (parenthetical or appositive)
- Maximum 8 annotations per review (force prioritization)
- Each annotation must cite specific text, not vague complaints
- Never suggest rewrites; only identify problems (the coordinator rewrites during REVISE)

---

### Voice Auditor

**Purpose**: Hunt for patterns that make text identifiable as AI-generated. This is adversarial detection, not quality scoring. Also enforces transition diversity between paragraphs.

**Input** (provided in agent prompt):
- The full draft text
- Voice register level (1-5)
- The editorial anti-patterns list (from Voice Register Spectrum)

**Output format** (structured annotations):
```
## Voice Audit

### AI-Tell Patterns Detected
- [Location]: Pattern: [name]. Evidence: "[quoted text]"

### Sentence Template Repetition
- Template "[structure]" appears N times: [locations]

### Rhythm Analysis
- Sentence length sequence: [N, N, N, N, N...] — monotonous at [section]
- Recommended: break with [short/long] sentence at [location]

### Transition Diversity
- Transition "[word/phrase]" used N times: [locations]
- Consecutive paragraphs [N-M] all use [same transition type]
- Suggested variety: [alternatives appropriate for register level]

### Register Violations
- [Location]: Anti-pattern "[name]" violates register level [N]

### Hedge Clustering
- [Para N]: N hedges in M sentences: "[list]"
```

**AI-Tell Pattern Catalog** (check for all of these every audit):

| Pattern | Description | Example |
|---------|-------------|---------|
| Kill-list words | Words on the banned list | "robust," "comprehensive," "notable," "demonstrates," "significant" (without p-value) |
| Em-dash usage | Any em-dash character (— or --) anywhere in the text. Zero tolerance. Replace with colons, semicolons, parentheses, commas, or sentence breaks | "The policy — which was controversial — failed" → "The policy (which was controversial) failed" |
| Hedge clustering | 3+ hedges within 2 sentences | "somewhat arguably perhaps" |
| Sentence template repetition | Same syntactic structure 3+ times in 5 paragraphs | "[Topic] is [adjective]. [Topic] is [adjective]." |
| Rhythm monotony | 5+ consecutive sentences within 20% of same word count | All sentences 15-18 words |
| Transition word repetition | Same transition used 3+ times in the piece | "However," "Moreover," "Furthermore" |
| List-then-elaborate | Announce N items, then walk through each identically | "There are three factors. First... Second... Third..." |
| Symmetric structure | Every paragraph same length, same shape | All paragraphs: topic sentence + 3 supporting + concluding |
| Over-signposting | Excessive meta-commentary about structure | "As mentioned earlier," "As we will see," "It's worth noting" |
| Qualitative vagueness | Magnitude words without specifics | "significant increase" (no number), "growing concern" (no evidence) |
| Vague referents | Sentence opens with "this," "these," "such," or "the pattern" without naming what it refers to | "This suggests..." "Such convergence points to..." |

**Transition Diversity Rules**:

The auditor checks that paragraph-to-paragraph transitions use varied connective strategies. Monotonous transitions are an AI-tell — humans naturally vary how they bridge paragraphs.

| Register | Acceptable transition strategies | Forbidden |
|----------|--------------------------------|-----------|
| 1-2 (Institutional/Formal) | Logical connectives ("consequently," "by contrast"), referential bridges (repeat key noun from prior paragraph), temporal markers ("in Q3," "subsequently"), data-driven pivots ("this 12% gap...") | Colloquial bridges, rhetorical questions as transitions |
| 3 (Authoritative journalism) | All of the above plus: thematic pivots, contrastive pairs, cause-effect chains | Excessive "However/Moreover/Furthermore" cycling |
| 4-5 (Accessible/Conversational) | All of the above plus: direct address pivots, question-as-bridge, narrative continuity ("But that's only half the story") | N/A — all strategies available |

**Minimum transition variety**: No single transition word or strategy should appear more than twice in a piece. Flag violations.

**Behavioral rules**:
- Minimum 3, maximum 10 annotations per audit
- Each annotation must quote the specific offending text
- False positives are costly — only flag patterns you're confident about
- Rhythm analysis is mandatory every audit (compute sentence length sequence)
- Transition diversity check is mandatory every audit
- Never suggest rewrites — only identify patterns (the coordinator rewrites during REVISE)

---

### Synonym Agent

**Purpose**: Suggest word substitutions that break the statistical signature of AI-generated text. AI detection tools work partly by measuring how consistently text uses the most predictable word choices. When every word is the "obvious" choice, the text reads as machine-generated. By substituting with less predictable but equally valid synonyms, the text's statistical profile shifts toward human-written patterns (humans naturally use more varied, less predictable vocabulary).

**Input** (provided in agent prompt):
- The full draft text
- Voice register level (1-5)
- The current iteration number

**Output format** (structured substitution list):
```
## Synonym Substitutions

### Proposed Replacements
- [Para N, sentence M]: "[original word]" → "[suggested synonym]"
  Why less predictable: [brief explanation — e.g., "most writers default to 'significant' here; 'sharp' is equally accurate but less expected"]
  Register-appropriate: yes/no.

### Words Considered but Rejected
- [Para N]: "[word]" — no suitable less-predictable synonym exists without changing meaning

### Substitution Density
- Total proposed: N substitutions across M paragraphs
- Target density: maximum 1 substitution per 2 sentences, no more than 2 per paragraph
```

**How it works**:

1. **Scan each paragraph** for words where the chosen word feels like the "default" or most obvious choice — the word any AI or average writer would reach for first
2. **For each candidate word**, identify a less predictable synonym that:
   - Preserves the exact meaning in context
   - Matches the target register level (don't suggest casual synonyms for institutional prose)
   - Reads naturally in the sentence — if a human editor would flag the substitution as awkward, reject it
   - Is not itself an AI-tell word (don't replace one banned word with another)
   - A human expert in the domain might plausibly choose over the default
3. **Prioritize substitutions on**:
   - Common AI-default words (the words LLMs most predictably choose: "significant," "crucial," "utilize," "implement," "demonstrate," "facilitate")
   - Adjectives and adverbs (highest substitution flexibility)
   - Verbs (second priority — verb choice strongly affects detection)
   - Nouns (lowest priority — noun substitution risks changing meaning)
4. **Target density**: 1 substitution per 2 sentences, maximum 2 per paragraph. Exceeding this density risks making the text awkward and unclear. **Maximum 8 substitutions total per review** (caps the triage burden on the coordinator).

**Register-matched synonym selection**:

| Register | Synonym direction | Example |
|----------|-------------------|---------|
| 1-2 (Institutional) | Prefer precise, domain-specific alternatives. Avoid generic formal words that AI overuses ("utilize," "facilitate," "implement") | "increased" → "rose," "important" → "material," "shows" → "reflects" |
| 3 (Authoritative) | Prefer specific over generic. Choose words a beat reporter would use over words a press release would use | "significant" → "sharp," "problem" → "bottleneck," "change" → "pivot" |
| 4-5 (Conversational) | Prefer concrete, tactile, everyday words. Avoid anything that sounds like a corporate memo | "utilize" → "use," "facilitate" → "help," "implement" → "build," "demonstrates" → "shows" |

**Behavioral rules**:
- Fewer is better. The goal is subtle statistical disruption, not a vocabulary overhaul. If a paragraph reads naturally, propose zero substitutions for it
- Never substitute proper nouns, technical terms, or quoted material
- Never substitute words that are already unusual or distinctive; these are humanizing
- Each substitution must include reasoning for why the original word is the "default" choice
- If the draft already uses diverse vocabulary, propose fewer substitutions (the text doesn't need help)
- The coordinator makes the final accept/reject decision during REVISE; the Synonym Agent only proposes

---

### Review Integration Rules

**Annotation decay**:
- Reader Agent annotations should decrease over iterations as the artifact improves. If they don't decrease after 4 iterations, flag as convergence signal #10.
- Voice Auditor annotations should decrease over iterations. If they don't, flag as convergence signal #9.
- If the Voice Auditor returns 0 AI-tell findings for 2 consecutive iterations, skip it for the next iteration to save time. Re-enable if any dimension score drops.
- If the Reader Agent finds 0 engagement drops for 2 consecutive iterations, skip it for the next iteration. Re-enable if score drops.
- The Synonym Agent always runs (its purpose is statistical, not quality-based — even good text benefits from probability-shifting).

**Cross-agent conflicts**:
- If Reader Agent flags a passage as confusing AND Synonym Agent proposes a substitution in the same passage: apply the Reader fix first, then re-evaluate whether the synonym still fits.
- If Voice Auditor flags a transition AND Reader Agent flags the same passage for pacing: address both — these are complementary, not conflicting.
- If Synonym Agent proposes a substitution that the Voice Auditor would flag as an AI-tell word: reject the substitution.

---

## Breakthrough Protocol

When Signal #6 fires (all dimensions at 7+ and gains have stalled below 0.3 for 2 consecutive keeps), the loop shifts from incremental improvement to structural experimentation. The protocol cycles through three techniques. Each feeds into the next.

**Review agents during Breakthrough**: All three review agents (Reader, Voice Auditor, Synonym) still run during breakthrough iterations. The Red Team Reader technique replaces the Reader Agent for that iteration only (they serve the same function but the Red Team version is more adversarial). Voice Auditor and Synonym Agent run as normal.

### Cycling Logic

```
Breakthrough iteration 1 → Red Team Reader → feeds findings into →
Breakthrough iteration 2 → Structural Rethink (informed by red team) →
Breakthrough iteration 3 → Constraint-Based Revision (polish the new structure) →
If still plateauing → cycle back to Red Team Reader with fresh eyes
If 2 full cycles (6 breakthrough iterations) produce no gain → accept plateau, proceed to distillation
```

---

### Technique 1: Red Team Reader

Adopt the persona of a skeptical member of the target audience (from intake). Answer four questions about the current artifact:

1. **Where would I stop reading?** Identify the exact drop-off point -- the sentence or transition where attention breaks
2. **What would I push back on?** Name the weakest claim or the assertion most likely to provoke "I don't buy that"
3. **What question does this leave unanswered?** The gap the piece doesn't address that the audience would notice
4. **What one sentence would I share with a colleague?** The "so what" test -- if nothing is shareable, the piece lacks a clear payoff

Red Team findings feed into the next THINK phase as **constraints**, not suggestions. The revision MUST address the drop-off point and the weakest claim. During this technique, the Red Team Reader **replaces** the Reader Agent in the REVIEW step (skip the standard Reader Agent to avoid redundant reader-perspective analysis). Voice Auditor and Synonym Agent still run in parallel with the Red Team Reader. Log findings to `log.md` with tag `[RED TEAM]`.

---

### Technique 2: Structural Rethink

Re-read the entire artifact as if seeing it for the first time. Discard iteration history. Generate 3 alternative structures:

1. **Inversion**: lead with the conclusion or recommendation, work backward to evidence. Tests whether the current structure buries the lede
2. **Narrative arc**: restructure around a tension-resolution or before-after frame. Tests whether the piece lacks forward momentum
3. **Compression**: what if this were half the length? What survives the cut? Tests whether the piece is padded

Pick the most promising alternative and execute it as a single DRAFT. Run the full REVIEW step (all three agents) on the structural rethink draft. **The Maximum Increment Rule is relaxed to +2 per dimension** for structural rethink iterations, because the artifact is fundamentally reorganized. However, unaddressed high-severity review annotations still cap dimensions per safeguard #8. Log with tag `[STRUCTURAL]`, including all 3 alternatives considered and the rationale for the choice.

---

### Technique 3: Constraint-Based Revision

Apply one constraint from this menu. Rotate through them across iterations:

| Constraint | What it forces |
|------------|---------------|
| **Cut 30%** | Remove 30% of word count without losing any data point or claim. Forces elimination of filler, redundancy, and over-explanation |
| **Rewrite the opening 3 ways** | Generate 3 different openings (different hook, different frame, different first sentence). Pick the strongest. Often the opening is the ceiling |
| **Remove all hedging** | Delete every hedge word (may, might, could, somewhat, relatively, arguably). Then add back ONLY the hedges that are genuinely necessary. Most aren't |
| **Kill your best paragraph** | Identify the paragraph you're most proud of. Delete it. Rebuild the piece around its absence. If the piece is better without it, it was a crutch |

Run the full REVIEW step (all three agents) after applying the constraint, then REVISE and SCORE. If composite improved: keep. If not: revert, try the next constraint. Log with tag `[CONSTRAINT]`, including which constraint was applied and what was cut or changed.

---

### Breakthrough Logging

Breakthrough iterations use the same `results.tsv` format but with a `mode` column:
- `regular` for standard THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT iterations
- `red_team` for Red Team Reader iterations
- `structural` for Structural Rethink iterations
- `constraint` for Constraint-Based Revision iterations

In `log.md`, breakthrough iterations include:
- `[RED TEAM]`: the four reader questions and answers
- `[STRUCTURAL]`: the 3 alternatives considered and which was chosen, with rationale
- `[CONSTRAINT]`: which constraint was applied and what was cut/changed

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
No dimension increases by more than +1 per iteration. Exception: **Structural Rethink** iterations (Breakthrough Protocol) allow +2 per dimension, because the artifact is fundamentally reorganized. A mediocre revision cannot jump from 4 to 8, but a structural rethink can jump from 7 to 9.

### 5. Baseline Anchor
The baseline (v0) scores in the 4-6 range. This is calibration, not false modesty — a first draft is adequate, not excellent.

### 6. Audience-Anchored Assessment
Score against the audience identified in intake, not against abstract quality. A piece written for general public readers should be scored on whether a general reader would follow it, not whether it's technically rigorous. A piece for experts should be scored on analytical depth, not accessibility. Reference the audience profile targets (sentence length, jargon level, evidence type) from the writing skill when scoring.

### 7. Register Compliance Check
After scoring all dimensions, scan the artifact for editorial anti-patterns that violate the target register level. If the register is ≤ 2 and any anti-patterns from the Editorial Anti-Patterns table are present, Audience Calibration cannot score above 6 regardless of other qualities. Log each violation found with the specific anti-pattern name and the offending text.

### 8. External Review Integration
After Reader Agent and Voice Auditor annotations are incorporated during REVISE, the scoring step must acknowledge which annotations were addressed and which were deferred. Scoring rules:
- **Unaddressed high-severity Reader annotations** (engagement drops, comprehension failures): the relevant dimension cannot increase this iteration. No improvement credit for known reader problems that remain.
- **Unaddressed AI-tell patterns** (Voice Auditor): if 3+ AI-tell patterns from the current audit remain unaddressed, Register Discipline cannot score above its current value.
- **Synonym substitution rate**: log how many substitutions were applied vs. proposed. If fewer than 50% of proposed substitutions were applied, note the reasoning (acceptable — the coordinator may have good reasons to reject).
- **Transition diversity**: if the Voice Auditor flagged transition monotony and it remains unaddressed, Structure cannot increase this iteration.

### Composite Score
```
composite = sum(weight_i * score_i) for all dimensions
```

## Clean Slate Review

Time allocation: ~5% of total budget. Runs once, after the iteration loop exits and before distillation.

**Purpose**: A final-pass review by an agent with **zero context**. This agent has never seen the rubric, the iteration log, or any prior version. It receives only the final artifact text. Its job is to read the document cold, as a complete stranger would, and flag anything that does not make sense.

Iterative review agents (Reader, Voice Auditor, Synonym) develop blind spots because they have watched the text evolve. They unconsciously fill gaps from memory. The Clean Slate Agent catches what they cannot.

**Input** (provided in agent prompt):
- The final artifact text. Nothing else. No rubric, no log, no scores, no iteration history, no audience description.

**What it checks**:
1. Does every sentence make sense on its own, without needing to read a glossary or earlier section?
2. Do data references add up? If the text says "46% decline," can the reader verify from the numbers given (e.g., 166.9 to 90.2)?
3. Are there terms or concepts used without sufficient explanation for a first-time reader?
4. Are there claims that feel unsupported, where a skeptical reader would ask "says who?" or "based on what?"
5. Does the document flow logically from section to section, or does it jump without transition?
6. Are there internal contradictions (the same metric stated differently in two places, or a claim in Section 3 that conflicts with data in Section 1)?

**Output format**:
```
## Clean Slate Review

### Questions (each must be resolved before committing)
1. [Para N]: "[quoted text]" — [question: what is unclear, contradictory, or unsupported]
2. [Para N]: "[quoted text]" — [question]
...
```

**Resolution rules**:
- The coordinator must resolve **every question** by editing the final artifact. No question may be dismissed without a text change.
- Resolution options: add a clarifying phrase, rewrite the sentence for clarity, add a data reference, or correct the inconsistency.
- If a question reveals a factual error that cannot be fixed without research (and the run is in simple-rewrite mode), flag it in the summary as an unresolved issue rather than fabricating a fix.
- After resolving all questions, save the updated artifact as the final version.

**Behavioral rules**:
- Read the text as if encountering it for the first time. Do not assume any background knowledge beyond what the text itself provides.
- Be blunt. If something is confusing, say so. Do not give the text the benefit of the doubt.
- Minimum 3 questions, maximum 12. Fewer than 3 means the review was not thorough enough. More than 12 means the text needs another iteration, not a longer review.
- Every question must cite the specific passage and explain why it is unclear.
- Flag any pronoun or demonstrative ('this,' 'these,' 'such,' 'the pattern') that lacks an unambiguous referent within the same sentence or the immediately preceding one. A grade 12 reader should never have to scroll back to understand what 'this' refers to.
- Never suggest rewrites. Only ask questions. The coordinator decides how to fix.

---

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

**Review agent patterns** (always extract):
- **Reader Agent**: Which engagement drops recurred across iterations? What audience assumptions kept failing? Which paragraph positions were most prone to attention loss?
- **Voice Auditor**: Which AI-tell patterns were hardest to eliminate? Which techniques successfully removed them? What transition strategies worked best for the target register? Did rhythm monotony persist despite targeted fixes?
- **Synonym Agent**: What was the average acceptance rate for proposed substitutions? Which word categories (adjectives, verbs, adverbs) had the highest acceptance rate? Were there register-specific patterns in which synonyms worked?

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

## Humanization Techniques
[Patterns that successfully reduced AI detectability, organized by category:]
### Synonym Substitution Patterns
[Which word replacements worked best? Register-specific preferences?]
### Transition Diversity
[Which transition strategies produced the most natural paragraph flow?]
### Rhythm Breaking
[Which sentence length variations were most effective?]
### AI-Tell Elimination
[Which AI-tell patterns were hardest to remove? What finally worked?]

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
