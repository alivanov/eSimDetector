import type { CollectedSignals } from '@esim-detector/signals-collector';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetectRequestContext, DetectResponse } from '../api/detect';
import { detect } from '../api/detect';
import type { ResultStatus, DeviceType } from '../api/enums';
import { ApiNetworkError, ApiRequestError } from '../api/error';
import type { PresentationAction, Presentation } from '../api/presentation';
import type { Clarification } from '../api/clarification';
import type { CandidateSummary } from '../api/device-summary';
import type { ApiReason } from '../api/reason';
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
      onResult?.({
        status: result.status,
        deviceId: result.deviceId,
        confidence: result.confidence,
        exactModelKnown: result.exactModelKnown,
      });
      setScreen({ kind: 'result', result, showCandidatesPicker: false });
    },
    [onResult],
  );

  const applySearchResult = useCallback(
    (response: SearchResponse) => {
      const result = searchResponseToResult(response);
      onResult?.({
        status: result.status,
        deviceId: result.deviceId,
        confidence: result.confidence,
        exactModelKnown: result.exactModelKnown,
      });
      setScreen({ kind: 'result', result, showCandidatesPicker: false });
    },
    [onResult],
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
      setScreen({
        kind: 'error',
        message: resolveErrorMessage(error),
        onRetry: () => {
          void initialDetect();
        },
      });
    }
  }, [apiBase, applyDetectResult, buildContext]);

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
        setScreen({
          kind: 'error',
          message: resolveErrorMessage(error),
          onRetry: () => {
            void followupDetect(region);
          },
        });
      }
    },
    [apiBase, applyDetectResult, buildContext, initialDetect],
  );

  const searchByQuery = useCallback(
    (query: string, region?: string) => {
      lastSearchQueryRef.current = query;
      setScreen({ kind: 'loading', label: manualSearchTexts.loading });
      void searchDevices(apiBase, query, region)
        .then(applySearchResult)
        .catch((error: unknown) => {
          setScreen({
            kind: 'error',
            message: resolveErrorMessage(error),
            onRetry: () => {
              searchByQuery(query, region);
            },
          });
        });
    },
    [apiBase, applySearchResult],
  );

  const searchByLabel = useCallback(
    (label: string) => {
      searchByQuery(label);
    },
    [searchByQuery],
  );

  /**
   * Ответ на `answer_question` для результата, полученного `/devices/search` (docs/06 §6.3) —
   * тот же запрос повторно, теперь с `region`. Используется тот же приём, что и `followupDetect`
   * для результатов `/detect`: клиент не хранит состояние сессии сам, а присылает всё заново.
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
    [apiBase, applySearchResult],
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
              presentation={screen.result.presentation}
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
                  searchByLabel(option.label);
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
                    searchByLabel(option.label);
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

      {screen.kind !== 'manual-search' ? (
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
