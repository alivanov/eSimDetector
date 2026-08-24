import type { CollectedSignals } from '@esim-detector/signals-collector';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetectionInfo, DetectRequestContext, DetectResponse } from '../api/detect';
import { detect } from '../api/detect';
import type { ResultStatus, DeviceType } from '../api/enums';
import { ApiNetworkError, ApiParseError, ApiRequestError } from '../api/error';
import type { PresentationAction, Presentation } from '../api/presentation';
import type { Clarification } from '../api/clarification';
import type { CandidateSummary } from '../api/device-summary';
import type { ApiReason } from '../api/reason';
import { getDeviceById } from '../api/device-card';
import { resultViewFromDeviceCard } from '../api/result-from-device-card';
import type { SearchResponse } from '../api/search';
import { searchDevices } from '../api/search';
import { findDeviceTypeLabel, findDeviceTypeNotice } from '../device-type';
import { collectBrowserSignals } from '../signals';
import {
  checkScreenTexts,
  clarificationTexts,
  interactionErrorTexts,
  manualSearchTexts,
  otherCandidateLabel,
  otherCandidateOptionId,
} from '../texts';

import { CandidateOptionsList } from './CandidateOptionsList';
import { ClarificationScreen } from './ClarificationScreen';
import styles from './EsimChecker.module.css';
import { LoadingIndicator } from './LoadingIndicator';
import { ManualSearch } from './ManualSearch';
import { ResultCard } from './ResultCard';
import type { OptionLike } from './CandidateOptionsList';

export interface EsimCheckerResult {
  readonly status: ResultStatus;
  readonly deviceId: string | null;
  readonly confidence: number;
  readonly exactModelKnown: boolean;
}

export interface EsimCheckerProps {
  /** Базовый адрес API — параметр, а не константа (ADR-027). */
  readonly apiBase: string;
  readonly channel?: string;
  readonly locale?: string;
  /** Вызывается при каждом определённом результате (docs/07-integration.md §7.2/§7.3, событие `esim:result`). */
  readonly onResult?: (result: EsimCheckerResult) => void;
  /** Клик по действию `kind: 'continue'` («Подключить eSIM») — точка перехода в сценарий подключения. */
  readonly onPrimaryAction?: (action: PresentationAction) => void;
  /**
   * Ответ `/detect` получен и разобран — независимо от того, требуется ли после этого уточнение
   * (событие `esim:detected`, docs/07 §7.2, ADR-040). НЕ вызывается для результатов
   * `/devices/search` и `GET /devices/{id}` (ручной поиск / выбор варианта уточнения): событие про
   * автоматическое определение по сигналам браузера, а не про ручной ввод.
   */
  readonly onDetected?: (detection: DetectionInfo) => void;
  /**
   * Ответ (от `/detect`, `/devices/search` или карточки `GET /devices/{id}`) содержит блок
   * `clarification` — вызывается ДОПОЛНИТЕЛЬНО к `onResult`, поскольку форма результата
   * фиксирована документом и не включает подробности уточнения (событие `esim:clarification`,
   * docs/07 §7.2, ADR-040).
   */
  readonly onClarification?: (clarification: Clarification) => void;
  /** Показан экран ошибки взаимодействия — сеть или ответ сервиса кодом 4xx/5xx (событие `esim:error`, docs/07 §7.2, ADR-040). */
  readonly onError?: (error: { readonly code: string; readonly message: string }) => void;
}

interface ResultState {
  readonly status: ResultStatus;
  readonly presentation: Presentation;
  readonly clarification: Clarification | undefined;
  readonly candidates: readonly CandidateSummary[];
  readonly deviceType: DeviceType | undefined;
  readonly reasons: readonly ApiReason[];
  readonly deviceId: string | null;
  readonly exactModelKnown: boolean;
  readonly confidence: number;
  /**
   * Каким запросом получен результат — определяет, ЧТО отправлять в ответ на
   * `clarification.kind === 'answer_question'` (ниже, обработчик `onAnswerQuestion`): результат
   * `/detect` продолжает диалог повторным `/detect` с теми же `signals` (docs/06 §6.2), а результат
   * `/devices/search` — повторным `/devices/search` с тем же `q` (docs/06 §6.3). Смешивать два пути
   * (например, отвечать на региональный вопрос найденного по имени устройства повторным `/detect`)
   * увело бы ответ не туда, откуда пришёл вопрос — это найдено ручным сквозным прогоном, а не
   * теоретическим рассуждением.
   */
  readonly source: 'detect' | 'search';
}

