#!/usr/bin/env node
// scripts/run-audit.mjs
//
// One-command audit of a run directory: merges every applicable validator
// into a single verdict. Wraps (in order):
//   - run-ledger consistency        (lib/run-integrity.mjs)
//   - verbatim quote verification   (lib/quotes.mjs; only if quotes.jsonl
//                                    + sources.json exist)
//   - readability + AI-tell scan    (lib/readability.mjs; on the resolved
//                                    artifact, kill-list from config/)
//   - near-duplicate detection      (lib/near-dupes.mjs; only if
//                                    sources.json / actors.json exist)
//
// Usage:
//   node scripts/run-audit.mjs <run_dir> [--audience=default|general|expert]
//        [--artifact=path] [--json]
//
// Exit codes:
//   0   no error-level findings (readability violations and near-dupe pairs
//       are reported as warnings — they gate scores inside the loop, not
//       this audit)
//   1   integrity errors or fabricated quotes
//   2   unreadable run dir / arg error

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { checkRunConsistency } from '../lib/run-integrity.mjs';
import { verifyQuotesFile } from '../lib/quotes.mjs';
import { analyzeReadability, AUDIENCES } from '../lib/readability.mjs';
import { nearDupePairs, parseRecords } from '../lib/near-dupes.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
const runDir = positional[0];

if (!runDir) fail('usage: run-audit.mjs <run_dir> [--audience=...] [--artifact=path] [--json]', json);
if (!existsSync(runDir)) fail(`run directory not found: ${runDir}`, json);

const audience = flags.audience ?? 'default';
if (!AUDIENCES.includes(audience)) fail(`unknown audience '${audience}' (expected: ${AUDIENCES.join(', ')})`, json);

const report = { run_dir: runDir, sections: {}, errors: 0, warnings: 0 };

// 1. ledger integrity (always)
const integrity = checkRunConsistency(runDir, typeof flags.artifact === 'string' ? { artifact: flags.artifact } : {});
report.sections.integrity = integrity;
report.errors += integrity.summary?.errors ?? 0;
report.warnings += integrity.summary?.warns ?? 0;

// 2. quotes (only when both files exist)
const quotesPath = join(runDir, 'quotes.jsonl');
const sourcesPath = join(runDir, 'sources.json');
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

// 3. readability on the resolved artifact (advisory at audit level).
// checkRunConsistency already resolved the artifact — reuse it instead of
// re-reading state.json (also avoids crashing on malformed state.json).
const artifactPath = integrity.artifact ? join(runDir.replace(/\/+$/, ''), integrity.artifact) : null;
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
  };
  report.warnings += readability.violations.length + readability.negation_antithesis.length;
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

report.pass = report.errors === 0;

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
  console.log(`errors: ${report.errors}   warnings: ${report.warnings}   ${report.pass ? 'PASS' : 'FAIL'}`);
}

process.exit(report.pass ? 0 : 1);
