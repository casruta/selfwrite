import { afterEach, describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkRunConsistency, preflightCheck, detectSchema, parseResultsTsv, CURRENT_SCHEMA_VERSION } from '../lib/run-integrity.mjs';

const byId = (report, id) => report.checks.find((check) => check.id === id);
const temporaryRuns = [];
function clonedRun() {
  const dir = mkdtempSync(join(tmpdir(), 'selfwrite-v3-'));
  temporaryRuns.push(dir);
  cpSync('tests/fixtures/runs/clean-v3', dir, { recursive: true });
  return dir;
}
afterEach(() => {
  for (const dir of temporaryRuns.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('strict schema-v3 integrity', () => {
  it('accepts a complete, hash-bound releasable run', () => {
    const report = checkRunConsistency('tests/fixtures/runs/clean-v3');
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    expect(report.valid).toBe(true);
    expect(report.schema_version).toBe(3);
    expect(report.artifact).toBe('draft.md');
    expect(report.artifact).not.toMatch(/^[A-Za-z]:[\\/]/);
    expect(preflightCheck('tests/fixtures/runs/clean-v3').valid).toBe(true);
  });

  it('fails closed when run.json is absent, unless explicitly legacy', () => {
    const strict = checkRunConsistency('tests/fixtures/runs/clean-v2');
    expect(strict.valid).toBe(false);
    expect(byId(strict, 'manifest_missing')).toBeDefined();
    const legacy = checkRunConsistency('tests/fixtures/runs/clean-v2', { legacy: true });
    expect(legacy.valid).toBe(true);
    expect(legacy.legacy).toBe(true);
  });

  it('rejects bad widths, duplicate/gapped iterations, and hash drift', () => {
    const report = checkRunConsistency('tests/fixtures/runs/malformed-v3');
    expect(report.valid).toBe(false);
    expect(byId(report, 'tsv_width')).toBeDefined();
    expect(byId(report, 'iteration_duplicate')).toBeDefined();
    expect(byId(report, 'iteration_gaps')).toBeDefined();
    expect(byId(report, 'hash_mismatch')).toBeDefined();
  });

  it('treats a malformed optional state.json as an error', () => {
    const report = checkRunConsistency('tests/fixtures/runs/malformed-v3');
    expect(report.checks.some((check) => check.id === 'state_malformed')).toBe(true);
  });

  it('detects a same-line-count artifact mutation and missing release hashes', () => {
    const dir = clonedRun();
    writeFileSync(join(dir, 'draft.md'), readFileSync(join(dir, 'draft.md'), 'utf8').replace('Line one', 'Line ONE'));
    let report = checkRunConsistency(dir);
    expect(byId(report, 'hash_mismatch')).toBeDefined();
    expect(byId(report, 'release_hash_mismatch')).toBeDefined();
    const manifest = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    delete manifest.verified_artifact_sha256;
    writeFileSync(join(dir, 'run.json'), JSON.stringify(manifest));
    report = checkRunConsistency(dir);
    expect(byId(report, 'hash_missing')).toBeDefined();
  });

  it('fails missing ledgers, unknown schemas, nonnumeric iterations, and incomplete evidence bundles', () => {
    const missing = clonedRun();
    unlinkSync(join(missing, 'results.tsv'));
    expect(byId(checkRunConsistency(missing), 'ledger_missing')).toBeDefined();

    const unknown = clonedRun();
    writeFileSync(join(unknown, 'results.tsv'), '# schema_version: 3\nweird\nvalue\n');
    expect(byId(checkRunConsistency(unknown), 'unknown_schema')).toBeDefined();

    const nonnumeric = clonedRun();
    writeFileSync(join(nonnumeric, 'results.tsv'), '# schema_version: 3\niteration\tdelta\nnope\t0\n');
    expect(byId(checkRunConsistency(nonnumeric), 'iteration_not_integer')).toBeDefined();

    const partial = clonedRun();
    writeFileSync(join(partial, 'sources.json'), '[]');
    expect(byId(checkRunConsistency(partial), 'evidence_file_missing')).toBeDefined();
  });

  it('rejects POSIX-style traversal and absolute Windows artifact paths', () => {
    const traversal = clonedRun();
    let manifest = JSON.parse(readFileSync(join(traversal, 'run.json'), 'utf8'));
    manifest.artifact = '../draft.md';
    writeFileSync(join(traversal, 'run.json'), JSON.stringify(manifest));
    let report = checkRunConsistency(traversal);
    expect(byId(report, 'artifact_path')).toBeDefined();
    expect(report.artifact).toBeNull();

    const absolute = clonedRun();
    manifest = JSON.parse(readFileSync(join(absolute, 'run.json'), 'utf8'));
    manifest.artifact = resolve(absolute, 'draft.md');
    writeFileSync(join(absolute, 'run.json'), JSON.stringify(manifest));
    report = checkRunConsistency(absolute);
    expect(byId(report, 'artifact_path')).toBeDefined();
    expect(report.artifact).toBeNull();
  });

  it('never reads a ledger outside the run', () => {
    const dir = clonedRun();
    const manifest = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    manifest.ledger = '../outside.tsv';
    writeFileSync(join(dir, 'run.json'), JSON.stringify(manifest));
    const report = checkRunConsistency(dir);
    expect(byId(report, 'ledger_path')).toBeDefined();
    expect(report.ledger).toBeNull();
  });

  it.each([
    ['quantifier', 'Line one', 'Every line'],
    ['negation', 'Line two.', 'Line two is not true.'],
    ['number', 'Line three.', 'Line 3.'],
    ['citation', 'Line four.', 'Line four [1].'],
    ['claim boundary', 'Line five.', 'Line five; another claim.'],
  ])('blocks a post-score %s edit', (_kind, before, after) => {
    const dir = clonedRun();
    writeFileSync(join(dir, 'draft.md'), readFileSync(join(dir, 'draft.md'), 'utf8').replace(before, after));
    const report = checkRunConsistency(dir);
    expect(byId(report, 'hash_mismatch')).toBeDefined();
    expect(byId(report, 'release_hash_mismatch')).toBeDefined();
  });
});

describe('TSV parsing', () => {
  it('preserves strict row-width errors and schema stamps', () => {
    const parsed = parseResultsTsv('# schema_version: 3\niteration\tdelta\n0\t0\textra\n');
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.widthErrors).toEqual([{ line: 3, expected: 2, actual: 3 }]);
  });

  it('detects historical layouts without treating them as current', () => {
    expect(detectSchema(['iteration', 'target'])).toBe('standard');
    expect(detectSchema(['cycle', 'target'])).toBe('state-json');
    expect(detectSchema(['iteration', 'synonym_applied'])).toBe('legacy-synonym');
    expect(detectSchema(['weird'])).toBe('unknown');
  });
});
