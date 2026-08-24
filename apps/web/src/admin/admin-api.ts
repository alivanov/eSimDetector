import type { CatalogChangeEntry, Device, ModerationTask } from '@esim-detector/contracts';
import {
  catalogChangeEntrySchema,
  deviceSchema,
  moderationTaskSchema,
} from '@esim-detector/contracts';
import type { ApiErrorBody } from '@esim-detector/widget';
import { parseApiErrorBody } from '@esim-detector/widget';

/**
 * Клиент раздела `/admin` (docs/15-moderation.md §15.7—§15.8) — тонкая обёртка над `fetch`,
 * прикладывающая заголовок `X-Admin-Token` к каждому запросу (ADR-025 п.5). Ответ проходит
 * разбор схемой (ADR-016: внешние данные не приводятся к типу утверждением `as`) —
 * `moderationTaskSchema`/`deviceSchema`/`catalogChangeEntrySchema` переиспользованы из
 * `@esim-detector/contracts` как есть, а не заведены здесь заново; для формы ошибки
 * переиспользован `parseApiErrorBody` из `@esim-detector/widget` (тот же приём, что уже
 * применяет `apps/web/src/debug/api.ts`).
 */

const API_BASE = '';
const ADMIN_TOKEN_HEADER = 'X-Admin-Token';

export type AdminApiOutcome<T> =
  | { readonly kind: 'success'; readonly data: T }
  | { readonly kind: 'error'; readonly error: ApiErrorBody }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'parse-error' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

async function requestRaw(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ readonly ok: boolean; readonly status: number; readonly body: unknown } | undefined> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        [ADMIN_TOKEN_HEADER]: token,
        ...init?.headers,
      },
    });
  } catch {
    return undefined;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { ok: response.ok, status: response.status, body };
}

async function request<T>(
  token: string,
  path: string,
  parse: (body: unknown) => T | undefined,
  init?: RequestInit,
): Promise<AdminApiOutcome<T>> {
  const raw = await requestRaw(token, path, init);
  if (raw === undefined) {
    return { kind: 'network-error' };
  }
  if (!raw.ok) {
    const errorBody = parseApiErrorBody(raw.body);
    if (errorBody === undefined) {
      return { kind: 'network-error' };
    }
    return { kind: 'error', error: errorBody };
  }
  const parsed = parse(raw.body);
  if (parsed === undefined) {
    return { kind: 'parse-error' };
  }
  return { kind: 'success', data: parsed };
}

export interface TaskSuggestions {
  readonly modelCodes?: readonly {
    readonly deviceId: string;
    readonly deviceName: string;
    readonly matchedCode: string;
    readonly commonPrefixLength: number;
  }[];
  readonly screenSignatures?: readonly {
    readonly signature: string;
    readonly candidates: readonly string[];
    readonly distance: number;
  }[];
  readonly names?: readonly {
    readonly deviceId: string;
    readonly deviceName: string;
    readonly score: number;
  }[];
}

export interface ListTasksResult {
  readonly items: readonly ModerationTask[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

function parseTaskArray(value: unknown): readonly ModerationTask[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = moderationTaskSchema.array().safeParse(value);
  return result.success ? result.data : undefined;
}

function parseListTasksResult(body: unknown): ListTasksResult | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const items = parseTaskArray(body['items']);
  if (items === undefined) {
    return undefined;
  }
  return {
    items,
    total: readNumber(body['total']),
    page: readNumber(body['page']),
    pageSize: readNumber(body['pageSize']),
  };
}

function parseTaskSuggestions(value: unknown): TaskSuggestions {
  if (!isRecord(value)) {
    return {};
  }
  return {
    ...(Array.isArray(value['modelCodes']) ? { modelCodes: value['modelCodes'] } : {}),
    ...(Array.isArray(value['screenSignatures'])
      ? { screenSignatures: value['screenSignatures'] }
      : {}),
    ...(Array.isArray(value['names']) ? { names: value['names'] } : {}),
  };
}

export interface TaskDetailResult {
  readonly task: ModerationTask;
  readonly suggestions: TaskSuggestions;
}

function parseTaskDetail(body: unknown): TaskDetailResult | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const taskResult = moderationTaskSchema.safeParse(body['task']);
  if (!taskResult.success) {
    return undefined;
  }
  return { task: taskResult.data, suggestions: parseTaskSuggestions(body['suggestions']) };
}

