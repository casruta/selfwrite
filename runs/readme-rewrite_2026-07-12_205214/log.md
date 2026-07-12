# Log — README.md rewrite

## Iteration 1

**Hypothesis:** full restructure into topical paragraphs. The baseline carries its content in four
tables and bolded inline notes, uses a "#### note:" heading as an aside, and fails the gate on a
71-word run-on at line 7 plus a 52-word one at line 137 (FK 10.72, avg 13, max 71, pass:false,
one tricolon flag at line 116). Restructure to: intro paragraph, professional italic detector
note, one substantial paragraph per skill with budgets folded into prose, install and quick
start, auditing runs, optional MCP upgrades, requirements — banner block and badge untouched.

**What changed:** wrote versions/v1-draft.md from scratch. Converted the "What's in the box"
table and all three budget tables to prose. Each skill section is now one paragraph covering
what it does, its loop stages, its honesty mechanism, and its time budgets (minimums 10m/15m/30m
in prose, verified against the skill files). Tier tags now carry their meanings (SRC sourced,
SYN synthesized, INF inferred, UNV unverified — checked against selfresearch.md's tier table).
Added run-directory layout, the three named validators, the skill.md distillate tip, and the
MCP trust rule from sources/mcp-backends.md. Kept fences for install, invoke, and audit.

**Review:** readability-check --json: pass=false, fk_grade=11.77 (baseline 10.72),
avg_sentence_words=21.09 (13), max_sentence_words=33 (71), kill_list_hits=0,
negation_antithesis=0, tricolon_paragraphs=0, violations=["avg_sentence_words 21.1 > 20"].
The two baseline run-ons are gone; the new failure is my own — folding tables into prose
produced uniformly long sentences (45 sentences carrying 949 words). Rubric: register 8,
structure 9, accuracy 9, readability 3 (capped, pass=false), completeness 9.
Composite 7.55 vs baseline 5.20.

**Decision: keep** (+2.35). The structure, register, and completeness gains are real and every
required fact is present; the single remaining violation is a targeted, fixable average-length
problem and is iteration 2's job.

## Iteration 2

**Hypothesis:** gate repair. Folding tables into prose in v1 produced uniformly long sentences —
45 sentences carrying 949 words, avg 21.09 against the 20-word cap. Splitting the longest
sentence in each dense paragraph (intro, all three skill paragraphs, install, auditing, MCP)
should pull the average under 20 without creating tricolon runs, since each split half stays
above the 8-word short-sentence threshold.

**What changed:** eleven splits, no content added or removed. Intro's colon-list opener became
two sentences; the selfwrite paragraph split its invocation, intake, and scoring sentences; the
selfresearch paragraph split its opener, tier list, verification, and budget sentences; the
selfinvestigate paragraph split its backends and thesis-gate sentences; the install paragraph
split "verify, then invoke"; auditing split the three-validator sentence; MCP split Exa/Tavily
from Zotero.

**Review:** readability-check --json: pass=true, fk_grade=10.20 (was 11.77),
avg_sentence_words=17.18 (21.09), max_sentence_words=30 (33), word_count=962,
sentence_count=56, kill_list_hits=0, negation_antithesis=0, tricolon_paragraphs=0,
violations=[]. No paragraph acquired a run of short sentences; the shortest split half is
9 words. Rubric: register 8, structure 9, accuracy 9, readability 9 (passes with margin),
completeness 9. Composite 8.75 vs 7.55.

**Decision: keep** (+1.20). The hard gate now passes with headroom on every metric and nothing
was lost — the exact fix this iteration targeted.

## Iteration 3

**Hypothesis:** accuracy audit against the repo. Every claim, path, flag, and number in the
draft gets checked against its defining file; anything wrong gets fixed, and flab found along
the way gets cut.

**What changed:** the audit itself found no drift — voice names (Economist, Reuters, NYT News
Analysis) match selfwrite.md's lexicon system, stance semantics ("weighted during triage, never
whether counter-queries run") match selfinvestigate.md line 473, tier meanings match
selfresearch.md's tag table, dependencies (yaml, vitest, node >= 20) match package.json, and
all MCP claims match sources/mcp-backends.md. Three micro-edits followed from it: the vague
"grade-12 readability gate conditioned on audience" now states the real thresholds (grade 12
default, grade 10 general, expert exempt, matching THRESHOLDS in lib/readability.mjs); the
skill.md tip lost its filler sentence ("is worth keeping around"); and the Wayback clause
swapped an awkward "and academic plus web sources" for a clean "while" construction.

**Review:** readability-check --json: pass=true, fk_grade=10.17 (10.20),
avg_sentence_words=17.34 (17.18), max_sentence_words=30, word_count=971, kill_list_hits=0,
negation_antithesis=0, tricolon_paragraphs=0, violations=[]. Rubric: register 8, structure 9,
accuracy 10 (every stated number verified against its source; thresholds now exact),
readability 9, completeness 9. Composite 8.95 vs 8.75.

**Decision: keep** (+0.20). Verified precision with a small net cut; the gate keeps its margin.

## Iteration 4

**Hypothesis:** cut flab, lift register. The quick-start tips paragraph re-announces the intake
questions that the selfwrite paragraph already covers, and the audit section never mentions
that run-audit is also installed as a slash-command skill (CLAUDE.md documents it as
"also /run-audit"). Merging the redundant intake beat and surfacing the alias should tighten
the read without touching any required fact.

**What changed:** two edits. The tips paragraph now opens directly with "Concrete answers to
the intake questions pay off" (one sentence gone, the CFO example kept), and the audit
paragraph reads "One command — also exposed as the `/run-audit` skill — runs the whole
battery". Nothing else touched.

**Review:** readability-check --json: pass=true, fk_grade=10.33 (10.17),
avg_sentence_words=17.65 (17.34), max_sentence_words=30, word_count=971, sentence_count=55,
kill_list_hits=0, negation_antithesis=0, tricolon_paragraphs=0, violations=[]. Rubric:
register 9 (the repeated intake beat was the last note-like wobble), structure 9, accuracy 10,
readability 9, completeness 9. Composite 9.20 vs 8.95.

**Decision: keep** (+0.25). Small, verified gains on register with the gate's margin intact.

## Iteration 5

**Hypothesis:** the italic AI-detector note interrupts the intro-to-skills flow at position two,
and it belongs topically with `/selfwrite`, whose whole point is prose that reads like natural
human writing. Relocating it under the selfwrite paragraph should complete the topical
structure. Two micro-fixes ride along: "Allow 15 to 30 minutes" (killing the Budgets/Budget
echo) and "The skills still function" (missing article).

**What changed:** moved the note, unchanged, from below the intro to below the selfwrite
paragraph. Drafting the move exposed a dropped baseline fact — the selfwrite section never said
the loop hunts AI-tell phrasing, so the relocated note had no antecedent. Added one sentence:
reviews hunt AI-tell phrasing against a kill list, so the finished piece reads like natural
human writing (verified: the REVIEW auditor works from the AI-Tell Pattern Catalog and
config/kill-list.yaml). Applied both micro-fixes.

**Review:** readability-check --json: pass=true, fk_grade=10.44 (10.33), avg_sentence_words=18.0
(17.65), max_sentence_words=30, word_count=990, sentence_count=55, kill_list_hits=0,
negation_antithesis=0, tricolon_paragraphs=0, violations=[]. First two paragraphs (intro,
selfwrite) and the final one (requirements) all clean. Rubric: register 9, structure 10 (every
section now purely topical), accuracy 10, readability 9, completeness 10 (the detector-evasion
purpose is back). Composite 9.55 vs 9.20.

**Decision: keep** (+0.35). The relocation reads better and recovered a lost fact. Ending the
loop here at 5 iterations (5 kept, 0 reverted) — remaining candidates are noise-level edits
that would not move any dimension.
