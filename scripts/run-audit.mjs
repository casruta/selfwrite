#!/usr/bin/env node
// scripts/run-audit.mjs
//
// One-command audit of a run directory: merges every applicable validator
// into a single verdict. Wraps (in order):
//   - run-ledger consistency        (lib/run-integrity.mjs)
//   - legacy quote verification     (lib/quotes.mjs, when present)
//   - schema-v3 evidence validation (lib/evidence.mjs, research modes)
//   - readability + AI-tell scan    (lib/readability.mjs; on the resolved
//                                    artifact, kill-list from config/)
//   - near-duplicate detection      (lib/near-dupes.mjs; only if
//                                    sources.json / actors.json exist)
//
// Usage:
//   node scripts/run-audit.mjs <run_dir> [--audience=default|general|expert]
//        [--artifact=path] [--legacy] [--json]
//
// Exit codes:
//   0   every required release gate passed
//   1   integrity, evidence, or quality gate failed
//   2   unreadable run dir / arg error

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { checkRunConsistency } from '../lib/run-integrity.mjs';
import { verifyQuotesFile } from '../lib/quotes.mjs';
import { analyzeReadability, AUDIENCES, normalizeAudience } from '../lib/readability.mjs';
import { nearDupePairs, parseRecords } from '../lib/near-dupes.mjs';
import { validateEvidenceRun } from '../lib/evidence.mjs';
import { validateJudgmentRecord } from '../lib/judgments.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
const runDir = positional[0];
process.on('uncaughtException', (error) => fail(`cannot complete audit: ${error.message}`, json));
process.on('unhandledRejection', (error) => fail(`cannot complete audit: ${error?.message ?? error}`, json));

if (!runDir) fail('usage: run-audit.mjs <run_dir> [--audience=...] [--artifact=path] [--legacy] [--json]', json);
if (!existsSync(runDir)) fail(`run directory not found: ${runDir}`, json);
const runRoot = resolve(runDir);

const requestedAudience = flags.audience === undefined ? undefined : normalizeAudience(flags.audience);
if (flags.audience !== undefined && !requestedAudience) fail(`unknown audience '${flags.audience}' (expected: ${AUDIENCES.join(', ')} or a documented intake alias)`, json);

const report = { run_dir: runDir, sections: {}, errors: 0, warnings: 0 };

// 1. ledger integrity (always)
const integrity = checkRunConsistency(runRoot, {
  ...(typeof flags.artifact === 'string' ? { artifact: flags.artifact } : {}),
  legacy: flags.legacy === true,
});
report.sections.integrity = integrity;
report.errors += integrity.summary?.errors ?? 0;
report.warnings += integrity.summary?.warns ?? 0;
const audience = requestedAudience ?? integrity.audience ?? 'default';

// 2. Legacy quote pair. Exactly one file is always an integrity failure.
const quotesPath = join(runDir, 'quotes.jsonl');
const sourcesPath = join(runDir, 'sources.json');
if (!integrity.evidence_required && existsSync(quotesPath) !== existsSync(sourcesPath)) {
  report.sections.quotes = { ok: false, pass: false, error: 'quotes.jsonl and sources.json must either both exist or both be absent' };
  report.errors += 1;
}
if (existsSync(quotesPath) && existsSync(sourcesPath)) {
  const quotes = verifyQuotesFile(readFileSync(quotesPath, 'utf8'), readFileSync(sourcesPath, 'utf8'));
  report.sections.quotes = quotes;
  if (!quotes.ok) {
    // unparseable sources.json means quotes are unverifiable — that is an
    // error, not a clean pass
    report.errors += 1;
  } else if (!quotes.pass) {
    report.errors += quotes.fabricated.length + quotes.parse_errors.length;
  }
}

// Schema-v3 research modes use sources + evidence/claims JSONL + documents.
// Parse every record here so mere file presence can never become an evidence pass.
if (integrity.evidence_required) {
  const evidence = validateEvidenceRun(runRoot);
  report.sections.evidence = evidence;
  report.errors += evidence.summary?.errors ?? evidence.errors?.length ?? 0;
}

// Releasable prose runs must preserve one aggregate, validator-compatible
// record for the final blind comparison. Per-judge files may also be kept.
const judgmentRequired = integrity.run_type === 'selfwrite' && integrity.status === 'releasable';
const judgmentPath = join(runRoot, 'judgments', 'final.json');
if (judgmentRequired || existsSync(judgmentPath)) {
  if (!existsSync(judgmentPath)) {
    report.sections.judgment = { valid: false, pass: false, errors: [{ path: 'judgments/final.json', message: 'final blind judgment record is required' }] };
    report.errors += 1;
  } else {
    try {
      const judgment = validateJudgmentRecord(JSON.parse(readFileSync(judgmentPath, 'utf8')));
      const artifactHash = integrity.artifact && existsSync(join(runRoot, integrity.artifact))
        ? createHash('sha256').update(readFileSync(join(runRoot, integrity.artifact))).digest('hex') : null;
      if (judgment.valid && artifactHash && JSON.parse(readFileSync(judgmentPath, 'utf8')).decision?.final_sha256 !== artifactHash) {
        judgment.valid = false;
        judgment.errors.push({ path: 'decision.final_sha256', message: 'must match the delivered artifact hash' });
      }
      judgment.pass = judgment.valid;
      report.sections.judgment = judgment;
      if (!judgment.pass) report.errors += Math.max(1, judgment.errors.length);
    } catch (error) {
      report.sections.judgment = { valid: false, pass: false, errors: [{ path: 'judgments/final.json', message: `cannot parse judgment record: ${error.message}` }] };
      report.errors += 1;
    }
  }
}

