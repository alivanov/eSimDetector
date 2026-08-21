import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CatalogAnswerPolicy,
  Device,
  DeviceType,
  EsimResolutionContext,
  Platform,
} from '@esim-detector/contracts';
import {
  resolveCandidateGroupEsimStatus,
  resolveDeviceEsimStatus,
} from '@esim-detector/esim-rules';

import type { ApiReason, Clarification } from '../../common/response';
import { buildPresentation, toCandidateSummary, toDeviceSummary } from '../../common/response';
import type { EnvConfig } from '../../config/env.schema';
import { CatalogService } from '../catalog/catalog.service';
import { ModerationTaskService } from '../moderation/moderation-task.service';
import { ResolutionLogService } from '../resolution-log/resolution-log.service';

import { resolveAndroidDevice } from './android/resolve-android';
import { BASE_CONFIDENCE, applyConfidenceGate, applyHeaderConsistency } from './confidence';
import type { DetectionInfo, DetectResponse } from './detect-response';
import type { DetectionSignals, RequestHeaderSignals } from './detection-signals';
import {
  classifyDeviceType,
  type DeviceTypeClassification,
} from './device-type/classify-device-type';
import { detectEmulation } from './emulation/detect-emulation';
import { checkHeaderConsistency, type HeaderConsistencyResult } from './header-consistency';
import { buildIosClarification } from './ios/build-ios-clarification';
import { buildScreenSignatureKey } from './ios/build-screen-signature-key';
import { collectGroupConditionReasons } from './ios/collect-group-condition-reasons';
import { ScreenSignatureService } from './ios/screen-signature.service';
import { selectIosCandidates } from './ios/select-ios-candidates';
import { classifyPlatform } from './platform/classify-platform';
import {
  parseAndroidVersionFromUserAgent,
  parseIosVersionFromUserAgent,
} from './platform/parse-user-agent';

export type DetectResult = Omit<DetectResponse, 'requestId'>;

/**
 * Уточнение для умных часов (docs/09-decisions.md ADR-034, этап 5.6; ADR-025 п.4). Часы почти
 * никогда не открывают произвольные страницы в браузере (докс/03 §3.9, "Отсечение неподдерживаемых
 * сценариев") — попытка сопоставить сигналы такого устройства с телефоном или планшетом рискует
 * дать ложный результат заведомо не по адресу, поэтому при уверенном распознавании часов сервис не
 * пытается их резолвить дальше, а прямо называет предполагаемый тип и предлагает проверить eSIM в
 * настройках самого устройства. Текст черновой — финальную формулировку утверждает пользователь
 * одним проходом (ADR-025 п.3), как и региональный вопрос iOS (docs/09 ADR-031).
 */
const WATCH_CLARIFICATION: Clarification = {
  kind: 'manual_input',
  question:
    'Похоже, это умные часы. Сервис определяет поддержку eSIM для телефонов и планшетов — уточните модель вручную или проверьте наличие eSIM в настройках самих часов.',
};

/** Слово, называющее группу кандидатов iOS в текстах уточнения (docs/09 ADR-034) — 'iPhone' для телефонов, 'iPad' для планшетов. */
function iosGroupLabel(deviceType: DeviceType): string {
  return deviceType === 'tablet' ? 'iPad' : 'iPhone';
}

/**
 * Оркестрация автоопределения (docs/03-detection-algorithm.md, §3.3): классификация платформы →
 * проверка на эмуляцию → ветка Android/HarmonyOS/iOS → вывод статуса eSIM (`esim-rules`) → расчёт
 * уверенности (§3.6) → формирование ответа. Каждый шаг вынесен в чистую функцию своего файла —
 * этот сервис только связывает их и добавляет то, что требует состояния приложения (справочник,
 * конфигурация), симметрично `MatchingService` (ADR-019 для модуля `matching`).
 */
@Injectable()
export class DetectionService {
  public constructor(
    private readonly catalogService: CatalogService,
    private readonly screenSignatureService: ScreenSignatureService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly resolutionLogService: ResolutionLogService,
    private readonly moderationTaskService: ModerationTaskService,
  ) {}

