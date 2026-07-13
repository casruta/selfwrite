# Example Runs

These are real selfwrite runs preserved as examples of the tool in action. They come from different versions of selfwrite and use different directory layouts, so treat the most recent one as the source of truth for "what the output actually looks like today."

## Current format

**`2026-04-01_011613/`** — Dark-money op-ed, deep rewrite, 30m, Op-Ed/Newsletter lexicon. This run uses the current directory layout produced by the tool today:

```
rubric.md              # scoring dimensions, locked after generation
log.md                 # narrative iteration log
results.tsv            # structured scores per iteration
versions/              # v0.md, v1.md, … (every draft kept)
research/findings.md   # research tree log (deep rewrite only)
skill.md               # distilled skill file
summary.md             # final metrics and learnings
```

If you want to know what a fresh run will output, read this one.

**`claude-md-rewrite_2026-07-11_234935/`** and **`readme-rewrite_2026-07-12_205214/`** — Two schema-v2 dogfood runs in which the loop rewrote this repo's own `CLAUDE.md` and `README.md`. Both use the current ledger discipline: `# schema_version: 2` atop `results.tsv`, a `state.json` hash reconciled after every iteration, drafts at `versions/v{N}-draft.md` with kept finals at `versions/v{N}.md` (a reverted iteration keeps only its draft — see claude-md-rewrite's iteration 4), and the run-root `draft.md` as the tracked artifact. Because REVISE often changed nothing after REVIEW, many draft/final pairs are byte-identical; that is the honest record, not an error.

## Historical (older layouts)

**`nyt-upgrade/`** — Early run from before the skill distillation refactor. Uses `samples/` and `writing-nyt.md`/`writing-nyt-backup.md` instead of `versions/`, and has a `learnings.md` instead of `skill.md`. Kept because the research directory shows what the tool looked like in its earlier analytical form.

**`skill-upgrade/`** — A middle-era run: has `versions/` and `summary.md` in the current shape, but is missing `skill.md` (distillation was added later). Useful as an example of the iteration loop when the loop went deeper than usual (v0 through v16).

## Installing a distilled skill

Any run's `skill.md` is a standalone, reusable skill file. To install the learnings from a past run into Claude Code:

```bash
mkdir -p ~/.claude/skills
cp runs/2026-04-01_011613/skill.md ~/.claude/skills/op-ed-dark-money.md
```

Name the destination file something descriptive — Claude Code uses the filename as the skill name.

## Integrity note

These directories double as **regression fixtures** for `tests/run-integrity.test.mjs` — the checker
must keep flagging the known historical discrepancies (nyt-upgrade's ledger/artifact drift,
skill-upgrade's missing iteration rows). Never "fix" or rewrite an old run.

## Smoke-test checklist (manual, after skill-file changes)

The skills need interactive Claude Code, so this can't run in CI. After editing the skill files:

1. **`/selfresearch`, narrow question, 15m budget.** Verify: `node scripts/verify-quotes.mjs runs/<new>`
   exits 0; the budget stop fired at a wave *start* (not mid-wave) if the run overran; `report.md` was
   run through `readability-check` (violations logged or gate passed); any dry node shows `done_empty`
   in the summary coverage rather than silently blocking dependents.
2. **`/selfwrite`, short prose task, 30m, 3+ iterations.** Verify: the Score Agent runs as a fresh
   subagent each SCORE; v0 is scored without baseline anchoring; `node scripts/run-integrity.mjs
   runs/<new>` exits 0 at run end; results.tsv carries `# schema_version: 2`; hand-editing the
   artifact mid-run makes the next `--preflight` hard-stop.
3. **Negative probe.** Paste an "It's not X. It's Y." kicker into a draft — the Voice Auditor must
   flag it (catalog row + `readability-check` candidate output).