type Screen =
  | { readonly kind: 'loading'; readonly label: string }
  | {
      readonly kind: 'result';
      readonly result: ResultState;
      readonly showCandidatesPicker: boolean;
    }
  | { readonly kind: 'manual-search' }
  | { readonly kind: 'error'; readonly message: string; readonly onRetry: () => void };

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiNetworkError) {
    return interactionErrorTexts.network;
  }
  if (error instanceof ApiRequestError) {
    if (error.code === 'CATALOG_UNAVAILABLE') {
      return interactionErrorTexts.CATALOG_UNAVAILABLE;
    }
    if (error.code === 'RATE_LIMITED') {
      return interactionErrorTexts.RATE_LIMITED;
    }
  }
  return interactionErrorTexts.other;
}

/**
 * Стабильный код ошибки взаимодействия для внешнего наблюдателя (`onError`, событие `esim:error`
 * будущего Web Component, docs/07 §7.2, ADR-040) — в отличие от `resolveErrorMessage`, который
 * возвращает утверждённый русскоязычный текст, здесь код нужен для машинной обработки (аналитика
 * заказчика), поэтому `ApiRequestError.code` передаётся как есть, а не переводится в текст.
 */
function resolveErrorCode(error: unknown): string {
  if (error instanceof ApiNetworkError) {
    return 'NETWORK';
  }
  if (error instanceof ApiRequestError) {
    return error.code;
  }
  if (error instanceof ApiParseError) {
    return 'PARSE_ERROR';
  }
  return 'UNKNOWN';
}

function detectResponseToResult(response: DetectResponse): ResultState {
  return {
    status: response.status,
    presentation: response.presentation,
    clarification: response.clarification,
    candidates: response.candidates,
    deviceType: response.detection.deviceType,
    reasons: response.reasons,
    deviceId: response.device?.id ?? null,
    exactModelKnown: response.detection.exactModelKnown,
    confidence: response.confidence,
    source: 'detect',
  };
}

function searchResponseToResult(response: SearchResponse): ResultState {
  return {
    status: response.status,
    presentation: response.presentation,
    clarification: response.clarification,
    candidates: response.matches,
    deviceType: undefined,
    reasons: response.reasons,
    deviceId: response.device?.id ?? null,
    exactModelKnown: response.device !== undefined,
    confidence: response.confidence,
    source: 'search',
  };
}

/**
 * Фильтр действий карточки для нашего виджета (тексты API в `presentation` не меняем):
 * - `continue` без `onPrimaryAction` — мёртвая кнопка (docs/07 §7.2);
 * - `clarify`, когда блок `clarification` уже на экране — дубль: варианты уже в ClarificationScreen.
 * Действие «Уточнить модель» при `exactModelKnown: false` без clarification остаётся — оно
 * раскрывает `candidates[]`.
 */
function presentationForWidgetDisplay(
  presentation: Presentation,
  options: {
    readonly hasPrimaryActionHandler: boolean;
    readonly clarificationVisible: boolean;
  },
): Presentation {
  function keepAction(
    action: Presentation['primaryAction'],
  ): action is NonNullable<Presentation['primaryAction']> {
    if (action === undefined) {
      return false;
    }
    if (action.kind === 'continue' && !options.hasPrimaryActionHandler) {
      return false;
    }
    if (action.kind === 'clarify' && options.clarificationVisible) {
      return false;
    }
    return true;
  }

  return {
    title: presentation.title,
    description: presentation.description,
    ...(keepAction(presentation.primaryAction)
      ? { primaryAction: presentation.primaryAction }
      : {}),
    ...(keepAction(presentation.secondaryAction)
      ? { secondaryAction: presentation.secondaryAction }
      : {}),
  };
}

/** Нижняя ссылка дублирует переход, уже доступный через `manual_input` или действие `manual_search`. */
function hasInlineManualSearchEntry(result: ResultState): boolean {
  if (result.clarification?.kind === 'manual_input') {
    return true;
  }
  return (
    result.presentation.primaryAction?.kind === 'manual_search' ||
    result.presentation.secondaryAction?.kind === 'manual_search'
  );
}

