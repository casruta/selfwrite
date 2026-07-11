# Multi-Agent Codebase Analysis — Research Loop Integrity & Grade-12 Readability

**Date:** 2026-07-11
**Method:** Five parallel auditor agents (selfresearch loop, selfinvestigate loop, selfwrite loop, output naturalness, run-log ground truth), findings cross-verified against the files before inclusion.

**Goals audited:**
1. Make research as close to perfect as possible, especially the iteration loops.
2. Ensure output text is completely natural, uses grade-12 English, and explains the subject matter so a grade-12 student can understand it.

---

## Executive summary

The pipelines are well-designed on paper, but both goals currently fail on enforcement, not on intent:

- **Goal 1 (research):** The verifier never re-checks that quotes are verbatim substrings of stored source text, so a fabricated quote passes verification (the biggest single hole). Scoring in `/selfwrite` is self-graded by the same context that wrote the draft, and the forced 4–6 baseline plus +1/iteration cap can manufacture an improvement arc regardless of real quality. Stance up-weighting in `/selfinvestigate` biases the evidence pool at retrieval time, so hiding stance from the writer is cosmetic. Real run logs show these aren't theoretical: the `nyt-upgrade` run abandoned its audit trail at cycle 12 of 36 while the shipped artifact grew to nearly twice its last logged size, unscored.
- **Goal 2 (readability):** "Grade 12" appears exactly once as a target across ~5,100 lines of skill files (`selfwrite.md:903`), inside an optional rubric row that a real run (`runs/2026-04-01_011613/rubric.md`) dropped entirely. There is no numeric readability gate anywhere, no jargon-on-first-use rule, and `/selfresearch` and `/selfinvestigate` — the skills that produce reports — contain zero readability language. The AI-tell catalog misses the "This isn't X. It's Y." construction; a real run *deliberately added it to raise its own score* (`runs/2026-04-01_011613/log.md:90-94`) and it shipped in the final version.

The highest-leverage fixes, in order: (1) verbatim quote-check in the verifier; (2) independent Score Agent; (3) numeric Readability Gate (Flesch-Kincaid ≤ 12) wired into all three skills; (4) stance-neutral stored relevance scores; (5) run-integrity validator (`lib/run-integrity.mjs`).

---

## Part 1 — Research quality: loop loopholes and fixes

### 1.1 Cross-cutting defects (all three skills)

**R1. Self-grading — the scorer is the author. (Highest impact.)**
`selfwrite.md:1167-1169, 1560-1601`. Reader Agent and Voice Auditor are fresh subagents (`:1134`), but SCORE runs in the same coordinator context that just ran THINK/DRAFT/REVISE. Every downstream mechanism (keep/revert, convergence, research-depth throttling at composite > 8.5) inherits this bias.
**Fix:** Add a fresh-context **Score Agent** given only `rubric.md`, `v{N}.md`, `v{best}.md`, and the Reader/Voice annotations — no drafting reasoning. The coordinator may not overrule its per-dimension numbers. Score v0 through the same blind agent and drop the "no dimension above 7" baseline forcing (`selfwrite.md:929`) — a forced-low baseline plus a +1/iteration cap (`:1579-1583`) fabricates an upward score arc regardless of quality.

**R2. Inconsistent and passive budget-overrun stops.**
`selfresearch.md:1411-1412` forces STOP at >10% over Phase-2 budget, checked only *between* waves; `selfinvestigate.md:1454-1456` uses 105% and phrases it as an edge-case afterthought ("Reflector should have caught this"); `selfwrite.md:1253-1254` doesn't say whether "remaining time" means run-remaining or phase-remaining, conflicting with the fixed phase split at `:50-54`.
**Fix:** One shared rule in all three files: *at the start of every wave/iteration*, compute `elapsed / phase_budget`; force STOP at ≥ 110% (pick one number and use it everywhere). Add a pre-dispatch wave-duration estimate (arXiv serialization at 3s/call × node count) and downsize the wave if it would blow the deadline, rather than only checking after it completes.

**R3. "Use the ENTIRE time budget" contradicts "accept plateau."**
`selfwrite.md:18` vs `:1246, :1500`. When plateau is accepted with time remaining, the coordinator must violate one rule or the other, and resolves it arbitrarily per run.
**Fix:** Add: "If plateau is accepted before the iteration-phase deadline, redirect remaining iteration time to Clean Slate Review / Distillation (extend pro-rata) rather than grinding low-value iterations or exiting early."

