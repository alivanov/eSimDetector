import { buildSampleDevice } from '@esim-detector/contracts';

import { computeScreenSignatureConsensus } from './screen-signature-consensus';

describe('computeScreenSignatureConsensus', () => {
  it('возвращает единый статус, когда все кандидаты согласны', () => {
    const devices = [buildSampleDevice({ _id: 'a' }), buildSampleDevice({ _id: 'b' })];

    expect(computeScreenSignatureConsensus(devices)).toBe('supported');
  });

  it('возвращает "mixed", когда статусы кандидатов расходятся', () => {
    const devices = [
      buildSampleDevice({
        _id: 'a',
        esim: {
          support: 'supported',
          dualSim: 'physical+esim',
          maxProfiles: 2,
          conditions: [],
          clarifyingQuestion: null,
          notes: '',
        },
      }),
      buildSampleDevice({
        _id: 'b',
        esim: {
          support: 'not_supported',
          dualSim: 'none',
          maxProfiles: null,
          conditions: [],
          clarifyingQuestion: null,
          notes: '',
        },
      }),
    ];

    expect(computeScreenSignatureConsensus(devices)).toBe('mixed');
  });

  it('возвращает "mixed" на пустом списке кандидатов', () => {
    expect(computeScreenSignatureConsensus([])).toBe('mixed');
  });
});
