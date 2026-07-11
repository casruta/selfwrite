// tests/run-audit.test.mjs
//
// Vitest suite for scripts/run-audit.mjs — the one-command audit that
// merges ledger integrity, quote verification, readability, and near-dupe
// detection over a run directory. Exercises the CLI end-to-end via
// execFileSync since the script is the integration point.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

function runAudit(args) {
  try {
    const stdout = execFileSync('node', ['scripts/run-audit.mjs', ...args, '--json'], { encoding: 'utf8' });
    return { code: 0, report: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.status, report: err.stdout ? JSON.parse(err.stdout) : null };
  }
}

describe('run-audit CLI', () => {
  it('passes the clean v2 fixture with exit 0', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/clean-v2']);
    expect(code).toBe(0);
    expect(report.pass).toBe(true);
    expect(report.errors).toBe(0);
    expect(report.sections.integrity.valid).toBe(true);
    expect(report.sections.quotes).toBeUndefined(); // no quotes.jsonl in that fixture
    expect(report.sections.readability).toBeDefined();
  });

  it('fails the quoted fixture on its one fabricated quote', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/quoted-v2']);
    expect(code).toBe(1);
    expect(report.pass).toBe(false);
    expect(report.sections.quotes.total).toBe(3);
    expect(report.sections.quotes.verbatim).toBe(2);
    expect(report.sections.quotes.fabricated.map((f) => f.quote_id)).toEqual(['Q003']);
    // the ledger itself is clean — the failure is purely the quote gate
    expect(report.sections.integrity.valid).toBe(true);
    // near-dupes section ran because sources.json exists
    expect(report.sections.near_dupes_sources).toBeDefined();
  });

  it('fails runs/nyt-upgrade with the two known integrity errors', () => {
    const { code, report } = runAudit(['runs/nyt-upgrade']);
    expect(code).toBe(1);
    const ids = report.sections.integrity.checks
      .filter((c) => c.level === 'error')
      .map((c) => c.id)
      .sort();
    expect(ids).toEqual(['artifact_line_drift', 'cycle_row_mismatch']);
  });

  it('reports readability advisories without failing the audit (expert audience)', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/clean-v2', '--audience=expert']);
    expect(code).toBe(0);
    expect(report.sections.readability.audience).toBe('expert');
  });

  it('exits 2 on a missing run dir or bad audience', () => {
    expect(runAudit(['runs/does-not-exist']).code).toBe(2);
    expect(runAudit(['tests/fixtures/runs/clean-v2', '--audience=child']).code).toBe(2);
  });
});
