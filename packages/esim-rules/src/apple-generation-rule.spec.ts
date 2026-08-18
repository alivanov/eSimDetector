import { resolveAppleGenerationRule, type AppleModelIdentity } from './apple-generation-rule';

function identity(overrides: Partial<AppleModelIdentity>): AppleModelIdentity {
  return { family: 'iphone', generation: null, modifiers: [], ...overrides };
}

describe('resolveAppleGenerationRule', () => {
  it('iPhone X — не поддерживает (старше границы появления eSIM)', () => {
    const result = resolveAppleGenerationRule(identity({ family: 'iphone-x' }));

    expect(result.support).toBe('not_supported');
    expect(result.reason.code).toBe('APPLE_RULE_NOT_SUPPORTED');
  });

  it('iPhone XS — поддерживает', () => {
    const result = resolveAppleGenerationRule(identity({ family: 'iphone-xs' }));

    expect(result.support).toBe('supported');
    expect(result.reason.code).toBe('APPLE_RULE_SUPPORTED');
  });

  it('iPhone XS Max (модификатор max) — поддерживает', () => {
    const result = resolveAppleGenerationRule(
      identity({ family: 'iphone-xs', modifiers: ['max'] }),
    );

    expect(result.support).toBe('supported');
  });

  it('iPhone XR — поддерживает', () => {
    const result = resolveAppleGenerationRule(identity({ family: 'iphone-xr' }));

    expect(result.support).toBe('supported');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'iPhone %i (числовая линия) — не поддерживает',
    (generation) => {
      const result = resolveAppleGenerationRule(identity({ generation }));

      expect(result.support).toBe('not_supported');
      expect(result.reason.code).toBe('APPLE_RULE_NOT_SUPPORTED');
    },
  );

  it.each([11, 12, 13, 14, 15, 16])(
    'iPhone %i (числовая линия, новее XR/XS) — поддерживает',
    (generation) => {
      const result = resolveAppleGenerationRule(identity({ generation }));

      expect(result.support).toBe('supported');
      expect(result.reason.code).toBe('APPLE_RULE_SUPPORTED');
    },
  );

  it('iPhone без номера поколения — правило не берётся угадывать (ADR-003)', () => {
    const result = resolveAppleGenerationRule(identity({ generation: null }));

    expect(result.support).toBeUndefined();
    expect(result.reason.code).toBe('APPLE_RULE_UNKNOWN_MODEL');
  });

  it('iPhone SE 1-го поколения — не поддерживает', () => {
    const result = resolveAppleGenerationRule(identity({ family: 'iphone-se', generation: 1 }));

    expect(result.support).toBe('not_supported');
  });

  it.each([2, 3])('iPhone SE %i-го поколения — поддерживает', (generation) => {
    const result = resolveAppleGenerationRule(identity({ family: 'iphone-se', generation }));

    expect(result.support).toBe('supported');
  });

  it('iPhone SE без номера поколения — неизвестно (1-е поколение неотличимо от 2-го/3-го)', () => {
    const result = resolveAppleGenerationRule(identity({ family: 'iphone-se', generation: null }));

    expect(result.support).toBeUndefined();
    expect(result.reason.code).toBe('APPLE_RULE_UNKNOWN_MODEL');
  });

  it('линия за пределами известного перечня — неизвестно, а не догадка', () => {
    const result = resolveAppleGenerationRule(identity({ family: 'ipad', generation: 10 }));

    expect(result.support).toBeUndefined();
    expect(result.reason.code).toBe('APPLE_RULE_UNKNOWN_MODEL');
  });
});