**R4. Convergence signals are all advisory.**
`selfwrite.md:1251`: "These are advisory signals, not rigid rules." The coordinator that wants to keep iterating can wave away any plateau/oscillation detection.
**Fix:** Make signals #1 (3+ consecutive reverts), #2 (plateau: <0.3 gain over 3 keeps), #4-fired-twice (oscillation → force Breakthrough Protocol), and #6 (ceiling) **mandatory** triggers; continuing anyway requires a `[SIGNAL OVERRIDE]` entry in `log.md` stating the specific evidence the signal was wrong.

### 1.2 `/selfresearch` — pipeline-specific

**R5. The verifier never checks quotes are verbatim. (Fabrication escape hatch — top research-integrity fix.)**
`selfresearch.md:790-798`: the SRC protocol checks Q-ID existence, source linkage, and semantic support — but never that `quote_text` is an actual substring of the stored `abstract`/`snippet_used`. The only verbatim check is the extractor's self-attestation (`:496-498`).
**Fix:** Add step 0 to SRC verification: "Normalize whitespace/case and confirm `quote_text` is an exact substring of `sources.json[S<id>].abstract` or `.snippet_used`. No match → FAIL (`fabricated_or_altered_quote`) regardless of plausibility." Add `fabricated_quotes: N` to `structural_issues`.

**R6. Contradictory STOP semantics.**
`selfresearch.md:302-306` (exit requires STOP **and** ≥2 waves) vs `:424` (STOP exits after this wave's merge). Unspecified which wins on an early STOP.
**Fix:** Reconcile: STOP at wave 1 forces one confirmation wave (DEEPEN-only, high-relevance sources), then exit once `stop_flag && wave_index >= 2`.

**R7. Failed queries are never fed back — blind requerying.**
Reflector inputs (`selfresearch.md:362-372`) include metrics but not the query log; EXPAND "alternative phrasings" (`:1382-1387`) can regenerate near-identical dead queries.
**Fix:** Feed `prior_queries_by_node` into the reflector; require each new EXPAND node to state its lexical/conceptual delta from every prior query in that lineage.

**R8. `no_sources` nodes permanently starve dependents.**
Ready-set requires dependencies at `status="done"` (`:264`); a node stuck at `no_sources` never advances, so its dependents never dispatch — silently.
**Fix:** After 2 dry waves, set `status="done_empty"` (satisfies `depends_on`), cascade a `blocked_by_empty_dependency` flag, and report cascaded nodes separately in `summary.md`'s coverage section. (Same fix applies to `/selfinvestigate`'s user-dropped nodes, `selfinvestigate.md:419-427`: cascade-check dependents at drop time.)

**R9. `novel_rate` is gameable by small waves.**
`:297, :376-377`: a 2-retrieval all-new wave scores 1.0, same as a 30-retrieval all-new wave.
**Fix:** Apply rate-based rules only when `retrievals_this_wave >= 8`; below that, use absolute `unique_new_this_wave` (<3 → saturating).

**R10. "Multiple corroborating sources" ignores source independence.**
HIGH confidence (`:822-826`) can be reached by two records from the same lab/dataset/preprint lineage that dodge the 0.85 near-dup threshold.
**Fix:** Before assigning HIGH via corroboration, check for ≥2 overlapping authors or shared dataset/lineage; if found, count as one corroborating unit and downgrade to MODERATE unless an outside source also supports it.

**R11. Unimplementable mechanisms presented as real.**
(a) Adaptive `max_parallel_nodes` (`:264-287`) requires rate-limit headers, but all backend calls go through `WebFetch` with LLM extraction — headers never reach the coordinator; the feature silently no-ops to the default. (b) MinHash dedup (`:291-293`) specifies 128 permutations but nothing says what executes it — it degrades to LLM eyeballing. (c) The injection-scan promise (`:108`) has no corresponding field or instruction in the verifier schema (`:834-857`).
**Fix:** (a) Have the WebFetch prompt return `rate_limit_remaining` as a JSON field, or delete the feature. (b) Compute `near_duplicate` via a short Python script (Bash tool); log `dedup_method: llm_fallback` when scripts aren't available. (c) Add `injection_flags: [...]` to the verifier schema and an explicit scan instruction.

