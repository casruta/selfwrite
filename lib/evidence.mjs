// Deterministic v0.3 provenance, evidence, and claim validation.
// Error-as-value throughout. The filesystem entry point is intentionally a
// small stable API so run-audit can embed this gate without spawning a CLI.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

export const ALLOWED_PROVENANCE_TYPES = Object.freeze([
  'publisher_abstract', 'full_text', 'primary_document', 'filing', 'transcript',
]);
export const FORBIDDEN_PROVENANCE_TYPES = Object.freeze([
  'generated_summary', 'search_snippet', 'paraphrase',
]);
export const CLAIM_TYPES = Object.freeze(['SRC', 'SYN', 'INF', 'UNV']);
const PEER_REVIEW_STATUSES = new Set(['peer_reviewed', 'preprint', 'primary_source', 'not_applicable']);
const WEAK_DISPOSITIONS = new Set(['removed', 'limitations', 'caveated']);

const SOURCE_FIELDS = Object.freeze([
  'source_id', 'title', 'canonical_url', 'persistent_id', 'source_type',
  'published_at', 'updated_at', 'retrieved_at', 'credibility_tier', 'peer_review_status',
  'retraction_status', 'integrity_check', 'snapshot_sha256',
]);
const EVIDENCE_FIELDS = Object.freeze([
  'evidence_id', 'source_id', 'provenance_type', 'exact_text', 'context_before',
  'context_after', 'locator', 'document_sha256',
]);
const CLAIM_FIELDS = Object.freeze([
  'claim_id', 'text', 'location', 'claim_type', 'verdict', 'confidence',
  'load_bearing', 'final_finding', 'classified_factual',
]);

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function parseJsonRecords(text, file) {
  try {
    const value = JSON.parse(text);
    const records = Array.isArray(value) ? value : Array.isArray(value?.records) ? value.records :
      Array.isArray(value?.sources) ? value.sources : Array.isArray(value?.evidence) ? value.evidence :
        Array.isArray(value?.claims) ? value.claims : null;
    return records ? { records } : { error: `${file} must contain an array` };
  } catch (err) {
    return { error: `${file} parse error: ${err.message}` };
  }
}

function parseJsonlRecords(text, file) {
  const records = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    try { records.push(JSON.parse(raw)); }
    catch (err) { errors.push(`${file}:${i + 1} parse error: ${err.message}`); }
  });
  return { records, errors };
}

function addError(report, code, message, details = {}) {
  report.errors.push({ code, message, ...details });
}

function missingFields(record, fields) {
  return fields.filter((field) => record?.[field] === undefined || record?.[field] === null ||
    (typeof record[field] === 'string' && record[field].trim() === ''));
}

function validSha(value) {
  return typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  if (value.length === 10) return date.toISOString().slice(0, 10) === value;
  const normalized = value.replace(/\.0{3}Z$/, 'Z');
  return date.toISOString().replace(/\.0{3}Z$/, 'Z') === normalized;
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch { return false; }
}

function duplicateIds(records, field) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    const id = record?.[field];
    if (typeof id !== 'string' || !id) continue;
    if (seen.has(id) && !duplicates.includes(id)) duplicates.push(id);
    seen.add(id);
  }
  return duplicates;
}

function validateIdSequence(report, records, field, prefix) {
  const values = records.map((record) => record?.[field]);
  const expected = values.map((_, index) => `${prefix}${String(index + 1).padStart(3, '0')}`);
  if (values.some((value) => typeof value !== 'string' || !new RegExp(`^${prefix}\\d{3,}$`).test(value))) {
    addError(report, `invalid_${field}`, `${field} values must use ${prefix} followed by at least three digits`);
  } else if (values.some((value, index) => value !== expected[index])) {
    addError(report, `${field}_sequence`, `${field} values must be unique, ordered, and contiguous from ${prefix}001`, { expected, actual: values });
  }
}

