export type { ResultStatus, Platform, DeviceType, EsimSupport, DualSimMode } from './enums';

export type { ApiReason } from './reason';

export type { PresentationActionKind, PresentationAction, Presentation } from './presentation';

export type { ClarificationKind, ClarificationOption, Clarification } from './clarification';

export type {
  DeviceEsimSummary,
  DeviceSummary,
  CandidateSummary,
  MatchSummary,
} from './device-summary';

export type { ApiErrorDetail, ApiErrorBody } from './error';
export { ApiRequestError, ApiNetworkError, ApiParseError, parseApiErrorBody } from './error';

export type {
  DetectRequestContext,
  DetectRequestBody,
  DetectionMethod,
  DetectionInfo,
  DetectResponse,
} from './detect';
export { detect, parseDetectResponse } from './detect';

export type { SearchQuery, SearchResponse } from './search';
export { searchDevices, parseSearchResponse } from './search';

export type { SuggestItem, SuggestResponse } from './suggest';
export { suggestDevices, parseSuggestResponse, MAX_SUGGEST_LIMIT } from './suggest';

export type { CatalogMeta } from './catalog-meta';
export { getCatalogMeta, parseCatalogMeta } from './catalog-meta';

export type { DeviceCard, DeviceCardEsim } from './device-card';
export { getDeviceById, parseDeviceCard } from './device-card';

export type { DeviceCardResultView } from './result-from-device-card';
export { buildExactModelPresentation, resultViewFromDeviceCard } from './result-from-device-card';