export interface ResolveOutcome {
  readonly taskStatus: string;
  readonly device?: Device;
}

function parseResolveOutcome(body: unknown): ResolveOutcome | undefined {
  if (!isRecord(body) || typeof body['taskStatus'] !== 'string') {
    return undefined;
  }
  const deviceResult = deviceSchema.safeParse(body['device']);
  return {
    taskStatus: body['taskStatus'],
    ...(deviceResult.success ? { device: deviceResult.data } : {}),
  };
}

function parseDeviceArray(body: unknown): readonly Device[] | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }
  const result = deviceSchema.array().safeParse(body);
  return result.success ? result.data : undefined;
}

function parseDevice(body: unknown): Device | undefined {
  const result = deviceSchema.safeParse(body);
  return result.success ? result.data : undefined;
}

export interface ListChangesResult {
  readonly items: readonly CatalogChangeEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

function parseListChangesResult(body: unknown): ListChangesResult | undefined {
  if (!isRecord(body) || !Array.isArray(body['items'])) {
    return undefined;
  }
  const itemsResult = catalogChangeEntrySchema.array().safeParse(body['items']);
  if (!itemsResult.success) {
    return undefined;
  }
  return {
    items: itemsResult.data,
    total: readNumber(body['total']),
    page: readNumber(body['page']),
    pageSize: readNumber(body['pageSize']),
  };
}

export interface CatalogStats {
  readonly deviceCount: number;
  readonly updatedAt: string | null;
  readonly byBrand: Readonly<Record<string, number>>;
  readonly byDataConfidence: Readonly<Record<string, number>>;
  readonly openTaskCount: number;
  readonly screenSignatureCount: number;
}

function parseStats(body: unknown): CatalogStats | undefined {
  if (!isRecord(body) || !isRecord(body['byBrand']) || !isRecord(body['byDataConfidence'])) {
    return undefined;
  }
  return {
    deviceCount: readNumber(body['deviceCount']),
    updatedAt: typeof body['updatedAt'] === 'string' ? body['updatedAt'] : null,
    byBrand: Object.fromEntries(
      Object.entries(body['byBrand']).map(([key, v]) => [key, readNumber(v)]),
    ),
    byDataConfidence: Object.fromEntries(
      Object.entries(body['byDataConfidence']).map(([key, v]) => [key, readNumber(v)]),
    ),
    openTaskCount: readNumber(body['openTaskCount']),
    screenSignatureCount: readNumber(body['screenSignatureCount']),
  };
}

export interface ReloadResult {
  readonly deviceCount: number;
  readonly screenSignatureReady: boolean;
}

function parseReloadResult(body: unknown): ReloadResult | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  return {
    deviceCount: readNumber(body['deviceCount']),
    screenSignatureReady: body['screenSignatureReady'] === true,
  };
}

export function listTasks(
  token: string,
  filters: { readonly kind?: string; readonly status?: string; readonly page?: number },
): Promise<AdminApiOutcome<ListTasksResult>> {
  const params = new URLSearchParams();
  if (filters.kind !== undefined) params.set('kind', filters.kind);
  if (filters.status !== undefined) params.set('status', filters.status);
  if (filters.page !== undefined) params.set('page', String(filters.page));
  return request(
    token,
    `/api/v1/admin/moderation/tasks?${params.toString()}`,
    parseListTasksResult,
  );
}

export function getTask(token: string, id: string): Promise<AdminApiOutcome<TaskDetailResult>> {
  return request(token, `/api/v1/admin/moderation/tasks/${id}`, parseTaskDetail);
}

