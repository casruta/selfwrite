import { createHash } from 'node:crypto';

export const JUDGMENT_SCHEMA_VERSION = 1;
export const BENCHMARK_THRESHOLDS = Object.freeze({ win_rate: 0.65, loss_rate: 0.15, kappa: 0.60 });

const SHA256_RE = /^[a-f0-9]{64}$/;
const BLIND_PREFERENCES = new Set(['A', 'B', 'TIE']);
const OUTCOMES = new Set(['candidate', 'incumbent', 'tie']);

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

/** JSON serialization with recursively sorted object keys. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutHash(record) {
  const { submission_sha256: _ignored, ...body } = record;
  return body;
}

export function submissionHash(submission) {
  return sha256(stableStringify(withoutHash(submission)));
}

/**
 * Produce reproducible, independently randomized blind packages.
 * Store the seed only in the revealed audit record, never in the judge package.
 */
export function createRandomizedSubmissions({ candidate_sha256, incumbent_sha256, rubric_sha256, seed, judge_ids = ['judge-1', 'judge-2'], blind_inputs = {}, artifact_bodies = {} }) {
  if (!SHA256_RE.test(candidate_sha256 ?? '') || !SHA256_RE.test(incumbent_sha256 ?? '')) throw new TypeError('candidate and incumbent hashes must be lowercase SHA-256 values');
  if (candidate_sha256 === incumbent_sha256) throw new TypeError('candidate and incumbent hashes must differ');
  if (!SHA256_RE.test(rubric_sha256 ?? '')) throw new TypeError('rubric_sha256 must be a lowercase SHA-256');
  if (typeof seed !== 'string' || seed.length === 0) throw new TypeError('seed must be a non-empty string');
  if (!Array.isArray(judge_ids) || new Set(judge_ids).size !== judge_ids.length || judge_ids.some((id) => typeof id !== 'string' || !id)) throw new TypeError('judge_ids must be unique non-empty strings');
  if (judge_ids.some((id) => typeof blind_inputs[id] !== 'string' || !blind_inputs[id])) throw new TypeError('blind_inputs must contain exact non-empty input text for every judge');
  if (sha256(artifact_bodies.candidate ?? '') !== candidate_sha256 || sha256(artifact_bodies.incumbent ?? '') !== incumbent_sha256) throw new TypeError('artifact_bodies must contain exact candidate and incumbent text');

  return judge_ids.map((judge_id) => {
    const candidateFirst = Number.parseInt(sha256(`${seed}\0${judge_id}\0${candidate_sha256}\0${incumbent_sha256}`).slice(0, 2), 16) < 128;
    const labels = candidateFirst ? { A: candidate_sha256, B: incumbent_sha256 } : { A: incumbent_sha256, B: candidate_sha256 };
    const record = {
      judge_id,
      labels,
      blind_artifacts: {
        A: { text: labels.A === candidate_sha256 ? artifact_bodies.candidate : artifact_bodies.incumbent, sha256: labels.A },
        B: { text: labels.B === candidate_sha256 ? artifact_bodies.candidate : artifact_bodies.incumbent, sha256: labels.B },
      },
      rubric_sha256,
      blind_input: blind_inputs[judge_id],
      blind_input_sha256: sha256(blind_inputs[judge_id]),
      randomization: { algorithm: 'sha256-seeded-v1', seed },
    };
    return { ...record, submission_sha256: submissionHash(record) };
  });
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function isHash(value) {
  return typeof value === 'string' && SHA256_RE.test(value);
}

function expectedSubmission(record, submission) {
  try {
    return createRandomizedSubmissions({
      candidate_sha256: record.candidate_sha256,
      incumbent_sha256: record.incumbent_sha256,
      rubric_sha256: record?.rubric?.sha256,
      seed: submission?.randomization?.seed,
      judge_ids: [submission.judge_id],
      blind_inputs: { [submission.judge_id]: submission.blind_input },
      artifact_bodies: record?.artifact_bodies,
    })[0];
  } catch {
    return null;
  }
}

function revealedPreference(judgment, submission) {
  if (judgment.preference === 'TIE') return 'tie';
  const selected = submission.labels[judgment.preference];
  return selected === undefined ? null : selected;
}

function majorityOutcome(votes, candidateHash, incumbentHash) {
  const counts = { candidate: 0, incumbent: 0, tie: 0 };
  for (const vote of votes) {
    if (vote === candidateHash) counts.candidate++;
    else if (vote === incumbentHash) counts.incumbent++;
    else if (vote === 'tie') counts.tie++;
  }
  const max = Math.max(...Object.values(counts));
  const leaders = Object.entries(counts).filter(([, count]) => count === max).map(([label]) => label);
  return leaders.length === 1 ? leaders[0] : 'tie';
}

/** Validate one fully revealed, audit-ready A/B comparison record. */
export function validateJudgmentRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { valid: false, errors: [{ path: '$', message: 'record must be an object' }] };
  }
  if (record.schema_version !== JUDGMENT_SCHEMA_VERSION) addError(errors, 'schema_version', `must be ${JUDGMENT_SCHEMA_VERSION}`);
  if (typeof record.task_id !== 'string' || !record.task_id) addError(errors, 'task_id', 'must be a non-empty string');
  if (!isHash(record.candidate_sha256)) addError(errors, 'candidate_sha256', 'must be a lowercase SHA-256');
  if (!isHash(record.incumbent_sha256)) addError(errors, 'incumbent_sha256', 'must be a lowercase SHA-256');
  if (record.candidate_sha256 === record.incumbent_sha256) addError(errors, 'candidate_sha256', 'must differ from incumbent_sha256');
  if (sha256(record?.artifact_bodies?.candidate ?? '') !== record.candidate_sha256) addError(errors, 'artifact_bodies.candidate', 'must preserve exact candidate text matching candidate_sha256');
  if (sha256(record?.artifact_bodies?.incumbent ?? '') !== record.incumbent_sha256) addError(errors, 'artifact_bodies.incumbent', 'must preserve exact incumbent text matching incumbent_sha256');
  if (!record.rubric || typeof record.rubric.text !== 'string' || !record.rubric.text) addError(errors, 'rubric.text', 'must preserve the exact non-empty locked rubric');
  if (!isHash(record?.rubric?.sha256) || record.rubric.sha256 !== sha256(record?.rubric?.text ?? '')) addError(errors, 'rubric.sha256', 'must match the exact rubric text');

  const requiredGates = ['factual_preservation', 'instruction_fidelity'];
  for (const gateName of requiredGates) {
    const gate = record?.pre_judgment_gates?.[gateName];
    if (!gate || gate.passed !== true) addError(errors, `pre_judgment_gates.${gateName}.passed`, 'must be true before judging');
    if (gate?.artifact_sha256 !== record.candidate_sha256) addError(errors, `pre_judgment_gates.${gateName}.artifact_sha256`, 'must bind the gate to the candidate hash');
  }

  const submissions = Array.isArray(record.submissions) ? record.submissions : [];
  const judgments = Array.isArray(record.judgments) ? record.judgments : [];
  if (!Array.isArray(record.submissions)) addError(errors, 'submissions', 'must be an array');
  if (!Array.isArray(record.judgments)) addError(errors, 'judgments', 'must be an array');
  if (![2, 3].includes(submissions.length)) addError(errors, 'submissions', 'must contain two submissions, or three when the first two judges disagree');
  if (judgments.length !== submissions.length) addError(errors, 'judgments', 'must contain exactly one judgment per submission');

  const submissionByJudge = new Map();
  submissions.forEach((submission, index) => {
    const path = `submissions[${index}]`;
    if (!submission || typeof submission !== 'object') return addError(errors, path, 'must be an object');
    if (typeof submission.judge_id !== 'string' || !submission.judge_id) addError(errors, `${path}.judge_id`, 'must be a non-empty string');
    else if (submissionByJudge.has(submission.judge_id)) addError(errors, `${path}.judge_id`, 'must be unique');
    else submissionByJudge.set(submission.judge_id, submission);
    const values = submission.labels && [submission.labels.A, submission.labels.B];
    if (!values || values.length !== 2 || new Set(values).size !== 2 || !values.includes(record.candidate_sha256) || !values.includes(record.incumbent_sha256)) {
      addError(errors, `${path}.labels`, 'A and B must map exactly once to the candidate and incumbent hashes');
    }
    if (typeof submission.blind_input !== 'string' || !submission.blind_input) addError(errors, `${path}.blind_input`, 'must preserve the exact non-empty judge input');
    if (!isHash(submission.blind_input_sha256) || submission.blind_input_sha256 !== sha256(submission.blind_input ?? '')) addError(errors, `${path}.blind_input_sha256`, 'must match the exact blind input');
    if (submission.rubric_sha256 !== record?.rubric?.sha256) addError(errors, `${path}.rubric_sha256`, 'must bind the blind submission to the locked rubric');
    for (const label of ['A', 'B']) {
      const artifact = submission?.blind_artifacts?.[label];
      if (!artifact || typeof artifact.text !== 'string' || artifact.sha256 !== submission?.labels?.[label] || sha256(artifact.text) !== artifact.sha256) addError(errors, `${path}.blind_artifacts.${label}`, 'must preserve the exact labeled artifact text and hash');
    }
    if (submission?.randomization?.algorithm !== 'sha256-seeded-v1' || typeof submission?.randomization?.seed !== 'string' || !submission.randomization.seed) {
      addError(errors, `${path}.randomization`, 'must declare sha256-seeded-v1 and a non-empty seed');
    } else {
      const expected = expectedSubmission(record, submission);
      if (!expected || stableStringify(expected.labels) !== stableStringify(submission.labels)) addError(errors, `${path}.labels`, 'does not match the committed seeded randomization');
    }
    if (!isHash(submission.submission_sha256) || submission.submission_sha256 !== submissionHash(submission)) addError(errors, `${path}.submission_sha256`, 'must hash the canonical submission record');
  });

  const votes = [];
  const seenJudges = new Set();
  judgments.forEach((judgment, index) => {
    const path = `judgments[${index}]`;
    if (!judgment || typeof judgment !== 'object') return addError(errors, path, 'must be an object');
    if (typeof judgment.judge_id !== 'string' || !judgment.judge_id) addError(errors, `${path}.judge_id`, 'must be a non-empty string');
    else if (seenJudges.has(judgment.judge_id)) addError(errors, `${path}.judge_id`, 'must be unique');
    else seenJudges.add(judgment.judge_id);
    const submission = submissionByJudge.get(judgment.judge_id);
    if (!submission) addError(errors, `${path}.judge_id`, 'has no matching submission');
    if (!isHash(judgment.submission_sha256) || judgment.submission_sha256 !== submission?.submission_sha256) addError(errors, `${path}.submission_sha256`, 'must match this judge\'s submission');
    for (const field of ['model', 'version', 'raw_output']) {
      if (typeof judgment[field] !== 'string' || !judgment[field]) addError(errors, `${path}.${field}`, 'must be a non-empty string');
    }
    if (!isHash(judgment.raw_output_sha256) || judgment.raw_output_sha256 !== sha256(judgment.raw_output ?? '')) addError(errors, `${path}.raw_output_sha256`, 'must match raw_output');
    if (!BLIND_PREFERENCES.has(judgment.preference)) addError(errors, `${path}.preference`, 'must be A, B, or TIE');
    try {
      const parsed = JSON.parse(judgment.raw_output);
      if (parsed.preference !== judgment.preference) addError(errors, `${path}.preference`, 'must equal preference in structured raw_output');
    } catch { addError(errors, `${path}.raw_output`, 'must be JSON containing the recorded preference'); }
    if (submission && BLIND_PREFERENCES.has(judgment.preference)) votes.push(revealedPreference(judgment, submission));
  });

  if (votes.length >= 2) {
    const disagreement = votes[0] !== votes[1];
    if (disagreement && judgments.length !== 3) addError(errors, 'judgments', 'a third judge is required when the first two revealed preferences disagree');
    if (!disagreement && judgments.length !== 2) addError(errors, 'judgments', 'a third judge is allowed only when the first two revealed preferences disagree');
  }

  const expectedOutcome = votes.length === judgments.length && votes.length >= 2
    ? majorityOutcome(votes, record.candidate_sha256, record.incumbent_sha256)
    : null;
  const decision = record.decision;
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    addError(errors, 'decision', 'must be an object');
  } else {
    if (!OUTCOMES.has(decision.outcome)) addError(errors, 'decision.outcome', 'must be candidate, incumbent, or tie');
    else if (expectedOutcome !== null && decision.outcome !== expectedOutcome) addError(errors, 'decision.outcome', `must equal the revealed majority (${expectedOutcome})`);
    if (typeof decision.deterministic_constraint_improved !== 'boolean') addError(errors, 'decision.deterministic_constraint_improved', 'must be a boolean');
    if (decision.outcome !== 'tie' && decision.deterministic_constraint_improved !== false) addError(errors, 'decision.deterministic_constraint_improved', 'must be false unless resolving a semantic tie');
    const expectedSelected = decision.outcome === 'candidate' || (decision.outcome === 'tie' && decision.deterministic_constraint_improved === true)
      ? record.candidate_sha256
      : decision.outcome === 'tie' ? record.incumbent_sha256
      : decision.outcome === 'incumbent' ? record.incumbent_sha256 : null;
    if (decision.selected_sha256 !== expectedSelected) addError(errors, 'decision.selected_sha256', 'must match the majority-selected artifact, or the candidate for an audited tie exception');
    if (!isHash(decision.final_sha256)) addError(errors, 'decision.final_sha256', 'must be a lowercase SHA-256');
    if (!isHash(decision.scored_sha256)) addError(errors, 'decision.scored_sha256', 'must be a lowercase SHA-256');
    if (expectedSelected && (decision.final_sha256 !== expectedSelected || decision.scored_sha256 !== expectedSelected)) addError(errors, 'decision', 'final_sha256 and scored_sha256 must match the selected hash');
  }

  return { valid: errors.length === 0, errors, outcome: errors.length === 0 ? expectedOutcome : null, votes };
}