  private policy(): CatalogAnswerPolicy {
    return {
      allowDerivedCatalogAnswers: this.configService.get('ALLOW_DERIVED_CATALOG_ANSWERS', {
        infer: true,
      }),
      allowUnverifiedCatalogAnswers: this.configService.get('ALLOW_UNVERIFIED_CATALOG_ANSWERS', {
        infer: true,
      }),
    };
  }

  private answerThreshold(): number {
    return this.configService.get('CONFIDENCE_ANSWER_THRESHOLD', { infer: true });
  }

  /**
   * `requestId` — только для журнала resolution_logs (docs/05 §5.6), не влияет на алгоритм.
   * Запись в журнал выполняется в фоне (`void`, без ожидания) — сбой или задержка записи не
   * должны замедлять или ломать ответ пользователю (ADR-008: результат определения — не ошибка,
   * и служебный журнал тем более не должен становиться источником отказа).
   *
   * `region` — ТОЛЬКО явный ответ пользователя на адресный вопрос уточнения (`context.region`,
   * docs/06 §6.2), а не сигнал устройства: сервис не выводит регион из `locale`/заголовков/IP
   * (ADR-003) и не хранит состояние между запросами — клиент присылает ответ заново с каждым
   * запросом, поэтому эндпоинт остаётся идемпотентным (без сессии на стороне API).
   */
  public detect(
    signals: DetectionSignals | undefined,
    headers: RequestHeaderSignals,
    requestId = 'unknown',
    region?: string,
  ): DetectResult {
    const startedAt = Date.now();
    const result = this.resolveDetection(signals, headers, region);

    void this.resolutionLogService.record({
      requestId,
      signals,
      platform: result.detection.platform,
      status: result.status,
      confidence: result.confidence,
      reasonCodes: result.reasons.map((reason) => reason.code),
      durationMs: Date.now() - startedAt,
    });

    return result;
  }

  private resolveDetection(
    signals: DetectionSignals | undefined,
    headers: RequestHeaderSignals,
    region: string | undefined,
  ): DetectResult {
    const platform = classifyPlatform(signals);
    // Классификация типа вычисляется ДО проверки на эмуляцию (docs/09 ADR-034): иначе устройство,
    // чей User-Agent прямо называет iPad, но которое поймано эмуляцией по другому признаку
    // (например, несогласованный рендерер WebGL), получило бы в ответе `deviceType: "phone"" по
    // умолчанию — метаданные ответа не должны противоречить очевидному сигналу даже тогда, когда
    // сам статус определения понижен до уточнения.
    const deviceTypeClassification = classifyDeviceType(platform, signals);
    const emulation = detectEmulation({ platform, signals });

    if (emulation.suspected) {
      return this.buildClarificationOnly(
        platform,
        deviceTypeClassification.deviceType,
        [
          { code: 'PLATFORM_DETECTED', detail: platform },
          ...deviceTypeClassification.reasons,
          ...emulation.details.map((detail) => ({ code: 'EMULATION_SUSPECTED', detail })),
        ],
        {
          kind: 'manual_input',
          question:
            'Не удалось подтвердить подлинность сигналов устройства. Уточните модель вручную.',
        },
      );
    }

    const headerConsistency = checkHeaderConsistency(signals, headers);
    const consistencyReason = this.consistencyReason(headerConsistency);

    if (platform === 'android' || platform === 'harmonyos') {
      return this.detectAndroidLike(
        platform,
        signals,
        headerConsistency,
        consistencyReason,
        region,
        deviceTypeClassification,
      );
    }
    if (platform === 'ios') {
      return this.detectIos(
        signals,
        headerConsistency,
        consistencyReason,
        region,
        deviceTypeClassification,
      );
    }

    return this.detectOther(platform, signals, deviceTypeClassification);
  }

