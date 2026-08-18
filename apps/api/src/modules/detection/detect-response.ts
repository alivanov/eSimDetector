import type { Platform, ResultStatus } from '@esim-detector/contracts';

import type {
  ApiReason,
  CandidateSummary,
  Clarification,
  DeviceSummary,
  Presentation,
} from '../../common/response';

/** Способ определения устройства (docs/06-api-contract.md, §6.2, поле `detection.method`). */
export type DetectionMethod =
  | 'ua_client_hints_model'
  | 'legacy_user_agent_model'
  | 'ios_version_and_screen_signature'
  | 'unknown';

export interface DetectionInfo {
  readonly method: DetectionMethod;
  readonly platform: Platform;
  readonly exactModelKnown: boolean;
}

/** Форма ответа `POST /api/v1/detect` (docs/06-api-contract.md, §6.2). */
export interface DetectResponse {
  readonly requestId: string;
  readonly status: ResultStatus;
  readonly confidence: number;
  readonly detection: DetectionInfo;
  readonly device: DeviceSummary | null;
  readonly candidates: readonly CandidateSummary[];
  readonly reasons: readonly ApiReason[];
  readonly clarification?: Clarification;
  readonly presentation: Presentation;
}
