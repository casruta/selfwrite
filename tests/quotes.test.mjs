// tests/quotes.test.mjs
//
// Vitest suite for lib/quotes.mjs — the verbatim-quote gate that closes the
// fabrication escape hatch (a quote that is not a substring of its stored
// source text FAILs with no semantic appeal).

import { describe, it, expect } from 'vitest';
import {
  normalizeForMatch,
  elisionFragments,
  verifyQuote,
  verifyQuotesFile,
} from '../lib/quotes.mjs';

const SOURCE = {
  source_id: 'S001',
  abstract:
    'We find that reinforcement learning from human feedback (RLHF) can induce ' +
    'sycophancy in large language models — models increasingly agree with users ' +
    'even when the user is wrong. This effect grows with model scale.',
  snippet_used: 'Sycophancy grows with model scale in our experiments.',
};

describe('normalizeForMatch', () => {
  it('straightens curly quotes and dashes, collapses whitespace, lowercases', () => {
    expect(normalizeForMatch('“Models — even large ones — can’t   agree”')).toBe(
      '"models - even large ones - can\'t agree"'
    );
  });
});

describe('verifyQuote', () => {
  it('passes an exact quote', () => {
    const r = verifyQuote({ quote_text: 'models increasingly agree with users' }, SOURCE);
    expect(r.verbatim).toBe(true);
    expect(r.field).toBe('abstract');
  });

  it('passes despite curly-quote / dash / whitespace variance', () => {
    const r = verifyQuote(
      { quote_text: 'in large language models  —  models increasingly agree' },
      SOURCE
    );
    expect(r.verbatim).toBe(true);
  });

  it('passes an elided quote whose fragments appear in order', () => {
    const r = verifyQuote(
      { quote_text: 'reinforcement learning from human feedback … grows with model scale' },
      SOURCE
    );
    expect(r.verbatim).toBe(true);
  });

  it('fails an elided quote whose fragments are out of order', () => {
    const r = verifyQuote(
      { quote_text: 'this effect grows with model scale ... reinforcement learning from human feedback' },
      SOURCE
    );
    expect(r.verbatim).toBe(false);
    expect(r.reason).toBe('not_substring');
  });

  it('fails a lightly altered quote and reports high closest-match similarity', () => {
    const r = verifyQuote(
      { quote_text: 'models increasingly disagree with users even when the user is wrong' },
      SOURCE
    );
    expect(r.verbatim).toBe(false);
    expect(r.reason).toBe('not_substring');
    expect(r.closest_match.similarity).toBeGreaterThan(0.5);
  });

  it('fails an invented quote with low closest-match similarity', () => {
    const r = verifyQuote(
      { quote_text: 'quantum entanglement destabilizes agricultural futures markets' },
      SOURCE
    );
    expect(r.verbatim).toBe(false);
    expect(r.closest_match.similarity).toBeLessThan(0.3);
  });

  it('fails on empty source text', () => {
    const r = verifyQuote({ quote_text: 'anything at all here' }, { abstract: '', snippet_used: '' });
    expect(r.verbatim).toBe(false);
    expect(r.reason).toBe('empty_source_text');
  });

  it('checks snippet_used as well as abstract', () => {
    const r = verifyQuote({ quote_text: 'grows with model scale in our experiments' }, SOURCE);
    expect(r.verbatim).toBe(true);
    expect(r.field).toBe('snippet_used');
  });
});

describe('elisionFragments', () => {
  it('drops fragments too short to verify', () => {
    const frags = elisionFragments('the model … it … increasingly agrees with users');
    expect(frags).toEqual(['increasingly agrees with users']);
  });
});

describe('verifyQuotesFile', () => {
  const sourcesJson = JSON.stringify([SOURCE]);

  it('passes a file where every quote is verbatim', () => {
    const quotes = [
      JSON.stringify({ quote_id: 'Q001', source_id: 'S001', quote_text: 'models increasingly agree with users' }),
      JSON.stringify({ quote_id: 'Q002', source_id: 'S001', quote_text: 'This effect grows with model scale.' }),
    ].join('\n');
    const r = verifyQuotesFile(quotes, sourcesJson);
    expect(r.pass).toBe(true);
    expect(r.total).toBe(2);
    expect(r.verbatim).toBe(2);
  });

  it('collects fabricated quotes, missing sources, and parse errors', () => {
    const quotes = [
      JSON.stringify({ quote_id: 'Q001', source_id: 'S001', quote_text: 'entirely invented statement about markets' }),
      JSON.stringify({ quote_id: 'Q002', source_id: 'S999', quote_text: 'some quote' }),
      '{not json',
    ].join('\n');
    const r = verifyQuotesFile(quotes, sourcesJson);
    expect(r.pass).toBe(false);
    expect(r.fabricated.map((f) => f.quote_id)).toContain('Q001');
    expect(r.missing_sources).toContain('S999');
    expect(r.parse_errors).toHaveLength(1);
  });

  it('accepts sources.json as an object map keyed by id', () => {
    const map = JSON.stringify({ S001: SOURCE });
    const quotes = JSON.stringify({ quote_id: 'Q001', source_id: 'S001', quote_text: 'grows with model scale' });
    expect(verifyQuotesFile(quotes, map).pass).toBe(true);
  });

  it('errors as value on unparseable sources.json', () => {
    const r = verifyQuotesFile('', '{broken');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parse error/);
  });
});
