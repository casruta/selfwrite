#!/usr/bin/env node
// scripts/readability-check.mjs
//
// Readability gate for skill artifacts (report.md, drafts, etc.). The
// skills shell out here instead of estimating grade level in-context.
//
// Usage:
//   node scripts/readability-check.mjs <file.md> [--audience=default|general|expert]
//        [--kill-list=config/kill-list.yaml] [--json]
//
// Exit codes:
//   0   gate passed (always, for --audience=expert)
//   1   gate failed (FK grade / sentence-length violations)
//   2   file / parse / arg error
//
// Stdout is JSON when --json is set, human-readable text otherwise.

import { readFileSync, existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { analyzeReadability, AUDIENCES, THRESHOLDS } from '../lib/readability.mjs';
import { parseArgs, fail } from '../lib/cli.mjs';

const { positional, flags } = parseArgs(process.argv);
const json = flags.json === true;
const file = positional[0];

if (!file) fail('usage: readability-check.mjs <file.md> [--audience=...] [--kill-list=...] [--json]', json);
if (!existsSync(file)) fail(`file not found: ${file}`, json);

const audience = flags.audience ?? 'default';
if (!AUDIENCES.includes(audience)) {
  fail(`unknown audience '${audience}' (expected: ${AUDIENCES.join(', ')})`, json);
}

let killList = null;
if (typeof flags['kill-list'] === 'string') {
  if (!existsSync(flags['kill-list'])) fail(`kill-list not found: ${flags['kill-list']}`, json);
  try {
    killList = parseYaml(readFileSync(flags['kill-list'], 'utf8'));
  } catch (err) {
    fail(`kill-list parse error: ${err.message}`, json);
  }
}

const text = readFileSync(file, 'utf8');
const report = analyzeReadability(text, { audience, killList });

if (json) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const t = THRESHOLDS[audience];
  console.log(`file: ${file}`);
  console.log(`audience: ${audience}${t ? ` (FK <= ${t.fk}, avg <= ${t.avgSentenceWords}w, max ${t.maxSentenceWords}w)` : ' (no gate; stats only)'}`);
  console.log(`fk_grade: ${report.fk_grade}   avg_sentence_words: ${report.avg_sentence_words}   max_sentence_words: ${report.max_sentence_words}`);
  console.log(`words: ${report.word_count}   sentences: ${report.sentence_count}`);
  if (report.negation_antithesis.length) {
    console.log(`negation-antithesis candidates (${report.negation_antithesis.length}):`);
    for (const h of report.negation_antithesis) console.log(`  line ${h.line}: ${h.text}`);
  }
  if (report.tricolon_paragraphs.length) {
    console.log(`tricolon-burst candidates (${report.tricolon_paragraphs.length}):`);
    for (const h of report.tricolon_paragraphs) console.log(`  line ${h.line}: ${h.excerpt}`);
  }
  if (report.power_position_hits.length) {
    console.log(`POWER-POSITION hits (binding per selfwrite.md scoring safeguard #5):`);
    for (const h of report.power_position_hits) console.log(`  ${h.kind} at line ${h.line} (${h.position} paragraph ${h.paragraph})`);
  }
  const undef = report.acronyms.filter((a) => !a.defined);
  if (undef.length) {
    console.log(`acronyms with no first-use expansion: ${undef.map((a) => `${a.acronym} (line ${a.first_use_line})`).join(', ')}`);
  }
  if (report.kill_list_hits.length) {
    console.log(`kill-list hits: ${report.kill_list_hits.map((h) => `${h.word}×${h.count}`).join(', ')}`);
  }
  if (report.violations.length) {
    console.log('VIOLATIONS:');
    for (const v of report.violations) console.log(`  - ${v}`);
  } else {
    console.log('gate: PASS');
  }
}

process.exit(report.pass ? 0 : 1);
