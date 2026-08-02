# Example Runs

These are historical selfwrite runs preserved as design evidence. One supplies a readability regression sample; the schema validators use synthetic fixtures under `tests/fixtures/`. None is workflow-current for schema v3, and none may be presented as proof that the v0.3 release gates passed. A workflow-current example must include `run.json`, exact prompt commit, artifact hashes, raw judge records, and—where applicable—source snapshots, `evidence.jsonl`, `claims.jsonl`, and a successful final audit.

| Run | Recorded schema | Prompt commit |
|---|---:|---|
| `2026-04-01_011613` | not recorded | not recorded |
| `claude-md-rewrite_2026-07-11_234935` | 2 | not recorded |
| `readme-rewrite_2026-07-12_205214` | 2 | not recorded |
| `nyt-upgrade` | not recorded | not recorded |
| `skill-upgrade` | not recorded | not recorded |

## Legacy examples

**`2026-04-01_011613/`** — Legacy dark-money op-ed. It is useful as a negative quality fixture: it predates v0.3 evidence provenance, blind judging, and final-hash release checks.

```
rubric.md              # scoring dimensions, locked after generation
log.md                 # narrative iteration log
results.tsv            # structured scores per iteration
versions/              # v0.md, v1.md, … (every draft kept)
research/findings.md   # research tree log (deep rewrite only)
skill.md               # distilled skill file
summary.md             # final metrics and learnings
```

**`claude-md-rewrite_2026-07-11_234935/`** and **`readme-rewrite_2026-07-12_205214/`** — Schema-v2 dogfood runs. They demonstrate v2 ledger mechanics only, not the v0.3 judging or release protocol.

**`nyt-upgrade/`** — Early run from before the skill distillation refactor. Uses `samples/` and `writing-nyt.md`/`writing-nyt-backup.md` instead of `versions/`, and has a `learnings.md` instead of `skill.md`. Kept because the research directory shows what the tool looked like in its earlier analytical form.

**`skill-upgrade/`** — A middle-era run: has `versions/` and `summary.md` in the current shape, but is missing `skill.md` (distillation was added later). Useful as an example of the iteration loop when the loop went deeper than usual (v0 through v16).

## Installing a distilled skill

Any run's `skill.md` is a standalone, reusable skill file. To install the learnings from a past run into Claude Code:

```bash
mkdir -p ~/.claude/skills/op-ed-dark-money
cp runs/2026-04-01_011613/skill.md ~/.claude/skills/op-ed-dark-money/SKILL.md
```

Name the destination directory descriptively; Claude Code discovers the `SKILL.md` within it.

## Integrity note

Do not rewrite these historical runs. Validator tests use synthetic schema-v3 fixtures; a readability test retains one historical dark-money artifact as a regression sample.

## Smoke-test checklist (manual, after skill-file changes)

The skills need interactive Claude Code, so this can't run in CI. After editing the skill files:

1. **`/selfresearch`, narrow question, 15m budget.** Verify original-text snapshots, evidence and claim ledgers, counter-queries, and `node scripts/evidence-check.mjs runs/<new> --json` before the final audit.
2. **`/selfwrite`, short prose task, 30m.** Verify randomized blind A/B records for two judges and the tie-breaker when needed. Every late edit must be a numbered candidate.
3. **`/selfinvestigate`, contradictory evidence.** Verify stance did not change relevance/confidence and the legal-risk gate ran for defamation-adjacent claims.
4. **Final release.** `node scripts/run-audit.mjs runs/<new> --json` must report all four pass fields true and identical artifact, verified, and scored hashes.
5. **Negative probes.** A generated-summary quote, title-only synthesis, missing evidence file, same-line-count artifact edit, retracted source, untagged factual claim, or post-score edit must block release.