/**
 * Корневой компонент интерфейса (docs/13-branding.md §13.4/§13.6, ADR-038/ADR-039) — единственный
 * исходник для `apps/web` и будущего Web Component (этап 6.3). Владеет состоянием сценария:
 * автоопределение → один из трёх статусов → (при необходимости) уточнение → ручной поиск.
 *
 * **`context.region` уходит на сервер ИСКЛЮЧИТЕЛЬНО из явного клика пользователя** по варианту
 * `clarification.options` (`handleAnswerQuestion` ниже) — этот компонент не читает `navigator.
 * language`, часовой пояс или иной косвенный сигнал ни в одной из веток (docs/06 §6.2, ADR-003,
 * ADR-031 п.3). Первый вызов `detect()` при монтировании ВСЕГДА уходит без `region`.
 */
export function EsimChecker({
  apiBase,
  channel,
  locale,
  onResult,
  onPrimaryAction,
  onDetected,
  onClarification,
  onError,
}: EsimCheckerProps) {
  const [screen, setScreen] = useState<Screen>({
    kind: 'loading',
    label: checkScreenTexts.loading,
  });
  const [isSearchSubmitting, setIsSearchSubmitting] = useState(false);
  const signalsRef = useRef<CollectedSignals | undefined>(undefined);
  /** Запрос, которым получен текущий результат `source: 'search'` — нужен для ответа на `answer_question`. */
  const lastSearchQueryRef = useRef<string | undefined>(undefined);

  const buildContext = useCallback(
    (region?: string): DetectRequestContext | undefined => {
      const context: DetectRequestContext = {
        ...(channel !== undefined ? { channel } : {}),
        ...(locale !== undefined ? { locale } : {}),
        ...(region !== undefined ? { region } : {}),
      };
      return Object.keys(context).length > 0 ? context : undefined;
    },
    [channel, locale],
  );

  const applyDetectResult = useCallback(
    (response: DetectResponse) => {
      const result = detectResponseToResult(response);
      onDetected?.(response.detection);
      if (result.clarification !== undefined) {
        onClarification?.(result.clarification);
      }
      onResult?.({
        status: result.status,
        deviceId: result.deviceId,
        confidence: result.confidence,
        exactModelKnown: result.exactModelKnown,
      });
      // Не перезаписывать ручной поиск, если пользователь ушёл с загрузки до ответа `/detect`.
      setScreen((current) =>
        current.kind === 'manual-search'
          ? current
          : { kind: 'result', result, showCandidatesPicker: false },
      );
    },
    [onClarification, onDetected, onResult],
  );

  const applySearchResult = useCallback(
    (response: SearchResponse) => {
      const result = searchResponseToResult(response);
      if (result.clarification !== undefined) {
        onClarification?.(result.clarification);
      }
      onResult?.({
        status: result.status,
        deviceId: result.deviceId,
        confidence: result.confidence,
        exactModelKnown: result.exactModelKnown,
      });
      setScreen({ kind: 'result', result, showCandidatesPicker: false });
    },
    [onClarification, onResult],
  );

  const initialDetect = useCallback(async () => {
    setScreen({ kind: 'loading', label: checkScreenTexts.loading });
    try {
      const signals = await collectBrowserSignals(window);
      signalsRef.current = signals;
      const context = buildContext();
      const response = await detect(apiBase, {
        signals,
        ...(context !== undefined ? { context } : {}),
      });
      applyDetectResult(response);
    } catch (error) {
      onError?.({ code: resolveErrorCode(error), message: resolveErrorMessage(error) });
      setScreen({
        kind: 'error',
        message: resolveErrorMessage(error),
        onRetry: () => {
          void initialDetect();
        },
      });
    }
  }, [apiBase, applyDetectResult, buildContext, onError]);

  const followupDetect = useCallback(
    async (region: string) => {
      setScreen({ kind: 'loading', label: checkScreenTexts.loading });
      try {
        const signals = signalsRef.current;
        if (signals === undefined) {
          await initialDetect();
          return;
        }
        const context = buildContext(region);
        const response = await detect(apiBase, {
          signals,
          ...(context !== undefined ? { context } : {}),
        });
        applyDetectResult(response);
      } catch (error) {
        onError?.({ code: resolveErrorCode(error), message: resolveErrorMessage(error) });
        setScreen({
          kind: 'error',
          message: resolveErrorMessage(error),
          onRetry: () => {
            void followupDetect(region);
          },
        });
      }
    },
    [apiBase, applyDetectResult, buildContext, initialDetect, onError],
  );

  const searchByQuery = useCallback(
    (query: string, region?: string) => {
      lastSearchQueryRef.current = query;
      setScreen({ kind: 'loading', label: manualSearchTexts.loading });
      void searchDevices(apiBase, query, region)
        .then(applySearchResult)
        .catch((error: unknown) => {
          onError?.({ code: resolveErrorCode(error), message: resolveErrorMessage(error) });
          setScreen({
            kind: 'error',
            message: resolveErrorMessage(error),
            onRetry: () => {
              searchByQuery(query, region);
            },
          });
        });
    },
    [apiBase, applySearchResult, onError],
  );

  /**
   * Выбор кандидата уточнения: `GET /devices/{id}` по id варианта (ADR-047 п.11), а не повторный
   * `/devices/search` по подписи. После ужесточения согласия кандидатов (этап 6 сдача п.1–2) поиск
   * по короткой подписи вроде «Apple iPhone XS» снова даёт `choose_candidate` (XS vs XS Max) —
   * пользователь, уже выбравший id, не должен попадать в тот же цикл.
   */
  const resolveChosenCandidate = useCallback(
    (option: OptionLike) => {
      setScreen({ kind: 'loading', label: checkScreenTexts.loading });
      void getDeviceById(apiBase, option.id)
        .then((card) => {
          const view = resultViewFromDeviceCard(card);
          // Для `conditional` ответ на вопрос идёт повторным `/devices/search` с именем и region —
          // запоминаем имя как «последний поисковый запрос».
          lastSearchQueryRef.current = view.deviceName;
          if (view.clarification !== undefined) {
            onClarification?.(view.clarification);
          }
          onResult?.({
            status: view.status,
            deviceId: view.deviceId,
            confidence: view.confidence,
            exactModelKnown: true,
          });
          setScreen({
            kind: 'result',
            result: {
              status: view.status,
              presentation: view.presentation,
              clarification: view.clarification,
              candidates: [],
              deviceType: card.deviceType,
              reasons: [{ code: 'CATALOG_EXACT_MATCH' }],
              deviceId: view.deviceId,
              exactModelKnown: true,
              confidence: view.confidence,
              source: 'search',
            },
            showCandidatesPicker: false,
          });
        })
        .catch((error: unknown) => {
          onError?.({ code: resolveErrorCode(error), message: resolveErrorMessage(error) });
          setScreen({
            kind: 'error',
            message: resolveErrorMessage(error),
            onRetry: () => {
              resolveChosenCandidate(option);
            },
          });
        });
    },
    [apiBase, onClarification, onError, onResult],
  );

  /**
   * Ответ на `answer_question` для результата, полученного `/devices/search` (docs/06 §6.3) —
   * тот же запрос повторно, теперь с `region`. Используется тот же приём, что и `followupDetect`
   * для результатов `/detect`: клиент не хранит состояние сессии сам, а присылает всё заново.
   * Тот же путь — после выбора `conditional`-кандидата через `GET /devices/{id}`.
   */
  const answerSearchQuestion = useCallback(
    (region: string) => {
      const query = lastSearchQueryRef.current;
      if (query === undefined) {
        return;
      }
      searchByQuery(query, region);
    },
    [searchByQuery],
  );

  const submitManualSearch = useCallback(
    (query: string) => {
      lastSearchQueryRef.current = query;
      setIsSearchSubmitting(true);
      void searchDevices(apiBase, query)
        .then(applySearchResult)
        .catch((error: unknown) => {
          onError?.({ code: resolveErrorCode(error), message: resolveErrorMessage(error) });
          setScreen({
            kind: 'error',
            message: resolveErrorMessage(error),
            onRetry: () => {
              submitManualSearch(query);
            },
          });
        })
        .finally(() => {
          setIsSearchSubmitting(false);
        });
    },
    [apiBase, applySearchResult, onError],
  );

  useEffect(() => {
    void initialDetect();
    // Автоопределение запускается один раз при монтировании — повторный запуск при смене
    // `apiBase`/`channel`/`locale` не требуется объёмом этапа (кнопка «Проверить снова» есть на
    // экране ошибки; демонстрационное приложение не меняет эти пропы во время жизни компонента).
  }, []);

  function handleResultAction(action: PresentationAction) {
    if (action.kind === 'manual_search') {
      setScreen({ kind: 'manual-search' });
      return;
    }
    if (action.kind === 'continue') {
      onPrimaryAction?.(action);
      return;
    }
    setScreen((current) => {
      if (current.kind !== 'result' || current.result.clarification !== undefined) {
        return current;
      }
      return { ...current, showCandidatesPicker: true };
    });
  }

  const showFooterManualLink =
    screen.kind !== 'manual-search' &&
    screen.kind !== 'loading' &&
    !(screen.kind === 'result' && hasInlineManualSearchEntry(screen.result));

  return (
    <section className={styles.root} aria-label={checkScreenTexts.title}>
      <h1 className={styles.heading}>{checkScreenTexts.title}</h1>
      <p className={styles.subtitle}>{checkScreenTexts.subtitle}</p>
      <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
        {screen.kind === 'loading' ? <LoadingIndicator label={screen.label} /> : null}

        {screen.kind === 'result' ? (
          <>
            <ResultCard
              status={screen.result.status}
              presentation={presentationForWidgetDisplay(screen.result.presentation, {
                hasPrimaryActionHandler: onPrimaryAction !== undefined,
                clarificationVisible: screen.result.clarification !== undefined,
              })}
              deviceTypeNotice={findDeviceTypeNotice(screen.result.reasons)}
              deviceTypeLabel={
                screen.result.deviceType !== undefined
                  ? findDeviceTypeLabel(screen.result.deviceType)
                  : undefined
              }
              onAction={(action) => {
                handleResultAction(action);
              }}
            />
            {screen.result.clarification !== undefined ? (
              <ClarificationScreen
                clarification={screen.result.clarification}
                onChooseCandidate={(option) => {
                  resolveChosenCandidate(option);
                }}
                onAnswerQuestion={(optionId) => {
                  if (screen.result.source === 'detect') {
                    void followupDetect(optionId);
                  } else {
                    answerSearchQuestion(optionId);
                  }
                }}
                onManualInput={() => {
                  setScreen({ kind: 'manual-search' });
                }}
              />
            ) : null}
            {screen.result.clarification === undefined &&
            screen.showCandidatesPicker &&
            screen.result.candidates.length > 0 ? (
              <CandidateOptionsList
                options={[
                  ...screen.result.candidates.map((candidate) => ({
                    id: candidate.id,
                    label: candidate.name,
                  })),
                  { id: otherCandidateOptionId, label: otherCandidateLabel },
                ]}
                groupLabel={clarificationTexts.optionsGroupLabel}
                onChoose={(option) => {
                  if (option.id === otherCandidateOptionId) {
                    setScreen({ kind: 'manual-search' });
                  } else {
                    resolveChosenCandidate(option);
                  }
                }}
              />
            ) : null}
          </>
        ) : null}

        {screen.kind === 'error' ? (
          <div className={styles.errorBox} role="alert">
            <p className={styles.errorMessage}>{screen.message}</p>
            <button type="button" className={styles.retryButton} onClick={screen.onRetry}>
              {interactionErrorTexts.retry}
            </button>
          </div>
        ) : null}

        {screen.kind === 'manual-search' ? (
          <ManualSearch
            baseUrl={apiBase}
            isSubmitting={isSearchSubmitting}
            onSubmit={submitManualSearch}
            onBackToAutoDetect={() => {
              void initialDetect();
            }}
          />
        ) : null}
      </div>

      {showFooterManualLink ? (
        <button
          type="button"
          className={styles.manualLink}
          onClick={() => {
            setScreen({ kind: 'manual-search' });
          }}
        >
          {checkScreenTexts.manualSearchLink}
        </button>
      ) : null}
    </section>
  );
}
