import { checkHeaderConsistency } from './header-consistency';

describe('checkHeaderConsistency', () => {
  it('not_applicable, если заголовков нет вовсе', () => {
    expect(checkHeaderConsistency({ uaData: { model: 'SM-S928B' } }, {})).toBe('not_applicable');
  });

  it('not_applicable, если сигналов uaData нет вовсе', () => {
    expect(checkHeaderConsistency(undefined, { model: 'SM-S928B' })).toBe('not_applicable');
  });

  it('consistent при совпадении модели без учёта регистра/пробелов', () => {
    expect(checkHeaderConsistency({ uaData: { model: ' SM-S928B ' } }, { model: 'sm-s928b' })).toBe(
      'consistent',
    );
  });

  it('inconsistent при расхождении модели', () => {
    expect(checkHeaderConsistency({ uaData: { model: 'SM-S928B' } }, { model: 'SM-A556E' })).toBe(
      'inconsistent',
    );
  });

  it('consistent при совпадении платформы', () => {
    expect(
      checkHeaderConsistency({ uaData: { platform: 'Android' } }, { platform: 'Android' }),
    ).toBe('consistent');
  });

  it('inconsistent, если хотя бы одно из двух сравнений разошлось', () => {
    expect(
      checkHeaderConsistency(
        { uaData: { model: 'SM-S928B', platform: 'Android' } },
        { model: 'SM-S928B', platform: 'Windows' },
      ),
    ).toBe('inconsistent');
  });
});
