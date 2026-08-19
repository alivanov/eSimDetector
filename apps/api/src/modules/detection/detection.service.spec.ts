import {
  buildSampleDevice,
  type Device,
  type ScreenSignatureRecord,
} from '@esim-detector/contracts';
import { ConfigService } from '@nestjs/config';

import { validateEnv, type EnvConfig } from '../../config/env.schema';
import { buildCatalogSnapshot } from '../catalog/catalog.snapshot';
import type { CatalogService } from '../catalog/catalog.service';

import { DetectionService } from './detection.service';
import type { ScreenSignatureService } from './ios/screen-signature.service';
import type { ResolutionLogService } from '../resolution-log/resolution-log.service';

function buildEnv(overrides: Partial<Record<string, string>> = {}): EnvConfig {
  return validateEnv({ NODE_ENV: 'test', ...overrides });
}

function buildFakeCatalogService(devices: readonly Device[]): CatalogService {
  const snapshot = buildCatalogSnapshot(devices);
  const fake: Pick<CatalogService, 'getSnapshot'> = { getSnapshot: () => snapshot };
  return fake as CatalogService;
}

function buildFakeScreenSignatureService(
  records: readonly ScreenSignatureRecord[] = [],
): ScreenSignatureService {
  const map = new Map(records.map((record) => [record.signature, record]));
  const fake: Pick<ScreenSignatureService, 'getBySignature'> = {
    getBySignature: (signature) => map.get(signature),
  };
  return fake as ScreenSignatureService;
}

function buildFakeResolutionLogService(): ResolutionLogService {
  const fake: Pick<ResolutionLogService, 'record' | 'hashSignals'> = {
    record: async () => {},
    hashSignals: () => 'hash',
  };
  return fake as ResolutionLogService;
}

function buildService(
  devices: readonly Device[],
  records: readonly ScreenSignatureRecord[] = [],
  env: EnvConfig = buildEnv(),
): DetectionService {
  return new DetectionService(
    buildFakeCatalogService(devices),
    buildFakeScreenSignatureService(records),
    new ConfigService<EnvConfig, true>(env),
    buildFakeResolutionLogService(),
  );
}

function androidDevice(overrides: Partial<Device> = {}): Device {
  return buildSampleDevice({ platform: 'android', ...overrides });
}

function iosDevice(overrides: Partial<Device> = {}): Device {
  return buildSampleDevice({
    platform: 'ios',
    brand: 'apple',
    brandTitle: 'Apple',
    modelCodes: [],
    aliases: [],
    screenSignatures: [],
    ...overrides,
  });
}

