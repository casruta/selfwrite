#!/usr/bin/env node
// scripts/verify-quotes.mjs
//
// Verbatim quote verification: every quote in quotes.jsonl must be an exact
// (normalization-tolerant, elision-aware) substring of its source's stored
// text in sources.json. The selfresearch/selfinvestigate verifiers run this
// as SRC verification Step 0 — a fabricated result here is a FAIL with no
// semantic appeal.
//
// Usage:
//   node scripts/verify-quotes.mjs <run_dir> [--quotes=path] [--sources=path] [--json]
//
// Exit codes:
//   0   all quotes verbatim
//   1   any fabricated / altered / orphaned quote
//   2   file / parse / arg error

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verifyQuotesFile } from '../lib/quotes.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
const runDir = positional[0];

if (!runDir) fail('usage: verify-quotes.mjs <run_dir> [--quotes=path] [--sources=path] [--json]', json);

const quotesPath = typeof flags.quotes === 'string' ? flags.quotes : join(runDir, 'quotes.jsonl');
const sourcesPath = typeof flags.sources === 'string' ? flags.sources : join(runDir, 'sources.json');

if (!existsSync(quotesPath)) fail(`quotes file not found: ${quotesPath}`, json);
if (!existsSync(sourcesPath)) fail(`sources file not found: ${sourcesPath}`, json);

const result = verifyQuotesFile(readFileSync(quotesPath, 'utf8'), readFileSync(sourcesPath, 'utf8'));
if (!result.ok) fail(result.error, json);

if (json) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  console.log(`quotes: ${result.total}   verbatim: ${result.verbatim}   fabricated: ${result.fabricated.length}`);
  for (const f of result.fabricated) {
    const closest = f.closest_match ? ` (closest: ${f.closest_match.field} @ ${f.closest_match.similarity})` : '';
    console.log(`  FAIL ${f.quote_id} -> ${f.source_id ?? 'missing source'}: ${f.reason}${closest}`);
  }
  for (const p of result.parse_errors) console.log(`  PARSE line ${p.line}: ${p.error}`);
  console.log(result.pass ? 'gate: PASS' : 'gate: FAIL');
}

process.exit(result.pass ? 0 : 1);
