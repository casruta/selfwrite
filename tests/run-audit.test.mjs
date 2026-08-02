import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

function runAudit(args) {
  try {
    const stdout = execFileSync('node', ['scripts/run-audit.mjs', ...args, '--json'], { encoding: 'utf8' });
    return { code: 0, report: JSON.parse(stdout) };
  } catch (error) {
    return { code: error.status, report: error.stdout ? JSON.parse(error.stdout) : null };
  }
}

describe('fail-closed aggregate audit', () => {
  it('releases only when integrity, evidence, and readability all pass', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/clean-v3']);
    expect(code).toBe(0);
    expect(report.integrity_pass).toBe(true);
    expect(report.evidence_pass).toBe(true);
    expect(report.quality_pass).toBe(true);
    expect(report.sections.judgment.pass).toBe(true);
    expect(report.release_pass).toBe(true);
    expect(report.pass).toBe(true);
  });

  it('does not release legacy runs, even when their downgraded integrity passes', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/clean-v2', '--legacy']);
    expect(code).toBe(1);
    expect(report.sections.integrity.legacy).toBe(true);
    expect(report.release_pass).toBe(false);
  });

  it('fails malformed current runs and reports every aggregate', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/malformed-v3']);
    expect(code).toBe(1);
    expect(report.integrity_pass).toBe(false);
    expect(report.evidence_pass).toBe(true);
    expect(report.quality_pass).toBe(false);
    expect(report.sections.judgment.pass).toBe(false);
    expect(report.release_pass).toBe(false);
  });

  it('uses readability as a quality and release gate', () => {
    const { code, report } = runAudit(['tests/fixtures/runs/clean-v3', '--audience=general']);
    expect(report.sections.readability).toBeDefined();
    expect(report.quality_pass).toBe(report.sections.readability.pass);
    expect(report.release_pass).toBe(report.integrity_pass && report.evidence_pass && report.quality_pass);
    expect(code).toBe(report.release_pass ? 0 : 1);
  });

  it('exits 2 for an invalid invocation', () => {
    expect(runAudit(['runs/does-not-exist']).code).toBe(2);
    expect(runAudit(['tests/fixtures/runs/clean-v3', '--audience=child']).code).toBe(2);
  });
});