function screenSignature(overrides: Partial<ScreenSignatureRecord> = {}): ScreenSignatureRecord {
  return {
    signature: '393x852@3',
    zoomed: false,
    candidates: [],
    esimConsensus: 'mixed',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('DetectionService.detect — ветка Android', () => {
  it('точное совпадение сервисного кода → supported, высокая уверенность, exactModelKnown', () => {
    const device = androidDevice();
    const service = buildService([device]);

    const result = service.detect({ uaData: { platform: 'Android', model: 'SM-S928B' } }, {});

    expect(result.status).toBe('supported');
    expect(result.detection).toEqual({
      method: 'ua_client_hints_model',
      platform: 'android',
      exactModelKnown: true,
      deviceType: 'phone',
    });
    expect(result.device?.id).toBe('samsung-galaxy-s24-ultra');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('неизвестный сервисный код → clarification_required, устройство не угадывается', () => {
    const service = buildService([androidDevice()]);
    const result = service.detect({ uaData: { platform: 'Android', model: 'SM-UNKNOWN99' } }, {});

    expect(result.status).toBe('clarification_required');
    expect(result.device).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.clarification?.kind).toBe('manual_input');
  });

  it('модель "K" (урезанный UA-CH) — восстанавливается из устаревшего User-Agent', () => {
    const device = androidDevice();
    const service = buildService([device]);

    const result = service.detect(
      { uaData: { model: 'K' }, userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-S928B)' },
      {},
    );

    expect(result.status).toBe('supported');
    expect(result.detection.method).toBe('legacy_user_agent_model');
    expect(result.confidence).toBeLessThan(0.9);
  });

  it('расхождение заголовков Sec-CH-UA-Model с сигналом может понизить ответ ниже порога уверенности', () => {
    const device = androidDevice();
    const service = buildService([device]);

    const result = service.detect(
      { uaData: { model: 'K' }, userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-S928B)' },
      { model: 'SM-A556E' },
    );

    expect(result.status).toBe('clarification_required');
    expect(result.reasons.some((r) => r.code === 'CONFIDENCE_BELOW_THRESHOLD')).toBe(true);
    expect(result.clarification?.kind).toBe('check_on_device');
  });

  it('согласованные заголовки Sec-CH-UA-Model повышают уверенность (SIGNAL_HEADERS_CONSISTENT)', () => {
    const device = androidDevice();
    const service = buildService([device]);

    const result = service.detect(
      { uaData: { platform: 'Android', model: 'SM-S928B' } },
      { model: 'SM-S928B', platform: 'Android' },
    );

    expect(result.status).toBe('supported');
    expect(result.reasons.some((r) => r.code === 'SIGNAL_HEADERS_CONSISTENT')).toBe(true);
  });

  it('запись "conditional" без известного региона → answer_question с вопросом записи', () => {
    const device = androidDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 1,
        conditions: [
          { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для КНР' },
        ],
        clarifyingQuestion: {
          kind: 'region',
          question: 'Устройство приобретено в Китае?',
          options: [
            { value: 'CN', label: 'Да' },
            { value: 'OTHER', label: 'Нет' },
          ],
        },
        notes: '',
      },
    });
    const service = buildService([device]);
    const result = service.detect({ uaData: { platform: 'Android', model: 'SM-S928B' } }, {});

    expect(result.status).toBe('clarification_required');
    expect(result.device?.id).toBe('samsung-galaxy-s24-ultra');
    expect(result.clarification).toEqual({
      kind: 'answer_question',
      question: 'Устройство приобретено в Китае?',
      options: [
        { id: 'CN', label: 'Да' },
        { id: 'OTHER', label: 'Нет' },
      ],
    });
  });

  it('запись "conditional" с переданным регионом → определённый статус вместо уточнения (context.region)', () => {
    const device = androidDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 1,
        conditions: [
          { scope: 'region', value: 'CN', support: 'not_supported', note: 'версия для КНР' },
        ],
        clarifyingQuestion: {
          kind: 'region',
          question: 'Устройство приобретено в Китае?',
          options: [
            { value: 'CN', label: 'Да' },
            { value: 'OTHER', label: 'Нет' },
          ],
        },
        notes: '',
      },
    });
    const service = buildService([device]);

    const withChina = service.detect(
      { uaData: { platform: 'Android', model: 'SM-S928B' } },
      {},
      'req-1',
      'CN',
    );
    expect(withChina.status).toBe('not_supported');
    expect(withChina.clarification).toBeUndefined();
    expect(withChina.reasons.map((r) => r.code)).toContain('ESIM_CONDITION_MATCHED_REGION');

    const withOtherRegion = service.detect(
      { uaData: { platform: 'Android', model: 'SM-S928B' } },
      {},
      'req-2',
      'RU',
    );
    expect(withOtherRegion.status).toBe('supported');
    expect(withOtherRegion.clarification).toBeUndefined();
    expect(withOtherRegion.reasons.map((r) => r.code)).toContain(
      'ESIM_CONDITION_DEFAULT_SUPPORTED',
    );
  });
});

