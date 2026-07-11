// tests/skill-lint.test.mjs
//
// Vitest suite for scripts/skill-lint.mjs. The bad-skills fixture proves the
// machinery catches each violation class; the live-repo test is the
// cross-phase completion gate (skipped until the P2-P4 skill-file edits
// land, then un-skipped).

import { describe, it, expect } from 'vitest';
import { lintSkills } from '../scripts/skill-lint.mjs';

describe('lintSkills — bad-skills fixture', () => {
  const r = lintSkills('tests/fixtures/skills-bad');
  const rules = r.violations.map((v) => v.rule);

  it('flags the phantom tools/tokenize_text.py path', () => {
    expect(rules).toContain('phantom-path');
  });

  it('flags SHARED:budget-stop drift between the two files', () => {
    expect(rules).toContain('shared-block-drift');
  });

  it('flags conflicting budget-stop percentages (110% vs 105%)', () => {
    expect(rules).toContain('budget-stop-drift');
  });

  it('flags the FK threshold that drifts from THRESHOLDS (11.5)', () => {
    const fk = r.violations.filter((v) => v.rule === 'fk-threshold-drift');
    expect(fk).toHaveLength(1);
    expect(fk[0].message).toContain('11.5');
  });

  it('flags banned legacy phrases (MinHash, tokenize_text.py)', () => {
    const banned = r.violations.filter((v) => v.rule === 'banned-phrase');
    expect(banned.some((v) => v.message.includes('MinHash'))).toBe(true);
    expect(banned.some((v) => v.message.includes('tokenize_text.py'))).toBe(true);
  });

  it('errors as value on a directory with no skill files', () => {
    expect(lintSkills('tests/fixtures/runs').ok).toBe(false);
  });
});

// Completion gate: un-skip once P2-P4 skill-file edits have landed.
describe('lintSkills — live repo (P5 completion gate)', () => {
  it('the real skill files pass the lint', () => {
    const r = lintSkills('.');
    expect(r.filesChecked.length).toBeGreaterThanOrEqual(3);
    expect(r.violations).toEqual([]);
  });
});
