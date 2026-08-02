---
name: selfwrite
description: >
  Time-boxed, evidence-aware iteration for prose and documentation, using
  explicit audience/voice controls, blind independent judging, immutable
  artifacts, and revalidation after every substantive edit.
command: selfwrite
argument-hint: '"writing task" <duration>'
---

# Selfwrite v0.3

Create and improve **prose or documentation only**: articles, reports, memos, essays, guides, reference documentation, policies, and README-style material. Decline or redirect requests whose primary deliverable is code, data analysis, images, slide decks, spreadsheets, or application behavior. Code snippets may appear inside documentation only when they explain the prose deliverable.

The objective is clear, accurate, useful writing for a named audience.

<!-- SHARED:budget-stop -->
**Budget stop.** Measure elapsed time against the user's total duration. At 110% or more, finish only work already in flight, persist it, and advance through the remaining mandatory release checks without starting optional work.
<!-- /SHARED:budget-stop -->

<!-- SHARED:convergence -->
**Convergence.** Three consecutive iterations with no accepted improvement, or three retrieval waves with no material new evidence, require a logged pivot or advancement to the next stage. Do not invent work to consume time. A justified override must identify concrete new information or a materially different hypothesis.
<!-- /SHARED:convergence -->

<!-- SHARED:grade12-check -->
**Comprehension check.** For audiences other than an explicitly mapped `expert` audience, review the artifact as a 12th-grade reader without specialist background. Flag sentences that require rereading, unexplained terms, and assumptions of knowledge absent from the audience map. Revise only when doing so preserves necessary precision.
<!-- /SHARED:grade12-check -->

## Intake

Parse a quoted task and duration (`Nm` or `Nh`). Ask when missing. Before drafting, establish:

- deliverable and success condition;
- audience and publication/use context;
- required facts/sources, supplied materials, and research permission;
- length, deadline, tone constraints, and prohibited content;
- whether this is a new document, rewrite, or edit that must preserve specific material.

Do not silently infer consequential requirements. Use the simplest workflow that can satisfy the request.

## Audience map

Persist an explicit map in `run.json`:

```json
{"label":"professional","knowledge":["known concepts"],"needs":["questions answered"],"decisions":["what the document enables"],"constraints":["time, sensitivity, accessibility"],"jargon_policy":"define uncommon terms on first use","evidence_expectation":"links and concise method notes"}
```

Defaults:

- `expert`: assume domain foundations; preserve technical precision and methods detail.
- `professional`: explain uncommon domain terms; lead with implications and decisions.
- `general`: use plain language, concrete examples, and explain why the subject matters.
- `undergraduate`: teach concepts, definitions, and reasoning without hiding complexity.

Every planning role, writer, reviewer, and judge receives the same audience map. Score audience fit against this map, not a generic readability ideal.

## Feature-based voice controls

Define voice as observable features:

```json
{
  "formality": "formal|neutral|conversational",
  "person": "first|second|third|mixed",
  "sentence_profile": "mostly concise with occasional longer analytical sentences",
  "paragraph_profile": "claim-led, one purpose per paragraph",
  "directness": "direct|qualified|exploratory",
  "technical_density": "low|medium|high",
  "figurative_language": "none|limited|moderate",
  "citation_style": "footnotes|author-date|links|none",
  "preferred_terms": [],
  "avoided_terms": [],
  "examples": []
}
```

Infer only low-risk defaults from genre/audience and show them in the plan. User-supplied examples are references for these features, not instructions to reproduce distinctive phrasing. Preserve precise terms even if stylistically uncommon.

## Run contract

Create `runs/<run-id>/`:

```
run.json
results.tsv
brief.md
rubric.md
plan_cards/structure.json
plan_cards/evidence.json
plan_cards/adversary.json
locked_plan.md
versions/v000.md ...
judgments/round-<n>/record.json
judgments/final.json                   # exact copy of selected round record
log.md
final.md
final-audit.md
```

When research is needed, also create `sources.json`, `documents/<S-ID>.txt`, `evidence.jsonl`, `claims.jsonl`, `report.tagged.md`, `claim-coverage.json`, `coverage.json`, `render-manifest.json`, `verification.jsonl`, and `remediation.md` as specified below.

`run.json` must contain:

```json
{
  "schema_version": 3,
  "run_type": "selfwrite",
  "prompt_commit": "<7–40 character git SHA>",
  "artifact": "versions/v000.md",
  "artifact_sha256": "<64 lowercase hex>",
  "verified_artifact_sha256": "<64 lowercase hex>",
  "scored_artifact_sha256": "<64 lowercase hex>",
  "audience": "default",
  "audience_profile": {"label":"professional","knowledge":[],"needs":[],"decisions":[],"constraints":[]},
  "status": "running",
  "release_gates": {"research_required": false},
  "task": "...",
  "deliverable_type": "prose",
  "voice_features": {}
}
```