describe('DetectionService.detect — ветка iOS', () => {
  const iphoneX = iosDevice({
    _id: 'apple-iphone-x',
    marketingName: 'iPhone X',
    displayName: 'iPhone X',
    os: { minVersion: '11.0', maxVersion: '16.7' },
    esim: {
      support: 'not_supported',
      dualSim: 'none',
      maxProfiles: null,
      conditions: [],
      clarifyingQuestion: null,
      notes: '',
    },
  });
  const iphoneXs = iosDevice({
    _id: 'apple-iphone-xs',
    marketingName: 'iPhone XS',
    displayName: 'iPhone XS',
    os: { minVersion: '12.0', maxVersion: '18.6' },
  });
  const iphone11Pro = iosDevice({
    _id: 'apple-iphone-11-pro',
    marketingName: 'iPhone 11 Pro',
    displayName: 'iPhone 11 Pro',
    os: { minVersion: '13.0', maxVersion: '18.6' },
  });

  it('iOS 17+ и сигнатура экрана 375x812@3 исключают iPhone X → supported, группа без точной модели', () => {
    const record = screenSignature({
      signature: '375x812@3',
      candidates: ['apple-iphone-x', 'apple-iphone-xs', 'apple-iphone-11-pro'],
    });
    const service = buildService([iphoneX, iphoneXs, iphone11Pro], [record]);

    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)',
        screen: { width: 375, height: 812, dpr: 3 },
      },
      {},
    );

    expect(result.status).toBe('supported');
    expect(result.detection.exactModelKnown).toBe(false);
    expect(result.device).toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('сигнатура экрана неоднозначна БЕЗ версии iOS (нет UA) → clarification_required со списком кандидатов', () => {
    const record = screenSignature({
      signature: '375x812@3',
      candidates: ['apple-iphone-x', 'apple-iphone-xs'],
    });
    const service = buildService([iphoneX, iphoneXs], [record]);

    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X)',
        screen: { width: 375, height: 812, dpr: 3 },
      },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.candidates.map((c) => c.id).sort()).toEqual([
      'apple-iphone-x',
      'apple-iphone-xs',
    ]);
    expect(result.clarification?.kind).toBe('choose_candidate');
  });

  it('нет ни версии iOS, ни сигнатуры экрана → clarification_required, кандидатов нет', () => {
    const service = buildService([iphoneX, iphoneXs]);
    const result = service.detect({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS)' }, {});

    expect(result.status).toBe('clarification_required');
    expect(result.candidates).toEqual([]);
    expect(result.clarification?.kind).toBe('manual_input');
  });
});

describe('DetectionService.detect — ветка iOS, планшеты (docs/09 ADR-034, этап 5.6)', () => {
  function ipadDevice(overrides: Partial<Device> = {}): Device {
    return buildSampleDevice({
      platform: 'ios',
      deviceType: 'tablet',
      brand: 'apple',
      brandTitle: 'Apple',
      modelCodes: [],
      aliases: [],
      screenSignatures: [],
      ...overrides,
    });
  }

  const ipad10 = ipadDevice({
    _id: 'apple-ipad-10',
    marketingName: 'iPad (10th generation)',
    displayName: 'Apple iPad (10th generation)',
    os: { minVersion: '16.1', maxVersion: '26.6.1' },
  });

  it('iPad с явным User-Agent "iPad" и сигнатурой экрана → адресный ответ про iPad, а не про телефон', () => {
    const record = screenSignature({
      signature: '820x1180@2',
      candidates: ['apple-ipad-10'],
      esimConsensus: 'supported',
    });
    const service = buildService([ipad10], [record]);

    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        screen: { width: 820, height: 1180, dpr: 2 },
      },
      {},
    );

    expect(result.status).toBe('supported');
    expect(result.detection.deviceType).toBe('tablet');
    expect(result.detection.platform).toBe('ios');
    expect(result.presentation.description).toContain('iPad');
    expect(result.presentation.description).not.toContain('iPhone');
    expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_TABLET_DETECTED')).toBe(true);
  });

  it('iPad c User-Agent настольного macOS Safari и maxTouchPoints > 0 → тот же адресный ответ (ловушка iPadOS 13+)', () => {
    const record = screenSignature({
      signature: '820x1180@2',
      candidates: ['apple-ipad-10'],
      esimConsensus: 'supported',
    });
    const service = buildService([ipad10], [record]);

    const result = service.detect(
      {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        screen: { width: 820, height: 1180, dpr: 2 },
        hardware: { maxTouchPoints: 5 },
      },
      {},
    );

    expect(result.status).toBe('supported');
    expect(result.detection.platform).toBe('ios');
    expect(result.detection.deviceType).toBe('tablet');
    // Единственный кандидат сигнатуры → точная модель известна (то же правило, что и для iPhone).
    expect(result.device?.id).toBe('apple-ipad-10');
    expect(result.presentation.description).toContain('iPad');
  });

  it('такой же User-Agent Mac, но maxTouchPoints = 0 (настоящий Mac) → НЕ классифицируется как планшет', () => {
    const service = buildService([ipad10]);

    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15',
        hardware: { maxTouchPoints: 0 },
      },
      {},
    );

    expect(result.detection.platform).not.toBe('ios');
    expect(result.detection.deviceType).not.toBe('tablet');
    expect(result.status).toBe('clarification_required');
  });

  it('тот же User-Agent Mac без сигнала maxTouchPoints вовсе → clarification_required, неоднозначность, а не догадка', () => {
    const service = buildService([ipad10]);

    const result = service.detect(
      { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15' },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.detection.platform).toBe('other');
    expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_AMBIGUOUS')).toBe(true);
  });

  it('iPad без совпавшей сигнатуры/версии в справочнике → уточнение адресовано iPad, а не "iPhone"', () => {
    const service = buildService([]);

    const result = service.detect(
      { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)' },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.detection.deviceType).toBe('tablet');
    expect(result.clarification).toEqual({
      kind: 'manual_input',
      question: 'Не удалось определить модель iPad. Введите модель вручную.',
    });
  });
});

describe('DetectionService.detect — Android/HarmonyOS, планшеты и часы (docs/09 ADR-034, этап 5.6)', () => {
  it('Sec-CH-UA-Mobile=false и неизвестный код → уточнение адресовано планшету, а не безликое', () => {
    const service = buildService([androidDevice()]);

    const result = service.detect(
      { uaData: { platform: 'Android', model: 'SM-UNKNOWN-TAB', mobile: false } },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.detection.deviceType).toBe('tablet');
    expect(result.clarification).toEqual({
      kind: 'manual_input',
      question:
        'Похоже, это планшет на Android. Такой модели нет в справочнике — уточните её вручную.',
    });
  });

  it('Sec-CH-UA-Mobile=false, но код совпал с планшетом в справочнике → обычный точный ответ (deviceType из данных)', () => {
    const tablet = androidDevice({
      _id: 'samsung-galaxy-tab-s9',
      deviceType: 'tablet',
      modelCodes: ['SM-X716B'],
    });
    const service = buildService([tablet]);

    const result = service.detect(
      { uaData: { platform: 'Android', model: 'SM-X716B', mobile: false } },
      {},
    );

    expect(result.status).toBe('supported');
    expect(result.detection.deviceType).toBe('tablet');
    expect(result.detection.exactModelKnown).toBe(true);
  });

  it('User-Agent называет часы явно → clarification_required, адресован часам, поиск устройства не предпринимается', () => {
    const service = buildService([androidDevice()]);

    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Wear OS) AppleWebKit/537.36',
        uaData: { platform: 'Android', model: 'SM-R925' },
      },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.detection.deviceType).toBe('watch');
    expect(result.clarification?.kind).toBe('manual_input');
    expect(result.clarification?.question).toContain('умные часы');
  });

  it('неоднозначный Android (нет Sec-CH-UA-Mobile, экран планшетного размера) → уточнение о типе, а не догадка', () => {
    const service = buildService([androidDevice()]);

    const result = service.detect(
      {
        uaData: { platform: 'Android', model: 'SM-UNKNOWN-2' },
        screen: { width: 800, height: 1280 },
      },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.reasons.some((r) => r.code === 'DEVICE_TYPE_AMBIGUOUS')).toBe(true);
    expect(result.clarification).toEqual({
      kind: 'manual_input',
      question: 'Не удалось точно определить, телефон это или планшет. Уточните модель вручную.',
    });
  });
});

