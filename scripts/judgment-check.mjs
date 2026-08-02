#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { validateJudgmentRecord, summarizeBenchmark } from '../lib/judgments.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
if (positional.length !== 1) fail('usage: judgment-check.mjs <record-or-summary.json> [--json]', json);

let input;
try {
  input = JSON.parse(readFileSync(positional[0], 'utf8'));
} catch (error) {
  fail(`cannot read JSON: ${error.message}`, json);
}

let report;
try {
  if (Array.isArray(input?.records)) {
    const validations = input.records.map(validateJudgmentRecord);
    const summary = summarizeBenchmark(
      input.records,
      input.human_labels ?? null,
      input.llm_labels ?? null,
    );
    report = { valid: validations.every((item) => item.valid), validations, summary };
    report.pass = report.valid && summary.pass;
  } else {
    report = validateJudgmentRecord(input);
    report.pass = report.valid;
  }
} catch (error) {
  fail(error.message, json);
}

if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else if (Array.isArray(report.validations)) {
  console.log(`records: ${report.summary.total}   wins: ${report.summary.wins}   losses: ${report.summary.losses}   ties: ${report.summary.ties}`);
  console.log(`win rate: ${(report.summary.win_rate * 100).toFixed(1)}%   loss rate: ${(report.summary.loss_rate * 100).toFixed(1)}%   kappa: ${report.summary.kappa?.toFixed(3) ?? 'missing'}`);
  console.log(report.pass ? 'benchmark: PASS' : 'benchmark: FAIL');
} else {
  for (const error of report.errors) console.log(`ERROR ${error.path}: ${error.message}`);
  console.log(report.valid ? 'judgment: PASS' : 'judgment: FAIL');
}

process.exit(report.pass ? 0 : 1);