**R12. Rate-limit collisions and reflector over-expansion.**
Semantic Scholar allows 1 req/s unauthenticated (`sources/semantic_scholar.md:11`) while waves fire up to 12 parallel nodes (`selfresearch.md:272, :324`). EXPAND (`:378`) has no cap tied to the retrieval ceiling, so late waves shrink to 1–2 sources/node via pro-rata clamping (`:441-447`).
**Fix:** Serialize S2 calls across a wave (1.1s spacing) when >1 node shares the backend and no key is set. Pass `ceiling_headroom_remaining` into the reflector and forbid EXPAND when headroom would force <3 sources per new node — prefer DEEPEN.

### 1.3 `/selfinvestigate` — pipeline-specific

**R13. Stance biases the evidence pool upstream; writer-blindness is cosmetic. (Top bias fix.)**
`selfinvestigate.md:463-467` up-weights supporting results during retrieval/relevance scoring, which determines what enters `sources.json` — so the Stage 4 assessor and Stage 5 writer see a tilted pool even though the writer never sees the stance (`:1064`).
**Fix:** Up-weighting affects wave-level triage order only; store both a stance-neutral and stance-weighted score per source, and require the causal-chain analyzer and thesis assessor to select "strongest evidence" using the stance-neutral score.

**R14. Counter-queries are asserted, never audited.**
`:463-467` mandates one counter-query per query, but nothing in `results.tsv`/`trace.md` records counts, so a subagent skipping them is invisible.
**Fix:** Add `queries_primary` / `queries_counter` columns; reflector flags `COUNTER_QUERY_DEFICIT` if counter < primary for two consecutive waves. Also change the "≥3 contradicting sources per wave" engagement trigger (`:581`) to a **cumulative** counter — 2-per-wave counter-evidence currently never triggers it.

**R15. The causal-chain analyzer can rationalize alternatives away unchecked.**
`:636-666`, illustrated at `:1138-1140` — reclassifying an alternative explanation as an "intermediary variable" preserves the thesis without being falsifiable.
**Fix:** Any such reclassification must state the falsification test distinguishing "intermediary" from "independent cause" and confirm it was run; otherwise keep the alternative live and drop confidence one tier.

**R16. Question-web nodes are never reopened after contradicting evidence.**
Statuses are `pending/in_progress/done/dropped` (`:1224`); Wave-4 evidence contradicting a Wave-1 `done` answer spawns new nodes but never corrects the old one.
**Fix:** Add a `needs_review` status; contradicted nodes must be re-answered before Stage 4 CONNECT begins.

**R17. Evidence-integrity gaps.**
(a) Wayback tier handling contradicts between `selfinvestigate.md:127` (-1 tier at verification) and `sources/investigative/wayback.md:81,141` (inherit original tier, no penalty) — resolve with an explicit `wayback_penalty_applied: true` flag at verify time, never mutating the stored tier. (b) No staleness rule: a 2016 snapshot can source a present-tense claim — require past-tense rephrasing with the snapshot date inline for snapshots older than 18 months (`:901-911`). (c) The redaction audit (Stage 4.5, `:762-804`) runs *after* the user locks the thesis verdict — if a DROP removes load-bearing evidence, re-run the thesis assessor and re-present the verdict before Stage 5.

**R18. Operational gaps.**
(a) Actor/timeline extractors have no ordering guarantee (`:472-546`) — run actor extraction to completion first, then timeline. (b) Actor dedup is passive ("the causal-chain analyzer will notice", `:1441-1443`) — add a dedicated dedup pass over `actors.json` before the actor map is built, since split identities undercount centrality. (c) OpenSecrets' 200-calls/day cap (`opensecrets.md:145`) can be exhausted mid-run with no accounting — track per-backend call counts and defer/substitute when a wave would exceed 80% of remaining quota. (d) Stage 1/2 user-edit loops have no time accounting (`:249-261`) — warn and recompute stage splits when edit loops exceed 150% of their allotment.

### 1.4 `/selfwrite` — iteration-loop specific

**R19. Keep/revert rules have holes.**
(a) `:1178`: "damaged 2+ other dimensions → REVERT" lets one dimension be sacrificed every iteration forever, and "damaged" has no magnitude floor. Fix: REVERT if any dimension drops ≥1, or 2+ drop at all; log `max_single_dim_drop` in `results.tsv`. (b) `:1176-1177`: "score equal but simpler/cleaner → KEEP" directly contradicts "score equal or worse → REVERT" — either remove the exception or make it measurable (≥5% shorter, zero claims removed, verified by diff).

