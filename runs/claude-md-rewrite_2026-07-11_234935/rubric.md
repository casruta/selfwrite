# Rubric — CLAUDE.md rewrite

Task: rewrite CLAUDE.md so a fresh Claude session learns what the tool does, how it does it,
and how to use it. Audience: default (Claude sessions reading repo instructions). Scored 1-10
per dimension; composite = sum(weight * score). Locked before iteration 1.

## Dimensions

| # | Dimension | Weight | What a 10 looks like |
|---|-----------|--------|----------------------|
| 1 | Invariant completeness | 0.30 | All four enforcement invariants present with exact thresholds: run ledger (one results.tsv row per attempted iteration, schema_version 2, preflight before DRAFT), verbatim-substring citations, readability gate (FK <= 12.0 default, <= 10.0 general, expert exempt), byte-identical SHARED blocks. Losing any one is a FAIL (cap composite at 4). |
| 2 | Accuracy of paths and commands | 0.20 | Every path, script, and command named in the doc exists in the repo as written. No phantom references (no selfpost, queue/, Twitter, .mcp.json). Commands are copy-paste runnable. |
| 3 | Readability gate | 0.20 | `readability-check --kill-list=config/kill-list.yaml --json` returns pass:true (FK <= 12.0, avg sentence <= 20 words, none > 35). Zero kill-list hits. No negation-antithesis or tricolon hits in the first two or final paragraphs. A pass:false result caps this dimension at 3. |
| 4 | Usefulness to a fresh session | 0.20 | Answers what the tool is, how each skill's loop works (one short paragraph each), and how to install, invoke, and audit. Repo map, commands, and conventions are present and easy to scan. |
| 5 | Concision | 0.10 | No filler, no repeated content, every line earns its place. Comparable length to the baseline or shorter per unit of information. |

## Baseline (v0) scores

1. Invariant completeness: 9 (all four present, exact numbers).
2. Accuracy: 9 (paths correct after the selfpost removal).
3. Readability gate: 2 (pass:false — FK 17.66, avg 35.43, max 92; bullet fragments merge into run-on "sentences").
4. Usefulness: 5 (no what/how/use summary, no per-skill loop descriptions, no install or invoke guidance).
5. Concision: 9 (dense, no filler).

Baseline composite: 0.30*9 + 0.20*9 + 0.20*2 + 0.20*5 + 0.10*9 = 6.80.
