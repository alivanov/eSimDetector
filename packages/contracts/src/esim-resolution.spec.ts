import { DEFAULT_CATALOG_ANSWER_POLICY } from './esim-resolution';

describe('DEFAULT_CATALOG_ANSWER_POLICY', () => {
  it('соответствует docs/14 §14.4 шаг 7: derived включён по умолчанию, unverified выключен', () => {
    expect(DEFAULT_CATALOG_ANSWER_POLICY).toEqual({
      allowDerivedCatalogAnswers: true,
      allowUnverifiedCatalogAnswers: false,
    });
  });
});