**R20. Self-score gates research depth — a self-reinforcing loop.**
`:1103-1113`: composite > 8.5 throttles research to flat search — an inflated score suppresses exactly the scrutiny that would catch the inflation.
**Fix:** Gate throttling on the independent Score Agent's composite, and always run one "contradiction sweep" search per gap even above 8.5.

**R21. Conditional research findings silently expire.**
`:1095, :1467`: `surface-if-draft-contains-X` findings "can be re-evaluated next iteration" — soft language, no persistent checklist; load-bearing evidence can vanish without the user ever seeing it.
**Fix:** Keep `research/pending_conditional.md`; re-check every unresolved entry at the start of every DRAFT; list never-triggered entries in `summary.md`.

**R22. Voice-Auditor skip logic is circular.**
`:1478-1479, :1249`: skipping after 2 clean iterations, re-enabled only "if any dimension score drops" — but the self-graded score won't drop without the auditor's annotations.
**Fix:** Cap the skip at 1 iteration; force an unconditional run every 3rd iteration.

**R23. Mode/artifact misclassification can silently disable research.**
`:45-49` keyword detection ("script", "API" → code) combined with `:66` (code artifacts skip all RESEARCH) can override an explicit "deep rewrite" choice.
**Fix:** When the detector and the user's step-7 choice disagree, ask a one-line confirmation instead of silently skipping.

**R24. Rubric dimensions lack concrete anchors.**
`:890-894` demands observable 1-2/5-6/9-10 markers, but the domain templates (`:900-919`) give one-line definitions only, so dimensions like Actionability are graded on vibes.
**Fix:** Add worked anchor examples per template dimension in the spec itself (e.g., Actionability 9-10: "names the specific decision-maker and the specific action available to them").

### 1.5 Ground truth from real runs (why enforcement matters)

The run artifacts show the loop pathologies happening in practice:

- **The 6h `nyt-upgrade` run abandoned its audit trail at ~2h** (cycle 12 of 36; `state.json` vs `log.md`/`results.tsv`), violating `selfwrite.md:18`, and the shipped `writing-nyt.md` (794 lines) diverged from every tracking file (last logged: 426 lines, v10 @ 8.15) — whole sections were added outside the logged loop, unscored.
- **`skill-upgrade` mutated the same shared artifact one day later with a completely different rubric**, starting from 531 lines that no prior log accounts for. Its `results.tsv` is missing iterations 10, 11, 13 while `summary.md` claims "Kept: 14 / Reverted: 0", and its `log.md` is a 10-line stub despite the REFLECT step requiring per-iteration narrative.
- **`runs/2026-04-01_011613`** used research findings verbatim in `v5-final.md` while logging `none` in the `research_findings`/`research_approved` columns — no auditable vetting record.
- **Schema drift:** old runs use a deprecated `synonym_*` results.tsv schema; nothing stamps a `schema_version`.

**Fixes:**
- **Add `lib/run-integrity.mjs`** with `checkRunConsistency(runDir)`: `state.json.current_cycle` == `results.tsv` row count; artifact line count == last logged `total_lines`; one `results.tsv` row per *attempted* iteration (reverts logged, never omitted); `log.md` narrative entry required before a `results.tsv` row may be appended. Mirror the rigor already present in the selfpost queue validators. Run it at every REFLECT step and at run end.
- Stamp `schema_version` in `results.tsv`/`state.json`; document the `samples/`+`state.json`+`learnings.md` layout as an explicit alternate mode or bring such runs into conformance.
- Forbid editing the target artifact outside the logged loop (pre-flight hash/line-count check); version shared artifacts per run (`writing-nyt.v{run_id}.md`) or require rubric inheritance when continuing a shared file.
- Add a self-consistency lint before consolidation "keep"s (the shipped skill file says "10-Pass Revision Protocol" over a 12-item list and calls it "the 12-pass protocol" three lines later — no rubric caught it).

### 1.6 Source-card fixes

