import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';

export const CURRENT_SCHEMA_VERSION = 3;

const LEDGER_BASENAMES = new Set([
  'log.md', 'rubric.md', 'learnings.md', 'summary.md', 'skill.md', 'readme.md',
]);
const SHA256_RE = /^[a-f0-9]{64}$/i;

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function parseJson(text) {
  if (text == null) return { value: null, malformed: false };
  try { return { value: JSON.parse(text), malformed: false }; }
  catch { return { value: null, malformed: true }; }
}

function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function displayPath(root, path) { return path ? relative(root, path).replaceAll('\\', '/') : null; }
function internalPath(root, path) { return isAbsolute(path) ? resolve(path) : resolve(root, path); }
function safeRunPath(root, path) {
  if (typeof path !== 'string' || !path.trim() || isAbsolute(path)) return null;
  const candidate = resolve(root, path);
  const rel = relative(root, candidate);
  return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? candidate : null;
}
function lineCount(text) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}
function integer(v) { return /^\d+$/.test(String(v ?? '')) ? Number(v) : null; }
function number(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/^\+/, ''));
  return Number.isFinite(n) ? n : null;
}

/** Parse a TSV without silently padding or truncating malformed rows. */
export function parseResultsTsv(text) {
  if (!text) return null;
  const physical = String(text).split(/\r?\n/);
  while (physical.length && physical.at(-1) === '') physical.pop();
  let schemaVersion = null;
  let i = 0;
  while (i < physical.length && physical[i].startsWith('#')) {
    const match = physical[i].match(/^#\s*schema_version:\s*(\d+)\s*$/i);
    if (match) schemaVersion = Number(match[1]);
    i++;
  }
  if (i >= physical.length) return { columns: [], rows: [], schemaVersion, widthErrors: [] };
  const columns = physical[i].split('\t').map((cell) => cell.trim());
  const rows = [];
  const widthErrors = [];
  for (i += 1; i < physical.length; i++) {
    if (physical[i].trim() === '') continue;
    const cells = physical[i].split('\t');
    if (cells.length !== columns.length) {
      widthErrors.push({ line: i + 1, expected: columns.length, actual: cells.length });
      continue;
    }
    rows.push(Object.fromEntries(columns.map((column, index) => [column, cells[index].trim()])));
  }
  return { columns, rows, schemaVersion, widthErrors };
}

export function detectSchema(columns) {
  if (!columns?.length) return 'unknown';
  if (columns.some((c) => c.startsWith('synonym_'))) return 'legacy-synonym';
  if (columns[0] === 'cycle') return 'state-json';
  if (columns[0] === 'iteration') return 'standard';
  return 'unknown';
}

function manifestFile(manifest, kind, fallback = null) {
  const entry = manifest?.[kind] ?? manifest?.files?.[kind];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.path === 'string') return entry.path;
  if (kind === 'artifact' && typeof manifest?.artifact_path === 'string') return manifest.artifact_path;
  if (kind === 'ledger' && typeof manifest?.ledger_path === 'string') return manifest.ledger_path;
  return fallback;
}

function manifestHash(manifest, kind, path) {
  const entry = manifest?.[kind] ?? manifest?.files?.[kind];
  if (entry && typeof entry === 'object' && typeof entry.sha256 === 'string') return entry.sha256;
  const hashes = manifest?.hashes;
  if (hashes && typeof hashes === 'object') {
    const candidate = hashes[kind] ?? hashes[path] ?? hashes[path?.replaceAll('\\', '/')];
    if (typeof candidate === 'string') return candidate;
    if (candidate && typeof candidate.sha256 === 'string') return candidate.sha256;
  }
  const direct = manifest?.[`${kind}_sha256`];
  return typeof direct === 'string' ? direct : null;
}

function evidenceRequired(manifest) {
  return ['selfresearch', 'selfinvestigate'].includes(manifest?.run_type) ||
    (manifest?.run_type === 'selfwrite' && manifest?.release_gates?.research_required === true);
}

