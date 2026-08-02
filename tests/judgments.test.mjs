import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_THRESHOLDS,
  cohensKappa,
  createRandomizedSubmissions,
  sha256,
  summarizeBenchmark,
  validateJudgmentRecord,
} from '../lib/judgments.mjs';

const CANDIDATE = sha256('candidate bytes');
const INCUMBENT = sha256('incumbent bytes');

function blindedPreference(submission, revealed) {
  if (revealed === 'tie') return 'TIE';
  const hash = revealed === 'candidate' ? CANDIDATE : INCUMBENT;
  return submission.labels.A === hash ? 'A' : 'B';
}

function completeRecord(preferences = ['candidate', 'candidate']) {
  const ids = preferences.map((_, index) => `judge-${index + 1}`);
  const submissions = createRandomizedSubmissions({
    candidate_sha256: CANDIDATE,
    incumbent_sha256: INCUMBENT,
    rubric_sha256: sha256('Prefer the more accurate, faithful, clear response.'),
    seed: 'fixed-test-seed',
    judge_ids: ids,
    blind_inputs: Object.fromEntries(ids.map((id) => [id, `Locked rubric and anonymized A/B artifacts for ${id}`])),
    artifact_bodies: { candidate: 'candidate bytes', incumbent: 'incumbent bytes' },
  });
  const judgments = submissions.map((submission, index) => {
    const raw_output = JSON.stringify({ preference: blindedPreference(submission, preferences[index]), rationale: `reason ${index + 1}` });
    return {
      judge_id: submission.judge_id,
      model: 'test-model',
      version: 'test-model-2026-08-02',
      submission_sha256: submission.submission_sha256,
      raw_output,
      raw_output_sha256: sha256(raw_output),
      preference: blindedPreference(submission, preferences[index]),
    };
  });
  const counts = preferences.reduce((all, value) => ({ ...all, [value]: (all[value] ?? 0) + 1 }), {});
  const max = Math.max(...Object.values(counts));
  const leaders = Object.keys(counts).filter((key) => counts[key] === max);
  const outcome = leaders.length === 1 ? leaders[0] : 'tie';
  const selected = outcome === 'candidate' || outcome === 'tie' ? CANDIDATE : INCUMBENT;
  return {
    schema_version: 1,
    task_id: 'memo-01',
    candidate_sha256: CANDIDATE,
    incumbent_sha256: INCUMBENT,
    artifact_bodies: { candidate: 'candidate bytes', incumbent: 'incumbent bytes' },
    rubric: { text: 'Prefer the more accurate, faithful, clear response.', sha256: sha256('Prefer the more accurate, faithful, clear response.') },
    pre_judgment_gates: {
      factual_preservation: { passed: true, artifact_sha256: CANDIDATE },
      instruction_fidelity: { passed: true, artifact_sha256: CANDIDATE },
    },
    submissions,
    judgments,
    decision: {
      outcome,
      selected_sha256: selected,
      final_sha256: selected ?? CANDIDATE,
      scored_sha256: selected ?? CANDIDATE,
      deterministic_constraint_improved: outcome === 'tie',
    },
  };
}

function benchmarkRecords(outcomes) {
  return outcomes.map((outcome, index) => ({ task_id: `task-${String(index + 1).padStart(2, '0')}`, outcome }));
}

describe('seeded blind randomization', () => {
  it('is reproducible and exercises both A/B orientations', () => {
    const options = { candidate_sha256: CANDIDATE, incumbent_sha256: INCUMBENT, rubric_sha256: sha256('rubric'), seed: 'repeatable', judge_ids: ['j1', 'j2'], blind_inputs: { j1: 'input 1', j2: 'input 2' }, artifact_bodies: { candidate: 'candidate bytes', incumbent: 'incumbent bytes' } };
    expect(createRandomizedSubmissions(options)).toEqual(createRandomizedSubmissions(options));

    const candidateLabels = new Set();
    for (let index = 0; index < 32; index++) {
      const [submission] = createRandomizedSubmissions({ ...options, seed: `seed-${index}`, judge_ids: ['j1'] });
      candidateLabels.add(submission.labels.A === CANDIDATE ? 'A' : 'B');
    }
    expect(candidateLabels).toEqual(new Set(['A', 'B']));
    expect(validateJudgmentRecord(completeRecord()).valid).toBe(true);
  });

  it('detects a mapping changed after its seeded commitment', () => {
    const record = completeRecord();
    [record.submissions[0].labels.A, record.submissions[0].labels.B] = [record.submissions[0].labels.B, record.submissions[0].labels.A];
    const report = validateJudgmentRecord(record);
    expect(report.valid).toBe(false);
    expect(report.errors.some((error) => error.path === 'submissions[0].labels')).toBe(true);
  });
});