- **Retractions:** no card mentions retracted papers. Add a retraction check to each academic card and a verifier rule: FAIL or force SPECULATIVE if the DOI resolves to a retraction notice.
- **Preprint tiers:** academic backends never set `credibility_tier`, so an unreviewed arXiv preprint passes as HIGH indistinguishably from peer-reviewed work. Assign tiers (peer-reviewed venue = 1, preprint = 2/3) and fold into the confidence rubric, alongside a citation-count floor for corroboration.
- **PII:** `openalex.md:11` requires `mailto=<email>` but has no redaction rule, so the user's real email lands in `trace.md`. Add the same Security/redaction block the investigative cards already have.

---

## Part 2 — Natural, grade-12 English output

### 2.1 The gap

- **The grade-12 target exists in exactly one sentence** (`selfwrite.md:903`), inside an *optional, per-task-customizable* rubric row. A real run's rubric (`runs/2026-04-01_011613/rubric.md`) contains no audience/readability dimension at all — the target never entered scoring. `selfresearch.md` and `selfinvestigate.md` contain **zero** readability language; the investigate section-writer's hard rules (`:901-911`) cover citations and verbs, never sentence length or jargon.
- **No numeric instrument exists.** All checks are subjective LLM reads. The file already has the right pattern — numeric rhythm targets (`selfwrite.md:485-493`) checked by `tools/tokenize_text.py` — except that script doesn't exist in the repo (a phantom reference) and rhythm ≠ readability.
- **The AI-tell catalog (`selfwrite.md:1352-1367`) misses the most common LLM tell**: the negation-antithesis "It's not X, it's Y" construction. In run `2026-04-01_011613`, the coordinator *deliberately used it to raise its own score* (`log.md:90`: "rewriting the kicker with the 'This isn't about X. It's about Y' pattern will push Voice and Structure to 8") and it shipped in `v5-final.md` after surviving five iterations, Clean Slate Review, and the Voice Auditor.
- **Jargon goes unexplained.** `v5-final.md` uses "super PAC," "dark money nonprofit," and "$5,800 legal maximum per cycle" with no first-use gloss, despite a general-audience register. No rule anywhere requires defining terms or expanding acronyms on first use.
- **The final gate is silent on comprehension.** The Skeptical-Editor smoke test (all three skills) checks buried ledes, hedges, and AI-tells — no criterion asks whether a 12th-grader would understand the piece.
- **Report skills get a *narrowed* voice check.** `selfresearch.md:883-885` and `selfinvestigate.md:947-949` explicitly reduce the Voice Auditor to kill-list/em-dash/hedge checks — the fuller catalog and any readability check never run on `report.md`, the artifact the user actually reads.
- **Internal contradictions:** the Institutional lexicon (`selfwrite.md:282`) sanctions "complex sentences with embedded clauses" — the opposite of `:903`'s one-subordinate-clause rule — in exactly the register most likely to have lay readers. The "kill-list" is referenced 5+ times but never defined in any skill file; the only actual list lives in a run artifact (`runs/skill-upgrade/versions/v16.md:563-580`) a fresh install won't have.

### 2.2 The fixes (concrete, in priority order)

**N1. Add a numeric Readability Gate to the Adversarial Scoring Protocol** (`selfwrite.md`, after `:1596`), computed by a real script (`tools/readability_check.py` — words, syllables, sentences; no LLM judgment):

> **9. Readability Gate (mandatory for all registers except `expert` audience).** Before final SCORE compute on the plain-text artifact: Flesch-Kincaid Grade Level ≤ 12.0 (≤ 10.0 for general-public/undergraduate audience); average sentence length ≤ 20 words (≤ 17 for general public); no sentence > 35 words. Any violation caps Audience Calibration at 6 regardless of other qualities.

Wire the cap into the existing Register Compliance mechanism (`:1588-1589`), which already implements "violation caps a dimension."

**N2. Make Audience Calibration (with the grade-12 clause) a mandatory rubric dimension**, not an optional template row (`:890, :898-906`). A rubric without it must be invalid.

**N3. Put the same gate in the report-producing skills.** Add the readability script check plus a style block to `selfresearch.md`'s section-writer/SUMMARIZE phases and `selfinvestigate.md`'s Stage-5 hard rules (`:901-911`): grade-12 ceiling, one subordinate clause per sentence, jargon defined on first use. Explicitly exempt the readability check from the "narrowed Voice Auditor scope" (`selfresearch.md:883-885`, `selfinvestigate.md:947-949`) — it's a cheap script, not an LLM pass.

**N4. Add the missing AI-tell rows** to the catalog (`selfwrite.md:1352-1367`):

