// tests/slug.test.mjs
//
// Vitest suite for lib/slug.mjs. Covers slugify determinism, stopword
// handling, unicode normalization, length limits, and generateId output
// format.

import { describe, it, expect } from 'vitest';
import {
  slugify,
  generateId,
  formatDateTimePrefix,
  MAX_SLUG_LENGTH,
} from '../lib/slug.mjs';

// ------------------------------------------------------------------
// slugify — basic cases
// ------------------------------------------------------------------

describe('slugify: basic', () => {
  it('lowercases + hyphenates a simple topic', () => {
    expect(slugify('AI Writing Loop')).toBe('ai-writing-loop');
  });

  it('is deterministic — same input -> same output', () => {
    const topic = 'Detection research and findings';
    expect(slugify(topic)).toBe(slugify(topic));
  });

  it('drops leading stopword "the"', () => {
    expect(slugify('The Quick Brown Fox')).toBe('quick-brown-fox');
  });

  it('drops interior stopwords', () => {
    expect(slugify('selfpost skill of the repo')).toBe('selfpost-skill-repo');
  });

  it('falls back to raw words when topic is all stopwords', () => {
    const s = slugify('the and of');
    expect(s).toBe('the-and-of');
  });

  it('returns "untitled" for empty input', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
  });

  it('returns "untitled" for non-string input', () => {
    expect(slugify(null)).toBe('untitled');
    expect(slugify(undefined)).toBe('untitled');
    expect(slugify(42)).toBe('untitled');
  });

  it('returns "untitled" when input has only punctuation', () => {
    expect(slugify('!!! ??? !!!')).toBe('untitled');
  });
});

// ------------------------------------------------------------------
// slugify — punctuation / special chars
// ------------------------------------------------------------------

describe('slugify: punctuation and symbols', () => {
  it('strips colons, commas, ampersands', () => {
    expect(slugify('Detection: research & findings')).toBe('detection-research-findings');
  });

  it('strips quotes and apostrophes (apostrophe becomes word break)', () => {
    // "don't" splits into "don" + "t"; four content tokens total fit the default maxWords=4
    expect(slugify("Don't 'stop' believing")).toBe('don-t-stop-believing');
  });

  it('truncates to maxWords when apostrophe inflates token count', () => {
    expect(slugify("Don't 'stop' believing now", { maxWords: 3 })).toBe('don-t-stop');
  });

  it('collapses runs of whitespace and punctuation', () => {
    expect(slugify('foo   ---   bar   ---   baz')).toBe('foo-bar-baz');
  });

  it('does not emit leading or trailing hyphens', () => {
    expect(slugify('!foo bar!')).toMatch(/^[a-z0-9]/);
    expect(slugify('!foo bar!')).toMatch(/[a-z0-9]$/);
  });
});

// ------------------------------------------------------------------
// slugify — diacritics / unicode
// ------------------------------------------------------------------

describe('slugify: unicode', () => {
  it('strips diacritics to ASCII equivalents', () => {
    expect(slugify('Café ÑOÑO naïve')).toBe('cafe-nono-naive');
  });

  it('drops non-latin characters entirely', () => {
    // Greek + Cyrillic don't decompose to ASCII, so they get stripped.
    // Falls back to the remaining ASCII words, or "untitled" if none.
    expect(slugify('hello мир')).toBe('hello');
  });
});

// ------------------------------------------------------------------
// slugify — length + word-count limits
// ------------------------------------------------------------------

describe('slugify: limits', () => {
  it('defaults to at most 4 content words', () => {
    const s = slugify('one two three four five six seven eight');
    expect(s.split('-').length).toBeLessThanOrEqual(4);
  });

  it('truncates to MAX_SLUG_LENGTH without trailing hyphen', () => {
    const s = slugify('this is a very long topic about a lot of things happening at once');
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(s.endsWith('-')).toBe(false);
  });

  it('honors opts.maxWords override', () => {
    const s = slugify('one two three four five', { maxWords: 2 });
    expect(s.split('-').length).toBeLessThanOrEqual(2);
  });

  it('honors opts.maxLength override', () => {
    const s = slugify('one two three four five', { maxLength: 10 });
    expect(s.length).toBeLessThanOrEqual(10);
    expect(s.endsWith('-')).toBe(false);
  });
});

// ------------------------------------------------------------------
// slugify — digits preserved
// ------------------------------------------------------------------

describe('slugify: digits', () => {
  it('preserves digits in words', () => {
    expect(slugify('GPT 4 benchmarks')).toBe('gpt-4-benchmarks');
  });

  it('keeps pure-number words', () => {
    expect(slugify('2026 outlook')).toBe('2026-outlook');
  });
});

// ------------------------------------------------------------------
// formatDateTimePrefix
// ------------------------------------------------------------------

describe('formatDateTimePrefix', () => {
  it('zero-pads months, days, hours, minutes', () => {
    const d = new Date();
    d.setFullYear(2026, 3, 4);  // April 4, 2026
    d.setHours(9, 5, 0, 0);
    expect(formatDateTimePrefix(d)).toBe('20260404-0905');
  });

  it('handles double-digit months and hours', () => {
    const d = new Date();
    d.setFullYear(2026, 11, 31);  // December 31, 2026
    d.setHours(23, 59, 0, 0);
    expect(formatDateTimePrefix(d)).toBe('20261231-2359');
  });
});

// ------------------------------------------------------------------
// generateId
// ------------------------------------------------------------------

describe('generateId', () => {
  it('produces YYYYMMDD-HHMM-<slug> shape', () => {
    const d = new Date();
    d.setFullYear(2026, 3, 14);
    d.setHours(15, 45, 0, 0);
    const id = generateId('AI Writing Loop', d);
    expect(id).toBe('20260414-1545-ai-writing-loop');
  });

  it('is deterministic for a fixed now', () => {
    const d = new Date(2026, 3, 14, 15, 45);
    expect(generateId('same topic', d)).toBe(generateId('same topic', d));
  });

  it('matches the id-format regex used in validators', () => {
    const d = new Date(2026, 3, 14, 15, 45);
    const id = generateId('Some Topic', d);
    expect(id).toMatch(/^\d{8}-\d{4}-[a-z0-9][a-z0-9-]*[a-z0-9]$/);
  });

  it('handles an empty topic (falls back to "untitled")', () => {
    const d = new Date(2026, 3, 14, 15, 45);
    expect(generateId('', d)).toBe('20260414-1545-untitled');
  });

  it('passes through opts to slugify', () => {
    const d = new Date(2026, 3, 14, 15, 45);
    const id = generateId('one two three four five six', d, { maxWords: 2 });
    expect(id).toBe('20260414-1545-one-two');
  });
});