  /**
   * Платформа `other` (докс/03 §3.3, узел "Desktop / прочее"). Разделено на два исхода
   * (docs/09-decisions.md ADR-034, этап 5.6): обычный десктоп даёт нейтральное сообщение "не
   * мобильное устройство", а Mac-подобный User-Agent без сигнала `maxTouchPoints` — отдельное,
   * адресное сообщение о неоднозначности (настоящий Mac либо iPad в режиме настольного сайта, для
   * которого браузер не сообщил `maxTouchPoints`), а не молчаливую догадку в пользу десктопа.
   */
  private detectOther(
    platform: Platform,
    signals: DetectionSignals | undefined,
    deviceTypeClassification: DeviceTypeClassification,
  ): DetectResult {
    const hasAnySignal =
      signals !== undefined && (signals.userAgent !== undefined || signals.uaData !== undefined);
    const baseReason: ApiReason = hasAnySignal
      ? { code: 'PLATFORM_NOT_MOBILE', detail: platform }
      : { code: 'NO_SIGNALS' };

    if (deviceTypeClassification.deviceType === 'watch') {
      return this.buildClarificationOnly(
        platform,
        'watch',
        [baseReason, ...deviceTypeClassification.reasons],
        WATCH_CLARIFICATION,
      );
    }

    if (deviceTypeClassification.ambiguous) {
      return this.buildClarificationOnly(
        platform,
        deviceTypeClassification.deviceType,
        [baseReason, ...deviceTypeClassification.reasons],
        {
          kind: 'manual_input',
          question:
            'Не удалось точно определить, обычный компьютер это или планшет iPad в режиме сайта для компьютера. Уточните модель вручную либо переключите Safari в обычный режим и повторите попытку.',
        },
      );
    }

    return this.buildClarificationOnly(
      platform,
      deviceTypeClassification.deviceType,
      [baseReason],
      {
        kind: 'manual_input',
        question:
          'Не удалось определить мобильное устройство. Откройте эту страницу на телефоне либо выберите модель вручную.',
      },
    );
  }

  private consistencyReason(consistency: HeaderConsistencyResult): ApiReason | undefined {
    if (consistency === 'consistent') {
      return { code: 'SIGNAL_HEADERS_CONSISTENT' };
    }
    if (consistency === 'inconsistent') {
      return { code: 'SIGNAL_HEADERS_INCONSISTENT' };
    }
    return undefined;
  }

  private detectAndroidLike(
    platform: Platform,
    signals: DetectionSignals | undefined,
    headerConsistency: HeaderConsistencyResult,
    consistencyReason: ApiReason | undefined,
    region: string | undefined,
    deviceTypeClassification: DeviceTypeClassification,
  ): DetectResult {
    const snapshot = this.catalogService.getSnapshot();
    const androidResolution = resolveAndroidDevice(signals, snapshot.matchIndex.aliasIndex);
    const baseReasons: ApiReason[] = [
      { code: 'PLATFORM_DETECTED', detail: platform },
      ...deviceTypeClassification.reasons,
      ...androidResolution.reasons,
    ];

    const device =
      androidResolution.deviceId === undefined
        ? undefined
        : snapshot.devices.get(androidResolution.deviceId);

    if (device === undefined) {
      // Сопоставление по сервисному коду безразлично к типу устройства (docs/03 §3.4) — код,
      // принадлежащий планшету, находил бы его так же, как код телефона. Классификация типа
      // здесь используется ТОЛЬКО для того, чтобы адресовать сообщение об отказе (docs/09
      // ADR-034): владелец планшета без совпавшего кода должен услышать "это планшет" вместо
      // безликого "модель устройства не найдена", а владелец часов — не получить ответ про
      // телефон вовсе.
      this.recordUnknownModelCodes(androidResolution.reasons, platform);
      return this.buildClarificationOnly(
        platform,
        deviceTypeClassification.deviceType,
        baseReasons,
        this.androidUnresolvedClarification(deviceTypeClassification),
      );
    }

    const osVersion =
      signals?.uaData?.platformVersion ?? parseAndroidVersionFromUserAgent(signals?.userAgent);
    const esimContext: EsimResolutionContext = {
      ...(osVersion !== undefined ? { osVersion } : {}),
      ...(region !== undefined ? { region } : {}),
    };
    const resolution = resolveDeviceEsimStatus(device, esimContext, this.policy());

    const baseConfidence =
      androidResolution.method === 'ua_client_hints_model'
        ? BASE_CONFIDENCE.androidExactCode
        : BASE_CONFIDENCE.androidLegacyUa;
    const confidence = applyHeaderConsistency(baseConfidence, headerConsistency);
    const gate = applyConfidenceGate({
      resolutionStatus: resolution.status,
      confidence,
      answerThreshold: this.answerThreshold(),
    });

    const reasons: ApiReason[] = [
      ...baseReasons,
      ...(consistencyReason !== undefined ? [consistencyReason] : []),
      ...resolution.reasons.map((reason) => ({ ...reason })),
      ...(gate.downgradedByConfidence
        ? [{ code: 'CONFIDENCE_BELOW_THRESHOLD', detail: confidence.toFixed(2) }]
        : []),
    ];

    const clarification = this.buildDeviceLevelClarification(resolution, gate.status);
    const detection: DetectionInfo = {
      method: androidResolution.method,
      platform,
      exactModelKnown: true,
      // Тип берётся из САМОЙ записи справочника, а не из предварительной классификации по
      // сигналам: точный код найден, значит тип устройства — уже проверенный факт данных, а не
      // предположение (docs/09 ADR-034).
      deviceType: device.deviceType,
    };

    return {
      status: gate.status,
      confidence,
      detection,
      device: toDeviceSummary(device),
      candidates: [],
      reasons,
      ...(clarification !== undefined ? { clarification } : {}),
      presentation: buildPresentation({
        status: gate.status,
        deviceName: device.displayName,
        exactModelKnown: true,
        ...(resolution.clarification !== undefined
          ? { clarificationQuestion: resolution.clarification.question }
          : {}),
      }),
    };
  }