export function cohensKappa(humanLabels, llmLabels) {
  if (!Array.isArray(humanLabels) || !Array.isArray(llmLabels) || humanLabels.length !== llmLabels.length || humanLabels.length === 0) {
    throw new TypeError('humanLabels and llmLabels must be non-empty arrays of equal length');
  }
  const n = humanLabels.length;
  const categories = new Set([...humanLabels, ...llmLabels]);
  const observed = humanLabels.reduce((sum, label, index) => sum + Number(Object.is(label, llmLabels[index])), 0) / n;
  let expected = 0;
  for (const category of categories) {
    const humanRate = humanLabels.filter((label) => Object.is(label, category)).length / n;
    const llmRate = llmLabels.filter((label) => Object.is(label, category)).length / n;
    expected += humanRate * llmRate;
  }
  return expected === 1 ? (observed === 1 ? 1 : 0) : (observed - expected) / (1 - expected);
}

/** Compute release metrics. Ties remain in the denominator for both rates. */
export function summarizeBenchmark(records, humanLabels = null, llmLabels = null) {
  if (!Array.isArray(records) || records.length !== 24) throw new TypeError('records must contain exactly 24 frozen benchmark tasks');
  const taskIds = records.map((record) => record?.task_id);
  if (taskIds.some((id) => typeof id !== 'string' || !id) || new Set(taskIds).size !== 24) throw new TypeError('records must contain 24 unique non-empty task_id values');
  const outcomes = records.map((record, index) => {
    if (record?.decision && OUTCOMES.has(record.decision.outcome)) return record.decision.outcome;
    if (OUTCOMES.has(record?.outcome)) return record.outcome;
    throw new TypeError(`records[${index}] has no valid outcome`);
  });
  const total = outcomes.length;
  const wins = outcomes.filter((value) => value === 'candidate').length;
  const losses = outcomes.filter((value) => value === 'incumbent').length;
  const ties = total - wins - losses;
  const win_rate = wins / total;
  const loss_rate = losses / total;
  const threshold_pass = win_rate >= BENCHMARK_THRESHOLDS.win_rate && loss_rate <= BENCHMARK_THRESHOLDS.loss_rate;
  if ((humanLabels === null) !== (llmLabels === null)) throw new TypeError('human_labels and llm_labels must be supplied together');
  if (humanLabels !== null && (humanLabels.length !== 8 || llmLabels.length !== 8)) throw new TypeError('human_labels and llm_labels must each contain exactly 8 paired labels');
  const kappa = humanLabels === null ? null : cohensKappa(humanLabels, llmLabels);
  const kappa_pass = kappa === null ? null : kappa >= BENCHMARK_THRESHOLDS.kappa;
  return {
    total, wins, losses, ties, win_rate, loss_rate, kappa,
    thresholds: { ...BENCHMARK_THRESHOLDS },
    threshold_pass,
    kappa_pass,
    pass: threshold_pass && kappa_pass === true,
  };
}

export const computeBenchmarkSummary = summarizeBenchmark;
export const computeCohensKappa = cohensKappa;
