// tests/readability.test.mjs
//
// Vitest suite for lib/readability.mjs. Includes real-fixture assertions
// against runs/2026-04-01_011613/versions/v5-final.md — the run whose log
// documents the coordinator deliberately shipping the negation-antithesis
// kicker ("This isn't coincidence. It's a pattern.").

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  countSyllables,
  stripMarkdown,
  splitSentences,
  analyzeReadability,
  THRESHOLDS,
  AUDIENCES,
  normalizeAudience,
} from '../lib/readability.mjs';

describe('countSyllables', () => {
  const cases = [
    ['cat', 1], ['the', 1], ['code', 1], ['fire', 1],
    ['water', 2], ['simple', 2], ['rhythm', 2], ['people', 2],
    ['beautiful', 3], ['syllable', 3],
    ['university', 5],
  ];
  for (const [word, expected] of cases) {
    it(`${word} -> ${expected}`, () => {
      expect(countSyllables(word)).toBe(expected);
    });
  }

  it('numbers and empty input count as 1', () => {
    expect(countSyllables('2026')).toBe(1);
    expect(countSyllables('')).toBe(1);
  });
});

describe('splitSentences', () => {
  it('splits on terminal punctuation before a capital', () => {
    expect(splitSentences('One thing. Another thing! A third?')).toHaveLength(3);
  });

  it('protects abbreviations and decimals', () => {
    const s = splitSentences('Dr. Smith cited the U.S. data, e.g. growth of 3.5 percent. Then he left.');
    expect(s).toHaveLength(2);
    expect(s[0]).toContain('Dr. Smith');
  });
});

describe('stripMarkdown / proseLines', () => {
  it('analyzes headings and tables, drops code fences, and keeps link text', () => {
    const md = [
      '# Title',
      '',
      'A sentence with a [link](https://example.com) in it.',
      '',
      '```js',
      'const excluded = true;',
      '```',
      '',
      '| col | col |',
      '|---|---|',
      '| a | b |',
    ].join('\n');
    const prose = stripMarkdown(md);
    expect(prose).toContain('A sentence with a link in it.');
    expect(prose).toContain('Title');
    expect(prose).not.toContain('excluded');
    expect(prose).toContain('col');
  });
});

describe('analyzeReadability — core stats', () => {
  it('computes FK from hand-countable monosyllabic prose', () => {
    // 19 words, 3 sentences, 19 syllables:
    // FK = 0.39*(19/3) + 11.8*(19/19) - 15.59 = -1.32
    const text = 'The cat sat on the mat. The dog ran to the park. We like to play all day long.';
    const r = analyzeReadability(text);
    expect(r.word_count).toBe(19);
    expect(r.sentence_count).toBe(3);
    expect(r.syllable_count).toBe(19);
    expect(r.fk_grade).toBeCloseTo(-1.32, 1);
    expect(r.pass).toBe(true);
  });

  it('grades dense institutional prose above simple prose and past the gate', () => {
    const simple = analyzeReadability('The cat sat on the mat. The dog ran to the park.');
    const dense = analyzeReadability(
      'The university administration subsequently promulgated a comprehensive evaluation of institutional performance encompassing multiple interdisciplinary departments and heterogeneous organizational configurations across the entire metropolitan educational apparatus.'
    );
    expect(dense.fk_grade).toBeGreaterThan(simple.fk_grade);
    expect(dense.fk_grade).toBeGreaterThan(THRESHOLDS.default.fk);
    expect(dense.pass).toBe(false);
    expect(dense.violations.some((v) => v.startsWith('fk_grade'))).toBe(true);
  });

  it('flags sentences over the max-words threshold', () => {
    const longSentence = `The committee decided that ${'word '.repeat(35)}mattered.`;
    const r = analyzeReadability(longSentence);
    expect(r.sentences_over_max.length).toBeGreaterThan(0);
    expect(r.pass).toBe(false);
  });

  it('general audience uses tighter prose thresholds; expert is exempt from those thresholds', () => {
    const mid = 'The intergovernmental negotiation concerning administrative harmonization proceeded slowly. ' .repeat(4);
    const general = analyzeReadability(mid, { audience: 'general' });
    const expert = analyzeReadability(mid, { audience: 'expert' });
    expect(general.pass).toBe(false);
    expect(expert.pass).toBe(true);
    expect(AUDIENCES).toContain('expert');
  });

  it('maps intake audience labels to CLI audiences', () => {
    expect(normalizeAudience('scholarly')).toBe('expert');
    expect(normalizeAudience('educated generalist')).toBe('general');
    expect(normalizeAudience('undergraduate')).toBe('general');
    expect(normalizeAudience('policy')).toBe('default');
    expect(normalizeAudience('unknown')).toBeNull();
  });

  it('fails coverage when most visible content is hidden in code fences', () => {
    const text = ['A short introduction.', '```text', 'dense hidden content '.repeat(30), '```'].join('\n');
    const r = analyzeReadability(text);
    expect(r.analyzed_visible_word_coverage).toBeLessThan(0.9);
    expect(r.violations.some((v) => v.startsWith('analyzed_visible_word_coverage'))).toBe(true);
    expect(r.pass).toBe(false);
  });

  it('enforces analysis coverage for expert audiences too', () => {
    const text = ['Short prose.', '```text', 'hidden '.repeat(200), '```'].join('\n');
    const r = analyzeReadability(text, { audience: 'expert' });
    expect(r.analyzed_visible_word_coverage).toBeLessThan(0.9);
    expect(r.pass).toBe(false);
  });

  it('includes prose in table cells in readability stats', () => {
    const r = analyzeReadability('| Finding | Explanation |\n|---|---|\n| Result | Institutionalization complicates interpretation. |');
    expect(r.word_count).toBeGreaterThan(4);
    expect(r.analyzed_visible_word_coverage).toBe(1);
  });
});

