import type { ResultStatus } from '@esim-detector/contracts';

import type {
  ApiReason,
  Clarification,
  DeviceSummary,
  MatchSummary,
  Presentation,
} from '../../common/response';

/** Форма ответа `GET/POST /api/v1/devices/search` (docs/06-api-contract.md, §6.3). */
export interface SearchResponse {
  readonly requestId: string;
  readonly query: { readonly raw: string; readonly normalized: string };
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly device: DeviceSummary | null;
  readonly matches: readonly MatchSummary[];
  readonly reasons: readonly ApiReason[];
  readonly clarification?: Clarification;
  readonly presentation: Presentation;
}

export interface SuggestItem {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
}

/** Форма ответа `GET /api/v1/devices/suggest` (docs/06-api-contract.md, §6.4; docs/04 §4.8). */
export interface SuggestResponse {
  readonly requestId: string;
  readonly query: { readonly raw: string; readonly normalized: string };
  readonly suggestions: readonly SuggestItem[];
}