  private detectIos(
    signals: DetectionSignals | undefined,
    headerConsistency: HeaderConsistencyResult,
    consistencyReason: ApiReason | undefined,
    region: string | undefined,
    deviceTypeClassification: DeviceTypeClassification,
  ): DetectResult {
    // Часы (`platform` не бывает `ios`, но проверка симметрична остальным веткам — на случай,
    // если сигнал платформы окажется недостоверным) обрабатываются отдельно от группы моделей:
    // резолюция по сигнатуре экрана для них не имеет смысла (docs/09 ADR-034).
    if (deviceTypeClassification.deviceType === 'watch') {
      return this.buildClarificationOnly(
        'ios',
        'watch',
        [{ code: 'PLATFORM_DETECTED', detail: 'ios' }, ...deviceTypeClassification.reasons],
        WATCH_CLARIFICATION,
      );
    }

    const deviceType = deviceTypeClassification.deviceType === 'tablet' ? 'tablet' : 'phone';
    const groupLabel = iosGroupLabel(deviceType);

    const snapshot = this.catalogService.getSnapshot();
    const iosVersion = parseIosVersionFromUserAgent(signals?.userAgent);
    const screenKey = buildScreenSignatureKey(signals?.screen);
    const screenSignature =
      screenKey === undefined ? undefined : this.screenSignatureService.getBySignature(screenKey);

    if (screenKey !== undefined && screenSignature === undefined) {
      this.recordUnknownScreenSignature(screenKey, iosVersion);
    }

    const selection = selectIosCandidates(
      snapshot.devices,
      iosVersion,
      screenSignature,
      deviceType,
    );
    const esimContext: EsimResolutionContext = {
      ...(iosVersion !== undefined ? { osVersion: iosVersion } : {}),
      ...(region !== undefined ? { region } : {}),
    };
    const policy = this.policy();
    const groupResolution = resolveCandidateGroupEsimStatus(
      selection.candidates.map((device) => ({
        esim: device.esim,
        dataConfidence: device.dataConfidence,
      })),
      esimContext,
      policy,
    );

    const candidatesAgree = groupResolution.status !== 'clarification_required';
    const baseConfidence = !candidatesAgree
      ? BASE_CONFIDENCE.iosCandidatesDisagree
      : selection.usedOsVersionRule && selection.usedScreenSignature
        ? BASE_CONFIDENCE.iosCandidatesAgreeBothSignals
        : BASE_CONFIDENCE.iosCandidatesAgreeSingleSignal;
    const confidence = applyHeaderConsistency(baseConfidence, headerConsistency);
    const gate = applyConfidenceGate({
      resolutionStatus: groupResolution.status,
      confidence,
      answerThreshold: this.answerThreshold(),
    });

    // Свёртка группы (`resolveCandidateGroupEsimStatus`) сообщает только `CANDIDATES_AGREE_ON_ESIM`
    // при согласии — код конкретного сработавшего правила (условие по региону/общий случай)
    // разворачивается отдельно, чтобы ответ оставался машиночитаемым и после того, как регион
    // сделал статус группы определённым (ADR-010, docs/09 ADR-031).
    const conditionReasons = candidatesAgree
      ? collectGroupConditionReasons(selection.candidates, esimContext, policy)
      : [];

    const reasons: ApiReason[] = [
      { code: 'PLATFORM_DETECTED', detail: 'ios' },
      ...deviceTypeClassification.reasons,
      ...selection.reasons,
      ...(consistencyReason !== undefined ? [consistencyReason] : []),
      ...groupResolution.reasons.map((reason) => ({ ...reason })),
      ...conditionReasons.map((reason) => ({ ...reason })),
      ...(gate.downgradedByConfidence
        ? [{ code: 'CONFIDENCE_BELOW_THRESHOLD', detail: confidence.toFixed(2) }]
        : []),
    ];

    const exactModelKnown = groupResolution.exactModelKnown && selection.candidates.length === 1;
    const singleDevice: Device | undefined = exactModelKnown ? selection.candidates[0] : undefined;
    const detection: DetectionInfo = {
      method: 'ios_version_and_screen_signature',
      platform: 'ios',
      exactModelKnown,
      deviceType,
    };
    const clarification =
      gate.status === 'clarification_required'
        ? buildIosClarification(selection.candidates, groupLabel)
        : undefined;

    return {
      status: gate.status,
      confidence,
      detection,
      device: singleDevice !== undefined ? toDeviceSummary(singleDevice) : null,
      candidates:
        gate.status === 'clarification_required'
          ? selection.candidates.map(toCandidateSummary)
          : [],
      reasons,
      ...(clarification !== undefined ? { clarification } : {}),
      presentation: buildPresentation({
        status: gate.status,
        exactModelKnown,
        // Для группы (`exactModelKnown: false`) имя устройства — обобщённое слово линейки
        // (`groupLabel`, 'iPhone'/'iPad'), а не конкретная модель: AGENTS.md, правило 3 — на iOS
        // определяется группа, а не модель, и текст ответа обязан отражать это честно. До этапа
        // 5.6 поле для групп не заполнялось вовсе, из-за чего ответ был безлико нейтральным
        // ("Ваше устройство...") даже для iPhone — заодно исправлено здесь (docs/09 ADR-034).
        deviceName: singleDevice !== undefined ? singleDevice.displayName : groupLabel,
        // Готовый текст вопроса — только для адресного уточнения (docs/13 §13.5: «уточнение
        // вызвано региональным/версионным условием»); "выбор из списка" по-прежнему показывает
        // общую формулировку презентации, а не текст clarification.question.
        ...(clarification?.kind === 'answer_question'
          ? { clarificationQuestion: clarification.question }
          : {}),
      }),
    };
  }

