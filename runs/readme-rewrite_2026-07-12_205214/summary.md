# Summary — README.md rewrite

Task: rewrite README.md professionally into topical paragraphs. Five iterations, kept: 5,
reverted: 0. Composite 5.20 (baseline) → 9.55 (v5).

## Structure change

The baseline carried its content in four tables (What's in the box plus three per-skill budget
tables), five bolded inline notes, and a "#### note:" heading used as an aside. Its per-skill
sections were command-first fragment stacks. The final README is seven topical sections in
connected prose: intro, one substantial paragraph per skill with loop stages and time budgets
folded in, install and quick start, auditing runs, optional MCP upgrades, and requirements.
Every table converted to prose; the banner block and badge line are untouched; fences remain
for install, invoke, and audit commands. The italic AI-detector note survived, rewritten and
relocated from position two to the end of the `/selfwrite` section, where it has a topical
antecedent.

## Readability

Baseline: pass=false — FK 10.72, avg 13 words, max 71 (a 71-word run-on at line 7 and a 52-word
one at line 137), one tricolon flag. Final: pass=true — FK 10.44, avg 18.0, max 30,
kill_list_hits=0, negation_antithesis=0, tricolon_paragraphs=0, violations=[]. The instructive
middle: v1's table-to-prose conversion produced uniformly long sentences (avg 21.09, its own
gate failure); v2 repaired it by splitting one long sentence per dense paragraph.

## Iterations

1. Full restructure into topical paragraphs — keep, 5.20 → 7.55 (gate still failing on avg).
2. Gate repair: split uniformly long sentences — keep, 7.55 → 8.75 (pass=true, FK 10.20).
3. Accuracy audit against the repo — keep, 8.75 → 8.95 (no drift found; thresholds made exact).
4. Cut flab, lift register — keep, 8.95 → 9.20 (redundant intake beat out, /run-audit alias in).
5. Relocate detector note; restore AI-tell fact — keep, 9.20 → 9.55.

Every factual claim in the final README was verified against its defining file: duration
minimums against the three skill prompts, stance semantics against selfinvestigate.md, tier
meanings against selfresearch.md, thresholds against lib/readability.mjs, dependencies against
package.json, and MCP claims against sources/mcp-backends.md.