`audience` is exactly `general`, `default`, or `expert`: map general/undergraduate profiles to `general`, professional to `default`, and expert to `expert`, retaining the rich map in `audience_profile`. Set `release_gates.research_required` to true whenever the research subworkflow is used; otherwise leave it false. `status` is exactly `running`, `failed`, or `releasable`. `artifact` must always be a non-empty relative path inside the run. After the first ledger row, `artifact_sha256` is mandatory. At release, all three hash fields are mandatory, identical, and equal to the exact artifact bytes. Put named gate outcomes in `release_gates`.

Initialize `results.tsv` with `# schema_version: 3` on line 1. Its tab-separated header must begin with `iteration`; iteration values are unique non-negative integers contiguous from 0 and every row has exactly the header width. Stamp every persisted candidate with SHA-256. Never judge or verify mutable, unnamed text.

## Planning: three roles

Use exactly three planning roles—not a large role swarm:

1. **Structure planner**: proposes thesis/purpose, order, section functions, transitions, word budget, and audience fit.
2. **Evidence planner**: inventories supplied support, factual gaps, research needs, counterevidence, and claims that should be omitted unless verified.
3. **Adversary planner**: attacks instruction fidelity, assumptions, omissions, likely reader objections, and factual-preservation risks.

Each writes one persisted plan card. A coordinator reconciles them into `locked_plan.md`, resolving contradictions and stating acceptance criteria. For a simple short edit, the cards may be brief but still cover all three responsibilities. Do not multiply instances merely to create consensus.

## Research subworkflow

If the deliverable contains externally checkable claims not fully supported by user-provided originals, use this sequence exactly:

**PLAN → RETRIEVE → PROVENANCE CHECK → EVIDENCE EXTRACT → DRAFT TAGGED REPORT → VERIFY → REMEDIATE → REVERIFY → RENDER → FINAL AUDIT**

Writing iteration may resume only after research findings pass REVERIFY. If no research is needed, record why in `run.json` and proceed with supplied material.

### Research contracts

`sources.json` is a JSON array (or object with a `sources` array). Every source has exactly the validator-required provenance fields: `source_id`, `title`, `canonical_url`, `persistent_id`, `source_type`, `published_at`, `updated_at`, `retrieved_at`, `credibility_tier`, `peer_review_status`, `retraction_status`, `integrity_check`, and `snapshot_sha256`. `credibility_tier` is an integer 1–5; `peer_review_status` is exactly `peer_reviewed`, `preprint`, `primary_source`, or `not_applicable`; dates use `YYYY-MM-DD` or a UTC ISO timestamp. If no separate update is recorded, repeat the publication date. `integrity_check` contains valid `checked_at`, `method`, a passing `result`, and `landing_url` with a dated successful status, final URL, and `resolved:true`. Use stable S IDs and store the exact UTF-8 snapshot at `documents/<source_id>.txt`; its SHA-256 must equal `snapshot_sha256`.

Each `evidence.jsonl` record has exactly the validator-required fields `evidence_id`, `source_id`, `provenance_type`, `exact_text`, `context_before`, `context_after`, `locator`, and `document_sha256`. `provenance_type` is `publisher_abstract`, `full_text`, `primary_document`, `filing`, or `transcript`; `generated_summary`, `search_snippet`, and `paraphrase` are forbidden. Evidence is original-text-only: `exact_text` must be an exact substring of `documents/<source_id>.txt`, must not be title-only, and `document_sha256` must match that snapshot.

Every `claims.jsonl` record has the nine base fields `claim_id`, `text`, `location`, `claim_type`, `verdict`, `confidence`, `load_bearing`, `final_finding`, and `classified_factual`; the last three are booleans. `verdict` is `PASS`, `WEAK`, or `FAIL`; release permits no FAIL, no unclassified factual claim, and no load-bearing claim below PASS. A WEAK claim adds `disposition` equal to `removed`, `limitations`, or `caveated`. SRC adds non-empty verified `evidence_ids`. SYN instead adds at least two `components`, each `{source_id,evidence_id,contribution}`, whose evidence belongs to its named source. INF instead adds non-empty `premise_claim_ids` resolving without cycles to verified PASS claims. Load-bearing claims cannot rely on `publisher_abstract`; HIGH confidence needs `peer_reviewed` or `primary_source` support. `UNV` is recognized by the validator but may not be a final finding and is omitted from rendered findings.

Use only:

- `{{SRC:C001|E001}}` for direct support;
- `{{SYN:C002|S001/E002,S002/E003}}` for synthesis naming each `source_id/evidence_id` pair and mirrored `components` entries;
- `{{INF:C003|P=C001,C002|R=<explicit inference rule>}}` for an inference from named verified premise claims.

No `UNV` finding is allowed. An unsupported idea may appear only as a clearly framed question, proposal, fictional example, or limitation—not as fact.

