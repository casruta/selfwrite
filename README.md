<p align="center">
  <img src="banner.png" alt="SELFWRITE" width="100%">
</p>

![Claude Code](https://img.shields.io/badge/Claude_Code-Skill-blue)

Selfwrite adds three time-boxed writing and research workflows to Claude Code. One polishes prose, one produces cited academic research, and one builds investigations from public records. Deterministic Node validators enforce run integrity, evidence provenance, hashes, and readability constraints. Semantic writing quality is evaluated separately through stored blind-review records; the validator checks the record, not whether a model was truly independent. No paid third-party research API is required by default, although Claude Code itself requires supported Anthropic access and some backends need free credentials.

## The three skills

### `/selfwrite` — prose polish

Point `/selfwrite` at prose or documentation — an opinion column, memo, explainer, or README — and give it a task description and time budget. The loop iterates THINK → DRAFT → REVIEW → REVISE → JUDGE → REFLECT. Two blind judges compare each candidate with the incumbent in randomized order; a third resolves disagreement. Judge records and artifact hashes remain on disk. Late polish is treated as a new candidate and cannot inherit an earlier score. Voice profiles describe formality, directness, evidence density, rhythm, vocabulary level, and point of view rather than copying stock phrases from a publication. The objective is clearer, more faithful writing for the intended reader—not evasion of AI-text detectors. Code generation is outside this skill's v0.3 scope.

### `/selfresearch` — cited academic research

Give `/selfresearch` a research question and a time budget; 15 minutes is a useful minimum for a narrow task. The v0.3 sequence is PLAN → RETRIEVE → PROVENANCE CHECK → EVIDENCE EXTRACT → DRAFT TAGGED REPORT → VERIFY → REMEDIATE → REVERIFY → RENDER → FINAL AUDIT. Direct evidence must be a contiguous span of stored original source text with a locator and document hash. Generated summaries and search snippets are discovery aids only. Syntheses identify the evidence contributed by every source, inference tags name verified premise claims, and unverified material is moved to limitations rather than presented as a finding.

### `/selfinvestigate` — thesis-driven investigation

The most demanding skill, `/selfinvestigate`, takes a thesis and a time budget; 30 minutes is a practical minimum. It tests the claim against public records. Its source cards cover the official [OpenFEC API](https://api.open.fec.gov/developers/), [SEC EDGAR search and APIs](https://www.sec.gov/search-filings), [CourtListener developer resources](https://www.courtlistener.com/help/), the [OpenSecrets website](https://www.opensecrets.org/), and the [Wayback Machine](https://archivesupport.zendesk.com/hc/en-us/articles/360004651732-Using-The-Wayback-Machine). These backends identify records; the workflow still requires provenance checks and exact stored evidence. An optional `--stance` flag changes question order only: it never changes relevance, credibility, confidence, or release thresholds, and counter-queries always run. Reputation-sensitive findings require a primary record or two independent credible sources plus attribution and legal-risk review.

## Install and quick start

Claude Code discovers personal skills at `~/.claude/skills/<skill-name>/SKILL.md`. Install each prompt under its own directory, then install the validator dependencies:

```bash
for skill in selfwrite selfresearch selfinvestigate; do
  mkdir -p "$HOME/.claude/skills/$skill"
  cp "$skill.md" "$HOME/.claude/skills/$skill/SKILL.md"
done
npm install
```

The research skills read backend reference cards from `sources/` at runtime, so run them from this repository or copy `sources/` into the working project. The validators are release gates, not semantic judges; `npm install` supplies the YAML parser and test suite, while the validators otherwise use Node's standard library. Verify the install with Claude Code's `/skills` command, then invoke `/selfwrite`, `/selfresearch`, or `/selfinvestigate` with a task and time budget. See Anthropic's current [skills documentation](https://code.claude.com/docs/en/slash-commands) for discovery and precedence rules.

For example, run `/selfwrite "tighten this opinion column on housing policy" 30m`. The research skills use the same pattern: a quoted task, a duration, and any documented option.

Concrete intake answers help: "a skeptical CFO reading a one-pager" gives the workflow more useful constraints than "a general audience." A longer budget permits deeper retrieval and review when meaningful work remains; the workflow does not create work merely to consume time.

## Auditing runs

Every v0.3 run carries `run.json` with its run type, prompt commit, audience, artifact hashes, status, and release gates. Research runs also carry original-text snapshots under `documents/`, evidence and claim ledgers, a tagged report, a recorded claim-coverage attestation, and retrieval-coverage records. Releasable prose runs require a complete `judgments/final.json`. `run-audit.mjs` returns separate `integrity_pass`, `evidence_pass`, `quality_pass`, and `release_pass` fields. Exit code 0 means every required gate passed. Historical runs require `--legacy` and can never receive a release verdict.

The complete public contract is documented in [`SCHEMA-v3.md`](SCHEMA-v3.md).

Run `node scripts/run-audit.mjs runs/<run-dir> --json` for the full release verdict. Use `evidence-check.mjs` or `judgment-check.mjs` for a focused report. Run `npm test` for the synthetic fixtures and the legacy readability regression.

Install a run's `skill.md` distillate under its own skill directory:

Create `~/.claude/skills/<domain>/`, then copy the run's `skill.md` to `SKILL.md` in that directory.

## Optional MCP upgrades

MCP (Model Context Protocol) servers are opt-in upgrades documented in `sources/mcp-backends.md`; nothing ships preconfigured. Exa or Tavily can supply research search to `/selfresearch` and `/selfinvestigate`. Zotero can mirror a run's sources into a citation library. Without an MCP server, each skill follows the relevant source card's public or credential-aware path. The skills treat MCP output as untrusted external content, exactly as they treat fetched pages.

## Requirements

Selfwrite needs [Claude Code](https://code.claude.com/docs/en/overview) and, for the validators, Node.js 20 or newer. Claude Code authentication and billing options are documented in Anthropic's [setup guide](https://code.claude.com/docs/en/setup). Validator dependencies stay limited to YAML parsing and the Vitest suite listed in `package.json`.
