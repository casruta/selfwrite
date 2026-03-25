# Writing Skill Quality Rubric

Locked at run start. No mid-run changes.

## Dimensions

### 1. Questioning Depth (Weight: 0.20)

**Definition**: How well the skill guides user-model dialogue before writing starts.

| Score | Observable Markers |
|-------|-------------------|
| 1-2 | No questioning phase. Jumps straight to writing |
| 5-6 | Asks basic questions (audience, purpose, tone) but doesn't adapt rules based on answers |
| 9-10 | Structured intake that maps answers to specific rule adjustments. Questions cover audience, purpose, tone, constraints, emphasis, genre, register, and output format |

### 2. Scoring Precision (Weight: 0.15)

**Definition**: How accurately the scoring protocol captures real writing quality.

| Score | Observable Markers |
|-------|-------------------|
| 1-2 | Generic dimensions (clarity, quality, readability) with no specific markers |
| 5-6 | Dimensions tied to craft elements (lede, structure, voice) with example markers |
| 9-10 | Dimensions grounded in research-backed criteria (given-new flow, subordination density, burstiness) with quantitative thresholds where appropriate |

### 3. Sentence Construction (Weight: 0.20)

**Definition**: Specificity and research-grounding of sentence-level rules.

| Score | Observable Markers |
|-------|-------------------|
| 1-2 | Vague advice ("write clearly," "vary sentence length") |
| 5-6 | Specific rules with examples (S-V-O order, active voice, conjunction starts) |
| 9-10 | Rules grounded in linguistic research (given-new contract, right-branching preference, stress position theory) with before/after examples and frequency targets |

### 4. Flow & Information Architecture (Weight: 0.20)

**Definition**: Guidance on information flow, buildup, transitions, paragraph sequencing.

| Score | Observable Markers |
|-------|-------------------|
| 1-2 | No guidance on information flow beyond "logical structure" |
| 5-6 | Story architecture types listed (inverted pyramid, diamond, hourglass) with selection rules |
| 9-10 | Paragraph-to-paragraph flow rules (old-to-new, question engine), transition taxonomy, information density management, section-level pacing guidance |

### 5. Audience Adaptation (Weight: 0.10)

**Definition**: How well the skill adapts its rules to different audiences and contexts.

| Score | Observable Markers |
|-------|-------------------|
| 1-2 | One-size-fits-all rules. No mention of audience |
| 5-6 | Audience mentioned as consideration but rules don't change based on audience |
| 9-10 | Explicit audience profiles with rule adjustments per type. Genre-specific guidance (opinion, data journalism, feature, explainer) |

### 6. Research Authority (Weight: 0.15)

**Definition**: Are rules grounded in actual writing research or LLM-generated heuristics?

| Score | Observable Markers |
|-------|-------------------|
| 1-2 | Rules are plausible-sounding heuristics with no sourcing |
| 5-6 | Some rules reference known concepts (kill list, verb ladder) but without attribution |
| 9-10 | Key rules cite or derive from established sources (Pinker, Zinsser, NYT style guide, Christensen, journalism pedagogy). Principles named and attributed |

## Scoring Rules

- Composite = sum(weight_i * score_i)
- Baseline (v0) anchored at 4-6 per dimension (hard rule)
- Max +1 per dimension per iteration
- Every score must cite specific content from the skill file
- State 2-3 weaknesses BEFORE scoring (mandatory)