  /**
   * Сообщение об отказе ветки Android/HarmonyOS, когда сервисный код не найден в справочнике
   * (docs/09-decisions.md ADR-034, этап 5.6). Классификация типа по сигналам — единственное, чем
   * можно адресовать сообщение в этой ситуации (данных о конкретной модели нет): при неоднозначных
   * сигналах — нейтральный вопрос о самом типе, а не догадка (AGENTS.md, правило 1, применённое к
   * типу устройства).
   */
  private androidUnresolvedClarification(classification: DeviceTypeClassification): Clarification {
    if (classification.deviceType === 'watch') {
      return WATCH_CLARIFICATION;
    }
    if (classification.ambiguous) {
      return {
        kind: 'manual_input',
        question: 'Не удалось точно определить, телефон это или планшет. Уточните модель вручную.',
      };
    }
    if (classification.deviceType === 'tablet') {
      return {
        kind: 'manual_input',
        question:
          'Похоже, это планшет на Android. Такой модели нет в справочнике — уточните её вручную.',
      };
    }
    return {
      kind: 'manual_input',
      question: 'Модель устройства не найдена в справочнике. Попробуйте найти её вручную.',
    };
  }

  /**
   * Уточнение уровня устройства (не группы) — либо адресный вопрос по условию `esim.conditions`
   * (регион/версия ОС, ADR-007), либо, при отсутствии такого вопроса, крайний случай "проверить
   * на устройстве" (docs/03 §3.7, п.4) для записей, заблокированных гейтом достоверности данных.
   */
  private buildDeviceLevelClarification(
    resolution: ReturnType<typeof resolveDeviceEsimStatus>,
    finalStatus: DetectResult['status'],
  ): Clarification | undefined {
    if (resolution.clarification !== undefined) {
      return {
        kind: 'answer_question',
        question: resolution.clarification.question,
        options: resolution.clarification.options.map((option) => ({
          id: option.value,
          label: option.label,
        })),
      };
    }
    if (finalStatus === 'clarification_required') {
      return {
        kind: 'check_on_device',
        question:
          'Устройство определено, но данные о поддержке eSIM пока не подтверждены. Проверьте наличие eSIM в настройках устройства.',
      };
    }
    return undefined;
  }