export function resolveArtifact(runDir, state, explicit, manifest = null) {
  const root = resolve(runDir);
  if (explicit) {
    const path = internalPath(root, explicit);
    return existsSync(path) ? path : null;
  }
  const declared = manifestFile(manifest, 'artifact') ?? (typeof state?.artifact === 'string' ? state.artifact : null);
  if (declared) {
    const path = internalPath(root, declared);
    if (existsSync(path)) return path;
  }
  const versionsDir = join(root, 'versions');
  if (existsSync(versionsDir)) {
    const versioned = readdirSync(versionsDir).filter((f) => /^v\d+.*\.md$/i.test(f))
      .map((f) => ({ f, n: Number(f.match(/^v(\d+)/i)?.[1] ?? -1) })).sort((a, b) => b.n - a.n);
    if (versioned.length) return join(versionsDir, versioned[0].f);
  }
  const rootMds = readdirSync(root).filter((f) => f.toLowerCase().endsWith('.md') &&
    !LEDGER_BASENAMES.has(f.toLowerCase()) && !f.toLowerCase().includes('backup') && statSync(join(root, f)).isFile());
  if (rootMds.includes('report.md')) return join(root, 'report.md');
  return rootMds.length === 1 ? join(root, rootMds[0]) : null;
}

function legacyCheck(root, opts, manifestInfo, stateInfo) {
  const checks = [];
  const add = (id, message, extra = {}) => checks.push({ id, level: 'warn', message, ...extra });
  const results = parseResultsTsv(readIfExists(join(root, 'results.tsv')));
  const state = stateInfo.value;
  const columns = results?.columns ?? [];
  const rows = results?.rows ?? [];
  const schema = detectSchema(columns);
  if (!results) add('results_missing', 'results.tsv not found');
  if (manifestInfo.malformed) add('manifest_malformed', 'run.json is malformed');
  if (stateInfo.malformed) add('state_malformed', 'state.json is malformed');
  const iter = columns[0];
  const values = rows.map((row) => integer(row[iter]));
  if (values.some((value) => value === null) || new Set(values).size !== values.length) add('iteration_sequence', 'iteration values must be unique integers');
  const artifactPath = resolveArtifact(root, state, opts.artifact, manifestInfo.value);
  const loggedLines = rows.length && columns.includes('total_lines') ? number(rows.at(-1).total_lines) : number(state?.artifact_line_count ?? state?.skill_line_count);
  const actualLines = artifactPath ? lineCount(readIfExists(artifactPath)) : null;
  if (loggedLines !== null && actualLines !== null && loggedLines !== actualLines) add('artifact_line_drift', `artifact ${basename(artifactPath)} is ${actualLines} lines but the last logged count is ${loggedLines}`, { expected: loggedLines, actual: actualLines });
  if (results && results.schemaVersion == null) add('schema_version_missing', 'no schema_version stamp found');
  return {
    ok: true, valid: true, legacy: true, schema, schema_version: results?.schemaVersion ?? state?.schema_version ?? null,
    artifact: displayPath(root, artifactPath), artifact_lines: actualLines, checks,
    summary: { errors: 0, warns: checks.length }, evidence_required: false,
  };
}

