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

You are running a time-boxed self-improvement loop. Each iteration follows a multi-agent cycle: **THINK → DRAFT → REVIEW → REVISE → SCORE → REFLECT**. You will iterate on a task, score yourself honestly, ask expert-level questions to push quality higher, and distill what you learn into a reusable skill file. Two independent review agents — a **Reader Agent** and a **Voice Auditor** — evaluate every draft from distinct cognitive perspectives before revisions are finalized, catching blind spots that self-evaluation misses.

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
   - Default: 50% iteration loop / 10% clean slate review / 30% distill / 10% summarize
   - Short budget (<15m): 60% / 10% / 20% / 10%
   - Long budget (>60m): 45% / 10% / 35% / 10%

   **Review agent scaling for short budgets**: On budgets under 15 minutes, the two-agent REVIEW step consumes a larger fraction of each iteration. To ensure the minimum 3 iterations:
   - **Under 15m**: Run only the Voice Auditor (skip Reader Agent — the coordinator's own reading suffices for short pieces). Re-enable Reader Agent if any dimension drops below 5.
   - **Under 10m**: Skip both review agents. The coordinator does its own pass against the rubric and the active lexicon.
   - **15m and above**: Both agents run every iteration (default behavior).
6. Initialize `log.md` and `results.tsv` (with header row: `iteration\ttarget\thypothesis\tcomposite_before\tcomposite_after\tdelta\tdecision\treason\tmode\tresearch_findings\tresearch_approved\treader_annotations\tvoice_audit_count\ttree_depth\ttree_nodes\ttree_contradictions\ttree_gated_count`). The `mode` column is `regular` for standard iterations or `red_team`/`structural`/`constraint` for Breakthrough Protocol iterations. The four `tree_*` columns track the RESEARCH decomposition tree (deep-rewrite only); they are 0 in simple-rewrite mode and when flat search was used (`tree_depth=0` is the sentinel for flat search).
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
   - **Voice model**: Name a publication whose vocabulary and phrasing you want to match (e.g., "The Economist," "Reuters," "FiveThirtyEight"). This loads a lexicon that guides word choice and phrase patterns. If unsure, skip — a default lexicon is selected based on your register level. See **Lexicon System** for the full list.

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
   | Voice model = named publication | Load matching lexicon (see Lexicon System). Voice Auditor uses lexicon phrase patterns, rhythm profile, and transition preferences as targets, and flags any word appearing in the lexicon's avoided vocabulary. The coordinator applies lexicon-aware word choices during REVISE. |
   | Voice model = skipped | Default lexicon selected from register level (Register 1 → Institutional, Register 2 → Economist, Register 3 → NYT, Register 4 → FiveThirtyEight, Register 5 → Op-Ed) |

   **Follow-up questions** (ask based on initial answers):
   - If audience = experts: "What's the one thing they don't already know?" (This is your lede)
   - If purpose = persuade: "What's the strongest counterargument? Should I address it directly or preempt it?"
   - If genre = data analysis: "What's the finding that surprised you most?" (Lead with it)
   - If tone model named: "Should I match their sentence rhythm too, or just the overall register?"
   - If voice model named: "Should I match only vocabulary, or also sentence structure and paragraph rhythm?"
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

### Register-Gated Humanization (encourage at appropriate levels)

Not all human writing patterns are inappropriate. Some make text sound more natural without sacrificing formality. The Voice Auditor should **allow** (not penalize) these patterns at the indicated register levels.

| Pattern | Register 1 | Register 2 | Register 3+ | Example |
|---------|-----------|-----------|-------------|---------|
| Short breathing-room sentences (1-5 words, no analytical content, exist to give the reader a beat). **Point-first rule:** breathers go mid-paragraph or end-of-paragraph only, never as the first sentence. The first sentence of every paragraph must state a finding, claim, or thesis. | Forbidden | Allow 1-2 per section, mid-paragraph only | Allow freely, mid-paragraph only | "BC's CSI dropped 46% from 1998 to 2014. It kept falling." (breather after thesis, not before) |
| Uneven paragraph length (mixing 1-sentence and 5-sentence paragraphs) | Allow | Allow | Allow | A 1-sentence paragraph followed by a 5-sentence paragraph is natural, not an error |
| Deliberate repetition for clarity ("There's X. There's also Y.") | Forbidden | Allow sparingly | Allow freely | Repeating a sentence structure 2x for parallel emphasis is human, not a template |
| First person in opinion/recommendation sections | Forbidden | Allow "we" in recommendations only | Allow "I" and "we" | "We recommend reviewing the allocation" in an Implications section |
| Rhetorical questions | Forbidden | Forbidden | Allow sparingly | Only at Register 3+: "What drove the decline?" |
| Filler transitions ("There's a lot to like") | Forbidden | Forbidden | Allow at 4-5 | Too casual for analytical prose |
| Cliches and vivid imprecision ("slim pickings") | Forbidden | Forbidden | Allow at 4-5 | Undercuts analytical credibility at formal registers |
| Sentence fragments for emphasis | Forbidden | Forbidden | Allow at 4+ | "Not even close." works in op-eds, not in reports |

**Key principle:** The Voice Auditor should stop penalizing patterns in the "Allow" column for the active register. An uneven paragraph or a short breathing-room sentence at Register 2 is a feature, not a defect. Penalizing these produces the uniform, mechanical rhythm that makes AI text detectable.

---

## Lexicon System

A lexicon is a curated vocabulary and phrasing profile tied to a specific publication or journalism style. It solves the core word-choice problem: a word can be technically correct but wrong for the voice. "Uptick" is fine at the Wall Street Journal; it's wrong in a StatsCan report. The lexicon tells the Voice Auditor what to consider natural and tells the coordinator what words to reach for during REVISE.

### Why Lexicons Work Against AI Detection

AI detectors measure how consistently text selects the most statistically probable word at each position. Clean AI output is detectable because it *always* picks the highest-probability token. Random synonym swaps break that pattern but introduce unnatural phrasing. A lexicon solves both problems: it shifts word choices away from the AI-default *toward* a specific human voice. The result is statistically varied (defeating detectors) and naturally consistent (sounding like a real writer). The text becomes predictable in a *human* way — the way a Globe and Mail columnist is predictable — rather than predictable in a machine way.

### Lexicon Structure

Each lexicon defines five components:

**1. Preferred Vocabulary** — Words this publication reaches for. The coordinator pulls from this pool during REVISE when a word in the draft feels generic or AI-default.

**2. Avoided Vocabulary** — Words this publication would never use. The Voice Auditor flags these on sight; the coordinator must replace them during REVISE. Independent of the kill-list.

**3. Phrase Patterns** — Multi-word constructions characteristic of this voice. These guide the Voice Auditor's naturalness check: a sentence using a phrase pattern from the active lexicon passes; an equivalent sentence using a generic construction gets flagged.

**4. Sentence Rhythm Profile** — Typical sentence length range and variation pattern. Guides the Voice Auditor's rhythm analysis with a concrete target instead of abstract "vary your sentences."

**5. Transition Preferences** — How this publication bridges paragraphs. Constrains the Voice Auditor's transition diversity check.

### Built-In Lexicons

#### The Economist (Register 2-3)

| Component | Content |
|-----------|---------|
| **Preferred vocabulary** | "reckons," "arguably," "in practice," "yet," "still," "nevertheless," "granted," "oddly," "in effect," "a hefty," "scant," "a clutch of," "a dose of," "a measure of," "hard to square with," "lopsided," "dented," "nudged," "crimped," "buoyed," "bolstered" |
| **Avoided vocabulary** | "utilize," "facilitate," "implement," "leverage," "robust," "comprehensive," "stakeholder," "synergy," "paradigm," "actionable," "holistic," "impactful" |
| **Phrase patterns** | "[Claim]. Yet [counterpoint]." · "In practice, [reality]." · "[Number] is [vivid comparison]." · "The short answer is [X]. The longer one is [Y]." · "That is [understated judgment]." · "[Country/entity] has long [verb]." |
| **Sentence rhythm** | 8-22 words typical. Alternates medium (12-18) with short punches (5-9). Rarely exceeds 25. One-sentence paragraphs used for emphasis, not as default. |
| **Transition preferences** | Contrastive ("Yet," "Still," "Even so"), temporal ("Since then," "Until recently"), concessive ("Granted,"), referential noun bridges. Avoids "However," "Moreover," "Furthermore." |

#### Reuters / Wire Service (Register 2-3)

| Component | Content |
|-----------|---------|
| **Preferred vocabulary** | "said," "told," "according to," "rose," "fell," "gained," "slid," "trimmed," "edged," "topped," "marked," "posted," "flagged," "cited," "underscored," "eased," "tightened," "widened," "narrowed" |
| **Avoided vocabulary** | "opined," "exclaimed," "revealed" (unless legal context), "admitted" (implies guilt), "claimed" (implies doubt unless intentional), "robust," "incredible," "amazing," "game-changing" |
| **Phrase patterns** | "[Entity] said on [day]." · "[Metric] rose/fell [X]% to [Y]." · "The move comes as [context]." · "[Source], who spoke on condition of anonymity, said [X]." · "Shares in [company] [rose/fell] [X]% [timeframe]." |
| **Sentence rhythm** | 10-20 words typical. Lead sentence front-loads the news. Attribution mid-sentence or end. Short sentences for breaking developments. |
| **Transition preferences** | Temporal ("On Monday," "Earlier this week"), attribution pivots ("Analysts said," "Officials noted"), cause-effect ("The decision followed"). Avoids editorial transitions entirely. |

#### NYT News Analysis (Register 3)

| Component | Content |
|-----------|---------|
| **Preferred vocabulary** | "underscored," "signaled," "reflected," "complicated," "raised questions about," "scrambled," "fueled," "deepened," "prompted," "illustrated," "tested," "strained," "widened," "narrowed," "echoed," "marked a shift" |
| **Avoided vocabulary** | "stakeholder," "leverage" (as verb), "utilize," "facilitate," "impact" (as verb in formal contexts), "paradigm shift," "game-changer," "unprecedented" (unless truly first-ever) |
| **Phrase patterns** | "The result is [concrete consequence]." · "[Event] underscored [tension]." · "But [counterpoint] complicates the picture." · "For [group], the stakes are [specific]." · "What is less clear is [uncertainty]." · "[X], [appositive descriptor], said [Y]." |
| **Sentence rhythm** | 12-25 words typical. Longer analytical sentences broken by 6-10 word pivots. Paragraphs 2-4 sentences. Occasional one-sentence paragraph for a turn. |
| **Transition preferences** | Thematic pivots ("But the bigger question is"), contrastive pairs ("X did A. Y did the opposite."), narrative continuity ("That was before [event]"), stakes-raising ("For [group], the calculus is different"). |

#### FiveThirtyEight / Vox Explainer (Register 4)

| Component | Content |
|-----------|---------|
| **Preferred vocabulary** | "turns out," "here's the thing," "roughly," "about," "tends to," "on average," "the short version," "in other words," "the catch," "the upshot," "pretty," "actually," "basically," "a lot," "way more," "sort of" |
| **Avoided vocabulary** | "utilize," "facilitate," "moreover," "furthermore," "thus," "hence," "whereby," "thereof," "heretofore," "notwithstanding," "it is worth noting" |
| **Phrase patterns** | "Here's what that looks like:" · "In other words, [plain restatement]." · "That's [vivid reframe]." · "The short version: [summary]." · "But here's the catch: [complication]." · "[X] is about [intuitive number], or roughly [comparison]." |
| **Sentence rhythm** | 8-20 words typical. Conversational pacing: short (5-8), medium (12-16), short (5-8). Rarely exceeds 22. Questions used as transitions. |
| **Transition preferences** | Question-as-bridge ("So what does that mean?"), direct pivots ("But," "And," "So"), restatement ("In other words,"), the-catch ("The problem is,"). Avoids formal connectives ("Moreover," "Furthermore"). |

#### Op-Ed / Newsletter (Register 5)

| Component | Content |
|-----------|---------|
| **Preferred vocabulary** | "look," "listen," "here's the deal," "bluntly," "frankly," "the truth is," "let's be honest," "the real question," "nonsense," "overdue," "long past time," "misses the point," "gets it backward," "deserves better" |
| **Avoided vocabulary** | "facilitate," "utilize," "synergize," "leverage," "paradigm," "holistic," "it is important to note," "it should be noted," "one might argue" |
| **Phrase patterns** | "[Strong claim]. Full stop." · "Let me be direct: [thesis]." · "[Common belief]? [Blunt rebuttal]." · "This isn't about [deflection]. It's about [real issue]." · "The answer is simpler than it looks: [answer]." |
| **Sentence rhythm** | 5-18 words typical. Punchy and staccato. Sentence fragments for emphasis. One-word paragraphs allowed. Rhythm drives argument, not just clarity. |
| **Transition preferences** | Direct address ("Look,"), rhetorical questions, dramatic pivots ("But here's what nobody's saying:"), blunt conjunctions ("And," "But," "So"). |

#### Institutional / Statistical Report (Register 1)

| Component | Content |
|-----------|---------|
| **Preferred vocabulary** | "reported," "recorded," "observed," "measured," "estimated," "remained," "averaged," "accounted for," "represented," "constituted," "comprised," "totalled," "corresponded to," "attributable to" |
| **Avoided vocabulary** | "dramatic," "alarming," "impressive," "incredible," "game-changing," "exciting," "interestingly," "notably," "it is worth noting," "it bears mentioning," "surprisingly" |
| **Phrase patterns** | "[Metric] [verb] [value] in [period], [direction] from [prior value]." · "This represented a [X]% [increase/decrease] over [period]." · "[Category] accounted for [X]% of [total]." · "The [adjective] rate was [X], compared with [Y] in [prior period]." |
| **Sentence rhythm** | 15-30 words typical. Uniform, measured pacing. No short punches. No sentence fragments. Complex sentences with embedded clauses are acceptable. |
| **Transition preferences** | Temporal ("In the reference period," "Year over year"), categorical ("By province," "Among [group]"), methodological ("Using [method],"). Zero editorial transitions. |

### Lexicon Selection

During intake, the lexicon is selected in one of three ways:

1. **Explicit naming**: User names a publication ("write like the Economist") → map to the matching built-in lexicon
2. **Register inference**: If no publication is named but a register level is set, use the default lexicon for that register:
   - Register 1 → Institutional
   - Register 2 → The Economist
   - Register 3 → NYT News Analysis
   - Register 4 → FiveThirtyEight / Vox
   - Register 5 → Op-Ed / Newsletter
3. **No preference**: Default to NYT News Analysis (Register 3) — the same default as the register system

If a user names a publication not in the built-in list, approximate: identify the closest register level and built-in lexicon, then note in the log that the lexicon is an approximation. The Voice Auditor should treat the lexicon as a guide, not a straitjacket, when approximating.

### How Lexicons Flow Through the System

| Stage | How it uses the lexicon |
|-------|------------------------|
| **Voice Auditor** | Phrase patterns serve as positive examples during the naturalness check. A sentence that uses a lexicon phrase pattern is marked as natural. The rhythm analysis uses the lexicon's sentence rhythm profile as its target instead of abstract length-variation rules. Transition preferences replace the generic transition diversity rules for the active lexicon. Scans for any word in the avoided vocabulary and flags each occurrence for the coordinator to replace during REVISE. |
| **REVISE (coordinator)** | When addressing Voice Auditor annotations, the coordinator reaches for preferred-vocabulary replacements first. Avoided vocabulary must be replaced; preferred vocabulary is the default replacement pool. Ad-hoc word choices are acceptable only when no preferred word fits. |
| **Reader Agent** | No direct lexicon input. The Reader Agent evaluates from the audience's perspective, not the publication's voice. |
| **Clean Slate Agent** | No direct lexicon input. Reads cold. |
| **Distillation** | The active lexicon is logged. The distilled skill file records which lexicon was used, which preferred words were most effective, and any words that should be added to or removed from the lexicon for this domain. |

### Custom Lexicon Building

Over multiple runs, the distillation phase accumulates lexicon refinements. Users can build a custom lexicon by:

1. Running selfwrite with a built-in lexicon
2. Reviewing the distilled skill file's lexicon notes
3. The skill file records: words that worked (repeatedly chosen from the preferred pool during REVISE), words that were flagged repeatedly by the Voice Auditor (should be added to the avoided list), and phrase patterns that emerged naturally during revision
4. Future runs in the same domain inherit these refinements when the distilled skill is installed

This creates a feedback loop: each run makes the lexicon more precise for the user's domain and voice.

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
  ┌──────────┐  ┌──────────┐                              │
  │  READER  │  │  VOICE   │  (parallel)                  │
  │  AGENT   │  │ AUDITOR  │                              │
  └────┬─────┘  └────┬─────┘                              │
       │              │                                   │
       ▼              ▼                                   │
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
  ┌──────────┐  ┌──────────┐                              │
  │  READER  │  │  VOICE   │  (parallel)                  │
  │  AGENT   │  │ AUDITOR  │                              │
  └────┬─────┘  └────┬─────┘                              │
       │              │                                   │
       ▼              ▼                                   │
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

**Skip this section entirely in simple-rewrite mode.** RESEARCH runs in parallel with THINK. While THINK diagnoses the weakest stylistic dimension, RESEARCH diagnoses substantive gaps — and it does so by building a bounded decomposition tree rather than a single flat search. One search often raises the next question; the tree lets the loop follow that thread within a single iteration.

**1. Gap Analysis** — Read the current artifact and identify up to 3 gaps:
- Claims that lack evidence or sourcing
- Counterarguments the piece ignores or underweights
- Context a knowledgeable reader would expect (historical, comparative, causal)
- Numbers presented without framing (no base year, no per-capita, no comparison)

**2. Query Decomposition** — Each gap spawns exactly three level-1 sub-questions. The trichotomy is hardcoded, not LLM-invented, so the tree shape is predictable:
- **Factual** — what are the atomic components of the claim? (dollar amounts, dates, named entities, filing numbers)
- **Adversarial** — what would a skeptic ask to disprove it? (counter-examples, contradicting sources, base rates)
- **Contextual** — what must a reader understand to use the fact? (definitions, legal framework, comparative baselines)

Three gaps × three level-1 sub-questions = up to 9 searches at level 1. Bounded by the hard budget (§6 below).

**3. Tree Expansion (the 2-of-3 delta test)** — Before spawning a child query beneath any node, check the node's search result against three deltas. Expand **only if ≥ 2 deltas pass**:

| Delta | Passes if… |
|---|---|
| **Entity delta** | The result introduces a proper noun, statute, dataset, or specific claim absent from the draft, the gap description, and every ancestor node on this branch |
| **Quantitative delta** | The result introduces a number that differs from any ancestor-node number by > 10%, or uses a different unit/denominator |
| **Source-class delta** | The citation is from a source class (primary document, peer-reviewed, government filing, court record) not yet represented on this branch |

Each child node logs the passing deltas inline, so every expansion decision is auditable. Maximum 2 children per node. This test is mechanically checkable and prevents the LLM from spawning sub-questions to justify its own existence.

**Depth rules:**
- **Default ceiling: depth 4.** Most real research bottoms out here.
- **Depths 5–6 are gated**: a level-4 node may spawn a child only if it surfaces an explicit contradiction with the draft or with a level 1–3 finding. No contradiction → stop at depth 4.
- **Dedup at expansion time**: before launching a child query, hash the normalized query (lowercased, stopwords stripped, entities sorted) against every prior query in this iteration's tree. On collision, mark the node `duplicate-of [tree path]` and issue no search. Dedup saves budget, not just presentation noise.

**4. Dependency Verifier (subagent)** — Runs **only if the tree contains nodes at depth ≥ 4**. Skipped entirely otherwise. See the **Dependency Verifier** section under Review Agents for the full spec. The verifier labels each deep finding as `surface-always`, `surface-if-draft-contains-X`, or `log-only`. It reads cold (no iteration history) and returns a structured report. Its only job is the semantic dependency question — "does this deep finding matter to *this* draft?" — which deterministic rules cannot answer.

**5. Surface to User** — The coordinator presents a synthesized bundle before DRAFT. Max 5 items per iteration (up from the old max 3 because tree findings are denser):
> **Research findings (iteration N):**
> 1. [Factual, L1] The piece claims X, but Y source says Z. Include?
> 2. [Adversarial, L2] Follow-up: the strongest counterargument bottoms out at [specific claim]. Address it?
> 3. [Contextual, L3] Missing comparison to [specific baseline]. Add?
> 4. [Surface-always, L4] Verifier flagged as load-bearing: [specific finding]. Include?
> 5. [Contradiction, L2 vs L4] Source A says X, source B says Y. Resolve?
>
> **Which findings should I incorporate? (numbers, "all", or "none")**

All level 1–3 findings that passed the 2-of-3 gate are eligible. Depth ≥ 4 findings surface only if the verifier labeled them `surface-always` or flagged a contradiction. `surface-if-draft-contains-X` findings are handed to the coordinator inline during DRAFT and resolved in the *same* iteration (never retroactively).

**6. Incorporate** — Approved findings feed into the DRAFT revision alongside THINK's stylistic hypothesis. Rejected findings are logged but not added.

**RESEARCH rules:**
- Never add content without user approval. Zero autonomous additions.
- **Hard search budget: 15 per iteration.** Soft target: 10. The budget is per iteration, not per gap — a thread-heavy gap can spend more, a thin gap less.
- Findings must be specific and cite-able. "Consider adding context" is not a finding.
- **Scaling precedence: time budget > decay rule > default depth.** Use this table:

  | Condition | Tree behavior |
  |---|---|
  | Under 10m deep rewrite | Flat search only, max 2 searches total, no verifier |
  | Under 15m deep rewrite | Decomposition capped at depth 2, no verifier (coordinator gates) |
  | Composite > 8.5 | Flat search only, max 1 search per gap |
  | Composite 7.0–8.5 | Decomposition capped at depth 3, verifier inactive (depth never reaches 4) |
  | Composite < 7.0, budget ≥ 15m | Full tree, default depth 4, ceiling 6 via contradiction trigger |

  Short budget always wins over decay, which always wins over the default.
- Log the full tree to `research/findings.md` with the structure shown in REFLECT. Every expansion decision must be traceable through the inline delta logs.

---

### DRAFT

Apply THINK insights to produce a candidate revision. In deep-rewrite mode, also incorporate user-approved RESEARCH findings. Save the draft to `versions/v{N}-draft.md`.

**Drafting rules:**
- **Targeted changes only**: Address the specific weaknesses identified by THINK. Do not rewrite everything — surgical revision beats wholesale replacement. Change as little as possible to test the hypothesis cleanly.
- **Scope**: Limit changes to the paragraphs and sentences named in the hypothesis and expert questions. If THINK identified paragraph 3's transition as weak, fix paragraph 3's transition — don't also reorganize paragraphs 5-7.
- **Preserve what works**: Sections that scored well in prior iterations should not be modified unless the hypothesis specifically targets them.
- **One hypothesis per draft**: Test one change at a time. If multiple changes are needed, pick the one with the highest expected impact and save the rest for the next iteration.

The draft is a candidate, not the final version. It will be reviewed by two independent agents before finalization.

---

### REVIEW

Launch two review agents **in parallel** against the draft. Each agent is a fresh subagent with no context carryover from previous iterations — this prevents them from developing the same blind spots as the main loop.

Each agent receives: the draft text, the rubric, the target audience profile (from intake), the current scores, and the specific dimension being targeted this iteration.

Each agent returns structured annotations (location + issue + severity). See the **Review Agents** section below for full specifications.

| Agent | Focus | Runs in parallel? |
|-------|-------|--------------------|
| **Reader Agent** | Engagement, comprehension, credibility, pacing — reads as the target audience | Yes |
| **Voice Auditor** | AI-tell patterns, sentence template repetition, rhythm monotony, register violations, transition diversity, lexicon avoided-vocabulary violations | Yes |

---

### REVISE

Incorporate review annotations into a final version. The coordinator (not the agents) makes all decisions about which annotations to apply.

**Triage order:**
1. **Engagement drops** (Reader Agent) — highest priority, these are where readers stop reading
2. **AI-tell patterns** (Voice Auditor) — second priority, these make the text detectable
3. **Avoided-vocabulary violations** (Voice Auditor) — replace each flagged word, drawing first from the lexicon's preferred vocabulary
4. **Transition diversity** (Voice Auditor) — vary paragraph connectors
5. **Pacing and comprehension** (Reader Agent) — lower priority but still address
6. **Rhythm fixes** (Voice Auditor) — break monotonous sentence length sequences

**Rules:**
- If an annotation conflicts with the iteration's target dimension, prioritize the target dimension but log the conflict
- If an annotation can't be addressed without damaging another dimension, defer it to a future iteration
- When replacing avoided-vocabulary words, first try a word from the active lexicon's preferred vocabulary. If no preferred word fits the meaning, use a voice-appropriate alternative. Never replace a word that is the most precise term for its context unless it specifically violates the avoided list
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
- Voice Auditor annotations (summarized): patterns detected, rhythm analysis, avoided-vocabulary words flagged and how they were replaced
- (Deep rewrite only) Research tree summary: max depth reached, total node count, any contradictions surfaced, Dependency Verifier invoked yes/no, findings surfaced vs. gated, user's approval/rejection of each surfaced finding, and how approved findings were incorporated

**2. Log to `results.tsv`** (structured):
Append one row: `{iteration}\t{target}\t{hypothesis_summary}\t{composite_before}\t{composite_after}\t{delta}\t{keep|revert}\t{one-line reason}\t{mode}\t{research_findings|none}\t{approved_numbers|none}\t{reader_annotations}\t{voice_audit_count}\t{tree_depth}\t{tree_nodes}\t{tree_contradictions}\t{tree_gated_count}`

**2a. Log the research tree** (deep rewrite only):
Append to `research/findings.md`:
```
## Iteration N — Research Tree

### Gap 1: [description]

#### L1 Factual: [query]
  Source: [url]
  Finding: [claim]
  Expansion deltas passed: [entity, source-class, ...] → [spawn L2 | STOP: fails 2-of-3]

  ##### L2: [query]
    Source: [url]
    Finding: [claim]
    Expansion deltas passed: [...] → [spawn L3 | STOP]

    (continue nesting up to depth 4, or depth 6 if a contradiction gated the expansion)

#### L1 Adversarial: [query]
  ...

#### L1 Contextual: [query]
  ...

### Dependency Verifier Report
[full verifier output, or "skipped: tree did not reach depth 4"]

### Surfaced to User
[the subset actually presented, with bucket labels]

### User Decision
[approved / rejected per finding]
```
Every expansion must be traceable through the inline delta logs. If a node was marked `duplicate-of [tree path]`, record that in place of the search result.

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
| 9 | **Voice Auditor annotation count not decreasing over 4+ iterations** | Drafter isn't learning to avoid AI patterns | Invoke structural rethink focused on breaking sentence templates; manually rewrite the three most-flagged sentences from scratch rather than editing them |
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
- **The active lexicon** (phrase patterns, sentence rhythm profile, and transition preferences from the Lexicon System)

**Output format** (structured annotations):
```
## Voice Audit

### AI-Tell Patterns Detected
- [Location]: Pattern: [name]. Evidence: "[quoted text]"

### Sentence Template Repetition
- Template "[structure]" appears N times: [locations]

### Rhythm Analysis (against lexicon rhythm profile)
- Lexicon target: [e.g., "8-22 words, alternating medium with short punches"]
- Sentence length sequence: [N, N, N, N, N...] — [matches/deviates from] lexicon at [section]
- Recommended: break with [short/long] sentence at [location] to match [publication] rhythm

### Transition Diversity (against lexicon transition preferences)
- Lexicon preferred transitions: [list from active lexicon]
- Transition "[word/phrase]" used N times: [locations]
- Consecutive paragraphs [N-M] use transitions outside lexicon preferences
- Suggested variety: [alternatives from lexicon transition preferences]

### Phrase Pattern Matches
- [Para N]: Uses lexicon phrase pattern "[pattern]" — natural ✓
- [Para N]: Generic phrasing "[text]" could use lexicon pattern "[pattern]" instead

### Register Violations
- [Location]: Anti-pattern "[name]" violates register level [N]

### Avoided Vocabulary Detected
- [Location]: "[word]" appears in lexicon's avoided vocabulary. Suggest replacement from preferred vocabulary: "[preferred candidate]" (if a fit exists) or note that the coordinator must choose a voice-appropriate alternative.

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
| Academic/archaic phrasing | Nominalized verbs, inverted constructions, or abstractions where plain contemporary language would work. The sentence should sound natural in The Economist or Globe and Mail, not in a medical journal | "persisted across the full series" (say "lasted the entire period"), "the compositional pattern decoupled" (say "the types of crime began moving in opposite directions") |

**Transition Diversity Rules**:

The auditor checks that paragraph-to-paragraph transitions use varied connective strategies. Monotonous transitions are an AI-tell — humans naturally vary how they bridge paragraphs.

**When a lexicon is active**, the lexicon's transition preferences take priority over the generic register table below. Use the lexicon's preferred transitions as the primary target and flag transitions that fall outside the lexicon's style. For example, if the Economist lexicon is active, prefer "Yet," "Still," "Even so," and referential noun bridges; flag "However," "Moreover," "Furthermore" even though they're technically acceptable at Register 2.

**Fallback** (when no lexicon provides transition preferences):

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
- Rhythm analysis is mandatory every audit (compute sentence length sequence against the active lexicon's rhythm profile)
- Transition diversity check is mandatory every audit (check against the active lexicon's transition preferences)
- Phrase pattern check is mandatory every audit: scan for opportunities to use lexicon phrase patterns in place of generic constructions. Flag at most 3 opportunities per audit — the goal is natural adoption, not forced insertion
- Avoided-vocabulary scan is mandatory every audit: flag every word in the draft that appears in the active lexicon's avoided vocabulary. For each flagged word, suggest a replacement from the preferred vocabulary when one fits. The coordinator handles replacement during REVISE
- Never suggest full sentence rewrites — only identify patterns and propose single-word replacements for avoided vocabulary (the coordinator rewrites during REVISE)

---

### Word-Choice Guidance for REVISE

The coordinator handles word-level substitution directly during REVISE, guided by the Voice Auditor's annotations and the active lexicon. There is no dedicated synonym agent — word choice is not a separate review pass, it is part of how the coordinator addresses Voice Auditor findings.

**When to replace a word**:
1. The Voice Auditor flagged it as avoided vocabulary — mandatory replacement
2. The Voice Auditor flagged it as a kill-list word or AI-tell — mandatory replacement
3. The word is generic ("shows," "demonstrates," "indicates," "utilizes") and the active lexicon has a more characteristic alternative — recommended

**How to pick the replacement**:
1. **First choice**: a word from the active lexicon's preferred vocabulary that preserves the meaning
2. **Second choice**: a voice-appropriate word that is not in the preferred list but fits the publication's register
3. **Never**: a word that changes the meaning, shifts the connotation, or sounds forced when the full sentence is read aloud

**What never to replace**:
- Proper nouns, technical terms, quoted material
- Words that are already precise, distinctive, or domain-specific ("cleared," "reported," "declined" where the verb carries specific meaning)
- Nouns (too much domain precision; changing "checks" to "tests" shifts meaning)
- Words that are already unusual — they are humanizing, not problematic

**Density target**: most paragraphs need zero word-level changes. Replace only what the Voice Auditor flags plus the occasional generic verb the lexicon would improve. If the draft already uses diverse vocabulary, leave it alone.

**The sentence-aloud test**: after any replacement, read the full sentence aloud. If it sounds awkward, forced, or unnatural, revert. The test: would a journalist *at the publication matching the active lexicon* write this sentence? If not, keep the original.

---

### Dependency Verifier (deep rewrite only)

**Purpose**: Decide whether each deep-tree research finding (depth ≥ 4) is unconditionally useful to the current draft, conditionally useful (and what the condition is), or irrelevant. The mechanical 2-of-3 delta test controls *whether* a node expands; the Dependency Verifier controls *whether the result surfaces* to the user. It answers the one question deterministic rules cannot: "does this deep finding matter to *this* draft, given what's already in it?"

**When it runs**: during the RESEARCH phase of a deep-rewrite iteration, **only** when the research tree contains at least one node at depth ≥ 4. Skipped entirely otherwise — shallow trees do not need a verifier. Also skipped under the short-budget and decay rules in the RESEARCH scaling table (see RESEARCH section).

**Input** (provided in the agent prompt):
- The current draft text (nothing else from the draft side — no iteration history, no rubric, no scores, no prior verifier reports)
- The flat list of depth-≥-4 findings, each with: tree path (e.g. `Gap 2 → L1 Adversarial → L2 → L3 → L4`), the search query that produced it, the finding itself, and the deltas that justified its expansion
- The gap description that kicked off this branch of the tree

**Output format** (structured — copies the Reader Agent's annotation shape):
```
## Dependency Verifier Report

### Surface-always
- [Tree path]: [one-line claim]
  Why load-bearing: [specific reason — e.g., "directly contradicts a claim at L1 Factual"]

### Surface-if-draft-contains
- [Tree path]: [one-line claim]
  Trigger: draft mentions "[specific entity, claim, or phrase]"
  Why: [without the trigger, this is background noise; with it, it's necessary context]

### Log-only
- [Tree path]: [one-line claim]
  Why gated: [speculative / redundant with shallower finding / off-thesis]

### Contradictions
- [Tree path A] says X; [Tree path B] says Y
  Resolution: [suggestion — e.g., "prefer the primary source", "surface both and let the draft address the tension"]
```

**Behavioral rules**:
- Reads cold. No access to the iteration log, prior scores, or previous verifier reports. Like the Clean Slate Agent, this impartiality is the point
- Every finding must cite its full tree path
- Maximum 5 `surface-always` items (forces prioritization)
- Contradictions are always surfaced regardless of which bucket the contributing findings fell into
- Never proposes new searches. Never rewrites findings. Only labels them
- If the draft is short (< 200 words), be more generous with `surface-if-draft-contains` — short drafts have less context, so more findings are borderline
- If the draft already cites many sources, be stricter with `surface-always` — the marginal value of a deep finding drops when the draft is already well-sourced

**How the coordinator uses the report**:
- `surface-always` findings go into the user-facing synthesis bundle in RESEARCH step 5
- `surface-if-draft-contains` findings are kept in a sidecar list. During DRAFT, the coordinator scans whether the draft (after applying other changes) contains the trigger; if yes, the finding is surfaced inline as an optional inclusion. If no, the finding stays logged-only for this iteration and can be re-evaluated next iteration
- `log-only` findings are written to `research/findings.md` but never shown to the user
- Contradictions always surface, flagged as such, so the user can choose how to resolve them

---

### Review Integration Rules

**Annotation decay**:
- Reader Agent annotations should decrease over iterations as the artifact improves. If they don't decrease after 4 iterations, flag as convergence signal #10.
- Voice Auditor annotations should decrease over iterations. If they don't, flag as convergence signal #9.
- If the Voice Auditor returns 0 AI-tell findings and 0 avoided-vocabulary flags for 2 consecutive iterations, skip it for the next iteration to save time. Re-enable if any dimension score drops.
- If the Reader Agent finds 0 engagement drops for 2 consecutive iterations, skip it for the next iteration. Re-enable if score drops.

**Cross-agent conflicts**:
- If Reader Agent flags a passage as confusing AND Voice Auditor flags the same passage for an AI-tell or avoided vocabulary: apply the Reader fix first (rewriting the sentence usually resolves both).
- If Voice Auditor flags a transition AND Reader Agent flags the same passage for pacing: address both — these are complementary, not conflicting.

---

## Breakthrough Protocol

When Signal #6 fires (all dimensions at 7+ and gains have stalled below 0.3 for 2 consecutive keeps), the loop shifts from incremental improvement to structural experimentation. The protocol cycles through three techniques. Each feeds into the next.

**Review agents during Breakthrough**: Both review agents (Reader, Voice Auditor) still run during breakthrough iterations. The Red Team Reader technique replaces the Reader Agent for that iteration only (they serve the same function but the Red Team version is more adversarial). The Voice Auditor runs as normal.

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

Red Team findings feed into the next THINK phase as **constraints**, not suggestions. The revision MUST address the drop-off point and the weakest claim. During this technique, the Red Team Reader **replaces** the Reader Agent in the REVIEW step (skip the standard Reader Agent to avoid redundant reader-perspective analysis). The Voice Auditor still runs in parallel with the Red Team Reader. Log findings to `log.md` with tag `[RED TEAM]`.

---

### Technique 2: Structural Rethink

Re-read the entire artifact as if seeing it for the first time. Discard iteration history. Generate 3 alternative structures:

1. **Inversion**: lead with the conclusion or recommendation, work backward to evidence. Tests whether the current structure buries the lede
2. **Narrative arc**: restructure around a tension-resolution or before-after frame. Tests whether the piece lacks forward momentum
3. **Compression**: what if this were half the length? What survives the cut? Tests whether the piece is padded

Pick the most promising alternative and execute it as a single DRAFT. Run the full REVIEW step (both agents) on the structural rethink draft. **The Maximum Increment Rule is relaxed to +2 per dimension** for structural rethink iterations, because the artifact is fundamentally reorganized. However, unaddressed high-severity review annotations still cap dimensions per safeguard #8. Log with tag `[STRUCTURAL]`, including all 3 alternatives considered and the rationale for the choice.

---

### Technique 3: Constraint-Based Revision

Apply one constraint from this menu. Rotate through them across iterations:

| Constraint | What it forces |
|------------|---------------|
| **Cut 30%** | Remove 30% of word count without losing any data point or claim. Forces elimination of filler, redundancy, and over-explanation |
| **Rewrite the opening 3 ways** | Generate 3 different openings (different hook, different frame, different first sentence). Pick the strongest. Often the opening is the ceiling |
| **Remove all hedging** | Delete every hedge word (may, might, could, somewhat, relatively, arguably). Then add back ONLY the hedges that are genuinely necessary. Most aren't |
| **Kill your best paragraph** | Identify the paragraph you're most proud of. Delete it. Rebuild the piece around its absence. If the piece is better without it, it was a crutch |

Run the full REVIEW step (both agents) after applying the constraint, then REVISE and SCORE. If composite improved: keep. If not: revert, try the next constraint. Log with tag `[CONSTRAINT]`, including which constraint was applied and what was cut or changed.

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
- **Avoided vocabulary**: if the Voice Auditor flagged avoided-vocabulary words and any remain unreplaced at the end of REVISE, Voice & Register (or the equivalent voice dimension) cannot increase this iteration.
- **Transition diversity**: if the Voice Auditor flagged transition monotony and it remains unaddressed, Structure cannot increase this iteration.

### Composite Score
```
composite = sum(weight_i * score_i) for all dimensions
```

## Clean Slate Review

Time allocation: ~10% of total budget. Runs in a loop after the iteration loop exits and before distillation. The loop continues until the Clean Slate Agent returns zero questions or 3 cycles have passed.

**Purpose**: A final-pass review by an agent with **zero context**. This agent has never seen the rubric, the iteration log, or any prior version. It receives only the final artifact text. Its job is to read the document cold, as a complete stranger would, and flag anything that does not make sense.

Iterative review agents (Reader, Voice Auditor) develop blind spots because they have watched the text evolve. They unconsciously fill gaps from memory. The Clean Slate Agent catches what they cannot.

**Input** (provided in agent prompt):
- The final artifact text. Nothing else. No rubric, no log, no scores, no iteration history, no audience description.

**What it checks**:
1. Does every sentence make sense on its own, without needing to read a glossary or earlier section?
2. Do data references add up? If the text says "46% decline," can the reader verify from the numbers given (e.g., 166.9 to 90.2)?
3. Are there terms or concepts used without sufficient explanation for a first-time reader?
4. Are there claims that feel unsupported, where a skeptical reader would ask "says who?" or "based on what?"
5. Does the document flow logically from section to section, or does it jump without transition?
6. Are there internal contradictions (the same metric stated differently in two places, or a claim in Section 3 that conflicts with data in Section 1)?
7. Does every sentence sound natural when read aloud in contemporary North American or British English? Flag any sentence that sounds academic, archaic, or stilted. Common tells: "persisted across," "the full series," "compositional pattern," "decoupled from the aggregate trend." The test: would this sentence appear in The Economist or the Globe and Mail? If not, flag it.
8. Does every sentence use contemporary word order and phrasing? Flag inverted constructions, nominalized verbs where a simple verb would work ("a reduction occurred" vs. "it fell"), and unnecessary abstractions ("the compositional pattern" vs. "what types of crime are changing").

**Output format**:
```
## Clean Slate Review

### Questions (each must be resolved before committing)
1. [Para N]: "[quoted text]" — [question: what is unclear, contradictory, or unsupported]
2. [Para N]: "[quoted text]" — [question]
...
```

**Resolution loop**:
```
cycle = 1
WHILE cycle <= 3:
  1. Launch Clean Slate Agent on current artifact
  2. IF zero questions → exit loop, proceed to distillation
  3. Coordinator resolves every question by editing the artifact
  4. IF same questions recur from the previous cycle → accept and log as unresolvable
  5. Save updated artifact
  6. cycle += 1
IF cycle > 3 and questions remain → log remaining issues in summary, proceed to distillation
```

**Resolution rules**:
- The coordinator must resolve **every question** by editing the final artifact. No question may be dismissed without a text change.
- Resolution options: add a clarifying phrase, rewrite the sentence for clarity, add a data reference, or correct the inconsistency.
- If a question reveals a factual error that cannot be fixed without research (and the run is in simple-rewrite mode), flag it in the summary as an unresolved issue rather than fabricating a fix.
- After resolving all questions in a cycle, re-launch the Clean Slate Agent on the updated text. Fixes often introduce new awkward phrasing; the loop catches this.

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
- **Voice Auditor**: Which AI-tell patterns were hardest to eliminate? Which techniques successfully removed them? What transition strategies worked best for the target register? Did rhythm monotony persist despite targeted fixes? Which avoided-vocabulary words recurred, and what replacements worked best?
- **Lexicon effectiveness**: Which lexicon was active? Which preferred words were reached for most often during REVISE? Which preferred words were never used (candidates for removal)? Which non-lexicon words were repeatedly chosen as replacements (candidates for addition to the preferred list)? Were any avoided-vocabulary words hard to replace cleanly (suggesting the avoided list is too aggressive for this domain)?

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
### Lexicon Refinements
[Active lexicon: [name]. Summary of how much of the final text's distinctive word choice traces to the lexicon.]
#### Words to Add to Preferred Vocabulary
[Words that were repeatedly reached for during REVISE even though they weren't in the lexicon — these fit the voice and should be added]
#### Words to Remove from Preferred Vocabulary
[Lexicon words that were never used — not useful for this domain]
#### Words to Add to Avoided Vocabulary
[Words that the Voice Auditor repeatedly flagged or that kept creeping back into drafts — should be hard-rejected]
#### Phrase Patterns That Emerged
[New phrase constructions that appeared naturally during revision and fit the lexicon's voice]
### Transition Diversity
[Which transition strategies produced the most natural paragraph flow? Did lexicon preferences hold?]
### Rhythm Breaking
[Which sentence length variations were most effective? Did the lexicon rhythm profile help?]
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