  /**
   * `unknown_model_code` (docs/15-moderation.md §15.2, §15.9 п.1—2) — фиксируется, когда
   * `resolveAndroidDevice` не нашёл устройства ни по `Sec-CH-UA-Model`, ни по разбору легаси
   * User-Agent. Код читается из уже вычисленных `reasons` (`CATALOG_MODEL_CODE_UNKNOWN`) —
   * не повторяет разбор сигналов заново (не переписывает `resolve-android.ts`, AGENTS.md).
   * Запись — побочный эффект без ожидания (`void`, симметрично `resolutionLogService.record`):
   * сбой очереди модерации не должен замедлять или ломать ответ пользователю.
   */
  private recordUnknownModelCodes(reasons: readonly ApiReason[], platform: Platform): void {
    for (const reason of reasons) {
      if (reason.code === 'CATALOG_MODEL_CODE_UNKNOWN' && reason.detail !== undefined) {
        void this.moderationTaskService.recordUnknownModelCode(reason.detail, platform);
      }
    }
  }

  /**
   * `unknown_screen_signature` (docs/15 §15.2, §15.9 демонстрационный сценарий, ветка iOS) —
   * `screenKey` уже в формате `"<cssWidth>x<cssHeight>@<dpr>"` (портретная ориентация,
   * `buildScreenSignatureKey`) — разбирается обратно на числа, а не пересчитывается из сырых
   * `signals.screen`, чтобы значение задачи гарантированно совпадало с ключом, по которому
   * модератор впоследствии свяжет сигнатуру (`CatalogWriteService.linkScreenSignature`,
   * `buildSignatureString` в `apps/api/src/modules/moderation/screen-signature-rebuild.ts`
   * использует ТОТ ЖЕ формат). `zoomed` сигналом браузера не передаётся (docs/05 §5.5: это
   * свойство КАТАЛОЖНОЙ записи, а не сигнал устройства) — по умолчанию `false`, модератор при
   * необходимости учитывает это при выборе устройства для привязки.
   */
  private recordUnknownScreenSignature(screenKey: string, iosVersion: string | undefined): void {
    const [dimensions, dprPart] = screenKey.split('@');
    const [widthPart, heightPart] = (dimensions ?? '').split('x');
    const cssWidth = Number(widthPart);
    const cssHeight = Number(heightPart);
    const dpr = Number(dprPart);
    if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || !Number.isFinite(dpr)) {
      return;
    }
    void this.moderationTaskService.recordUnknownScreenSignature({
      signature: screenKey,
      cssWidth,
      cssHeight,
      dpr,
      zoomed: false,
      osVersion: iosVersion ?? null,
    });
  }

  private buildClarificationOnly(
    platform: Platform,
    deviceType: DeviceType,
    reasons: readonly ApiReason[],
    clarification: Clarification,
  ): DetectResult {
    const detection: DetectionInfo = {
      method: 'unknown',
      platform,
      exactModelKnown: false,
      deviceType,
    };
    return {
      status: 'clarification_required',
      confidence: 0,
      detection,
      device: null,
      candidates: [],
      reasons: [...reasons],
      clarification,
      presentation: buildPresentation({
        status: 'clarification_required',
        exactModelKnown: false,
        clarificationQuestion: clarification.question,
      }),
    };
  }
}
