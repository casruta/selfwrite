# Writing judgment benchmark

`tasks.json` is a fixed, version-controlled suite of 24 writing tasks: three each for memos, explainers, op-eds, READMEs, executive summaries, literature reviews, investigations, and benchmarks. A benchmark run should pin the task file hash and provide the task-specific source packet separately; the descriptors do not invent source material.

## Blind comparison record

Create a candidate/incumbent comparison with `createRandomizedSubmissions` from `lib/judgments.mjs`. The revealed audit record has this shape:

```json
{
  "schema_version": 1,
  "task_id": "memo-01",
  "candidate_sha256": "<64 lowercase hex characters>",
  "incumbent_sha256": "<64 lowercase hex characters>",
  "artifact_bodies": {"candidate": "<exact candidate text>", "incumbent": "<exact incumbent text>"},
  "rubric": {"text": "<exact locked rubric>", "sha256": "<rubric hash>"},
  "pre_judgment_gates": {
    "factual_preservation": {"passed": true, "artifact_sha256": "<candidate hash>"},
    "instruction_fidelity": {"passed": true, "artifact_sha256": "<candidate hash>"}
  },
  "submissions": [
    {
      "judge_id": "judge-1",
      "labels": {"A": "<artifact hash>", "B": "<artifact hash>"},
      "blind_artifacts": {"A": {"text": "<exact A text>", "sha256": "<A hash>"}, "B": {"text": "<exact B text>", "sha256": "<B hash>"}},
      "rubric_sha256": "<locked rubric hash>",
      "blind_input": "<exact text sent to this judge, including rubric and anonymized artifacts>",
      "blind_input_sha256": "<blind input hash>",
      "randomization": {"algorithm": "sha256-seeded-v1", "seed": "<revealed audit seed>"},
      "submission_sha256": "<canonical record hash>"
    }
  ],
  "judgments": [
    {
      "judge_id": "judge-1",
      "model": "<model family>",
      "version": "<exact model/version identifier>",
      "submission_sha256": "<matching submission hash>",
      "raw_output": "{\"preference\":\"A\",\"rationale\":\"...\"}",
      "raw_output_sha256": "<raw response hash>",
      "preference": "A"
    }
  ],
  "decision": {
    "outcome": "candidate",
    "selected_sha256": "<candidate hash or incumbent hash; candidate hash for an audited tie exception>",
    "final_sha256": "<delivered artifact hash>",
    "scored_sha256": "<scored artifact hash>",
    "deterministic_constraint_improved": false
  }
}
```

Dispatch only the blinded package; keep the seed and revealed mapping from judges. Preserve the locked rubric, exact blind input, exact model/version, and raw response with matching hashes. The factual-preservation and instruction-fidelity gates must both pass on the candidate's exact bytes before dispatch. Two judges are mandatory. Compare their revealed preferences, not their A/B letters: a third judge is mandatory only when those preferences differ. Its vote may create a semantic tie; when no preference has a majority, apply the tie rule below. The final and scored hashes must equal the selected artifact hash.

A semantic tie keeps the incumbent with `deterministic_constraint_improved: false`. The one supported exception is a candidate that demonstrably improves a deterministic task constraint while preserving facts and instructions. Persist `deterministic_constraint_improved: true`; then `selected_sha256`, `final_sha256`, and `scored_sha256` must all equal the candidate hash. The field must be `false` for non-tie decisions.

The seeded algorithm makes assignment reproducible for audit; use a fresh, unpredictable seed for every real round. A fixed seed is appropriate only in tests.

## Release thresholds

`summarizeBenchmark` counts ties in the denominator. A candidate passes the outcome gate when its win rate is at least 65% and its loss rate is at most 15%. Human and LLM labels must be paired over the same examples; Cohen's kappa must be at least 0.60. The overall `pass` field is false if agreement labels are absent, even if the outcome gate passes.

Validate one record or a benchmark bundle:

```text
node scripts/judgment-check.mjs path/to/record.json
node scripts/judgment-check.mjs path/to/bundle.json --json
```

A bundle is `{ "records": [...], "human_labels": [...], "llm_labels": [...] }`. It must contain all 24 unique task IDs and exactly eight paired human/LLM labels. Exit status is 0 on pass, 1 on a failed validation or release gate, and 2 for unreadable or malformed input.
