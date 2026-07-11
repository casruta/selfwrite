#!/usr/bin/env node
// scripts/run-integrity.mjs
//
// Run-ledger consistency checks. The selfwrite skill runs this at every
// REFLECT step and at run end; any error-level finding blocks the next
// iteration until reconciled. --preflight runs before each DRAFT to detect
// artifact edits made outside the logged loop.
//
// Usage:
//   node scripts/run-integrity.mjs <run_dir> [--artifact=path] [--json]
//   node scripts/run-integrity.mjs <run_dir> --preflight [--artifact=path] [--json]
//
// Exit codes:
//   0   clean (warnings alone still exit 0)
//   1   error-level findings (or preflight mismatch)
//   2   unreadable run dir / arg error

import { checkRunConsistency, preflightCheck } from '../lib/run-integrity.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function fail(msg, json) {
  if (json) process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
  else process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
const runDir = positional[0];

if (!runDir) fail('usage: run-integrity.mjs <run_dir> [--preflight] [--artifact=path] [--json]', json);

const opts = typeof flags.artifact === 'string' ? { artifact: flags.artifact } : {};

if (flags.preflight === true) {
  const r = preflightCheck(runDir, opts);
  if (!r.ok) fail(r.error, json);
  if (json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else {
    console.log(`artifact: ${r.artifact}   lines: ${r.actual_lines}${r.expected_lines !== null ? ` (logged: ${r.expected_lines})` : ''}`);
    for (const m of r.mismatches) console.log(`  MISMATCH: ${m}`);
    console.log(r.valid ? 'preflight: PASS' : 'preflight: FAIL — artifact changed outside the logged loop');
  }
  process.exit(r.valid ? 0 : 1);
}

const r = checkRunConsistency(runDir, opts);
if (!r.ok) fail(r.error, json);

if (json) {
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
} else {
  console.log(`run: ${runDir}   schema: ${r.schema}${r.schema_version !== null ? ` (v${r.schema_version})` : ''}   artifact: ${r.artifact ?? 'unresolved'}`);
  for (const c of r.checks) console.log(`  ${c.level.toUpperCase().padEnd(5)} ${c.id}: ${c.message}`);
  console.log(`errors: ${r.summary.errors}   warnings: ${r.summary.warns}   ${r.valid ? 'PASS' : 'FAIL'}`);
}

process.exit(r.valid ? 0 : 1);