Retrieval must include two independently phrased searches and a disconfirming counter-query for each conclusion-bearing question, plus backward/forward citation chasing for each major finding. Persist `coverage.json` with those per-question checks and arrays for source type, year, geography, language, and method. Follow secondary claims to originals, validate provenance before extraction, and do not draft during retrieval. Before claim verification, dispatch a coverage reviewer without drafting history to identify every apparently factual sentence without a tag; declare and verify it, rewrite it as non-factual framing, or remove it. Persist the reviewer attestation in `claim-coverage.json` with completion, exact model, zero `untagged_claims`, and the tagged-report hash. Verification checks exact text, hashes, provenance, entailment, scope, SYN independence, INF premises/rule, and counterevidence. Remediate by narrowing, qualifying, replacing, or deleting, then reverify all changed and dependent claims. Render only claims whose latest verification record is PASS, then bind tagged and rendered hashes, all claim IDs, and a recorded zero-change equivalence attestation in `render-manifest.json`. The deterministic validator checks these records and bindings; it cannot prove reviewer independence.

## Drafting and iteration

1. Draft `versions/v000.md` from the locked plan and permitted evidence.
2. Hash it and create a blind judgment round.
3. Select a revision hypothesis tied to the lowest-confidence acceptance criterion.
4. Edit only what the hypothesis requires; preserve user-mandated content.
5. Save a new immutable version, then validate and judge it.
6. Keep it only if the decision rule prefers it and no hard gate regresses.
7. Continue within the budget while a meaningful hypothesis remains.

Do not edit an existing version in place. `log.md` records hypothesis, source version/hash, new version/hash, checks, judgment IDs, decision, and reason.

### Clean-slate rule

A review returns zero through eight material issues. Zero is valid: treat it as a clean slate, persist the empty findings array, and proceed to judging. Do not invent faults, force a revision, lower the bar, or dispatch additional reviewers solely because the result was clean. A new iteration requires a concrete improvement hypothesis supported by the rubric, user feedback, or judge rationale.

## Blind independent judging

Every candidate comparison uses two blind judges and, only when required, a third tie-breaker.

### Submission

Before dispatch, build one aggregate record using the exact schema documented in `benchmarks/README.md` and validated by `lib/judgments.mjs`. Store the locked rubric text/hash, passing candidate-bound factual-preservation and instruction-fidelity gates, and one independently randomized A/B submission per judge containing the exact blind input and hash. Judges receive only the task/brief, audience map, locked rubric, and anonymized candidates. They must not see filenames, iteration order, revealed mappings, other judgments, logs, authorship/model identity, or coordinator preference. Run them independently with no communication. Persist each exact model/version, raw output/hash, A/B preference, and submission hash in the same `record.json`.

The rubric uses observable criteria: accuracy/evidence, task completion, structure, clarity, audience fit, voice-feature compliance, and mechanical correctness. Judges cite specific passages and score independently.

### Decision and tie-break

If the first two revealed preferences agree, their majority decides. If they differ (candidate/incumbent, candidate/TIE, or incumbent/TIE), invoke blind judge C with the same contract and no prior judgments. C supplies the third vote; if no preference has a majority, apply the semantic-tie rule. A semantic tie keeps the incumbent unless the candidate demonstrably improves a deterministic constraint with both hard gates passing; persist that exception. Persist the complete decision and artifact hashes in `record.json`. Copy the selected final round's record byte-for-byte to `judgments/final.json` so `run-audit` can enforce it.

If the two candidates are byte-identical, do not create a comparison or a new iteration. Do not choose based on iteration recency.

## Validation gates

Before every judgment and delivery:

- confirm the candidate hash matches the submitted artifact;
- confirm required sections, length bounds, links, anchors, headings, and code examples where applicable;
- verify quotes and externally checkable claims through the research contracts;
- check internal consistency of names, dates, numbers, terminology, and cross-references;
- check audience and voice features directly;
- render/preview when formatting materially affects comprehension.

For documentation, also test instructions or examples when safely feasible, and distinguish tested behavior from illustrative pseudocode.

## Late-edit rule

Any edit after validation, verification, judging, selection, rendering, or audit—however small—creates a new version and invalidates downstream results for the edited bytes. Re-run all applicable deterministic checks, claim verification/reverification, blind scoring (two judges plus tie-break rule), rendering, and final audit. Formatting-only edits are not exempt when they change the delivered file hash.

Never copyedit `final.md` after its last score. Instead produce a new candidate and process it normally.

## Final audit

On the exact `final.md` bytes:

1. point `artifact` at the selected relative path and persist its exact UTF-8 hash as `artifact_sha256`;
2. run `node scripts/run-integrity.mjs <run_dir>` and, for a research bundle, `node scripts/evidence-check.mjs <run_dir>`; store outcomes in `release_gates`;
3. confirm the selected judgment decision names that exact hash;
4. confirm all applicable validation gates pass;
5. for researched writing, confirm every factual finding has a latest PASS, all citations resolve, and no `UNV`, PENDING, or FAIL finding remains;
6. confirm audience mapping and feature-based voice controls are satisfied;
7. confirm no post-score or post-verification edits occurred;
8. after verification and blind scoring of the unchanged artifact, set `verified_artifact_sha256` and `scored_artifact_sha256` to that same hash; set `status` to `releasable` only when every gate passes and all three hashes match.

If any check fails, remediate through a new version and repeat the required verification and scoring. Deliver only the audited artifact plus a concise note of sources/limitations when relevant.
