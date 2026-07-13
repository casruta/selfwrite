# Log — CLAUDE.md rewrite

## Iteration 1

**Hypothesis:** full restructure to a summary-first doc. The baseline is a dense map-plus-invariants
card with no what/how/use summary, and its unpunctuated bullet fragments merge into 90-word
"sentences" (FK 17.66). Restructure to: intro (what + why validators), one paragraph per skill loop,
install/invoke/audit, then the preserved map, invariants, commands, and conventions — with every
bullet written as a real sentence and all commands moved into fenced code blocks.

**What changed:** wrote versions/v1-draft.md from scratch. Added the three loop paragraphs
(selfwrite THINK→...→REFLECT with keep-or-revert; selfresearch PLAN→...→SUMMARIZE with claim
tiers and quote verification; selfinvestigate SCOPE→...→WRITE with the thesis-assessment gate)
and a How-to-use section (cp skills, npm install, invoke with duration, run-audit). Kept all four
invariants with their exact numbers, the map, the commands list (now one fenced block), and the
conventions.

**Review:** readability-check --json: pass=false, fk_grade=10.08 (baseline 17.66),
avg_sentence_words=16.66 (35.43), max_sentence_words=55 (92), kill_list_hits=0,
negation_antithesis=0, tricolon_paragraphs=0. Two violations remain, both in the Map list at
line 39: bullets that start with a lowercase path (`lib/`, `scripts/`, ...) never terminate the
previous bullet's sentence (the splitter requires an uppercase start), so bullets merge into 42-
and 55-word run-ons. Rubric: invariants 9, accuracy 9, readability 3 (capped, pass=false),
usefulness 9, concision 8. Composite 7.70 vs baseline 6.80.

**Decision: keep** (+0.90). The structure, loop summaries, and usage section are genuine gains and
every content requirement is now present; the remaining gate failure is localized to the Map list
and is the target of iteration 2.

## Iteration 2

**Hypothesis:** readability repair. The splitter only ends a sentence when the next one starts with
an uppercase letter (or digit/quote), so Map bullets that open with lowercase paths (`lib/`,
`scripts/`, `sources/`, `config/`) merge with the previous bullet into 42- and 55-word run-ons.
Rewriting each bullet to open with a capitalized subject ("Pure logic sits in `lib/` ...") should
clear both violations without losing any map content.

**What changed:** only the Map section. Each of the seven map facts is now a standalone sentence
with an uppercase start; the near-dupes exit-code exception got its own bullet. No other section
touched.

**Review:** readability-check --json: pass=true, fk_grade=9.42 (was 10.08), avg_sentence_words=15.11
(16.66), max_sentence_words=35 (55), kill_list_hits=0, negation_antithesis=0, tricolon_paragraphs=0,
violations=[]. Content unchanged elsewhere; all four invariants and their numbers intact. Rubric:
invariants 9, accuracy 9, readability 9 (gate passes with margin), usefulness 9, concision 8.
Composite 8.90 vs 7.70.

**Decision: keep** (+1.20). The hard gate now passes and nothing was lost — the exact fix the
iteration targeted.

## Iteration 3

**Hypothesis:** cut flab. The three code fences under Run ledger, Citations, and Readability gate
repeat commands that appear verbatim in the Commands block 15 lines below. Weaving the script
names into the invariant prose ("Enforcement: `run-integrity.mjs --preflight` ...") should keep
each invariant self-contained while cutting ~14 lines.

**What changed:** removed the three per-invariant fences; each invariant now names its enforcing
script inline. Split the Run ledger's third sentence in two to stay under the 35-word cap. Also
spelled out Flesch-Kincaid at FK's first use. Before drafting, verified every flag in the doc
against the CLI usage strings (readability-check, near-dupes, verify-quotes, run-audit), the
PostToolUse hook in .claude/settings.json, and the SHARED markers in all three skill files —
all accurate, no fixes needed.

**Review:** readability-check --json: pass=true, fk_grade=9.61 (9.42), avg_sentence_words=14.79
(15.11), max_sentence_words=35 (35), zero kill-list/negation/tricolon hits, violations=[].
73 lines vs 87. All four invariants still carry their exact thresholds and enforcing scripts.
Rubric: invariants 9, accuracy 9, readability 9, usefulness 9, concision 9. Composite 9.00 vs 8.90.

**Decision: keep** (+0.10). Real deletion with no information loss; FK moved 9.42 to 9.61, still
well inside the gate.

## Iteration 4

**Hypothesis:** compress the three loop paragraphs into a Skill / Loop / Honesty-mechanism table.
Tables are excluded from readability analysis, so this buys FK headroom for free, and a table
scans faster than three paragraphs.

**What changed:** replaced the three paragraphs under "The three loops" with a 3-row table
(versions/v4-draft.md). Nothing else touched.

**Review:** readability-check --json: pass=true, fk_grade=9.42, avg=14.62, max=35, zero hits —
but only because the table's text is invisible to the analyzer, so the pass earns no credit.
Content check against the rubric: the table drops the intake-questions/rubric step, "every
version stays on disk", the named backends (Semantic Scholar, OpenAlex, arXiv, FEC, SEC EDGAR,
court archives), the quote-anchored meaning of the claim tiers, and what the thesis gate shows
the user. The task requires one short descriptive paragraph per skill; step names alone do not
describe the loops. Rubric: invariants 9, accuracy 9, readability 9, usefulness 6 (-3),
concision 9. Composite 8.40 vs 9.00.

**Decision: revert** (-0.60). Scannability did not pay for the information loss; draft.md stays
at v3. The -draft file remains as the record of the attempt.

## Iteration 5

**Hypothesis:** clean-read polish for a fresh session. Three micro-fixes: define LLM and MCP at
first use (the acronym checker flags both as undefined), state the per-skill minimum durations in
the invoke line, and remove a stray blank line splitting the invariants list into two paragraphs
(leftover from iteration 3's fence removal).

**What changed:** "no LLM (large language model) re-derives ...", "MCP (Model Context Protocol)
servers are optional upgrades ...", invoke line now reads "minimums are 10m, 15m, and 30m
respectively" (verified against selfwrite.md:27, selfresearch.md:34, selfinvestigate.md:33), and
the invariants bullets are one list again.

**Review:** readability-check --json: pass=true, fk_grade=9.77 (9.61), avg_sentence_words=15.06
(14.79), max_sentence_words=35, zero kill-list/negation/tricolon hits, violations=[]. 72 lines.
Rubric: invariants 9, accuracy 9, readability 9, usefulness 10 (acronyms defined, duration
minimums stated), concision 9. Composite 9.20 vs 9.00.

**Decision: keep** (+0.20). Small, verified gains; the gate still passes with margin. Ending the
loop here at 5 iterations (4 kept, 1 reverted).
