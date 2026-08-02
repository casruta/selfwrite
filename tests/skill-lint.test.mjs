import { describe, it, expect } from 'vitest';
import { lintSkills } from '../scripts/skill-lint.mjs';

describe('lintSkills bad-skills fixture', () => {
  const result = lintSkills('tests/fixtures/skills-bad');
  const rules = result.violations.map((violation) => violation.rule);

  it('flags phantom paths', () => {
    expect(rules).toContain('phantom-path');
  });

  it('flags shared-block drift', () => {
    expect(rules).toContain('shared-block-drift');
  });

  it('flags budget-stop drift', () => {
    expect(rules).toContain('budget-stop-drift');
  });

  it('flags FK threshold drift', () => {
    const findings = result.violations.filter((violation) => violation.rule === 'fk-threshold-drift');
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('11.5');
  });

  it('flags banned legacy phrases', () => {
    const findings = result.violations.filter((violation) => violation.rule === 'banned-phrase');
    expect(findings.some((violation) => violation.message.includes('MinHash'))).toBe(true);
    expect(findings.some((violation) => violation.message.includes('tokenize_text.py'))).toBe(true);
  });

  it('requires every skill file and shared block participant', () => {
    expect(rules).toContain('missing-skill-file');
    expect(rules).toContain('missing-shared-block');
  });

  it('returns an error value when no skill files exist', () => {
    expect(lintSkills('tests/fixtures/runs').ok).toBe(false);
  });
});

describe('lintSkills live repository', () => {
  it('passes all skill invariants', () => {
    const result = lintSkills('.');
    expect(result.filesChecked).toHaveLength(3);
    expect(result.violations).toEqual([]);
  });
});
