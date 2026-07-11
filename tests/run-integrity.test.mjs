// tests/run-integrity.test.mjs
//
// Vitest suite for lib/run-integrity.mjs. The real runs/ directories are the
// primary fixtures: the checker must provably flag the exact discrepancies
// the ANALYSIS.md audit documented, and must classify legacy runs without
// erroring on them.

import { describe, it, expect } from 'vitest';
import {
  checkRunConsistency,
  preflightCheck,
  detectSchema,
  parseResultsTsv,
} from '../lib/run-integrity.mjs';

const byId = (r, id) => r.checks.find((c) => c.id === id);

describe('real fixture: runs/nyt-upgrade', () => {
  const r = checkRunConsistency('runs/nyt-upgrade');

  it('classifies the state-json schema', () => {
    expect(r.schema).toBe('state-json');
  });

  it('flags cycle_row_mismatch (state cycle 13 vs 12 ledger rows)', () => {
    const c = byId(r, 'cycle_row_mismatch');
    expect(c.level).toBe('error');
    expect(c.expected).toBe(13);
    expect(c.actual).toBe(12);
  });

  it('flags artifact_line_drift (last logged 426 vs 794 on disk)', () => {
    const c = byId(r, 'artifact_line_drift');
    expect(c.level).toBe('error');
    expect(c.expected).toBe(426);
    expect(c.actual).toBe(794);
  });

  it('is invalid overall', () => {
    expect(r.valid).toBe(false);
  });
});

describe('real fixture: runs/skill-upgrade', () => {
  const r = checkRunConsistency('runs/skill-upgrade');

  it('flags the missing iteration rows 10, 11, 13', () => {
    const c = byId(r, 'iteration_gaps');
    expect(c.level).toBe('error');
    expect(c.actual).toContain('10, 11, 13');
  });

  it('warns that log.md is a stub (0 narrative entries for 14 rows)', () => {
    const c = byId(r, 'log_narrative_count');
    expect(c.level).toBe('warn');
    expect(c.actual).toBe(0);
    expect(c.expected).toBe(14);
  });
});

describe('real fixture: runs/2026-04-01_011613 (legacy)', () => {
  const r = checkRunConsistency('runs/2026-04-01_011613');

  it('classifies legacy-synonym and never errors on it', () => {
    expect(r.schema).toBe('legacy-synonym');
    expect(r.summary.errors).toBe(0);
    expect(r.valid).toBe(true);
  });

  it('warns about the missing schema_version stamp', () => {
    expect(byId(r, 'schema_version_missing').level).toBe('warn');
  });
});

describe('synthetic fixture: clean v2 run', () => {
  const r = checkRunConsistency('tests/fixtures/runs/clean-v2');

  it('passes with zero findings', () => {
    expect(r.valid).toBe(true);
    expect(r.checks).toHaveLength(0);
    expect(r.schema_version).toBe(2);
  });

  it('passes preflight (artifact matches logged line count)', () => {
    const p = preflightCheck('tests/fixtures/runs/clean-v2');
    expect(p.valid).toBe(true);
  });
});

describe('preflight mismatch detection', () => {
  it('fails when the artifact drifted from logged line count and hash', () => {
    const p = preflightCheck('tests/fixtures/runs/drifted-v2');
    expect(p.valid).toBe(false);
    expect(p.mismatches.length).toBe(2); // line count + sha256
  });

  it('errors as value on a missing run dir', () => {
    expect(checkRunConsistency('runs/does-not-exist').ok).toBe(false);
    expect(preflightCheck('runs/does-not-exist').ok).toBe(false);
  });
});

describe('schema detection and TSV parsing', () => {
  it('detects all schemas from headers', () => {
    expect(detectSchema(['cycle', 'topic', 'total_lines'])).toBe('state-json');
    expect(detectSchema(['iteration', 'target'])).toBe('standard');
    expect(detectSchema(['iteration', 'synonym_applied'])).toBe('legacy-synonym');
    expect(detectSchema(['weird'])).toBe('unknown');
    expect(detectSchema([])).toBe('unknown');
  });

  it('captures the schema_version comment', () => {
    const p = parseResultsTsv('# schema_version: 2\niteration\tdelta\n1\t0.5\n');
    expect(p.schemaVersion).toBe(2);
    expect(p.rows).toHaveLength(1);
  });
});
