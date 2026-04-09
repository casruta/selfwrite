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
