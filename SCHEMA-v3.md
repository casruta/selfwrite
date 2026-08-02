# Selfwrite run schema v3

Schema v3 is fail-closed. A directory is releasable only when its manifest,
ledger, artifact, mode-specific evidence, and deterministic quality checks all
pass `node scripts/run-audit.mjs <run-dir> --json`.

## `run.json`

Every run requires these fields:

```json
{
  "schema_version": 3,
  "run_type": "selfwrite",
  "prompt_commit": "<7–40 character git SHA>",
  "artifact": "final.md",
  "artifact_sha256": "<64 hex characters>",
  "verified_artifact_sha256": "<64 hex characters>",
  "scored_artifact_sha256": "<64 hex characters>",
  "audience": "general",
  "status": "releasable",
  "release_gates": {"integrity_pass": true, "evidence_pass": true, "quality_pass": true}
}
```

`run_type` is `selfwrite`, `selfresearch`, or `selfinvestigate`. `audience` is
`general`, `default`, or `expert`. A releasable run requires all three artifact
hashes to be identical and to match the delivered file. Rich intake details
belong in optional fields such as `audience_profile`; they do not replace the
canonical fields above.

`verified_artifact_sha256` binds the bytes that passed the applicable factual
or evidence review. `scored_artifact_sha256` binds the same bytes subjected to
the applicable quality review. For research and investigation, this need not
mean a numeric score. Releasable runs also set `integrity_pass`,
`evidence_pass`, and `quality_pass` to `true` inside `release_gates`.

`results.tsv` begins with `# schema_version: 3`. Its first column is
`iteration`, with unique integer values ordered contiguously from zero. Every
row has exactly the same number of fields as the header.

## Research and investigation evidence

Research modes additionally require `sources.json`, `documents/`,
`evidence.jsonl`, `claims.jsonl`, `report.tagged.md`, `claim-coverage.json`,
`coverage.json`, and `render-manifest.json`. The render manifest binds both
file hashes, every rendered claim ID, and a recorded semantic-equivalence
attestation with zero changed claims. The validator binds the attestation; it
cannot prove reviewer independence. Investigation runs also require
`legal-risk.json`.
For `selfwrite`, set `release_gates.research_required` to `true` when the
research subworkflow is used. The presence of any schema-v3 evidence file also
activates the evidence gate, so partial bundles cannot fall through to legacy
quote handling.

A source record requires `source_id`, `title`, `canonical_url`,
`persistent_id`, `source_type`, valid publication/update/retrieval dates, numeric
`credibility_tier` from 1 through 5, `peer_review_status`, safe
`retraction_status`, an integrity-check record, and the SHA-256 of
`documents/<source_id>.txt`.
The integrity record includes a dated landing-URL check with a successful HTTP
status, final URL, and `resolved: true`; syntax alone is not enough.

Evidence records require an allowed original-text provenance type, an exact
substring of the stored document, surrounding context, a locator, and the same
document hash. Generated summaries, search snippets, and paraphrases cannot be
evidence.

Claims use `SRC`, `SYN`, `INF`, or `UNV` internally. `SRC` names verified
evidence IDs. `SYN` supplies at least two `{source_id, evidence_id,
contribution}` components. `INF` names verified premise claim IDs. `UNV` cannot
be a final finding. Every released factual claim is classified and passes;
weak claims require a recorded `removed`, `limitations`, or `caveated`
disposition.

The tagged report uses `{{SRC:C001|E001}}`,
`{{SYN:C002|S001/E002,S002/E003}}`, and
`{{INF:C003|P=C001,C002|R=<reasoning rule>}}`. Every non-UNV claim record must
appear exactly once, its tag type and references must match the ledger, and
orphan tags are rejected. A recorded claim-coverage review attests that it found
no undeclared factual sentences; deterministic validation then enforces the
one-to-one mapping for all declared claims. It does not prove fresh context.

## Audit result

The aggregate JSON contains:

- `integrity_pass`: manifest, ledger, paths, and hashes are valid;
- `evidence_pass`: the complete research evidence chain is valid, when needed;
- `quality_pass`: readability passes and, for a releasable `selfwrite` run, the
  final blind-judgment record also validates;
- `release_pass`: all required gates pass and the non-legacy run is marked
  `releasable`.

Legacy runs are inspectable only with `--legacy` and never receive
`release_pass: true`.
