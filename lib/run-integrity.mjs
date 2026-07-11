// lib/run-integrity.mjs
//
// Consistency checks between a run directory's tracking files (results.tsv,
// state.json, log.md, summary.md) and its actual artifact. This is the
// guardrail the ANALYSIS.md audit found missing: real runs abandoned their
// audit trail mid-run (nyt-upgrade: state says cycle 13, ledger stops at 12,
// artifact grew 426 -> 794 lines outside the loop) and dropped attempted
// iterations from the ledger (skill-upgrade: rows 10, 11, 13 missing).
//
// Schema handling is backward compatible: legacy runs are classified, their
// findings downgraded to warnings, and the files are never modified.
//
// Error-as-value pattern; nothing throws. No default export.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const SCHEMAS = Object.freeze(['standard', 'state-json', 'legacy-synonym', 'unknown']);
export const CURRENT_SCHEMA_VERSION = 2;

const LEDGER_BASENAMES = new Set([
  'log.md', 'rubric.md', 'learnings.md', 'summary.md', 'skill.md', 'readme.md',
]);

// ---------- low-level readers ----------

function readIfExists(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

function parseJsonSafe(text) {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parse results.tsv into header columns + row objects. Leading lines that
 * start with '#' are treated as comments; a `# schema_version: N` comment is
 * captured.
 *
 * @param {string|null} text
 * @returns {{ columns: string[], rows: object[], schemaVersion: number|null }|null}
 */
export function parseResultsTsv(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let schemaVersion = null;
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx].startsWith('#')) {
    const m = lines[headerIdx].match(/schema_version:\s*(\d+)/i);
    if (m) schemaVersion = Number(m[1]);
    headerIdx++;
  }
  if (headerIdx >= lines.length) return { columns: [], rows: [], schemaVersion };
  const columns = lines[headerIdx].split('\t').map((c) => c.trim());
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    const row = {};
    columns.forEach((c, idx) => { row[c] = (cells[idx] ?? '').trim(); });
    rows.push(row);
  }
  return { columns, rows, schemaVersion };
}

/**
 * Classify a results.tsv header into a known schema.
 *
 * @param {string[]} columns
 * @returns {'standard'|'state-json'|'legacy-synonym'|'unknown'}
 */
export function detectSchema(columns) {
  if (!columns || columns.length === 0) return 'unknown';
  if (columns.some((c) => c.startsWith('synonym_'))) return 'legacy-synonym';
  if (columns[0] === 'cycle') return 'state-json';
  if (columns[0] === 'iteration') return 'standard';
  return 'unknown';
}

/**
 * Resolve the run's target artifact path. Order: explicit opts.artifact ->
 * state.json `artifact` field -> highest-numbered versions/v*.md ->
 * sole non-ledger, non-backup .md at the run root.
 *
 * @param {string} runDir
 * @param {object|null} state
 * @param {string|null} explicit
 * @returns {string|null} absolute path or null
 */
export function resolveArtifact(runDir, state, explicit) {
  if (explicit) {
    const p = explicit.startsWith('/') ? explicit : join(runDir, explicit);
    return existsSync(p) ? p : null;
  }
  if (typeof state?.artifact === 'string') {
    const p = join(runDir, state.artifact);
    if (existsSync(p)) return p;
  }
  const versionsDir = join(runDir, 'versions');
  if (existsSync(versionsDir)) {
    const versioned = readdirSync(versionsDir)
      .filter((f) => /^v\d+.*\.md$/i.test(f))
      .map((f) => ({ f, n: Number((f.match(/^v(\d+)/i) ?? [])[1] ?? -1) }))
      .sort((a, b) => b.n - a.n);
    if (versioned.length > 0) return join(versionsDir, versioned[0].f);
  }
  const rootMds = readdirSync(runDir).filter((f) => {
    if (!f.endsWith('.md')) return false;
    const lower = f.toLowerCase();
    if (LEDGER_BASENAMES.has(lower)) return false;
    if (lower.includes('backup')) return false;
    return statSync(join(runDir, f)).isFile();
  });
  return rootMds.length === 1 ? join(runDir, rootMds[0]) : null;
}

function lineCount(text) {
  if (!text) return 0;
  const lines = text.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

function toNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/^\+/, ''));
  return Number.isNaN(n) ? null : n;
}

// ---------- main check ----------

/**
 * Run all applicable consistency checks on a run directory.
 *
 * Error-level checks (block the next iteration): iteration_gaps,
 * cycle_row_mismatch, artifact_line_drift, kept_reverted_tally.
 * Warn-level: log_narrative_count, schema_version_missing,
 * rubric_audience_dimension, pending_conditional_unresolved,
 * signal_override_missing.
 *
 * For legacy schemas every finding is downgraded to a warning: old runs are
 * historical fixtures, not violations.
 *
 * @param {string} runDir
 * @param {{ artifact?: string }} [opts]
 * @returns {object}
 */