export interface ResolveTaskBody {
  readonly action: string;
  readonly decidedBy: string;
  readonly reason?: string;
  readonly deviceId?: string;
  readonly esimSupport?: 'supported' | 'not_supported' | 'conditional';
  readonly sourceUrl?: string;
  readonly sourceTitle?: string;
  readonly note?: string;
}

export function resolveTask(
  token: string,
  id: string,
  body: ResolveTaskBody,
): Promise<AdminApiOutcome<ResolveOutcome>> {
  return request(token, `/api/v1/admin/moderation/tasks/${id}/resolve`, parseResolveOutcome, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function searchDevices(
  token: string,
  query: string,
): Promise<AdminApiOutcome<readonly Device[]>> {
  const params = new URLSearchParams({ q: query });
  return request(token, `/api/v1/admin/devices?${params.toString()}`, parseDeviceArray);
}

export function getDevice(token: string, id: string): Promise<AdminApiOutcome<Device>> {
  return request(token, `/api/v1/admin/devices/${id}`, parseDevice);
}

export interface UpdateDeviceBody {
  readonly esim?: {
    readonly support?: 'supported' | 'not_supported' | 'conditional';
    readonly notes?: string;
  };
  readonly dataConfidence?: 'verified' | 'derived' | 'unverified' | 'quarantined';
  readonly sources?: readonly { readonly url: string; readonly title: string }[];
  readonly status?: 'active' | 'deprecated';
  readonly deviceType?: 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';
  readonly decidedBy: string;
  readonly reason: string;
}

export function updateDevice(
  token: string,
  id: string,
  body: UpdateDeviceBody,
): Promise<AdminApiOutcome<Device>> {
  return request(token, `/api/v1/admin/devices/${id}`, parseDevice, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function addAlias(
  token: string,
  body: { readonly deviceId: string; readonly alias: string; readonly decidedBy: string },
): Promise<AdminApiOutcome<Device>> {
  return request(token, '/api/v1/admin/aliases', parseDevice, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface CreateDeviceBody {
  readonly id: string;
  readonly brand: string;
  readonly brandTitle: string;
  readonly marketingName: string;
  readonly family: string;
  readonly modelCodes?: readonly string[];
  readonly aliases?: readonly string[];
  readonly platform: 'ios' | 'android' | 'harmonyos' | 'other';
  readonly deviceType: 'phone' | 'tablet' | 'watch' | 'laptop' | 'other';
  readonly esimSupport: 'supported' | 'not_supported' | 'conditional';
  readonly releaseYear: number;
  readonly sources?: readonly { readonly url: string; readonly title: string }[];
  readonly decidedBy: string;
  readonly reason: string;
  readonly resolvesTaskId?: string;
}

export function createDevice(
  token: string,
  body: CreateDeviceBody,
): Promise<AdminApiOutcome<Device>> {
  return request(token, '/api/v1/admin/devices', parseDevice, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listChanges(
  token: string,
  filters: { readonly deviceId?: string; readonly page?: number },
): Promise<AdminApiOutcome<ListChangesResult>> {
  const params = new URLSearchParams();
  if (filters.deviceId !== undefined) params.set('deviceId', filters.deviceId);
  if (filters.page !== undefined) params.set('page', String(filters.page));
  return request(token, `/api/v1/admin/changes?${params.toString()}`, parseListChangesResult);
}

export function getStats(token: string): Promise<AdminApiOutcome<CatalogStats>> {
  return request(token, '/api/v1/admin/catalog/stats', parseStats);
}

export function reloadCatalog(token: string): Promise<AdminApiOutcome<ReloadResult>> {
  return request(token, '/api/v1/admin/catalog/reload', parseReloadResult, { method: 'POST' });
}

export type EvalRunStatus = 'running' | 'completed' | 'failed';
export type EvalRunPhase = 'detection' | 'matching';

export interface EvalRunSummary {
  readonly detectionFalsePositives: number;
  readonly matchingFalsePositives: number;
  readonly detectionTotal: number;
  readonly matchingTotal: number;
  readonly falsePositives: number;
}

export interface EvalRun {
  readonly id: string;
  readonly status: EvalRunStatus;
  readonly progress: {
    readonly completed: number;
    readonly total: number;
    readonly phase: EvalRunPhase | null;
  };
  readonly summary: EvalRunSummary | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly createdAt: string;
  readonly hasReport: boolean;
}

function parseEvalRun(body: unknown): EvalRun | undefined {
  if (!isRecord(body) || typeof body['id'] !== 'string' || typeof body['status'] !== 'string') {
    return undefined;
  }
  const status = body['status'];
  if (status !== 'running' && status !== 'completed' && status !== 'failed') {
    return undefined;
  }
  const progressRaw = body['progress'];
  if (!isRecord(progressRaw)) {
    return undefined;
  }
  const phaseRaw = progressRaw['phase'];
  const phase = phaseRaw === 'detection' || phaseRaw === 'matching' ? phaseRaw : null;
  let summary: EvalRunSummary | null = null;
  const summaryRaw = body['summary'];
  if (isRecord(summaryRaw)) {
    summary = {
      detectionFalsePositives: readNumber(summaryRaw['detectionFalsePositives']),
      matchingFalsePositives: readNumber(summaryRaw['matchingFalsePositives']),
      detectionTotal: readNumber(summaryRaw['detectionTotal']),
      matchingTotal: readNumber(summaryRaw['matchingTotal']),
      falsePositives: readNumber(summaryRaw['falsePositives']),
    };
  }
  return {
    id: body['id'],
    status,
    progress: {
      completed: readNumber(progressRaw['completed']),
      total: readNumber(progressRaw['total']),
      phase,
    },
    summary,
    errorMessage: typeof body['errorMessage'] === 'string' ? body['errorMessage'] : null,
    startedAt: typeof body['startedAt'] === 'string' ? body['startedAt'] : '',
    finishedAt: typeof body['finishedAt'] === 'string' ? body['finishedAt'] : null,
    createdAt: typeof body['createdAt'] === 'string' ? body['createdAt'] : '',
    hasReport: body['hasReport'] === true,
  };
}

function parseEvalRunList(body: unknown): { readonly items: readonly EvalRun[] } | undefined {
  if (!isRecord(body) || !Array.isArray(body['items'])) {
    return undefined;
  }
  const items: EvalRun[] = [];
  for (const item of body['items']) {
    const parsed = parseEvalRun(item);
    if (parsed === undefined) {
      return undefined;
    }
    items.push(parsed);
  }
  return { items };
}

export function listEvalRuns(
  token: string,
): Promise<AdminApiOutcome<{ readonly items: readonly EvalRun[] }>> {
  return request(token, '/api/v1/admin/eval/runs', parseEvalRunList);
}

export function getEvalRun(token: string, id: string): Promise<AdminApiOutcome<EvalRun>> {
  return request(token, `/api/v1/admin/eval/runs/${id}`, parseEvalRun);
}

export function startEvalRun(token: string): Promise<AdminApiOutcome<EvalRun>> {
  return request(token, '/api/v1/admin/eval/runs', parseEvalRun, { method: 'POST' });
}

export async function downloadEvalReport(
  token: string,
  id: string,
): Promise<AdminApiOutcome<string>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1/admin/eval/runs/${id}/report`, {
      headers: { [ADMIN_TOKEN_HEADER]: token },
    });
  } catch {
    return { kind: 'network-error' };
  }
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const errorBody = parseApiErrorBody(body);
    if (errorBody === undefined) {
      return { kind: 'network-error' };
    }
    return { kind: 'error', error: errorBody };
  }
  const markdown = await response.text();
  return { kind: 'success', data: markdown };
}
