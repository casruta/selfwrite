<p align="center">
  <img src="banner.png" alt="SELFWRITE" width="100%">
</p>

![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blue)

A Claude Code skill that polishes up the writing making it indistunguishable from human-written content by applying various linguistic, structural, and grammatical principles (and no, this segment was not written by this product). 

The skill is supposed to supplement dense, data-heavy text whilst utilizing point-first paragraph structure to optimize for maximum context and explanatory value while inserting minor fluff here and there to bamboozle the AI text detectors. 

#### note: AI-text detectors are evolving daily. At times, entire paragraphs get flagged as AI-generated due to a phrase thats currently over-used by various text models. Finding 2-3 fitting synonyms is generally enough to confuse the AI-detection tool. 


## How to install it 

```bash
cp selfwrite.md ~/.claude/skills/selfwrite.md
```

Requires [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). No other dependencies.

Verify by running `/selfwrite` in any project.

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

Selfwrite opens with an intake: questions about your audience, purpose, genre, and tone. Your answers shape a scoring rubric with 4-6 weighted dimensions (each scored 1-10). The baseline is anchored at 4-6 by design, so scores have room to climb. Then the loop begins:

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
  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
  │  READER  │  │  VOICE   │  │ SYNONYM  │  (parallel)    │
  │  AGENT   │  │ AUDITOR  │  │  AGENT   │                │
  └────┬─────┘  └────┬─────┘  └────┬─────┘                │
       │             │             │                      │
       ▼             ▼             ▼                      │
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

## Example Runs

| Run | Iterations | Start | Final | Delta |
|-----|-----------|-------|-------|-------|
| [`nyt-upgrade/`](runs/nyt-upgrade/) | 12 | 4.95 | 8.15 | +3.20 |
| [`skill-upgrade/`](runs/skill-upgrade/) | 14 | 4.75 | 8.45 | +3.70 |

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