// 3. Readability and deterministic editorial-quality gates.
// checkRunConsistency already resolved the artifact — reuse it instead of
// re-reading state.json (also avoids crashing on malformed state.json).
const artifactPath = integrity.artifact ? join(runRoot, integrity.artifact) : null;
if (artifactPath && existsSync(artifactPath)) {
  let killList = null;
  // resolve relative to this script so the audit works from any cwd
  const killListPath = fileURLToPath(new URL('../config/kill-list.yaml', import.meta.url));
  if (existsSync(killListPath)) {
    try { killList = parseYaml(readFileSync(killListPath, 'utf8')); } catch { /* advisory */ }
  }
  const readability = analyzeReadability(readFileSync(artifactPath, 'utf8'), { audience, killList });
  report.sections.readability = {
    artifact: artifactPath,
    audience,
    fk_grade: readability.fk_grade,
    avg_sentence_words: readability.avg_sentence_words,
    violations: readability.violations,
    negation_antithesis: readability.negation_antithesis,
    tricolon_paragraphs: readability.tricolon_paragraphs,
    undefined_acronyms: readability.acronyms.filter((a) => !a.defined),
    kill_list_hits: readability.kill_list_hits,
    power_position_hits: readability.power_position_hits,
    analyzed_visible_word_coverage: readability.analyzed_visible_word_coverage,
    finding_counts: {
      violations: readability.violations.length,
      negation_antithesis: readability.negation_antithesis.length,
      tricolons: readability.tricolon_paragraphs.length,
      undefined_acronyms: readability.acronyms.filter((a) => !a.defined).length,
      kill_list_hits: readability.kill_list_hits.length,
      power_position_hits: readability.power_position_hits.length,
    },
    pass: readability.pass,
  };
  report.warnings += readability.violations.length + readability.negation_antithesis.length +
    readability.tricolon_paragraphs.length + report.sections.readability.undefined_acronyms.length +
    readability.kill_list_hits.length;
}

// 4. near-dupes (advisory; only when the record files exist)
const dupeTargets = [
  { file: 'sources.json', fields: ['title', 'abstract'], threshold: 0.85 },
  { file: 'actors.json', fields: ['canonical_name', 'aliases'], threshold: 0.6 },
];
for (const t of dupeTargets) {
  const p = join(runDir, t.file);
  if (!existsSync(p)) continue;
  const key = `near_dupes_${t.file.replace('.json', '')}`;
  const { records, error } = parseRecords(readFileSync(p, 'utf8'), false);
  if (!records) {
    // an unparseable record file must not vanish from the report silently
    report.sections[key] = { ok: false, error };
    report.warnings += 1;
    continue;
  }
  const dupes = nearDupePairs(records, { fields: t.fields, threshold: t.threshold });
  report.sections[key] = dupes;
  report.warnings += dupes.count;
}

report.integrity_pass = integrity.valid === true;
report.evidence_pass = integrity.evidence_required
  ? report.sections.evidence?.pass === true
  : (report.sections.quotes ? report.sections.quotes.ok === true && report.sections.quotes.pass === true : true);
report.quality_pass = report.sections.readability?.pass === true && (!judgmentRequired || report.sections.judgment?.pass === true);
report.release_pass = !integrity.legacy && integrity.status === 'releasable' && report.integrity_pass && report.evidence_pass && report.quality_pass;
report.pass = report.release_pass;

if (json) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  console.log(`run: ${runDir}   schema: ${integrity.schema ?? 'n/a'}`);
  for (const c of integrity.checks ?? []) console.log(`  ${c.level.toUpperCase().padEnd(5)} ${c.id}: ${c.message}`);
  if (report.sections.quotes) {
    const q = report.sections.quotes;
    console.log(`  quotes: ${q.verbatim}/${q.total} verbatim${q.fabricated.length ? ` — ${q.fabricated.length} FABRICATED` : ''}`);
  }
  if (report.sections.readability) {
    const r = report.sections.readability;
    console.log(`  readability (${r.audience}): FK ${r.fk_grade}, avg ${r.avg_sentence_words}w, ${r.violations.length} violations, ${r.negation_antithesis.length} negation-antithesis, ${r.undefined_acronyms.length} undefined acronyms`);
  }
  for (const [k, v] of Object.entries(report.sections)) {
    if (!k.startsWith('near_dupes_')) continue;
    if (v.ok === false) console.log(`  ${k}: UNPARSEABLE — ${v.error}`);
    else if (v.count > 0) console.log(`  ${k}: ${v.count} candidate pairs`);
  }
  console.log(`integrity: ${report.integrity_pass ? 'PASS' : 'FAIL'}   evidence: ${report.evidence_pass ? 'PASS' : 'FAIL'}   quality: ${report.quality_pass ? 'PASS' : 'FAIL'}   release: ${report.release_pass ? 'PASS' : 'FAIL'}`);
}

process.exit(report.release_pass ? 0 : 1);