function sameMembers(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function validateReportTags(report, reportText, claims) {
  if (typeof reportText !== 'string') return;
  const claimMap = new Map(claims.map((claim) => [claim?.claim_id, claim]));
  const tags = [];
  const tagPattern = /\{\{(SRC|SYN|INF):([A-Za-z][A-Za-z0-9_-]*)\|([^{}]+)\}\}/g;
  for (const match of reportText.matchAll(tagPattern)) tags.push({ type: match[1], claimId: match[2], payload: match[3], index: match.index });
  const counts = new Map();
  for (const tag of tags) {
    counts.set(tag.claimId, (counts.get(tag.claimId) ?? 0) + 1);
    const claim = claimMap.get(tag.claimId);
    if (!claim) { addError(report, 'orphan_claim_tag', `${tag.claimId} appears in the report but not claims.jsonl`, { claim_id: tag.claimId }); continue; }
    if (claim.claim_type !== tag.type) addError(report, 'claim_tag_type_mismatch', `${tag.claimId} is tagged ${tag.type} but ledger type is ${claim.claim_type}`, { claim_id: tag.claimId });
    if (tag.type === 'SRC') {
      const ids = tag.payload.split(',').map((value) => value.trim()).filter(Boolean);
      if (!sameMembers(ids, claim.evidence_ids)) addError(report, 'claim_tag_evidence_mismatch', `${tag.claimId} report evidence does not match claims.jsonl`, { claim_id: tag.claimId });
    } else if (tag.type === 'SYN') {
      const pairs = tag.payload.split(',').map((value) => value.trim()).filter(Boolean);
      const expected = (claim.components ?? []).map((component) => `${component.source_id}/${component.evidence_id}`);
      if (pairs.some((pair) => !/^S\d+\/E\d+$/.test(pair)) || !sameMembers(pairs, expected)) addError(report, 'claim_tag_evidence_mismatch', `${tag.claimId} SYN tag must match source/evidence components using S-ID/E-ID pairs`, { claim_id: tag.claimId });
    } else {
      const premiseMatch = tag.payload.match(/^P=([^|]+)\|R=(.+)$/);
      const ids = premiseMatch ? premiseMatch[1].split(',').map((value) => value.trim()).filter(Boolean) : [];
      if (!premiseMatch || !sameMembers(ids, claim.premise_claim_ids)) addError(report, 'claim_tag_premise_mismatch', `${tag.claimId} INF tag must name the ledger premises and a reasoning rule`, { claim_id: tag.claimId });
    }
  }
  for (const claim of claims) {
    if (claim?.claim_type === 'UNV') continue;
    const count = counts.get(claim?.claim_id) ?? 0;
    if (count === 0) addError(report, 'missing_claim_tag', `${claim?.claim_id ?? '<unknown>'} has no report tag`, { claim_id: claim?.claim_id ?? null });
    else if (count > 1) addError(report, 'duplicate_claim_tag', `${claim.claim_id} appears ${count} times in the report`, { claim_id: claim.claim_id, count });
  }
}

/**
 * Validate already-loaded v0.3 records and document snapshots.
 * @param {{sources: object[], evidence: object[], claims: object[], documents: Map<string,string>|object, reportText?: string}} bundle
 */
export function validateEvidenceBundle(bundle) {
  const sources = Array.isArray(bundle?.sources) ? bundle.sources : [];
  const evidence = Array.isArray(bundle?.evidence) ? bundle.evidence : [];
  const claims = Array.isArray(bundle?.claims) ? bundle.claims : [];
  const documents = bundle?.documents instanceof Map ? bundle.documents : new Map(Object.entries(bundle?.documents ?? {}));
  const report = {
    ok: true, pass: false, errors: [], warnings: [],
    duplicate_source_ids: duplicateIds(sources, 'source_id'),
    duplicate_evidence_ids: duplicateIds(evidence, 'evidence_id'),
    duplicate_claim_ids: duplicateIds(claims, 'claim_id'),
    verified_evidence_ids: [], verified_claim_ids: [],
    unclassified_factual_claims: [], weak_load_bearing: [], fail_verdicts: [],
    summary: { sources: sources.length, evidence: evidence.length, claims: claims.length },
  };

  if (sources.length === 0) addError(report, 'no_sources', 'at least one source is required');
  if (evidence.length === 0) addError(report, 'no_evidence', 'at least one evidence record is required');
  if (claims.length === 0) addError(report, 'no_claims', 'at least one claim record is required');

  for (const [kind, ids] of [['source', report.duplicate_source_ids], ['evidence', report.duplicate_evidence_ids], ['claim', report.duplicate_claim_ids]]) {
    for (const id of ids) addError(report, `duplicate_${kind}_id`, `duplicate ${kind} ID: ${id}`, { id });
  }
  validateIdSequence(report, sources, 'source_id', 'S');
  validateIdSequence(report, evidence, 'evidence_id', 'E');
  validateIdSequence(report, claims, 'claim_id', 'C');

  const sourceMap = new Map();
  for (const source of sources) {
    const id = source?.source_id;
    const missing = missingFields(source, SOURCE_FIELDS);
    if (missing.length) addError(report, 'source_missing_provenance', `${id ?? '<unknown>'} missing required provenance: ${missing.join(', ')}`, { source_id: id ?? null, fields: missing });
    if (typeof id === 'string' && !sourceMap.has(id)) sourceMap.set(id, source);
    if (!validHttpUrl(source?.canonical_url)) addError(report, 'invalid_canonical_url', `${id ?? '<unknown>'} has no valid canonical_url`, { source_id: id ?? null });
    if (!Number.isInteger(source?.credibility_tier) || source.credibility_tier < 1 || source.credibility_tier > 5) addError(report, 'invalid_credibility_tier', `${id ?? '<unknown>'} credibility_tier must be an integer from 1 to 5`, { source_id: id ?? null });
    if (!PEER_REVIEW_STATUSES.has(source?.peer_review_status)) addError(report, 'invalid_peer_review_status', `${id ?? '<unknown>'} peer_review_status is unknown or unsupported`, { source_id: id ?? null });
    for (const field of ['published_at', 'updated_at', 'retrieved_at']) {
      if (!validDate(source?.[field])) addError(report, 'invalid_source_date', `${id ?? '<unknown>'} ${field} must be a valid date`, { source_id: id ?? null, field });
    }
    if (!validSha(source?.snapshot_sha256)) addError(report, 'invalid_snapshot_hash', `${id ?? '<unknown>'} snapshot_sha256 must be 64 hex characters`, { source_id: id ?? null });
    const status = String(source?.retraction_status ?? '').toLowerCase();
    if (!['not_retracted', 'checked_not_retracted', 'none', 'clear'].includes(status)) addError(report, 'retracted_source', `${id ?? '<unknown>'} is retracted or has an unsafe retraction status`, { source_id: id ?? null, retraction_status: source?.retraction_status });
    const integrity = source?.integrity_check;
    if (!integrity || missingFields(integrity, ['checked_at', 'method', 'result']).length || !validDate(integrity?.checked_at)) addError(report, 'invalid_integrity_check', `${id ?? '<unknown>'} integrity_check requires a valid checked_at, method, and result`, { source_id: id ?? null });
    else if (!['pass', 'passed', 'ok', 'clear'].includes(String(integrity.result).toLowerCase())) addError(report, 'failed_integrity_check', `${id ?? '<unknown>'} integrity check did not pass`, { source_id: id ?? null });
    const landing = integrity?.landing_url;
    if (!landing || landing.resolved !== true || !validDate(landing.checked_at) || !Number.isInteger(landing.status_code) || landing.status_code < 200 || landing.status_code >= 400 || !validHttpUrl(landing.final_url)) {
      addError(report, 'broken_landing_url', `${id ?? '<unknown>'} requires a successful, dated landing-URL check`, { source_id: id ?? null });
    }
    const doc = documents.get(id);
    if (typeof doc !== 'string') addError(report, 'missing_snapshot_document', `documents/${id}.txt is missing`, { source_id: id ?? null });
    else if (validSha(source?.snapshot_sha256) && sha256(doc) !== source.snapshot_sha256.toLowerCase()) addError(report, 'snapshot_hash_mismatch', `${id} snapshot hash does not match documents/${id}.txt`, { source_id: id });
  }

  const evidenceMap = new Map();
  const verifiedEvidence = new Set();
  for (const item of evidence) {
    const id = item?.evidence_id;
    // Context may legitimately be empty at the start/end of a snapshot, but
    // the fields must still be present to make that boundary explicit.
    const missing = missingFields(item, EVIDENCE_FIELDS.filter((field) => !['context_before', 'context_after'].includes(field)));
    for (const field of ['context_before', 'context_after']) {
      if (!Object.prototype.hasOwnProperty.call(item ?? {}, field) || typeof item[field] !== 'string') missing.push(field);
    }
    let valid = true;
    if (missing.length) { addError(report, 'evidence_missing_fields', `${id ?? '<unknown>'} missing required evidence fields: ${missing.join(', ')}`, { evidence_id: id ?? null, fields: missing }); valid = false; }
    if (typeof id === 'string' && !evidenceMap.has(id)) evidenceMap.set(id, item);
    const type = String(item?.provenance_type ?? '').toLowerCase();
    if (FORBIDDEN_PROVENANCE_TYPES.includes(type) || !ALLOWED_PROVENANCE_TYPES.includes(type)) { addError(report, 'invalid_evidence_provenance', `${id ?? '<unknown>'} provenance_type '${type}' cannot be evidence`, { evidence_id: id ?? null }); valid = false; }
    const source = sourceMap.get(item?.source_id);
    if (!source) { addError(report, 'evidence_missing_source', `${id ?? '<unknown>'} references missing source ${item?.source_id ?? '<none>'}`, { evidence_id: id ?? null }); valid = false; }
    const doc = documents.get(item?.source_id);
    if (typeof doc !== 'string') valid = false;
    else {
      const digest = sha256(doc);
      if (!validSha(item?.document_sha256) || item.document_sha256.toLowerCase() !== digest) { addError(report, 'evidence_hash_mismatch', `${id ?? '<unknown>'} document_sha256 does not match its snapshot`, { evidence_id: id ?? null }); valid = false; }
      if (typeof item?.exact_text !== 'string' || !doc.includes(item.exact_text)) { addError(report, 'evidence_not_exact_substring', `${id ?? '<unknown>'} exact_text is not an exact substring of documents/${item?.source_id}.txt`, { evidence_id: id ?? null }); valid = false; }
      if (source && String(item?.exact_text ?? '').trim() === String(source.title ?? '').trim()) { addError(report, 'title_only_support', `${id ?? '<unknown>'} uses only the source title`, { evidence_id: id ?? null }); valid = false; }
      const evidenceAt = typeof item?.exact_text === 'string' ? doc.indexOf(item.exact_text) : -1;
      if (evidenceAt >= 0) {
        const before = doc.slice(0, evidenceAt);
        const after = doc.slice(evidenceAt + item.exact_text.length);
        if (item.context_before && !before.includes(item.context_before)) { addError(report, 'context_mismatch', `${id ?? '<unknown>'} context_before does not occur before the evidence span`, { evidence_id: id ?? null }); valid = false; }
        if (item.context_after && !after.includes(item.context_after)) { addError(report, 'context_mismatch', `${id ?? '<unknown>'} context_after does not occur after the evidence span`, { evidence_id: id ?? null }); valid = false; }
      }
      if (!(typeof item?.locator === 'string' && item.locator.trim()) && !(item?.locator && typeof item.locator === 'object' && Object.keys(item.locator).some((key) => item.locator[key] !== null && item.locator[key] !== ''))) {
        addError(report, 'invalid_locator', `${id ?? '<unknown>'} locator must identify a page, section, or paragraph`, { evidence_id: id ?? null }); valid = false;
      }
    }
    if (valid && typeof id === 'string' && !report.duplicate_evidence_ids.includes(id)) verifiedEvidence.add(id);
  }
  report.verified_evidence_ids = [...verifiedEvidence];

  const claimMap = new Map();
  for (const claim of claims) if (typeof claim?.claim_id === 'string' && !claimMap.has(claim.claim_id)) claimMap.set(claim.claim_id, claim);
  const structurallyValid = new Set();
  for (const claim of claims) {
    const id = claim?.claim_id;
    const missing = missingFields(claim, CLAIM_FIELDS);
    let valid = true;
    if (missing.length) { addError(report, 'claim_missing_fields', `${id ?? '<unknown>'} missing required claim fields: ${missing.join(', ')}`, { claim_id: id ?? null, fields: missing }); valid = false; }
    if (!CLAIM_TYPES.includes(claim?.claim_type)) { addError(report, 'invalid_claim_type', `${id ?? '<unknown>'} has invalid claim_type`, { claim_id: id ?? null }); valid = false; }
    if (!['PASS', 'WEAK', 'FAIL'].includes(claim?.verdict)) { addError(report, 'invalid_claim_verdict', `${id ?? '<unknown>'} has invalid verdict`, { claim_id: id ?? null }); valid = false; }
    for (const field of ['load_bearing', 'final_finding', 'classified_factual']) {
      if (typeof claim?.[field] !== 'boolean') { addError(report, 'invalid_claim_boolean', `${id ?? '<unknown>'} ${field} must be boolean`, { claim_id: id ?? null, field }); valid = false; }
    }
    if (claim?.verdict === 'FAIL') { report.fail_verdicts.push(id); addError(report, 'fail_verdict', `${id ?? '<unknown>'} has verdict FAIL`, { claim_id: id ?? null }); valid = false; }
    if (claim?.classified_factual !== true) { report.unclassified_factual_claims.push(id); addError(report, 'unclassified_factual_claim', `${id ?? '<unknown>'} is not classified as factual`, { claim_id: id ?? null }); valid = false; }
    if (claim?.load_bearing === true && claim?.verdict !== 'PASS') { report.weak_load_bearing.push(id); addError(report, 'weak_load_bearing', `${id ?? '<unknown>'} is load-bearing but not PASS`, { claim_id: id ?? null }); valid = false; }
    if (claim?.verdict === 'WEAK' && !WEAK_DISPOSITIONS.has(claim?.disposition)) { addError(report, 'weak_claim_without_disposition', `${id ?? '<unknown>'} must be removed, moved to limitations, or explicitly caveated`, { claim_id: id ?? null }); valid = false; }
    if (claim?.claim_type === 'UNV' && claim?.final_finding === true) { addError(report, 'unverified_final_finding', `${id ?? '<unknown>'} is UNV and cannot be a final finding`, { claim_id: id ?? null }); valid = false; }
    if (claim?.claim_type === 'SRC') {
      if (!Array.isArray(claim.evidence_ids) || claim.evidence_ids.length === 0 || claim.evidence_ids.some((e) => !verifiedEvidence.has(e))) { addError(report, 'src_unverified_evidence', `${id ?? '<unknown>'} must reference verified evidence IDs`, { claim_id: id ?? null }); valid = false; }
    } else if (claim?.claim_type === 'SYN') {
      if (!Array.isArray(claim.components) || claim.components.length < 2) { addError(report, 'syn_missing_components', `${id ?? '<unknown>'} requires at least two source components`, { claim_id: id ?? null }); valid = false; }
      else {
        const pairs = claim.components.map((component) => `${component?.source_id}/${component?.evidence_id}`);
        const sourceIds = claim.components.map((component) => component?.source_id);
        if (new Set(pairs).size !== pairs.length || new Set(sourceIds).size < 2) { addError(report, 'syn_not_independent', `${id ?? '<unknown>'} requires distinct evidence from at least two sources`, { claim_id: id ?? null }); valid = false; }
        for (const component of claim.components) {
          const item = evidenceMap.get(component?.evidence_id);
          if (!component?.source_id || !component?.contribution || !verifiedEvidence.has(component?.evidence_id) || item?.source_id !== component.source_id) { addError(report, 'syn_invalid_component', `${id ?? '<unknown>'} has a component without verified evidence from its named source`, { claim_id: id ?? null, component }); valid = false; }
        }
      }
    }
    const contributingEvidence = claim?.claim_type === 'SRC'
      ? (claim.evidence_ids ?? []).map((evidenceId) => evidenceMap.get(evidenceId)).filter(Boolean)
      : claim?.claim_type === 'SYN'
        ? (claim.components ?? []).map((component) => evidenceMap.get(component?.evidence_id)).filter(Boolean)
        : [];
    if (claim?.load_bearing === true && contributingEvidence.some((item) => item.provenance_type === 'publisher_abstract')) {
      addError(report, 'load_bearing_abstract_only', `${id ?? '<unknown>'} is load-bearing and requires full-text or primary-document evidence`, { claim_id: id ?? null }); valid = false;
    }
    if (String(claim?.confidence).toUpperCase() === 'HIGH' && contributingEvidence.length > 0) {
      const supportingSources = contributingEvidence.map((item) => sourceMap.get(item.source_id)).filter(Boolean);
      if (contributingEvidence.every((item) => item.provenance_type === 'publisher_abstract')) {
        addError(report, 'abstract_only_high_confidence', `${id ?? '<unknown>'} relies only on abstracts and cannot exceed MODERATE confidence`, { claim_id: id ?? null }); valid = false;
      }
      if (!supportingSources.some((source) => ['peer_reviewed', 'primary_source'].includes(source.peer_review_status))) {
        addError(report, 'high_confidence_without_strong_source', `${id ?? '<unknown>'} lacks peer-reviewed or primary-source support for HIGH confidence`, { claim_id: id ?? null }); valid = false;
      }
    }
    // INF dependencies are resolved below, after all non-INF claims.
    if (valid && ['SRC', 'SYN'].includes(claim?.claim_type) && claim?.verdict === 'PASS' && typeof id === 'string' && !report.duplicate_claim_ids.includes(id)) structurallyValid.add(id);
  }

  // Resolve INF claims to a fixed point; this permits forward references while
  // rejecting missing, weak, failed, or cyclic premise chains.
  let changed = true;
  while (changed) {
    changed = false;
    for (const claim of claims) {
      if (claim?.claim_type !== 'INF' || structurallyValid.has(claim?.claim_id) || claim?.verdict !== 'PASS') continue;
      if (Array.isArray(claim.premise_claim_ids) && claim.premise_claim_ids.length > 0 && claim.premise_claim_ids.every((id) => structurallyValid.has(id))) {
        structurallyValid.add(claim.claim_id); changed = true;
      }
    }
  }
  for (const claim of claims) {
    if (claim?.claim_type === 'INF' && !structurallyValid.has(claim?.claim_id)) addError(report, 'inf_unverified_premise', `${claim?.claim_id ?? '<unknown>'} must reference verified PASS claim IDs`, { claim_id: claim?.claim_id ?? null });
  }
  validateReportTags(report, bundle?.reportText, claims);
  report.verified_claim_ids = [...structurallyValid];
  report.summary = { ...report.summary, fail: report.fail_verdicts.length, unclassified_factual_claims: report.unclassified_factual_claims.length, weak_load_bearing: report.weak_load_bearing.length, errors: report.errors.length, warnings: report.warnings.length };
  report.pass = report.errors.length === 0 && report.summary.fail === 0 && report.summary.unclassified_factual_claims === 0 && report.summary.weak_load_bearing === 0;
  return report;
}

/** Validate the v0.3 manifest files and per-source document snapshots. */
export function validateEvidenceRun(runDir) {
  const paths = { sources: join(runDir, 'sources.json'), evidence: join(runDir, 'evidence.jsonl'), claims: join(runDir, 'claims.jsonl') };
  const missing = Object.entries(paths).filter(([, path]) => !existsSync(path)).map(([name]) => name);
  for (const file of ['report.tagged.md', 'claim-coverage.json', 'coverage.json']) if (!existsSync(join(runDir, file))) missing.push(file);
  if (missing.length) return { ok: false, pass: false, errors: missing.map((name) => ({ code: 'missing_file', message: `${name} file is missing` })), warnings: [], summary: { errors: missing.length, warnings: 0 } };
  const sourceResult = parseJsonRecords(readFileSync(paths.sources, 'utf8'), 'sources.json');
  const evidenceResult = parseJsonlRecords(readFileSync(paths.evidence, 'utf8'), 'evidence.jsonl');
  const claimResult = parseJsonlRecords(readFileSync(paths.claims, 'utf8'), 'claims.jsonl');
  const parseErrors = [sourceResult.error, ...evidenceResult.errors, ...claimResult.errors].filter(Boolean);
  if (parseErrors.length) return { ok: false, pass: false, errors: parseErrors.map((message) => ({ code: 'parse_error', message })), warnings: [], summary: { errors: parseErrors.length, warnings: 0 } };
  const documents = new Map();
  const sourceById = new Map(sourceResult.records.map((source) => [source?.source_id, source]));
  const evidenceById = new Map(evidenceResult.records.map((item) => [item?.evidence_id, item]));
  const claimById = new Map(claimResult.records.map((claim) => [claim?.claim_id, claim]));
  for (const source of sourceResult.records) {
    const id = source?.source_id;
    const path = join(runDir, 'documents', `${id}.txt`);
    if (typeof id === 'string' && existsSync(path)) documents.set(id, readFileSync(path, 'utf8'));
  }
  const taggedReportPath = join(runDir, 'report.tagged.md');
  const reportText = existsSync(taggedReportPath) ? readFileSync(taggedReportPath, 'utf8') : undefined;
  const report = validateEvidenceBundle({ sources: sourceResult.records, evidence: evidenceResult.records, claims: claimResult.records, documents, reportText });
  try {
    const coverage = JSON.parse(readFileSync(join(runDir, 'claim-coverage.json'), 'utf8'));
    if (coverage.completed !== true || typeof coverage.reviewer_model !== 'string' || !coverage.reviewer_model || !Array.isArray(coverage.untagged_claims) || coverage.untagged_claims.length !== 0 || coverage.tagged_report_sha256 !== sha256(reportText ?? '')) {
      addError(report, 'claim_coverage_failed', 'claim-coverage.json must record a completed independent review, zero untagged claims, and the tagged-report hash');
    }
  } catch (error) { addError(report, 'claim_coverage_failed', `cannot validate claim-coverage.json: ${error.message}`); }
  try {
    const coverage = JSON.parse(readFileSync(join(runDir, 'coverage.json'), 'utf8'));
    const questions = coverage.core_questions;
    const dimensions = coverage.dimensions;
    const dimensionsComplete = dimensions && ['source_type', 'year', 'geography', 'language', 'method'].every((key) => Array.isArray(dimensions[key]));
    const searchesComplete = Array.isArray(questions) && questions.length > 0 && questions.every((question) =>
      Array.isArray(question.independent_queries) && question.independent_queries.length >= 2 &&
      Array.isArray(question.counter_queries) && question.counter_queries.length >= 1 &&
      question.backward_citation_chase === true && question.forward_citation_chase === true);
    if (coverage.completed !== true || !dimensionsComplete || !searchesComplete) addError(report, 'research_coverage_failed', 'coverage.json must document two independent searches, a counterquery, backward/forward citation chasing, and coverage dimensions for every core question');
  } catch (error) { addError(report, 'research_coverage_failed', `cannot validate coverage.json: ${error.message}`); }
  try {
    const manifest = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'));
    const artifactPath = resolve(runDir, String(manifest.artifact ?? ''));
    const artifactRelative = relative(resolve(runDir), artifactPath);
    if (!manifest.artifact || artifactRelative.startsWith('..') || isAbsolute(artifactRelative) || !existsSync(artifactPath)) throw new Error('declared rendered artifact is missing or outside the run');
    const renderedText = readFileSync(artifactPath, 'utf8');
    const render = JSON.parse(readFileSync(join(runDir, 'render-manifest.json'), 'utf8'));
    const expectedClaims = claimResult.records.filter((claim) => claim.claim_type !== 'UNV').map((claim) => claim.claim_id).sort();
    const renderedClaims = Array.isArray(render.claim_ids) ? [...render.claim_ids].sort() : [];
    if (render.tagged_report_sha256 !== sha256(reportText ?? '') || render.artifact_sha256 !== sha256(renderedText) || !sameMembers(renderedClaims, expectedClaims) || render?.semantic_review?.completed !== true || typeof render?.semantic_review?.reviewer_model !== 'string' || !render.semantic_review.reviewer_model || !Array.isArray(render.semantic_review.changed_claim_ids) || render.semantic_review.changed_claim_ids.length !== 0) {
      addError(report, 'render_binding_failed', 'render-manifest.json must bind tagged and rendered hashes, all claim IDs, and a completed independent zero-change semantic review');
    }
    if (manifest.run_type === 'selfinvestigate') {
      const legal = JSON.parse(readFileSync(join(runDir, 'legal-risk.json'), 'utf8'));
      const finalClaims = claimResult.records.filter((claim) => claim.final_finding === true);
      const reviewedIds = new Set((legal.reviewed_claims ?? []).map((review) => review?.claim_id));
      const evidenceForClaim = (claim, seen = new Set()) => {
        if (!claim || seen.has(claim.claim_id)) return [];
        const nextSeen = new Set(seen).add(claim.claim_id);
        if (claim.claim_type === 'SRC') return (claim.evidence_ids ?? []).map((e) => evidenceById.get(e)).filter(Boolean);
        if (claim.claim_type === 'SYN') return (claim.components ?? []).map((component) => evidenceById.get(component.evidence_id)).filter(Boolean);
        if (claim.claim_type === 'INF') return (claim.premise_claim_ids ?? []).flatMap((id) => evidenceForClaim(claimById.get(id), nextSeen));
        return [];
      };
      const reviewsValid = Array.isArray(legal.reviewed_claims) && legal.reviewed_claims.length > 0 && legal.reviewed_claims.every((review) => {
        const claim = claimResult.records.find((item) => item.claim_id === review?.claim_id);
        if (!claim || !Array.isArray(review.checks) || review.checks.length === 0) return false;
        const items = evidenceForClaim(claim);
        const hasPrimaryRecord = items.some((item) => ['primary_document', 'filing', 'transcript'].includes(item.provenance_type));
        const credibleSources = new Set(items.map((item) => sourceById.get(item.source_id)).filter((source) => source && source.credibility_tier <= 3).map((source) => source.source_id));
        return hasPrimaryRecord || credibleSources.size >= 2;
      });
      const allFindingsReviewed = finalClaims.length > 0 && finalClaims.every((claim) => reviewedIds.has(claim.claim_id));
      if (legal.completed !== true || typeof legal.scope !== 'string' || !legal.scope || !reviewsValid || !allFindingsReviewed || !Array.isArray(legal.unresolved_high_risk_claims) || legal.unresolved_high_risk_claims.length !== 0) addError(report, 'legal_risk_failed', 'legal-risk.json must review every final finding, record checks, establish primary-record or two-source support, and leave no unresolved high-risk claims');
    }
  } catch (error) {
    if (existsSync(join(runDir, 'run.json'))) addError(report, 'render_or_legal_risk_failed', `cannot validate render/investigation records: ${error.message}`);
  }
  report.summary = { ...report.summary, errors: report.errors.length, warnings: report.warnings.length };
  report.pass = report.errors.length === 0 && report.summary.fail === 0 && report.summary.unclassified_factual_claims === 0 && report.summary.weak_load_bearing === 0;
  return report;
}
