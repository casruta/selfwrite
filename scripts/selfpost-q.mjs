#!/usr/bin/env node
// scripts/selfpost-q.mjs
//
// Queue CLI for the selfpost skill. Deterministic operations on
// queue/twitter/*.md that the skill shells out to via Bash so Claude
// doesn't re-derive char counts, duplicate scores, or state transitions
// at runtime.
//
// Commands:
//   list     [--status=X] [--json]           List queued items
//   show     <id> [--json]                   Print one item's content
//   validate <id> [--stage=S] [--json]       Run validators on one item
//   status   <id> <new-status>               Atomic status frontmatter edit
//   stats    [--json]                        Counts + cadence summary
//
// Exit codes:
//   0   success
//   1   not found / no items / validation failed
//   2   parse / file / arg error
//   3   invalid status transition
//
// Stdout is JSON when --json is set, human-readable text otherwise.
// Errors go to stderr; scripts always write structured JSON on error
// when --json is set.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { stringify as yamlStringify } from 'yaml';

import {
  parseYamlFrontmatter,
  validateFrontmatter,
  validateIdMatchesFilename,
  validateStatusTransition,
  runValidationSuite,
  checkCadence,
  VALID_STATUSES,
  DAILY_CAP,
} from '../lib/validate.mjs';

const QUEUE_DIR_DEFAULT = 'queue/twitter';

