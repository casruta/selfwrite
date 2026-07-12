# Summary — CLAUDE.md rewrite

**Task:** rewrite CLAUDE.md to summarize what the tool does, how it does it, and how to use it.
**Audience:** default. **Mode:** simple rewrite. **Iterations:** 5 attempted, 4 kept, 1 reverted.

## Baseline → final

The v0 baseline was a dense map-plus-invariants card. It had no summary of what the tool is, no
description of the three skill loops, and no install/invoke/audit guidance. It also failed the
readability gate badly: unpunctuated bullet fragments merged into run-on "sentences" up to 92
words, for FK 17.66 against the <= 12.0 cap.

The final draft (v5, 72 lines) leads with what the tool is and why the validators exist, gives one
paragraph per skill loop (selfwrite's keep-or-revert cycle, selfresearch's claim tiers and quote
verification, selfinvestigate's thesis-assessment gate), and adds install, invoke, and audit
instructions. The repo map, all four enforcement invariants with their exact thresholds, the
commands list, and the conventions survived intact — reworded into real sentences, with every
command moved into fenced code blocks.

## Final readability (baseline in parentheses)

- pass: true (false)
- fk_grade: 9.77 (17.66)
- avg_sentence_words: 15.06 (35.43)
- max_sentence_words: 35 (92)
- kill_list_hits: 0; negation_antithesis: 0; tricolon_paragraphs: 0

## Iterations

| N | Hypothesis | Decision | Composite |
|---|------------|----------|-----------|
| 1 | Full restructure to summary-first doc | keep | 6.80 → 7.70 |
| 2 | Readability repair: capitalize Map bullet openings | keep | 7.70 → 8.90 |
| 3 | Cut duplicate command fences from invariants | keep | 8.90 → 9.00 |
| 4 | Replace loop paragraphs with a table | revert | 9.00 → 8.40 (discarded) |
| 5 | Define acronyms, add duration minimums, fix list split | keep | 9.00 → 9.20 |

Iteration 4 passed the readability gate only because tables are invisible to the analyzer; it
dropped the named backends and the loop mechanics, so it was reverted for the usefulness loss.
