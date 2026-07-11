#!/usr/bin/env node
// scripts/near-dupes.mjs
//
// Near-duplicate pair finder over a JSON/JSONL record collection. Used by
// selfresearch (source dedup, replacing the old MinHash prose) and
// selfinvestigate (actor dedup before the actor map is built). Pairs are
// advisory: the skill decides merge vs. keep.
//
// Usage:
//   node scripts/near-dupes.mjs <file.json|file.jsonl> --fields=title,abstract
//        [--threshold=0.85] [--id-field=source_id] [--json]
//
// Exit codes:
//   0   ran (pairs found or not — advisory output)
//   2   file / parse / arg error

import { readFileSync, existsSync } from 'node:fs';
import { nearDupePairs, parseRecords, DEFAULT_THRESHOLD } from '../lib/near-dupes.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
const file = positional[0];

if (!file) fail('usage: near-dupes.mjs <file.json|jsonl> --fields=a,b [--threshold=N] [--id-field=X] [--json]', json);
if (!existsSync(file)) fail(`file not found: ${file}`, json);
if (typeof flags.fields !== 'string' || !flags.fields.trim()) fail('--fields=a,b is required', json);

const fields = flags.fields.split(',').map((f) => f.trim()).filter(Boolean);
const threshold = flags.threshold !== undefined ? Number(flags.threshold) : DEFAULT_THRESHOLD;
if (Number.isNaN(threshold) || threshold <= 0 || threshold > 1) fail(`invalid --threshold: ${flags.threshold}`, json);

const { records, error } = parseRecords(readFileSync(file, 'utf8'), file.endsWith('.jsonl'));
if (!records) fail(error, json);

const result = nearDupePairs(records, {
  fields,
  threshold,
  idField: typeof flags['id-field'] === 'string' ? flags['id-field'] : undefined,
});
if (!result.ok) fail(result.error, json);

if (json) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  console.log(`records compared: ${result.compared}   near-duplicate pairs at >= ${threshold}: ${result.count}`);
  for (const p of result.pairs) console.log(`  ${p.a} <-> ${p.b}  (${p.similarity})`);
}

process.exit(0);
