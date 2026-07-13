# Rubric — README.md rewrite

Task: rewrite README.md professionally into topical paragraphs. Audience: default (developers
evaluating or installing the tool from the repo page). Scored 1-10 per dimension;
composite = sum(weight * score). Locked before iteration 1.

## Dimensions

| # | Dimension | Weight | What a 10 looks like |
|---|-----------|--------|----------------------|
| 1 | Professional register | 0.25 | Connected prose throughout — no fragment pile-ups, no bolded inline note-clutter, no "#### note:" heading misuse. Reads like a well-edited project page, not a spec sheet. Honors the AI-tell catalog: no summary-kicker ending, no anaphora runs, at most 2 paragraphs opening on stage directions, no negation-antithesis or tricolon in the first two or final paragraphs. |
| 2 | Topical-paragraph structure | 0.20 | Content organized into topical sections: what Selfwrite is, one substantial paragraph per skill (what it does, how its loop works, when to use it, time budgets folded into prose), install and quick start, auditing runs, optional MCP upgrades, requirements. Tables converted to prose unless genuinely tabular data survives review. Banner block and badge line untouched at top. |
| 3 | Factual accuracy | 0.20 | Every path, command, flag, and number matches the repo: duration minimums 10m/15m/30m, --stance values with investigate default, backend names, validator scripts, runs/<skill>_<timestamp> layout. No phantom references. Commands copy-paste runnable. A plausible-but-wrong detail caps this dimension at 4. |
| 4 | Readability gate | 0.20 | `readability-check --kill-list=config/kill-list.yaml --json` returns pass:true (FK <= 12.0, avg sentence <= 20 words, none over 35). Zero kill-list hits. No negation_antithesis or tricolon_paragraphs hits in the first two or final paragraphs. A pass:false result caps this dimension at 3. |
| 5 | Completeness | 0.15 | Every fact a new user needs survives: three invocation forms with minimums, intake questions, versions-kept and revert behavior, claim tiers (SRC/SYN/INF/UNV) with verbatim-quote verification, thesis-assessment gate, run directory layout, run-audit one-command audit, npm install/test, skill.md distillate install tip, no-API-keys default, Node 20+. |

## Baseline (v0) scores

1. Professional register: 4 (a "#### note:" heading used as an aside, five bolded inline notes,
   fragment pile-ups like "Duration is Nm or Nh, minimum 30m. Default stance: investigate
   (neutral). Examples:" — the analyzer flags that one as a tricolon).
2. Topical-paragraph structure: 4 (four tables carry core content; per-skill sections are
   command-first fragments, not connected paragraphs; budget guidance lives in tables).
3. Factual accuracy: 9 (paths, flags, and minimums verified against the skill files and
   sources/; no phantom references).
4. Readability gate: 2 (pass:false — 71-word and 52-word run-on sentences at lines 7 and 137;
   FK 10.72, avg 13, max 71).
5. Completeness: 8 (nearly everything present; fresh-context scoring and the layout of a run
   directory are implied rather than stated).

Baseline composite: 0.25*4 + 0.20*4 + 0.20*9 + 0.20*2 + 0.15*8 = 5.20.
