import { applyConfidenceGate, applyHeaderConsistency, clampConfidence } from './confidence';

describe('clampConfidence', () => {
  it('ограничивает значение диапазоном [0, 1]', () => {
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(-0.2)).toBe(0);
    expect(clampConfidence(0.5)).toBe(0.5);
  });
});

describe('applyHeaderConsistency', () => {
  it('добавляет бонус при согласованности заголовков', () => {
    expect(applyHeaderConsistency(0.9, 'consistent')).toBeCloseTo(0.93);
  });

  it('снижает уверенность при несогласованности заголовков', () => {
    expect(applyHeaderConsistency(0.9, 'inconsistent')).toBeCloseTo(0.8);
  });

  it('не меняет уверенность, если сравнение неприменимо', () => {
    expect(applyHeaderConsistency(0.9, 'not_applicable')).toBe(0.9);
  });

  it('не выходит за пределы [0, 1] при бонусе', () => {
    expect(applyHeaderConsistency(0.99, 'consistent')).toBe(1);
  });
});

describe('applyConfidenceGate', () => {
  it('выдаёт статус как есть при уверенности не ниже порога', () => {
    const result = applyConfidenceGate({
      resolutionStatus: 'supported',
      confidence: 0.9,
      answerThreshold: 0.8,
    });
    expect(result).toEqual({ status: 'supported', downgradedByConfidence: false });
  });

  it('понижает до уточнения при уверенности ниже порога', () => {
    const result = applyConfidenceGate({
      resolutionStatus: 'not_supported',
      confidence: 0.5,
      answerThreshold: 0.8,
    });
    expect(result).toEqual({ status: 'clarification_required', downgradedByConfidence: true });
  });

  it('не трогает уже определённое esim-rules уточнение (downgradedByConfidence остаётся false)', () => {
    const result = applyConfidenceGate({
      resolutionStatus: 'clarification_required',
      confidence: 0.99,
      answerThreshold: 0.8,
    });
    expect(result).toEqual({ status: 'clarification_required', downgradedByConfidence: false });
  });
});