describe('analyzeReadability — AI-tell candidates', () => {
  it('flags the negation-antithesis two-sentence pivot', () => {
    const r = analyzeReadability("This isn't coincidence. It's a pattern. And the pattern has consequences.");
    expect(r.negation_antithesis.length).toBeGreaterThanOrEqual(1);
    expect(r.tricolon_paragraphs.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag ordinary negation', () => {
    const r = analyzeReadability('The results were not significant, and the study continued for another year without changes.');
    expect(r.negation_antithesis).toHaveLength(0);
  });

  it('tracks acronym first use and definition status', () => {
    const r = analyzeReadability(
      'The Federal Election Commission (FEC) ruled on the case. Meanwhile the DOJ opened a separate inquiry.'
    );
    const fec = r.acronyms.find((a) => a.acronym === 'FEC');
    const doj = r.acronyms.find((a) => a.acronym === 'DOJ');
    expect(fec.defined).toBe(true);
    expect(doj.defined).toBe(false);
  });

  it('does not accept bare parenthetical acronyms or years as expansions', () => {
    const r = analyzeReadability('Another body (DOJ) opened a case. The FEC (2020) report followed.');
    expect(r.acronyms.find((a) => a.acronym === 'DOJ').defined).toBe(false);
    expect(r.acronyms.find((a) => a.acronym === 'FEC').defined).toBe(false);
  });

  it('counts kill-list hits with word boundaries', () => {
    const r = analyzeReadability('We will leverage a robust framework to leverage synergies.', {
      killList: { words: ['leverage', 'robust'], phrases: ['deep dive'] },
    });
    const lev = r.kill_list_hits.find((h) => h.word === 'leverage');
    expect(lev.count).toBe(2);
    expect(r.kill_list_hits.find((h) => h.word === 'robust').count).toBe(1);
    expect(r.kill_list_hits.find((h) => h.word === 'deep dive')).toBeUndefined();
  });
});

describe('real fixture: runs/2026-04-01_011613/versions/v5-final.md', () => {
  const text = readFileSync('runs/2026-04-01_011613/versions/v5-final.md', 'utf8');
  const r = analyzeReadability(text);

  it('flags the documented shipped negation-antithesis kicker', () => {
    expect(r.negation_antithesis.length).toBeGreaterThanOrEqual(1);
  });

  it('lists PAC-family acronyms as undefined on first use', () => {
    const undefAcros = r.acronyms.filter((a) => !a.defined).map((a) => a.acronym);
    expect(undefAcros).toContain('PAC');
    expect(undefAcros).toContain('FEC');
  });

  it('produces finite, plausible stats', () => {
    expect(Number.isFinite(r.fk_grade)).toBe(true);
    expect(r.fk_grade).toBeGreaterThan(3);
    expect(r.word_count).toBeGreaterThan(300);
  });
});

describe('review regressions', () => {
  it('flags the comma-less "not X but Y" pivot', () => {
    const r = analyzeReadability("This isn't just a policy change but a fundamental shift in strategy.");
    expect(r.negation_antithesis.length).toBeGreaterThanOrEqual(1);
  });

  it('still ignores ordinary negation without a pivot', () => {
    const r = analyzeReadability('The committee did not approve the motion and the meeting ended early.');
    expect(r.negation_antithesis).toHaveLength(0);
  });
});

describe('kill-list typographic matching and hit types', () => {
  const killList = { words: ['robust'], phrases: ["let's be honest"] };

  it("matches a curly-apostrophe phrase against a straight-quoted term", () => {
    const r = analyzeReadability('Let’s be honest about the results of the study.', { killList });
    const hit = r.kill_list_hits.find((h) => h.word === "let's be honest");
    expect(hit).toBeDefined();
    expect(hit.count).toBe(1);
  });

  it('tags each hit as word or phrase', () => {
    const r = analyzeReadability("The robust model was robust. Let's be honest about that.", { killList });
    expect(r.kill_list_hits.find((h) => h.word === 'robust').type).toBe('word');
    expect(r.kill_list_hits.find((h) => h.word === "let's be honest").type).toBe('phrase');
  });
});

describe('power_position_hits', () => {
  const body = 'A plain middle paragraph with nothing remarkable in it at all.';
  const tell = "This isn't coincidence. It's a pattern.";

  it('maps a kicker-paragraph hit to the final power position', () => {
    const text = ['An ordinary opening paragraph sits here.', '', body, '', tell].join('\n');
    const r = analyzeReadability(text);
    const hit = r.power_position_hits.find((h) => h.kind === 'negation_antithesis');
    expect(hit).toBeDefined();
    expect(hit.position).toBe('final');
  });

  it('maps a nut-graph hit to an opening power position', () => {
    const text = [tell, '', body, '', 'A quiet closing paragraph ends the piece.'].join('\n');
    const r = analyzeReadability(text);
    expect(r.power_position_hits.some((h) => h.position === 'opening')).toBe(true);
  });

  it('leaves mid-piece hits out of the power-position array', () => {
    const text = ['An ordinary opening paragraph sits here.', '', 'A second calm paragraph follows it.', '', tell, '', body, '', 'A quiet closing paragraph ends the piece.'].join('\n');
    const r = analyzeReadability(text);
    expect(r.negation_antithesis.length).toBeGreaterThanOrEqual(1);
    expect(r.power_position_hits).toHaveLength(0);
  });
});