export function checkRunConsistency(runDir, opts = {}) {
  if (!runDir || !existsSync(runDir)) {
    return { ok: false, error: `run directory not found: ${runDir}`, valid: false, checks: [], summary: { errors: 0, warns: 0 } };
  }

  const checks = [];
  const add = (id, level, message, extra = {}) => checks.push({ id, level, message, ...extra });

  const resultsText = readIfExists(join(runDir, 'results.tsv'));
  const results = parseResultsTsv(resultsText);
  const state = parseJsonSafe(readIfExists(join(runDir, 'state.json')));
  const logText = readIfExists(join(runDir, 'log.md'));
  const summaryText = readIfExists(join(runDir, 'summary.md'));
  const rubricText = readIfExists(join(runDir, 'rubric.md'));

  const columns = results?.columns ?? [];
  const rows = results?.rows ?? [];
  const schema = detectSchema(columns);
  const schemaVersion = results?.schemaVersion ?? (typeof state?.schema_version === 'number' ? state.schema_version : null);
  const iterCol = columns[0]; // 'cycle' or 'iteration'
  const legacy = schema === 'legacy-synonym';

  if (!results) {
    add('results_missing', 'warn', 'results.tsv not found; most checks skipped');
  }

  // 1. iteration_gaps — one row per attempted iteration, contiguous
  if (rows.length > 0) {
    const nums = rows.map((r) => toNumber(r[iterCol])).filter((n) => n !== null);
    if (nums.length === rows.length && nums.length > 0) {
      const sorted = [...nums].sort((a, b) => a - b);
      const missing = [];
      for (let expected = sorted[0]; expected <= sorted[sorted.length - 1]; expected++) {
        if (!sorted.includes(expected)) missing.push(expected);
      }
      if (missing.length > 0) {
        add('iteration_gaps', 'error',
          `results.tsv missing ${iterCol} rows: ${missing.join(', ')} — one row per ATTEMPTED iteration, reverts included`,
          { expected: `${sorted[0]}..${sorted[sorted.length - 1]} contiguous`, actual: `gaps at ${missing.join(', ')}` });
      }
    }
  }

  // 2. cycle_row_mismatch — state.json's cursor vs ledger row count
  const currentCycle = toNumber(state?.current_cycle ?? state?.current_iteration);
  if (currentCycle !== null && rows.length > 0) {
    if (rows.length !== currentCycle) {
      add('cycle_row_mismatch', 'error',
        `state.json ${state?.current_cycle != null ? 'current_cycle' : 'current_iteration'}=${currentCycle} but results.tsv has ${rows.length} data rows`,
        { expected: currentCycle, actual: rows.length });
    }
  }

  // 3. artifact_line_drift — artifact on disk vs last logged size
  const artifactPath = resolveArtifact(runDir, state, opts.artifact ?? null);
  let loggedLines = null;
  if (rows.length > 0 && columns.includes('total_lines')) {
    loggedLines = toNumber(rows[rows.length - 1].total_lines);
  }
  if (loggedLines === null) {
    loggedLines = toNumber(state?.skill_line_count ?? state?.artifact_line_count);
  }
  let actualLines = null;
  if (artifactPath) {
    actualLines = lineCount(readIfExists(artifactPath));
    if (loggedLines !== null && actualLines !== loggedLines) {
      add('artifact_line_drift', 'error',
        `artifact ${artifactPath.split('/').pop()} is ${actualLines} lines but the last logged count is ${loggedLines} — the artifact was edited outside the logged loop`,
        { expected: loggedLines, actual: actualLines });
    }
  }

  // 4. kept_reverted_tally — decision-column tally vs state/summary claims
  if (rows.length > 0 && columns.includes('decision')) {
    const keeps = rows.filter((r) => (r.decision ?? '').toLowerCase().startsWith('keep')).length;
    const reverts = rows.filter((r) => (r.decision ?? '').toLowerCase().startsWith('revert')).length;
    const claims = [];
    if (toNumber(state?.kept_count) !== null) claims.push({ src: 'state.json', kept: toNumber(state.kept_count), reverted: toNumber(state.reverted_count) ?? 0 });
    const keptM = summaryText?.match(/kept:\s*(\d+)/i);
    const revM = summaryText?.match(/reverted:\s*(\d+)/i);
    if (keptM) claims.push({ src: 'summary.md', kept: Number(keptM[1]), reverted: revM ? Number(revM[1]) : 0 });
    for (const c of claims) {
      if (c.kept !== keeps || c.reverted !== reverts) {
        add('kept_reverted_tally', 'error',
          `${c.src} claims kept=${c.kept}/reverted=${c.reverted} but results.tsv decisions tally kept=${keeps}/reverted=${reverts}`,
          { expected: `${c.kept}/${c.reverted}`, actual: `${keeps}/${reverts}` });
      }
    }
  }

  // 5. log_narrative_count — a narrative entry per ledger row
  if (logText !== null && rows.length > 0) {
    const headings = (logText.match(/^##\s/gm) ?? []).length;
    if (headings < rows.length) {
      add('log_narrative_count', 'warn',
        `log.md has ${headings} iteration entries for ${rows.length} results.tsv rows — the REFLECT narrative is required per iteration`,
        { expected: rows.length, actual: headings });
    }
  }

  // 6. schema_version_missing
  if (results && schemaVersion === null) {
    add('schema_version_missing', 'warn',
      `no schema_version stamp found (expected '# schema_version: ${CURRENT_SCHEMA_VERSION}' atop results.tsv or a schema_version field in state.json)`);
  }

  // 7. rubric_audience_dimension
  if (rubricText !== null && !/audience|readability|reading level|grade[- ]?(?:12|level)/i.test(rubricText)) {
    add('rubric_audience_dimension', 'warn',
      'rubric.md has no Audience Calibration / readability dimension — the grade-12 target never entered scoring');
  }

  // 8. pending_conditional_unresolved
  const pendingText = readIfExists(join(runDir, 'research', 'pending_conditional.md'));
  if (pendingText !== null && /- \[ \]/.test(pendingText)) {
    add('pending_conditional_unresolved', 'warn',
      'research/pending_conditional.md has unresolved conditional findings — list them in summary.md before closing the run');
  }

  // 9. signal_override_missing — plateau/oscillation in the ledger with no logged override
  if (rows.length >= 3 && columns.includes('decision') && columns.includes('delta')) {
    let plateauRun = 0;
    let revertRun = 0;
    let signal = null;
    for (const r of rows) {
      const d = (r.decision ?? '').toLowerCase();
      const delta = Math.abs(toNumber(r.delta) ?? 0);
      plateauRun = d.startsWith('keep') && delta < 0.1 ? plateauRun + 1 : 0;
      revertRun = d.startsWith('revert') ? revertRun + 1 : 0;
      if (plateauRun >= 3) signal = 'plateau (3+ consecutive keeps with delta < 0.1)';
      if (revertRun >= 3) signal = '3+ consecutive reverts';
    }
    if (signal && !(logText ?? '').includes('[SIGNAL OVERRIDE]')) {
      add('signal_override_missing', 'warn',
        `ledger shows ${signal} but log.md has no [SIGNAL OVERRIDE] entry — mandatory convergence triggers require one`);
    }
  }

  // legacy runs: findings are historical context, not violations
  if (legacy) {
    for (const c of checks) c.level = 'warn';
  }

  const errors = checks.filter((c) => c.level === 'error').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  return {
    ok: true,
    valid: errors === 0,
    schema,
    schema_version: schemaVersion,
    artifact: artifactPath ? artifactPath.replace(`${runDir}/`, '') : null,
    artifact_lines: actualLines,
    checks,
    summary: { errors, warns },
  };
}

// ---------- preflight ----------

/**
 * Fast pre-DRAFT check: has the artifact changed outside the logged loop?
 * Compares the on-disk artifact against the last logged line count and (when
 * state.json carries artifact_sha256) the logged content hash.
 *
 * @param {string} runDir
 * @param {{ artifact?: string }} [opts]
 * @returns {object}
 */
export function preflightCheck(runDir, opts = {}) {
  if (!runDir || !existsSync(runDir)) {
    return { ok: false, error: `run directory not found: ${runDir}`, valid: false };
  }
  const state = parseJsonSafe(readIfExists(join(runDir, 'state.json')));
  const results = parseResultsTsv(readIfExists(join(runDir, 'results.tsv')));
  const artifactPath = resolveArtifact(runDir, state, opts.artifact ?? null);
  if (!artifactPath) {
    return { ok: false, error: 'could not resolve the run artifact', valid: false };
  }

  const text = readIfExists(artifactPath) ?? '';
  const actualLines = lineCount(text);
  const actualSha = createHash('sha256').update(text).digest('hex');

  let expectedLines = null;
  const rows = results?.rows ?? [];
  if (rows.length > 0 && (results?.columns ?? []).includes('total_lines')) {
    expectedLines = toNumber(rows[rows.length - 1].total_lines);
  }
  if (expectedLines === null) {
    expectedLines = toNumber(state?.skill_line_count ?? state?.artifact_line_count);
  }
  const expectedSha = typeof state?.artifact_sha256 === 'string' ? state.artifact_sha256 : null;

  const mismatches = [];
  if (expectedLines !== null && actualLines !== expectedLines) {
    mismatches.push(`line count ${actualLines} != logged ${expectedLines}`);
  }
  if (expectedSha !== null && actualSha !== expectedSha) {
    mismatches.push('content hash differs from logged artifact_sha256');
  }

  return {
    ok: true,
    valid: mismatches.length === 0,
    artifact: artifactPath.replace(`${runDir}/`, ''),
    expected_lines: expectedLines,
    actual_lines: actualLines,
    expected_sha256: expectedSha,
    actual_sha256: actualSha,
    mismatches,
  };
}
