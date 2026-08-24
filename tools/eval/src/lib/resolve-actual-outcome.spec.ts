import { resolveActualOutcome } from './resolve-actual-outcome';

describe('resolveActualOutcome', () => {
  it('clarification_required с matches побеждает непустой deviceId → clarification', () => {
    expect(
      resolveActualOutcome({
        status: 'clarification_required',
        deviceId: 'apple-iphone-17-pro',
        matchCount: 3,
      }),
    ).toBe('clarification');
  });

  it('clarification_required без matches при device → match (известна модель, нужен регион)', () => {
    expect(
      resolveActualOutcome({
        status: 'clarification_required',
        deviceId: 'apple-iphone-15',
        matchCount: 0,
      }),
    ).toBe('match');
  });

  it('непустой deviceId при определённом статусе → match', () => {
    expect(
      resolveActualOutcome({
        status: 'supported',
        deviceId: 'samsung-galaxy-s24-ultra',
        matchCount: 0,
      }),
    ).toBe('match');
  });

  it('группа без device при supported/not_supported → match (ADR-002)', () => {
    expect(
      resolveActualOutcome({
        status: 'supported',
        deviceId: null,
        matchCount: 0,
      }),
    ).toBe('match');
    expect(
      resolveActualOutcome({
        status: 'not_supported',
        deviceId: null,
        matchCount: 0,
      }),
    ).toBe('match');
  });

  it('clarification_required без matches и без device → not_found', () => {
    expect(
      resolveActualOutcome({
        status: 'clarification_required',
        deviceId: null,
        matchCount: 0,
      }),
    ).toBe('not_found');
  });
});
