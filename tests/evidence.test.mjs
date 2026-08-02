import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvidenceBundle, validateEvidenceRun } from '../lib/evidence.mjs';

const document = 'The audited study found a 17 percent reduction in errors. Independent records confirmed the result.';
const hash = createHash('sha256').update(document).digest('hex');
const temporaryRuns = [];
afterEach(() => {
  for (const dir of temporaryRuns.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function validBundle() {
  const source = (id, title = 'Audited study') => ({
    source_id: id, title, canonical_url: `https://example.org/${id}`,
    persistent_id: `doi:10.1/${id}`, source_type: 'journal_article',
    published_at: '2026-01-02', updated_at: '2026-01-02', retrieved_at: '2026-08-02T12:00:00Z',
    credibility_tier: 1, peer_review_status: 'peer_reviewed',
    retraction_status: 'not_retracted',
    integrity_check: { checked_at: '2026-08-02T12:05:00Z', method: 'publisher_and_crossref', result: 'pass', landing_url: { checked_at: '2026-08-02T12:04:00Z', status_code: 200, final_url: `https://example.org/${id}`, resolved: true } },
    snapshot_sha256: hash,
  });
  const ev = (id, sourceId, text) => ({
    evidence_id: id, source_id: sourceId, provenance_type: 'full_text', exact_text: text,
    context_before: id === 'E001' ? 'The audited study' : 'errors.',
    context_after: id === 'E001' ? 'Independent records' : '',
    locator: 'p. 4', document_sha256: hash,
  });
  return {
    sources: [source('S001'), source('S002', 'Independent audit')],
    documents: new Map([['S001', document], ['S002', document]]),
    evidence: [ev('E001', 'S001', 'found a 17 percent reduction in errors'), ev('E002', 'S002', 'Independent records confirmed the result')],
    claims: [
      { claim_id: 'C001', text: 'Errors fell 17 percent.', location: 'report:1', claim_type: 'SRC', verdict: 'PASS', confidence: 'HIGH', load_bearing: true, final_finding: false, classified_factual: true, evidence_ids: ['E001'] },
      { claim_id: 'C002', text: 'Two sources support the result.', location: 'report:2', claim_type: 'SYN', verdict: 'PASS', confidence: 'HIGH', load_bearing: true, final_finding: true, classified_factual: true, components: [{ source_id: 'S001', evidence_id: 'E001', contribution: 'measured result' }, { source_id: 'S002', evidence_id: 'E002', contribution: 'independent confirmation' }] },
      { claim_id: 'C003', text: 'The intervention likely caused the change.', location: 'report:3', claim_type: 'INF', verdict: 'PASS', confidence: 'MODERATE', load_bearing: false, final_finding: false, classified_factual: true, premise_claim_ids: ['C001', 'C002'] },
    ],
  };
}

function codes(report) { return report.errors.map((error) => error.code); }

describe('validateEvidenceBundle', () => {
  it('passes a complete chain with exact snapshots, SYN components, and INF premises', () => {
    const report = validateEvidenceBundle(validBundle());
    expect(report.pass).toBe(true);
    expect(report.summary).toMatchObject({ fail: 0, unclassified_factual_claims: 0, weak_load_bearing: 0, errors: 0 });
    expect(report.verified_claim_ids).toEqual(expect.arrayContaining(['C001', 'C002', 'C003']));
  });

  it('rejects duplicate source, evidence, and claim IDs', () => {
    const bundle = validBundle();
    bundle.sources.push({ ...bundle.sources[0] });
    bundle.evidence.push({ ...bundle.evidence[0] });
    bundle.claims.push({ ...bundle.claims[0] });
    const report = validateEvidenceBundle(bundle);
    expect(codes(report)).toEqual(expect.arrayContaining(['duplicate_source_id', 'duplicate_evidence_id', 'duplicate_claim_id']));
  });

  it('requires ordered contiguous S, E, and C identifiers', () => {
    const bundle = validBundle();
    bundle.evidence[0].evidence_id = 'banana';
    bundle.claims[0].evidence_ids = ['banana'];
    expect(codes(validateEvidenceBundle(bundle))).toContain('invalid_evidence_id');

    const gapped = validBundle();
    gapped.evidence[1].evidence_id = 'E003';
    gapped.claims[1].components[1].evidence_id = 'E003';
    expect(codes(validateEvidenceBundle(gapped))).toContain('evidence_id_sequence');
  });

  it('requires locator content and surrounding context from the stored document', () => {
    const bundle = validBundle();
    bundle.evidence[0].context_before = 'words that are not in the document';
    bundle.evidence[1].locator = {};
    expect(codes(validateEvidenceBundle(bundle))).toEqual(expect.arrayContaining(['context_mismatch', 'invalid_locator']));
  });

  it.each(['generated_summary', 'search_snippet', 'paraphrase'])(
    'rejects %s as evidence', (provenance_type) => {
      const bundle = validBundle();
      bundle.evidence[0].provenance_type = provenance_type;
      expect(codes(validateEvidenceBundle(bundle))).toContain('invalid_evidence_provenance');
    }
  );

  it('requires every source provenance field, integrity result, and matching snapshot hash', () => {
    const bundle = validBundle();
    delete bundle.sources[0].persistent_id;
    bundle.sources[0].integrity_check.result = 'fail';
    bundle.sources[1].snapshot_sha256 = '0'.repeat(64);
    const result = validateEvidenceBundle(bundle);
    expect(codes(result)).toEqual(expect.arrayContaining(['source_missing_provenance', 'failed_integrity_check', 'snapshot_hash_mismatch']));
  });

  it('rejects unknown credibility, review, and date values', () => {
    const bundle = validBundle();
    bundle.sources[0].credibility_tier = 'HIGH';
    bundle.sources[0].peer_review_status = 'unknown';
    bundle.sources[0].published_at = 'sometime';
    expect(codes(validateEvidenceBundle(bundle))).toEqual(expect.arrayContaining(['invalid_credibility_tier', 'invalid_peer_review_status', 'invalid_source_date']));
  });

  it('requires evidence to be an exact substring and rejects title-only support', () => {
    const altered = validBundle();
    altered.evidence[0].exact_text = 'found about a 17 percent reduction in errors';
    expect(codes(validateEvidenceBundle(altered))).toContain('evidence_not_exact_substring');
    const titleOnly = validBundle();
    titleOnly.sources[0].title = 'The audited study';
    titleOnly.evidence[0].exact_text = 'The audited study';
    expect(codes(validateEvidenceBundle(titleOnly))).toContain('title_only_support');
  });

  it('allows empty context only at an explicitly represented document boundary', () => {
    const bundle = validBundle();
    bundle.evidence[0].context_before = '';
    expect(validateEvidenceBundle(bundle).errors.find((e) => e.code === 'evidence_missing_fields')).toBeUndefined();
    delete bundle.evidence[0].context_before;
    expect(codes(validateEvidenceBundle(bundle))).toContain('evidence_missing_fields');
  });

  it('blocks retracted sources', () => {
    const bundle = validBundle();
    bundle.sources[0].retraction_status = 'retracted';
    expect(codes(validateEvidenceBundle(bundle))).toContain('retracted_source');
  });

  it('blocks an unresolved canonical landing URL', () => {
    const bundle = validBundle();
    bundle.sources[0].integrity_check.landing_url.resolved = false;
    bundle.sources[0].integrity_check.landing_url.status_code = 404;
    expect(codes(validateEvidenceBundle(bundle))).toContain('broken_landing_url');
  });

  it('requires each SYN component to name verified evidence from that source', () => {
    const bundle = validBundle();
    bundle.claims[1].components[1].evidence_id = 'E001';
    expect(codes(validateEvidenceBundle(bundle))).toContain('syn_invalid_component');
  });

  it('rejects a SYN that repeats one evidence span or one source', () => {
    const bundle = validBundle();
    bundle.claims[1].components = [
      { source_id: 'S001', evidence_id: 'E001', contribution: 'first description' },
      { source_id: 'S001', evidence_id: 'E001', contribution: 'duplicated description' },
    ];
    expect(codes(validateEvidenceBundle(bundle))).toContain('syn_not_independent');
  });

  it('rejects missing, weak, failed, and cyclic INF premises', () => {
    const missing = validBundle();
    missing.claims[2].premise_claim_ids = ['C999'];
    expect(codes(validateEvidenceBundle(missing))).toContain('inf_unverified_premise');
    const weak = validBundle();
    weak.claims[0].verdict = 'WEAK';
    expect(codes(validateEvidenceBundle(weak))).toEqual(expect.arrayContaining(['weak_load_bearing', 'inf_unverified_premise']));
    const cyclic = validBundle();
    cyclic.claims[2].premise_claim_ids = ['C004'];
    cyclic.claims.push({ ...cyclic.claims[2], claim_id: 'C004', premise_claim_ids: ['C003'] });
    expect(codes(validateEvidenceBundle(cyclic))).toContain('inf_unverified_premise');
    const unverified = validBundle();
    unverified.claims.push({ claim_id: 'C004', text: 'Unverified context.', location: 'report:4', claim_type: 'UNV', verdict: 'PASS', confidence: 'LOW', load_bearing: false, final_finding: false, classified_factual: true });
    unverified.claims[2].premise_claim_ids = ['C004'];
    expect(codes(validateEvidenceBundle(unverified))).toContain('inf_unverified_premise');
  });

  it('blocks FAIL, unclassified factual, weak load-bearing, and final UNV claims', () => {
    const bundle = validBundle();
    bundle.claims.push({ claim_id: 'C004', text: 'Unverified conclusion.', location: 'report:4', claim_type: 'UNV', verdict: 'FAIL', confidence: 'LOW', load_bearing: true, final_finding: true, classified_factual: false });
    const report = validateEvidenceBundle(bundle);
    expect(codes(report)).toEqual(expect.arrayContaining(['fail_verdict', 'unclassified_factual_claim', 'weak_load_bearing', 'unverified_final_finding']));
    expect(report.pass).toBe(false);
  });

  it('requires a disposition for weak non-load-bearing claims', () => {
    const bundle = validBundle();
    bundle.claims[2].verdict = 'WEAK';
    expect(codes(validateEvidenceBundle(bundle))).toContain('weak_claim_without_disposition');
    bundle.claims[2].disposition = 'limitations';
    expect(codes(validateEvidenceBundle(bundle))).not.toContain('weak_claim_without_disposition');
  });

  it('blocks abstract-only load-bearing claims and unsupported HIGH confidence', () => {
    const bundle = validBundle();
    bundle.evidence[0].provenance_type = 'publisher_abstract';
    expect(codes(validateEvidenceBundle(bundle))).toContain('load_bearing_abstract_only');
    const preprint = validBundle();
    for (const source of preprint.sources) source.peer_review_status = 'preprint';
    expect(codes(validateEvidenceBundle(preprint))).toContain('high_confidence_without_strong_source');
    const nonLoadBearing = validBundle();
    nonLoadBearing.claims[0].load_bearing = false;
    nonLoadBearing.evidence[0].provenance_type = 'publisher_abstract';
    expect(codes(validateEvidenceBundle(nonLoadBearing))).toContain('abstract_only_high_confidence');
  });

  it('requires strict ISO dates and well-formed HTTP URLs', () => {
    const bundle = validBundle();
    bundle.sources[0].updated_at = '08/02/2026';
    bundle.sources[0].canonical_url = 'https://';
    expect(codes(validateEvidenceBundle(bundle))).toEqual(expect.arrayContaining(['invalid_source_date', 'invalid_canonical_url']));
  });

  it('requires exactly one evidence-bearing report tag for every declared claim', () => {
    const bundle = validBundle();
    bundle.reportText = [
      'Errors fell. {{SRC:C001|E001}}',
      'The sources converge. {{SYN:C002|S001/E001,S002/E002}}',
      'The intervention likely mattered. {{INF:C003|P=C001,C002|R=the verified premises jointly support the inference}}',
    ].join('\n');
    expect(validateEvidenceBundle(bundle).pass).toBe(true);

    bundle.reportText = bundle.reportText.replace('{{SRC:C001|E001}}', '{{SRC:C001|E002}}');
    bundle.reportText = bundle.reportText.replace(/\{\{INF:[^}]+\}\}/, '');
    expect(codes(validateEvidenceBundle(bundle))).toEqual(expect.arrayContaining(['claim_tag_evidence_mismatch', 'missing_claim_tag']));
  });

  it('rejects orphan, duplicate, type-mismatched, and malformed SYN report tags', () => {
    const bundle = validBundle();
    bundle.reportText = [
      '{{SRC:C001|E001}} {{SRC:C001|E001}}',
      '{{SRC:C002|E001}}',
      '{{INF:C003|P=C001,C002|R=reason}}',
      '{{SRC:C999|E001}}',
    ].join('\n');
    expect(codes(validateEvidenceBundle(bundle))).toEqual(expect.arrayContaining([
      'duplicate_claim_tag', 'claim_tag_type_mismatch', 'claim_tag_evidence_mismatch', 'orphan_claim_tag',
    ]));
  });
});

describe('validateEvidenceRun', () => {
  it('loads and passes the evidence-only fixture', () => {
    const report = validateEvidenceRun('tests/fixtures/evidence/clean');
    expect(report.ok).toBe(true);
    expect(report.pass).toBe(true);
  });

  it('requires persisted claim-coverage and research-coverage gates', () => {
    const report = validateEvidenceRun('tests/fixtures/evidence/missing');
    expect(report.errors.some((error) => String(error.message).includes('claim-coverage.json'))).toBe(true);
    expect(report.errors.some((error) => String(error.message).includes('coverage.json'))).toBe(true);
  });

  it('binds the tagged report to the delivered rendered artifact', () => {
    const dir = mkdtempSync(join(tmpdir(), 'selfwrite-evidence-'));
    temporaryRuns.push(dir);
    cpSync('tests/fixtures/evidence/clean', dir, { recursive: true });
    const artifact = 'Errors fell 17 percent [1].\n';
    writeFileSync(join(dir, 'report.md'), artifact);
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ schema_version: 3, run_type: 'selfresearch', artifact: 'report.md' }));
    writeFileSync(join(dir, 'render-manifest.json'), JSON.stringify({
      tagged_report_sha256: createHash('sha256').update(readFileSync(join(dir, 'report.tagged.md'))).digest('hex'),
      artifact_sha256: createHash('sha256').update(artifact).digest('hex'),
      claim_ids: ['C001'],
      semantic_review: { completed: true, reviewer_model: 'fixture-reviewer-1', changed_claim_ids: [] },
    }));
    expect(validateEvidenceRun(dir).pass).toBe(true);
    writeFileSync(join(dir, 'report.md'), 'Unrelated unsupported prose.\n');
    expect(codes(validateEvidenceRun(dir))).toContain('render_binding_failed');
  });

  it('rejects an empty investigation legal review and enforces its support rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'selfwrite-investigation-'));
    temporaryRuns.push(dir);
    cpSync('tests/fixtures/evidence/clean', dir, { recursive: true });
    const artifact = 'Errors fell 17 percent [1].\n';
    writeFileSync(join(dir, 'report.md'), artifact);
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ schema_version: 3, run_type: 'selfinvestigate', artifact: 'report.md' }));
    writeFileSync(join(dir, 'render-manifest.json'), JSON.stringify({
      tagged_report_sha256: createHash('sha256').update(readFileSync(join(dir, 'report.tagged.md'))).digest('hex'),
      artifact_sha256: createHash('sha256').update(artifact).digest('hex'),
      claim_ids: ['C001'],
      semantic_review: { completed: true, reviewer_model: 'fixture-reviewer-1', changed_claim_ids: [] },
    }));
    writeFileSync(join(dir, 'legal-risk.json'), JSON.stringify({ completed: true, scope: 'all final findings', reviewed_claims: [], unresolved_high_risk_claims: [] }));
    expect(codes(validateEvidenceRun(dir))).toContain('legal_risk_failed');

    const evidence = readFileSync(join(dir, 'evidence.jsonl'), 'utf8').replace('"full_text"', '"primary_document"');
    writeFileSync(join(dir, 'evidence.jsonl'), evidence);
    writeFileSync(join(dir, 'legal-risk.json'), JSON.stringify({ completed: true, scope: 'all final findings', reviewed_claims: [{ claim_id: 'C001', checks: ['attribution', 'legal-risk'] }], unresolved_high_risk_claims: [] }));
    expect(validateEvidenceRun(dir).pass).toBe(true);
  });

  it('exposes the same clean verdict through the evidence-check CLI', () => {
    const stdout = execFileSync('node', ['scripts/evidence-check.mjs', 'tests/fixtures/evidence/clean', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, pass: true, summary: { errors: 0 } });
  });

  it('returns a structural error for missing manifests', () => {
    const report = validateEvidenceRun('tests/fixtures/evidence/missing');
    expect(report.ok).toBe(false);
    expect(report.errors.every((error) => error.code === 'missing_file')).toBe(true);
  });
});