describe('DetectionService.detect — защита от ложных определений', () => {
  it('признаки эмуляции (iOS + maxTouchPoints=0) → clarification_required, confidence=0', () => {
    const service = buildService([]);
    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        hardware: { maxTouchPoints: 0 },
      },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.confidence).toBe(0);
    expect(result.reasons.some((r) => r.code === 'EMULATION_SUSPECTED')).toBe(true);
  });

  it('iPad с признаками эмуляции (User-Agent называет iPad, но подозрение по WebGL) → deviceType в ответе — "tablet", а не безусловный "phone"', () => {
    const service = buildService([]);
    const result = service.detect(
      {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)',
        webgl: { renderer: 'SwiftShader' },
      },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.reasons.some((r) => r.code === 'EMULATION_SUSPECTED')).toBe(true);
    expect(result.detection.deviceType).toBe('tablet');
  });

  it('десктопная платформа → clarification_required, устройство не пытается определиться', () => {
    const service = buildService([]);
    const result = service.detect(
      { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      {},
    );

    expect(result.status).toBe('clarification_required');
    expect(result.reasons.some((r) => r.code === 'PLATFORM_NOT_MOBILE')).toBe(true);
  });

  it('сигналов нет вовсе → clarification_required, код причины NO_SIGNALS', () => {
    const service = buildService([]);
    const result = service.detect(undefined, {});

    expect(result.status).toBe('clarification_required');
    expect(result.reasons.some((r) => r.code === 'NO_SIGNALS')).toBe(true);
  });
});