> | Negation-antithesis | "It's not X, it's Y" / "This isn't about X. It's about Y" used as a rhetorical pivot. Flag on ANY occurrence in a kicker or nut graph; 2+ elsewhere. | "This isn't coincidence. It's a pattern." → state the claim directly: "The pattern recurs across five separate cycles." |

Plus a tricolon-burst rule: flag any single paragraph with 3+ short parallel clauses in succession (the current "3+ times in 5 paragraphs" threshold at `:1359` misses same-paragraph bursts like "This isn't coincidence. It's a pattern. And the pattern has consequences.").

**N5. Jargon and acronym rules.** Reader Agent (`:1299-1300`): flag every specialist term with no definition, analogy, or gloss within a sentence of first use (unless audience = experts). Clean Slate Review (`:1614-1622`): every acronym spelled out on first use. These are the rules that make subject matter *understandable* to a grade-12 reader, not just parseable.

**N6. Grade-12 comprehension check in the Skeptical-Editor gate** (all three skills):

> **Grade-12 comprehension.** Read as a 12th-grade student with no specialist background. Flag any sentence you had to re-read, any unexplained term, any paragraph assuming unsupplied domain knowledge. Output a grade-level estimate with the 2-3 sentences driving it.

**N7. Resolve the contradictions.** (a) Lexicon rhythm profiles set style targets but never override the grade-12 ceiling; when they conflict (e.g., Institutional's "embedded clauses acceptable", `:282`), grade-12 wins unless audience = expert. (b) Inline a canonical default Kill List in `selfwrite.md` (the v16.md table is a good seed) so `banned_words` (`:492`) is defined on a fresh install. (c) Either ship `tools/tokenize_text.py`/`readability_check.py` or remove the phantom references. (d) Cap "a dense 25-word sentence beats three choppy ones" advice with the gate: if it pushes the paragraph above grade 12, split it.

**N8. Inherit distilled writing-skill guidance.** `runs/skill-upgrade/versions/v16.md` (Audience Profiles, Jargon Management, syntactic-complexity caps) is better readability guidance than anything in the process files — Rubric Generation should inherit a prior distilled writing skill's audience/jargon rules when present, with the N1 gate as the floor either way.

---

## Prioritized implementation checklist

| # | Change | File(s) | Serves |
|---|--------|---------|--------|
| 1 | Verbatim quote substring check in verifier (SRC step 0) | selfresearch.md | Goal 1 |
| 2 | Independent fresh-context Score Agent; drop baseline forcing | selfwrite.md | Goal 1 |
| 3 | Readability Gate script + FK ≤ 12 cap; mandatory Audience Calibration dimension | selfwrite.md, new tools/readability_check.py | Goal 2 |
| 4 | Grade-12 + jargon rules in report writers; exempt from narrowed auditor scope | selfresearch.md, selfinvestigate.md | Goal 2 |
| 5 | Stance-neutral stored relevance scores; counter-query accounting (cumulative) | selfinvestigate.md | Goal 1 |
| 6 | `lib/run-integrity.mjs` + one-row-per-attempt ledger + no out-of-loop artifact edits | lib/, selfwrite.md | Goal 1 |
| 7 | Negation-antithesis + tricolon AI-tell rows; inline default Kill List | selfwrite.md | Goal 2 |
| 8 | Mandatory convergence triggers + `[SIGNAL OVERRIDE]` logging; unified budget-overrun rule | all three skills | Goal 1 |
| 9 | Reconcile STOP semantics; query-log feedback to reflector; `done_empty` cascade | selfresearch.md | Goal 1 |
| 10 | Grade-12 comprehension criterion in Skeptical-Editor gate | all three skills | Goal 2 |
| 11 | Revert-rule tightening (any-dimension ≥1 drop; remove "simpler/cleaner" tie exception) | selfwrite.md | Goal 1 |
| 12 | Retraction check, preprint tiers, citation floor, mailto redaction | sources/*.md, selfresearch.md | Goal 1 |
| 13 | Source-independence check before HIGH confidence | selfresearch.md | Goal 1 |
| 14 | needs_review node status; alternative-explanation falsification test; Wayback staleness rule; post-redaction verdict re-check | selfinvestigate.md | Goal 1 |
| 15 | Fix/remove unimplementable mechanisms (header-based parallelism, unscripted MinHash, verifier injection field) | selfresearch.md | Goal 1 |
