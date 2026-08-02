#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { validateEvidenceRun } from '../lib/evidence.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const runDir = positional[0];
const json = flags.json === true;
process.on('uncaughtException', (error) => fail(`cannot read evidence run: ${error.message}`, json));
process.on('unhandledRejection', (error) => fail(`cannot read evidence run: ${error?.message ?? error}`, json));
if (!runDir) fail('usage: evidence-check.mjs <run_dir> [--json]', json);
if (!existsSync(runDir)) fail(`run directory not found: ${runDir}`, json);
const report = validateEvidenceRun(runDir);
if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  console.log(`sources: ${report.summary?.sources ?? 0}   evidence: ${report.summary?.evidence ?? 0}   claims: ${report.summary?.claims ?? 0}`);
  for (const error of report.errors) console.log(`  FAIL ${error.code}: ${error.message}`);
  console.log(`errors: ${report.errors.length}   unclassified: ${report.summary?.unclassified_factual_claims ?? 0}   weak load-bearing: ${report.summary?.weak_load_bearing ?? 0}   ${report.pass ? 'PASS' : 'FAIL'}`);
}
process.exit(report.pass ? 0 : report.ok ? 1 : 2);
