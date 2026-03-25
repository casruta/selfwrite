# Plan: Selfwrite — Autonomous Self-Improving Skill Loop

## Context

The user wants a Claude Code skill that turns Claude into a self-improving loop: given any task and a time budget, Claude autonomously iterates on the output, scores itself, asks expert-level probing questions to push quality higher, then distills what it learned into a reusable skill file. This generalizes the existing Continuous Improvement Protocol (which only covers data analysis and writing) to any domain.

The core insight: Claude improves the **artifact itself** through iteration, then extracts the **meta-knowledge** (what questions to ask, what patterns work) into a skill file that makes all future runs better.

## What gets created

**One file to write:**
- `~/.claude/skills/selfwrite.md` — the complete skill definition (~250-300 lines)

**One minor edit:**
- `~/.claude/CLAUDE.md` — add selfwrite to the Registered Domains table (1 line)

**Runtime artifacts (created by the skill when invoked, not by us now):**
- `selfwrite/runs/<run-id>/rubric.md` — auto-generated scoring rubric
- `selfwrite/runs/<run-id>/log.md` — iteration log with scores, questions, decisions
- `selfwrite/runs/<run-id>/versions/v0.md, v1.md, ...` — artifact versions
- `selfwrite/runs/<run-id>/skill.md` — distilled reusable skill
- `selfwrite/runs/<run-id>/summary.md` — final metrics and learnings

## Invocation

```
/selfwrite "write a financial report analyzing Alberta's Q4 budget surplus" 30m
/selfwrite "Python function to merge overlapping intervals" 20m
/selfwrite "executive summary of Canada housing starts data" 45m
```

Arguments: `"task description" <duration>` where duration is `Nm` or `Nh`. Minimum 10 minutes.

## Skill file structure

The skill file (`selfwrite.md`) is organized into these sections:

### Frontmatter
```yaml
---
name: selfwrite
description: >
  Self-improving iteration loop. Takes any task + time budget, autonomously
  iterates to produce the best possible output, then distills learnings into
  a reusable skill file. Invoke with /selfwrite "task" duration.
command: selfwrite
argument-hint: '"task description" <duration>' (e.g., "write a cold email" 30m)
---
```

### Phase 0: Setup
- Parse task description + duration from `$ARGUMENTS`
- Record start time via `date +%s`, calculate deadline
- Create run directory at `selfwrite/runs/YYYY-MM-DD_HHMMSS/`
- Detect artifact type (code vs prose vs analysis) from task keywords
- Calculate phase boundaries: 60% iterate, 30% distill, 10% summarize
- Flex for short budgets (<15m → 70/20/10) and long budgets (>60m → 55/35/10)

### Phase 1: Rubric Generation
- Generate 4-6 scoring dimensions specific to the task domain
- Each dimension gets: name, definition, observable markers at scores 1, 5, and 10
- Weighted (sum to 1.0), with the dimension most tied to the task's purpose weighted highest
- **Rubric locks once generated** — no mid-run changes (changing it invalidates prior scores)
- Domain templates seed the rubric:
  - **Prose**: specificity, structure, audience calibration, actionability
  - **Code**: correctness, edge cases, readability, efficiency
  - **Analysis**: analytical depth, evidence quality, framing, actionability
- Saved to `rubric.md`

### Phase 2: Baseline Production
- Produce initial artifact (v0) — competent first draft, no over-investment
- Score using the **Adversarial Scoring Protocol**:
  1. State 2-3 biggest weaknesses BEFORE assigning any scores
  2. Score each dimension with specific evidence cited
  3. **Anchor baseline at 4-6** (hard rule — a first draft is not excellent)
  4. Max +1 per dimension per iteration going forward
- Save v0 and scores to versions/ and log.md

### Phase 3: Artifact Iteration Loop (core engine)

Each iteration follows this fixed protocol:

**A. Target Selection** — pick the lowest-scoring dimension. If unchanged for 2 iterations, pick second-lowest.