// ------------------------------------------------------------------
// Arg parsing (tiny, no cli framework)
// ------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let cmd = null;
  const positional = [];
  const flags = {};
  for (const a of args) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else if (cmd === null) {
      cmd = a;
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

// ------------------------------------------------------------------
// I/O helpers
// ------------------------------------------------------------------

function queueDir(flags) {
  return resolve(flags['queue-dir'] ?? QUEUE_DIR_DEFAULT);
}

function ensureQueueDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function listQueueFiles(dir) {
  ensureQueueDir(dir);
  return readdirSync(dir)
    .filter(f => /^\d{8}-\d{4}-[a-z0-9][a-z0-9-]*[a-z0-9]\.md$/.test(f))
    .sort()
    .map(f => ({ filename: f, id: f.replace(/\.md$/, ''), path: join(dir, f) }));
}

function readQueueFile(path) {
  const raw = readFileSync(path, 'utf8');
  const { frontmatter, body, error } = parseYamlFrontmatter(raw);
  return { raw, frontmatter, body, error };
}

// ------------------------------------------------------------------
// Output helpers
// ------------------------------------------------------------------

function emitJson(data, ok = true) {
  process.stdout.write(JSON.stringify({ ok, ...data }, null, 2) + '\n');
}

function emitText(text) {
  process.stdout.write(text + '\n');
}

function emitError(message, { asJson = false, code = 'error' } = {}) {
  if (asJson) {
    process.stderr.write(JSON.stringify({ ok: false, error: message, code }, null, 2) + '\n');
  } else {
    process.stderr.write(`error: ${message}\n`);
  }
}

function humanDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

// ------------------------------------------------------------------
// Commands
// ------------------------------------------------------------------

function cmdList({ flags }) {
  const dir = queueDir(flags);
  const files = listQueueFiles(dir);
  const statusFilter = flags.status;

  const items = [];
  for (const f of files) {
    const { frontmatter, error } = readQueueFile(f.path);
    if (error || !frontmatter) {
      items.push({ id: f.id, filename: f.filename, error: error ?? 'malformed frontmatter' });
      continue;
    }
    if (statusFilter && frontmatter.status !== statusFilter) continue;
    items.push({
      id: f.id,
      status: frontmatter.status ?? null,
      type: frontmatter.type ?? null,
      created: frontmatter.created ? humanDate(frontmatter.created) : null,
      posted_at: frontmatter.posted_at ? humanDate(frontmatter.posted_at) : null,
      url: frontmatter.url ?? null,
      tags: frontmatter.tags ?? [],
    });
  }

  // newest first by created (descending)
  items.sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')));

  if (flags.json) {
    emitJson({ count: items.length, queueDir: dir, items });
    return 0;
  }

  if (items.length === 0) {
    emitText(statusFilter ? `no items with status=${statusFilter} in ${dir}` : `queue is empty (${dir})`);
    return 0;
  }

  emitText(`${pad('ID', 32)} ${pad('STATUS', 10)} ${pad('TYPE', 8)} ${pad('CREATED', 18)} URL`);
  emitText(`${'-'.repeat(32)} ${'-'.repeat(10)} ${'-'.repeat(8)} ${'-'.repeat(18)} ${'-'.repeat(32)}`);
  for (const it of items) {
    emitText(`${pad(it.id, 32)} ${pad(it.status, 10)} ${pad(it.type, 8)} ${pad(it.created, 18)} ${it.url ?? '-'}`);
  }
  emitText(`\n${items.length} item(s)${statusFilter ? ` with status=${statusFilter}` : ''}`);
  return 0;
}

function cmdShow({ positional, flags }) {
  const id = positional[0];
  if (!id) {
    emitError('show: missing <id>', { asJson: !!flags.json, code: 'arg_error' });
    return 2;
  }
  const dir = queueDir(flags);
  const path = join(dir, `${id}.md`);
  if (!existsSync(path)) {
    emitError(`show: ${id} not found in ${dir}`, { asJson: !!flags.json, code: 'not_found' });
    return 1;
  }
  const { raw, frontmatter, body, error } = readQueueFile(path);
  if (flags.json) {
    emitJson({ id, path, frontmatter, body, error: error ?? null });
    return error ? 2 : 0;
  }
  emitText(raw);
  return error ? 2 : 0;
}

function cmdValidate({ positional, flags }) {
  const id = positional[0];
  if (!id) {
    emitError('validate: missing <id>', { asJson: !!flags.json, code: 'arg_error' });
    return 2;
  }
  const stage = flags.stage ?? 'preflight';
  if (!['new', 'ready', 'preflight'].includes(stage)) {
    emitError(`validate: unknown stage '${stage}' (expected new|ready|preflight)`, { asJson: !!flags.json, code: 'arg_error' });
    return 2;
  }

  const dir = queueDir(flags);
  const path = join(dir, `${id}.md`);
  if (!existsSync(path)) {
    emitError(`validate: ${id} not found in ${dir}`, { asJson: !!flags.json, code: 'not_found' });
    return 1;
  }

  const { frontmatter, body, error: parseError } = readQueueFile(path);
  if (parseError || !frontmatter) {
    emitError(`validate: ${parseError ?? 'frontmatter missing'}`, { asJson: !!flags.json, code: 'parse_error' });
    return 2;
  }

  // collect posted archive for duplicate + cadence checks
  const postedArchive = [];
  if (stage === 'preflight') {
    const allFiles = listQueueFiles(dir);
    for (const f of allFiles) {
      if (f.id === id) continue;
      const { frontmatter: fm, body: fbody } = readQueueFile(f.path);
      if (fm && fm.status === 'posted') {
        postedArchive.push({ id: f.id, body: fbody, posted_at: fm.posted_at });
      }
    }
    // newest-first for duplicate lookback
    postedArchive.sort((a, b) => String(b.posted_at ?? '').localeCompare(String(a.posted_at ?? '')));
  }

  const result = runValidationSuite({ frontmatter, body }, stage, postedArchive);
  // also id-filename check
  const idMatch = validateIdMatchesFilename(frontmatter.id, basename(path));
  if (!idMatch.valid) {
    result.errors.push(idMatch.error);
    result.valid = false;
  }

  if (flags.json) {
    emitJson({ id, stage, ...result });
    return result.valid ? 0 : 1;
  }

  if (result.valid) {
    emitText(`✓ ${id}: valid at stage=${stage}`);
    if (result.warnings.length) {
      emitText(`  warnings:`);
      for (const w of result.warnings) emitText(`    - ${w}`);
    }
    return 0;
  }
  emitText(`✗ ${id}: ${result.errors.length} error(s) at stage=${stage}`);
  for (const e of result.errors) emitText(`  - ${e}`);
  if (result.warnings.length) {
    emitText(`  warnings:`);
    for (const w of result.warnings) emitText(`    - ${w}`);
  }
  return 1;
}

function cmdStatus({ positional, flags }) {
  const id = positional[0];
  const newStatus = positional[1];
  if (!id || !newStatus) {
    emitError('status: usage: status <id> <new-status>', { asJson: !!flags.json, code: 'arg_error' });
    return 2;
  }
  if (!VALID_STATUSES.includes(newStatus)) {
    emitError(`status: invalid new status '${newStatus}' (expected: ${VALID_STATUSES.join(', ')})`, { asJson: !!flags.json, code: 'arg_error' });
    return 2;
  }

  const dir = queueDir(flags);
  const path = join(dir, `${id}.md`);
  if (!existsSync(path)) {
    emitError(`status: ${id} not found in ${dir}`, { asJson: !!flags.json, code: 'not_found' });
    return 1;
  }

  const raw = readFileSync(path, 'utf8');
  const { frontmatter, body, error } = parseYamlFrontmatter(raw);
  if (error || !frontmatter) {
    emitError(`status: ${error ?? 'frontmatter missing'}`, { asJson: !!flags.json, code: 'parse_error' });
    return 2;
  }

  const oldStatus = frontmatter.status;
  const check = validateStatusTransition(oldStatus, newStatus);
  if (!check.valid) {
    emitError(`status: ${check.error}`, { asJson: !!flags.json, code: 'invalid_transition' });
    return 3;
  }

  // rebuild the frontmatter block, preserving body verbatim
  const newFrontmatter = { ...frontmatter, status: newStatus };
  const yamlOut = yamlStringify(newFrontmatter);
  const bodyPart = body.startsWith('\n') ? body : `\n${body}`;
  const out = `---\n${yamlOut}---${bodyPart}`;

  writeFileSync(path, out, 'utf8');

  if (flags.json) {
    emitJson({ id, oldStatus, newStatus, path });
    return 0;
  }
  emitText(`${id}: ${oldStatus} → ${newStatus}`);
  return 0;
}

function cmdStats({ flags }) {
  const dir = queueDir(flags);
  const files = listQueueFiles(dir);

  const statusCounts = Object.fromEntries(VALID_STATUSES.map(s => [s, 0]));
  const postedArchive = [];
  let malformed = 0;
  let oldestPending = null;

  for (const f of files) {
    const { frontmatter, error } = readQueueFile(f.path);
    if (error || !frontmatter) {
      malformed++;
      continue;
    }
    const s = frontmatter.status;
    if (s in statusCounts) statusCounts[s]++;
    if (s === 'posted' && frontmatter.posted_at) {
      postedArchive.push({ id: f.id, posted_at: frontmatter.posted_at });
    }
    if ((s === 'ready' || s === 'draft') && frontmatter.created) {
      if (!oldestPending || String(frontmatter.created) < String(oldestPending.created)) {
        oldestPending = { id: f.id, created: frontmatter.created, status: s };
      }
    }
  }

  const cadence = checkCadence(postedArchive);

  if (flags.json) {
    emitJson({
      queueDir: dir,
      total: files.length,
      malformed,
      statusCounts,
      postsIn24h: cadence.postsIn24h,
      dailyCap: DAILY_CAP,
      canPost: cadence.canPost,
      oldestPending,
    });
    return 0;
  }

  emitText(`Queue: ${dir}`);
  emitText(`Total items: ${files.length}${malformed ? ` (${malformed} malformed)` : ''}`);
  emitText('');
  emitText('Status distribution:');
  for (const [s, n] of Object.entries(statusCounts)) {
    emitText(`  ${pad(s, 10)} ${n}`);
  }
  emitText('');
  emitText(`Posted in last 24h: ${cadence.postsIn24h} (cap ${DAILY_CAP})${cadence.canPost ? '' : ' — AT CAP'}`);
  if (oldestPending) {
    emitText(`Oldest pending: ${oldestPending.id} (${oldestPending.status}, created ${humanDate(oldestPending.created)})`);
  }
  return 0;
}

function cmdHelp() {
  emitText(`selfpost-q — queue CLI for the selfpost skill

Usage:
  node scripts/selfpost-q.mjs <command> [args] [flags]

Commands:
  list     [--status=S] [--json]              List queued items
  show     <id> [--json]                      Print one item
  validate <id> [--stage=new|ready|preflight] [--json]   Run validators
  status   <id> <new-status>                  Atomic frontmatter edit
  stats    [--json]                           Queue summary

Flags:
  --json              JSON output to stdout
  --queue-dir=PATH    Override queue directory (default: queue/twitter)
  --status=S          Filter list by status
  --stage=S           Validation stage (default: preflight)

Valid statuses: ${VALID_STATUSES.join(', ')}
`);
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function main() {
  const { cmd, positional, flags } = parseArgs(process.argv);

  if (!cmd || cmd === 'help' || flags.help) {
    cmdHelp();
    return 0;
  }

  switch (cmd) {
    case 'list':      return cmdList({ positional, flags });
    case 'show':      return cmdShow({ positional, flags });
    case 'validate':  return cmdValidate({ positional, flags });
    case 'status':    return cmdStatus({ positional, flags });
    case 'stats':     return cmdStats({ positional, flags });
    default:
      emitError(`unknown command: ${cmd}. Run with --help for usage.`, { asJson: !!flags.json, code: 'arg_error' });
      return 2;
  }
}

process.exit(main());