/** Strict schema-v3 validation. Pass opts.legacy to inspect historical runs. */
export function checkRunConsistency(runDir, opts = {}) {
  const root = resolve(String(runDir ?? ''));
  if (!runDir || !existsSync(root)) return { ok: false, error: `run directory not found: ${runDir}`, valid: false, checks: [], summary: { errors: 0, warns: 0 } };
  const manifestInfo = parseJson(readIfExists(join(root, 'run.json')));
  const stateInfo = parseJson(readIfExists(join(root, 'state.json')));
  if (opts.legacy === true) return legacyCheck(root, opts, manifestInfo, stateInfo);

  const checks = [];
  const add = (id, message, extra = {}) => checks.push({ id, level: 'error', message, ...extra });
  const manifest = manifestInfo.value;
  if (!manifest && !manifestInfo.malformed) add('manifest_missing', 'run.json manifest is required for schema v3');
  if (manifestInfo.malformed) add('manifest_malformed', 'run.json is not valid JSON');
  if (manifest && manifest.schema_version !== CURRENT_SCHEMA_VERSION) add('schema_version', `run.json schema_version must be ${CURRENT_SCHEMA_VERSION}`, { expected: CURRENT_SCHEMA_VERSION, actual: manifest.schema_version ?? null });
  if (stateInfo.malformed) add('state_malformed', 'state.json is not valid JSON');
  if (manifest) {
    if (!['selfwrite', 'selfresearch', 'selfinvestigate'].includes(manifest.run_type)) add('run_type', 'run_type must be selfwrite, selfresearch, or selfinvestigate');
    if (typeof manifest.prompt_commit !== 'string' || !/^[0-9a-f]{7,40}$/i.test(manifest.prompt_commit)) add('prompt_commit', 'prompt_commit must be a 7–40 character Git SHA');
    if (typeof manifest.artifact !== 'string' || !manifest.artifact.trim()) add('artifact_path', 'artifact must be a non-empty relative path');
    if (!['general', 'default', 'expert'].includes(manifest.audience)) add('audience', 'audience must be general, default, or expert');
    if (!['running', 'failed', 'releasable'].includes(manifest.status)) add('status', 'status must be running, failed, or releasable');
    if (!manifest.release_gates || typeof manifest.release_gates !== 'object' || Array.isArray(manifest.release_gates)) add('release_gates', 'release_gates must be an object');
    else if (manifest.status === 'releasable') {
      const requiredGates = ['integrity_pass', 'evidence_pass', 'quality_pass'];
      for (const gate of requiredGates) if (manifest.release_gates[gate] !== true) add('release_gate_missing', `releasable runs require release_gates.${gate}=true`, { gate });
    }
  }

  const state = stateInfo.value;
  const ledgerRel = manifestFile(manifest, 'ledger', 'results.tsv');
  const ledgerPath = safeRunPath(root, ledgerRel);
  if (!ledgerPath) add('ledger_path', 'ledger must be a relative path inside the run directory');
  const ledgerText = ledgerPath ? readIfExists(ledgerPath) : null;
  const results = parseResultsTsv(ledgerText);
  if (ledgerText === null) add('ledger_missing', `ledger not found: ${ledgerRel}`);
  const columns = results?.columns ?? [];
  const rows = results?.rows ?? [];
  const schema = detectSchema(columns);
  if (results && results.schemaVersion !== CURRENT_SCHEMA_VERSION) add('ledger_schema_version', `ledger schema_version must be ${CURRENT_SCHEMA_VERSION}`, { expected: CURRENT_SCHEMA_VERSION, actual: results.schemaVersion });
  if (results && schema === 'unknown') add('unknown_schema', 'ledger header is not a recognized current schema');
  if (results && columns[0] !== 'iteration') add('unknown_schema', 'schema-v3 ledger must begin with iteration');
  for (const mismatch of results?.widthErrors ?? []) add('tsv_width', `ledger line ${mismatch.line} has ${mismatch.actual} fields; expected ${mismatch.expected}`, mismatch);

  const iterCol = columns.includes('iteration') ? 'iteration' : columns.includes('cycle') ? 'cycle' : null;
  if (results && !iterCol) add('iteration_column_missing', 'ledger requires an iteration or cycle column');
  if (iterCol) {
    const values = rows.map((row) => integer(row[iterCol]));
    if (values.some((value) => value === null)) add('iteration_not_integer', `${iterCol} values must be non-negative integers`);
    else {
      if (new Set(values).size !== values.length) add('iteration_duplicate', `${iterCol} values must be unique`);
      const contiguous = values.every((value, index) => value === index);
      if (!contiguous) add('iteration_gaps', `${iterCol} values must be ordered and contiguous from 0`, { expected: `0..${values.length - 1}`, actual: values.join(', ') });
    }
  }

  const artifactRel = manifestFile(manifest, 'artifact');
  let declaredArtifactPath = null;
  if (artifactRel) {
    declaredArtifactPath = safeRunPath(root, artifactRel);
    if (!declaredArtifactPath) {
      add('artifact_path', 'artifact must be a relative path inside the run directory');
    }
  }
  const artifactPath = artifactRel ? declaredArtifactPath : resolveArtifact(root, state, opts.artifact, manifest);
  const artifactText = artifactPath ? readIfExists(artifactPath) : null;
  if (!artifactRel && !opts.artifact) add('artifact_undeclared', 'run.json must declare the artifact path');
  if (artifactText === null) add('artifact_missing', `artifact not found${artifactRel ? `: ${artifactRel}` : ''}`);

  const evidenceFiles = ['sources.json', 'evidence.jsonl', 'claims.jsonl'];
  const hasAnyEvidenceFile = evidenceFiles.some((file) => existsSync(join(root, file)));
  const needsEvidence = evidenceRequired(manifest) || hasAnyEvidenceFile;
  if (needsEvidence) {
    for (const file of evidenceFiles) {
      if (!existsSync(join(root, file))) add('evidence_file_missing', `${file} is required for ${manifest?.run_type}`, { file });
    }
    if (!existsSync(join(root, 'documents')) || !statSync(join(root, 'documents')).isDirectory()) add('evidence_documents_missing', `documents/ is required for ${manifest?.run_type}`);
    if (!existsSync(join(root, 'report.tagged.md'))) add('tagged_report_missing', 'report.tagged.md is required for evidence-bearing runs');
  }
  const actualArtifactHash = artifactText === null ? null : sha256(artifactText);
  const artifactHashes = ['artifact_sha256', 'verified_artifact_sha256', 'scored_artifact_sha256'];
  const requiredHashFields = manifest?.status === 'releasable'
    ? artifactHashes
    : rows.length > 0
      ? ['artifact_sha256']
      : [];
  for (const field of requiredHashFields) {
    const expected = manifest?.[field];
    if (!SHA256_RE.test(expected ?? '')) add('hash_missing', `run.json ${field} must be a sha256`, { field });
  }
  if (actualArtifactHash && SHA256_RE.test(manifest?.artifact_sha256 ?? '') && manifest.artifact_sha256.toLowerCase() !== actualArtifactHash) {
    add('hash_mismatch', 'artifact_sha256 does not match the artifact', { field: 'artifact_sha256', expected: manifest.artifact_sha256, actual: actualArtifactHash });
  }
  if (manifest?.status === 'releasable') {
    const normalized = artifactHashes.map((field) => String(manifest?.[field] ?? '').toLowerCase());
    if (new Set(normalized).size !== 1 || (actualArtifactHash && normalized[0] !== actualArtifactHash)) {
      add('release_hash_mismatch', 'releasable runs require artifact, verified, and scored hashes to be identical and match the artifact');
    }
  }

  const current = integer(state?.current_iteration ?? state?.current_cycle);
  if (current !== null && rows.length && current !== rows.length && current !== rows.at(-1)?.[iterCol]) add('cycle_row_mismatch', `state cursor ${current} does not match ledger`, { expected: current, actual: rows.length });
  const errors = checks.length;
  return {
    ok: true, valid: errors === 0, legacy: false, schema, schema_version: manifest?.schema_version ?? null,
    artifact: displayPath(root, artifactPath), artifact_lines: artifactText === null ? null : lineCount(artifactText),
    run_type: manifest?.run_type ?? null, status: manifest?.status ?? null, audience: manifest?.audience ?? null,
    ledger: displayPath(root, ledgerPath), evidence_required: needsEvidence, checks, summary: { errors, warns: 0 },
  };
}