describe('judge dispatch and decisions', () => {
  it('requires a third judge to break first-pair disagreement and accepts its majority', () => {
    const incomplete = completeRecord(['candidate', 'incumbent']);
    expect(validateJudgmentRecord(incomplete).errors.some((error) => error.message.includes('third judge is required'))).toBe(true);

    const resolved = completeRecord(['candidate', 'incumbent', 'candidate']);
    const report = validateJudgmentRecord(resolved);
    expect(report.valid).toBe(true);
    expect(report.outcome).toBe('candidate');
  });

  it('rejects an unnecessary third judge and a stale final hash', () => {
    const unnecessary = completeRecord(['candidate', 'candidate', 'candidate']);
    expect(validateJudgmentRecord(unnecessary).errors.some((error) => error.message.includes('allowed only'))).toBe(true);

    const stale = completeRecord();
    stale.decision.final_sha256 = INCUMBENT;
    expect(validateJudgmentRecord(stale).errors.some((error) => error.path === 'decision')).toBe(true);
  });

  it('fails closed on incomplete model and raw-output provenance', () => {
    const record = completeRecord();
    delete record.judgments[0].version;
    delete record.judgments[1].raw_output_sha256;
    delete record.decision.scored_sha256;
    const paths = validateJudgmentRecord(record).errors.map((error) => error.path);
    expect(paths).toContain('judgments[0].version');
    expect(paths).toContain('judgments[1].raw_output_sha256');
    expect(paths).toContain('decision.scored_sha256');
  });

  it('binds the locked rubric, exact blind inputs, and pre-judgment gates', () => {
    const record = completeRecord();
    record.rubric.text += ' changed';
    record.submissions[0].blind_input += ' changed';
    record.pre_judgment_gates.instruction_fidelity.passed = false;
    const paths = validateJudgmentRecord(record).errors.map((error) => error.path);
    expect(paths).toContain('rubric.sha256');
    expect(paths).toContain('submissions[0].blind_input_sha256');
    expect(paths).toContain('pre_judgment_gates.instruction_fidelity.passed');
  });

  it('permits a semantic tie only through the candidate-bound deterministic exception', () => {
    const tied = completeRecord(['candidate', 'incumbent', 'tie']);
    expect(validateJudgmentRecord(tied).valid).toBe(true);
    tied.decision.deterministic_constraint_improved = false;
    tied.decision.selected_sha256 = INCUMBENT;
    tied.decision.final_sha256 = INCUMBENT;
    tied.decision.scored_sha256 = INCUMBENT;
    expect(validateJudgmentRecord(tied).valid).toBe(true);
  });

  it('rejects a recorded preference that disagrees with raw judge output', () => {
    const record = completeRecord();
    record.judgments[0].raw_output = JSON.stringify({ preference: record.judgments[0].preference === 'A' ? 'B' : 'A', rationale: 'opposite' });
    record.judgments[0].raw_output_sha256 = sha256(record.judgments[0].raw_output);
    expect(validateJudgmentRecord(record).errors.some((error) => error.path === 'judgments[0].preference')).toBe(true);
  });
});

describe('benchmark release gates', () => {
  it('applies inclusive 65% win and 15% loss thresholds with ties in the denominator', () => {
    const boundary = summarizeBenchmark([
      ...Array(16).fill('candidate'),
      ...Array(3).fill('incumbent'),
      ...Array(5).fill('tie'),
    ].map((outcome, index) => ({ task_id: `task-${index + 1}`, outcome })));
    expect(boundary.win_rate).toBeGreaterThanOrEqual(BENCHMARK_THRESHOLDS.win_rate);
    expect(boundary.loss_rate).toBeLessThanOrEqual(BENCHMARK_THRESHOLDS.loss_rate);
    expect(boundary.threshold_pass).toBe(true);
    expect(boundary.pass).toBe(false); // agreement is a separate required gate

    expect(summarizeBenchmark(benchmarkRecords([...Array(15).fill('candidate'), ...Array(3).fill('incumbent'), ...Array(6).fill('tie')])).threshold_pass).toBe(false);
    expect(summarizeBenchmark(benchmarkRecords([...Array(17).fill('candidate'), ...Array(4).fill('incumbent'), ...Array(3).fill('tie')])).threshold_pass).toBe(false);
  });

  it('computes Cohen\'s kappa and requires at least 0.60', () => {
    const human = ['win', 'win', 'win', 'loss', 'loss', 'tie', 'tie', 'tie'];
    expect(cohensKappa(human, human)).toBe(1);
    const poor = ['loss', 'loss', 'tie', 'win', 'win', 'win', 'loss', 'tie'];
    expect(cohensKappa(human, poor)).toBeLessThan(0.60);

    const passing = summarizeBenchmark(
      benchmarkRecords([...Array(16).fill('candidate'), ...Array(3).fill('incumbent'), ...Array(5).fill('tie')]),
      human,
      human,
    );
    expect(passing.kappa_pass).toBe(true);
    expect(passing.pass).toBe(true);
  });

  it('requires 24 unique task IDs and exactly eight paired human labels', () => {
    expect(() => summarizeBenchmark([{ task_id: 'only-one', outcome: 'candidate' }], ['win'], ['win'])).toThrow(/exactly 24/);
    const duplicate = benchmarkRecords(Array(24).fill('candidate'));
    duplicate[1].task_id = duplicate[0].task_id;
    expect(() => summarizeBenchmark(duplicate, Array(8).fill('win'), Array(8).fill('win'))).toThrow(/unique/);
    expect(() => summarizeBenchmark(benchmarkRecords(Array(24).fill('candidate')), ['win'], ['win'])).toThrow(/exactly 8/);
  });
});