**B. Expert Question Generation** — put yourself in the shoes of a deep domain expert:
- Generate 2-3 questions specific to THIS artifact's content (not generic)
- Questions must reference specific passages/lines/decisions
- Frame as "why" or "what if" questions
- Each question probes a DIFFERENT weakness
- Quality check: would the answer change what's written? If not, question is too easy

**C. Answer the Questions** — thoroughly, with specific actionable insights. Not "make it more specific" but "replace 'improve metrics' with 'reduce churn by X% within 90 days'."

**D. Revise** — apply insights to produce a new version. Address specific weaknesses, don't rewrite everything. Save as v{N}.

**E. Adversarial Scoring** — before scoring:
1. State 2-3 biggest REMAINING weaknesses (mandatory)
2. Compare each dimension to the previous best: "better/same/worse because [reason]"
3. Scores can go DOWN if the revision damaged a dimension
4. Calculate new composite (weighted sum)

**F. Keep/Revert** — if composite > best composite: KEEP, else REVERT. Log reasoning.

**G. Plateau Detection** — if no improvement in 3 consecutive iterations:
- Switch to a different dimension
- OR do a structural rethink instead of incremental revision
- OR switch expert persona (domain expert → target audience member → skeptical reviewer)

**H. Log + Time Check** — log everything, check deadline. If remaining time < 1.5x average iteration time, move to Phase 4.

**Guarantees:**
- Minimum 3 iterations (adjust depth per iteration if time is tight)
- NEVER exit early — use the full time budget (per user's explicit feedback)
- After hitting Phase 1 deadline, must still move to distillation

### Phase 4: Skill Distillation (~30% of time)
- Analyze iteration log: which questions produced score jumps? Which revision types worked?
- Extract patterns into a reusable skill file:
  - Refined rubric with lessons learned
  - Common weaknesses and fixes (top 3-5 patterns)
  - Best expert questions (generalized for reuse)
  - Anti-patterns (from reverted iterations)
  - Step-by-step revision protocol
- **Key insight**: capture the QUESTIONS, not the answers. Questions transfer better.
- Run 1-2 revision passes on the skill text itself
- Save to `runs/<id>/skill.md`

### Phase 5: Summary (~10% of time)
- Score trajectory table (all versions, all dimensions, composite, kept/reverted)
- Key learnings (top 3 insights)
- Best questions (what led to biggest improvements)
- What didn't work (reverted approaches)
- Present to user
- Offer to install the generated skill to `~/.claude/skills/`

### Appendix: Anti-Inflation Safeguards
Five built-in defenses against Claude scoring itself too generously:
1. Pre-score weakness articulation (name weaknesses before scoring)
2. Comparative scoring (relative to previous, not absolute)
3. Evidence requirement (cite specific artifact content for every score)
4. Maximum +1 per dimension per iteration
5. Baseline anchored at 4-6

### Appendix: Expert Personas by Domain
| Domain | Persona | Question style |
|---|---|---|
| Financial analysis | Senior equity analyst | "What's the margin trend? Is this cyclical or structural?" |
| Data analysis | Research director | "Correlation or causation? What confounders exist?" |
| Engineering | Senior code reviewer | "What happens with N=0? What's the complexity?" |
| Writing | Major publication editor | "Can I cut paragraph 1? Where's the lead?" |
| Strategy | Board advisor | "What's the downside case? What was rejected?" |

## CLAUDE.md change

Add one row to the Registered Domains table:

```
| Any other domain | Dynamic rubric-based iteration | `/selfwrite` |
```

## Verification

1. **Invoke the skill**: `/selfwrite "write a financial report analyzing Alberta's Q4 provincial budget data" 15m`
2. **Check run directory exists**: `selfwrite/runs/<id>/` with rubric.md, log.md, versions/, skill.md, summary.md
3. **Verify iteration count**: at least 3 iterations logged
4. **Verify time usage**: elapsed time should be close to 15 minutes (never early exit)
5. **Verify score trajectory**: baseline scores in 4-6 range, composite should trend upward
6. **Verify skill output**: skill.md should be a standalone, reusable guide
7. **Verify log quality**: each iteration has questions, answers, scores with evidence, keep/revert reasoning
