// tests/near-dupes.test.mjs
//
// Vitest suite for lib/near-dupes.mjs — the executable replacement for the
// unimplementable MinHash prose (source dedup) and the passive actor-dedup
// hope in the skill files.

import { describe, it, expect } from 'vitest';
import { nearDupePairs, parseRecords, comparisonText } from '../lib/near-dupes.mjs';
import { jaccardBigramSimilarity } from '../lib/similarity.mjs';

describe('nearDupePairs — sources', () => {
  const sources = [
    { source_id: 'S001', title: 'Sycophancy in RLHF-trained language models', abstract: 'We study sycophancy induced by human feedback in large language models.' },
    { source_id: 'S002', title: 'Sycophancy in RLHF trained language models', abstract: 'We study the sycophancy induced by human feedback in large language models.' },
    { source_id: 'S003', title: 'Quantum error correction with surface codes', abstract: 'A study of logical qubit fidelity under realistic noise.' },
  ];

  it('finds the near-identical preprint/journal pair at 0.85', () => {
    const r = nearDupePairs(sources, { fields: ['title', 'abstract'], threshold: 0.85 });
    expect(r.count).toBe(1);
    expect([r.pairs[0].a, r.pairs[0].b].sort()).toEqual(['S001', 'S002']);
  });

  it('finds nothing among unrelated records', () => {
    const r = nearDupePairs([sources[0], sources[2]], { fields: ['title', 'abstract'] });
    expect(r.count).toBe(0);
  });

  it('errors as value without fields', () => {
    expect(nearDupePairs(sources, {}).ok).toBe(false);
  });
});

describe('nearDupePairs — actors (alias arrays, lower threshold)', () => {
  const actors = [
    { id: 'A001', name: 'Robert Mercer', aliases: ['Bob Mercer'] },
    { id: 'A035', name: 'R. Mercer', aliases: ['Robert Mercer'] },
    { id: 'A007', name: 'Peter Thiel', aliases: [] },
  ];

  it('clusters the split identity at a 0.6 threshold', () => {
    const r = nearDupePairs(actors, { fields: ['name', 'aliases'], threshold: 0.6, idField: 'id' });
    expect(r.pairs.some((p) => [p.a, p.b].sort().join(',') === 'A001,A035')).toBe(true);
    expect(r.pairs.some((p) => p.a === 'A007' || p.b === 'A007')).toBe(false);
  });
});

describe('parseRecords', () => {
  it('parses arrays, single-array objects, object maps, and jsonl', () => {
    expect(parseRecords('[{"a":1}]', false).records).toHaveLength(1);
    expect(parseRecords('{"sources":[{"a":1},{"a":2}]}', false).records).toHaveLength(2);
    expect(parseRecords('{"S1":{"t":"x"},"S2":{"t":"y"}}', false).records.map((r) => r.id)).toEqual(['S1', 'S2']);
    expect(parseRecords('{"a":1}\n\n{"a":2}\n', true).records).toHaveLength(2);
  });

  it('errors as value on bad payloads', () => {
    expect(parseRecords('nope', false).records).toBeNull();
    expect(parseRecords('{"a":1}\n{bad', true).records).toBeNull();
  });
});

describe('comparisonText', () => {
  it('joins string and array fields, skipping missing ones', () => {
    expect(comparisonText({ name: 'X', aliases: ['Y', 'Z'], other: 5 }, ['name', 'aliases', 'missing'])).toBe('X Y Z');
  });
});

describe('review regressions', () => {
  it('object-map keys win over a record-level id field', () => {
    const { records } = parseRecords('{"S001":{"id":"custom","t":"x"},"S002":{"id":"custom","t":"y"}}', false);
    expect(records.map((r) => r.id).sort()).toEqual(['S001', 'S002']);
  });
});

// Direct contract tests for the shared similarity helper — the selfpost
// removal deleted its original suite while both quotes.mjs and
// near-dupes.mjs still depend on these exact values.
describe('jaccardBigramSimilarity contract', () => {
  it('identical strings score 1 and disjoint strings score 0', () => {
    expect(jaccardBigramSimilarity('model scale', 'model scale')).toBe(1);
    expect(jaccardBigramSimilarity('abcdef', 'uvwxyz')).toBe(0);
  });

  it('two empty strings score 1; empty vs non-empty scores 0', () => {
    expect(jaccardBigramSimilarity('', '')).toBe(1);
    expect(jaccardBigramSimilarity('', 'text')).toBe(0);
  });

  it('is case-insensitive, whitespace-collapsing, and symmetric', () => {
    expect(jaccardBigramSimilarity('Model  Scale', 'model scale')).toBe(1);
    const a = 'reinforcement learning from feedback';
    const b = 'reinforcement learning with feedback';
    expect(jaccardBigramSimilarity(a, b)).toBe(jaccardBigramSimilarity(b, a));
  });

  it('applies NFC unicode normalization', () => {
    expect(jaccardBigramSimilarity('café nights', 'café nights')).toBe(1);
  });
});
