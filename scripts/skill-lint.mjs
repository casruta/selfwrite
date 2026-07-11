#!/usr/bin/env node
// scripts/skill-lint.mjs
//
// Consistency lint over the four skill prompt files. Guards the invariants
// introduced by the ANALYSIS.md remediation:
//   1. every scripts/, lib/, tools/, config/, sources/ path a skill file
//      references exists on disk (no phantom tool references),
//   2. <!-- SHARED:name --> ... <!-- /SHARED:name --> blocks are
//      byte-identical across every skill file that contains them,
//   3. thresholds quoted in prose match the code: a single budget-stop
//      percentage repo-wide, FK numbers equal to lib/readability.mjs
//      THRESHOLDS,
//   4. banned legacy phrases are gone (phantom scripts, the MinHash spec,
//      the header-based adaptive-parallelism mechanism).
//
// Usage:  node scripts/skill-lint.mjs [--dir=path] [--json]
// Exit:   0 clean, 1 violations, 2 arg/read error

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { THRESHOLDS } from '../lib/readability.mjs';

export const SKILL_FILES = Object.freeze([
  'selfwrite.md', 'selfresearch.md', 'selfinvestigate.md', 'selfpost.md',
]);

const PATH_RE = /\b(?:scripts|lib|tools|config|sources)\/[A-Za-z0-9._/-]+\.[a-z]{2,5}\b/g;
const SHARED_RE = /<!-- SHARED:([a-z0-9-]+) -->([\s\S]*?)<!-- \/SHARED:\1 -->/g;
const BANNED_PHRASES = Object.freeze([
  'tokenize_text.py', 'readability_check.py', 'MinHash', 'X-RateLimit',
]);

/**
 * Lint the skill files under rootDir. Error-as-value; nothing throws.
 *
 * @param {string} rootDir repo root containing the skill .md files
 * @returns {{ ok: boolean, error?: string, violations: Array<{file: string, line: number, rule: string, message: string}>, filesChecked: string[] }}
 */
export function lintSkills(rootDir) {
  const root = resolve(rootDir ?? '.');
  const violations = [];
  const filesChecked = [];
  const sharedBlocks = new Map(); // name -> [{file, content, line}]
  const budgetPercents = new Map(); // percent -> [{file, line}]

  for (const name of SKILL_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    filesChecked.push(name);
    const text = readFileSync(path, 'utf8');
    const lines = text.split(/\r?\n/);
    const lineOf = (index) => text.slice(0, index).split('\n').length;

    // 1. referenced paths exist
    for (const m of text.matchAll(PATH_RE)) {
      const ref = m[0];
      if (/[*<>{]/.test(ref)) continue; // glob / placeholder examples
      if (!existsSync(join(root, ref))) {
        violations.push({
          file: name, line: lineOf(m.index), rule: 'phantom-path',
          message: `references ${ref} which does not exist`,
        });
      }
    }

    // 2. collect SHARED blocks
    for (const m of text.matchAll(SHARED_RE)) {
      const entry = { file: name, content: m[2], line: lineOf(m.index) };
      if (!sharedBlocks.has(m[1])) sharedBlocks.set(m[1], []);
      sharedBlocks.get(m[1]).push(entry);
    }

    // 3a. budget-stop percentages (only on lines that talk about budget)
    for (let i = 0; i < lines.length; i++) {
      if (!/budget/i.test(lines[i])) continue;
      for (const m of lines[i].matchAll(/\b(1\d\d)%/g)) {
        const pct = m[1];
        if (!budgetPercents.has(pct)) budgetPercents.set(pct, []);
        budgetPercents.get(pct).push({ file: name, line: i + 1 });
      }
    }

    // 3b. FK numbers in prose must match THRESHOLDS
    const validFk = new Set(
      Object.values(THRESHOLDS).filter(Boolean).map((t) => t.fk)
    );
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(/(?:FK|Flesch[-–]Kincaid)[^0-9\n]{0,40}?(\d+(?:\.\d+)?)/gi)) {
        const num = Number(m[1]);
        if (!validFk.has(num)) {
          violations.push({
            file: name, line: i + 1, rule: 'fk-threshold-drift',
            message: `FK threshold ${num} in prose does not match lib/readability.mjs THRESHOLDS (${[...validFk].join(', ')})`,
          });
        }
      }
    }

    // 4. banned phrases
    for (let i = 0; i < lines.length; i++) {
      for (const phrase of BANNED_PHRASES) {
        if (lines[i].includes(phrase)) {
          violations.push({
            file: name, line: i + 1, rule: 'banned-phrase',
            message: `contains banned legacy phrase '${phrase}'`,
          });
        }
      }
    }
  }

  if (filesChecked.length === 0) {
    return { ok: false, error: `no skill files found under ${root}`, violations: [], filesChecked };
  }

  // 2 (cont.) SHARED blocks byte-identical across files
  for (const [blockName, entries] of sharedBlocks) {
    const reference = entries[0];
    for (const e of entries.slice(1)) {
      if (e.content !== reference.content) {
        violations.push({
          file: e.file, line: e.line, rule: 'shared-block-drift',
          message: `SHARED:${blockName} differs from the copy in ${reference.file}:${reference.line} — shared blocks must stay byte-identical`,
        });
      }
    }
  }

  // 3a (cont.) exactly one budget-stop percentage repo-wide
  if (budgetPercents.size > 1) {
    for (const [pct, locs] of budgetPercents) {
      for (const loc of locs) {
        violations.push({
          file: loc.file, line: loc.line, rule: 'budget-stop-drift',
          message: `budget-stop percentage ${pct}% conflicts with other files (found: ${[...budgetPercents.keys()].map((p) => `${p}%`).join(', ')}) — use one number everywhere`,
        });
      }
    }
  }

  return { ok: true, violations, filesChecked };
}

// ---------- CLI ----------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const flags = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    }
  }
  const json = flags.json === true;
  const result = lintSkills(typeof flags.dir === 'string' ? flags.dir : '.');

  if (!result.ok) {
    if (json) process.stdout.write(JSON.stringify(result) + '\n');
    else process.stderr.write(`error: ${result.error}\n`);
    process.exit(2);
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    console.log(`checked: ${result.filesChecked.join(', ')}`);
    for (const v of result.violations) {
      console.log(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
    console.log(result.violations.length === 0 ? 'lint: PASS' : `lint: FAIL (${result.violations.length} violations)`);
  }
  process.exit(result.violations.length === 0 ? 0 : 1);
}