export function preflightCheck(runDir, opts = {}) {
  const consistency = checkRunConsistency(runDir, opts);
  if (!consistency.ok) return consistency;
  const root = resolve(String(runDir));
  const manifest = parseJson(readIfExists(join(root, 'run.json'))).value;
  const state = parseJson(readIfExists(join(root, 'state.json'))).value;
  const artifactPath = consistency.artifact ? internalPath(root, consistency.artifact) : null;
  if (!artifactPath || !existsSync(artifactPath)) return { ok: false, error: 'could not resolve the run artifact', valid: false };
  const text = readIfExists(artifactPath) ?? '';
  const actualSha = sha256(text);
  const expectedSha = opts.legacy ? state?.artifact_sha256 ?? null : manifestHash(manifest, 'artifact', consistency.artifact);
  const actualLines = lineCount(text);
  const expectedLines = number(state?.artifact_line_count ?? state?.skill_line_count);
  const mismatches = [];
  if (expectedLines !== null && expectedLines !== actualLines) mismatches.push(`line count ${actualLines} != logged ${expectedLines}`);
  if (expectedSha && expectedSha.toLowerCase() !== actualSha) mismatches.push('content hash differs from logged artifact sha256');
  return {
    ok: true, valid: consistency.valid && mismatches.length === 0, unverifiable: !expectedSha,
    artifact: consistency.artifact, expected_lines: expectedLines, actual_lines: actualLines,
    expected_sha256: expectedSha, actual_sha256: actualSha, mismatches,
  };
}
