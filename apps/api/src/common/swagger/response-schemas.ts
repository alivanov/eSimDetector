/**
 * Инлайн-схемы ответов для `@ApiResponse({ schema })` (docs/06, этап 6 п.8).
 * Классы-DTO ответов не заводятся — только plain-объекты SchemaObject.
 */

const RESULT_STATUS = ['supported', 'not_supported', 'clarification_required'];
const PLATFORM = ['ios', 'android', 'harmonyos', 'other'];
const DEVICE_TYPE = ['phone', 'tablet', 'watch', 'laptop', 'other'];
const ESIM_SUPPORT = ['supported', 'not_supported', 'conditional'];
const DUAL_SIM = ['physical+esim', 'dual-esim', 'esim-only', 'none'];
const CLARIFICATION_KIND = [
  'choose_candidate',
  'answer_question',
  'manual_input',
  'check_on_device',
];
const ACTION_KIND = ['continue', 'clarify', 'manual_search'];
const DATA_CONFIDENCE = ['verified', 'derived', 'unverified', 'quarantined'];

const reasonSchema = {
  type: 'object',
  required: ['code'],
  properties: {
    code: { type: 'string' },
    detail: { type: 'string' },
  },
};

const deviceEsimSummarySchema = {
  type: 'object',
  required: ['support', 'dualSim', 'maxProfiles'],
  properties: {
    support: { type: 'string', enum: ESIM_SUPPORT },
    dualSim: { type: 'string', enum: DUAL_SIM },
    maxProfiles: { type: 'number', nullable: true },
  },
};

const deviceSummarySchema = {
  type: 'object',
  required: ['id', 'brand', 'name', 'esim'],
  properties: {
    id: { type: 'string' },
    brand: { type: 'string' },
    name: { type: 'string' },
    modelCode: { type: 'string' },
    esim: deviceEsimSummarySchema,
  },
};

const candidateSummarySchema = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    esimSupport: { type: 'string', enum: ESIM_SUPPORT },
  },
};

const matchSummarySchema = {
  type: 'object',
  required: ['id', 'name', 'score'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    score: { type: 'number' },
    esimSupport: { type: 'string', enum: ESIM_SUPPORT },
  },
};

const clarificationOptionSchema = {
  type: 'object',
  required: ['id', 'label'],
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
  },
};

const clarificationSchema = {
  type: 'object',
  required: ['kind', 'question'],
  properties: {
    kind: { type: 'string', enum: CLARIFICATION_KIND },
    question: { type: 'string' },
    options: { type: 'array', items: clarificationOptionSchema },
  },
};

const presentationActionSchema = {
  type: 'object',
  required: ['label', 'kind'],
  properties: {
    label: { type: 'string' },
    kind: { type: 'string', enum: ACTION_KIND },
  },
};

const presentationSchema = {
  type: 'object',
  required: ['title', 'description'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    primaryAction: presentationActionSchema,
    secondaryAction: presentationActionSchema,
  },
};

const deviceSourceSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string' },
    checkedAt: { type: 'string', format: 'date-time' },
  },
};

const esimInfoSchema = {
  type: 'object',
  properties: {
    support: { type: 'string', enum: ESIM_SUPPORT },
    dualSim: { type: 'string', enum: DUAL_SIM },
    maxProfiles: { type: 'number', nullable: true },
    notes: { type: 'string' },
    conditions: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
};

/** Карточка устройства `GET /devices/{id}` (без provenance). */
export const deviceCardSchema = {
  type: 'object',
  required: [
    'id',
    'brand',
    'brandTitle',
    'marketingName',
    'name',
    'family',
    'generation',
    'modifiers',
    'modelCodes',
    'platform',
    'deviceType',
    'esim',
    'releaseYear',
    'sources',
    'dataConfidence',
  ],
  properties: {
    id: { type: 'string' },
    brand: { type: 'string', description: 'Слаг бренда (как в GET /brands)' },
    brandTitle: { type: 'string' },
    marketingName: { type: 'string' },
    name: { type: 'string' },
    family: { type: 'string' },
    generation: { type: 'number', nullable: true },
    modifiers: { type: 'array', items: { type: 'string' } },
    modelCodes: { type: 'array', items: { type: 'string' } },
    platform: { type: 'string', enum: PLATFORM },
    deviceType: { type: 'string', enum: DEVICE_TYPE },
    esim: esimInfoSchema,
    releaseYear: { type: 'number' },
    sources: { type: 'array', items: deviceSourceSchema },
    dataConfidence: { type: 'string', enum: DATA_CONFIDENCE },
  },
};

/** `POST /api/v1/detect` — docs/06 §6.2. */
export const detectResponseSchema = {
  type: 'object',
  required: [
    'requestId',
    'status',
    'confidence',
    'detection',
    'device',
    'candidates',
    'reasons',
    'presentation',
  ],
  properties: {
    requestId: { type: 'string' },
    status: { type: 'string', enum: RESULT_STATUS },
    confidence: { type: 'number' },
    detection: {
      type: 'object',
      required: ['method', 'platform', 'exactModelKnown', 'deviceType'],
      properties: {
        method: {
          type: 'string',
          enum: [
            'ua_client_hints_model',
            'legacy_user_agent_model',
            'ios_version_and_screen_signature',
            'unknown',
          ],
        },
        platform: { type: 'string', enum: PLATFORM },
        exactModelKnown: { type: 'boolean' },
        deviceType: { type: 'string', enum: DEVICE_TYPE },
      },
    },
    device: { oneOf: [deviceSummarySchema, { type: 'null' }] },
    candidates: { type: 'array', items: candidateSummarySchema },
    reasons: { type: 'array', items: reasonSchema },
    clarification: clarificationSchema,
    presentation: presentationSchema,
  },
};

/** `GET/POST /api/v1/devices/search` — docs/06 §6.3. */
export const searchResponseSchema = {
  type: 'object',
  required: [
    'requestId',
    'query',
    'status',
    'confidence',
    'device',
    'matches',
    'reasons',
    'presentation',
  ],
  properties: {
    requestId: { type: 'string' },
    query: {
      type: 'object',
      required: ['raw', 'normalized'],
      properties: {
        raw: { type: 'string' },
        normalized: { type: 'string' },
      },
    },
    status: { type: 'string', enum: RESULT_STATUS },
    confidence: { type: 'number' },
    device: { oneOf: [deviceSummarySchema, { type: 'null' }] },
    matches: { type: 'array', items: matchSummarySchema },
    reasons: { type: 'array', items: reasonSchema },
    clarification: clarificationSchema,
    presentation: presentationSchema,
  },
};

/** `GET /api/v1/devices/suggest` — docs/06 §6.4. */
export const suggestResponseSchema = {
  type: 'object',
  required: ['requestId', 'query', 'suggestions'],
  properties: {
    requestId: { type: 'string' },
    query: {
      type: 'object',
      required: ['raw', 'normalized'],
      properties: {
        raw: { type: 'string' },
        normalized: { type: 'string' },
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'brand'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          brand: { type: 'string' },
        },
      },
    },
  },
};

/** `GET /api/v1/devices` — постраничный перечень. */
export const listDevicesResponseSchema = {
  type: 'object',
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: deviceCardSchema },
    total: { type: 'number' },
    page: { type: 'number' },
    pageSize: { type: 'number' },
  },
};

/** `GET /api/v1/brands`. */
export const brandsResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    required: ['brand', 'brandTitle', 'deviceCount'],
    properties: {
      brand: { type: 'string' },
      brandTitle: { type: 'string' },
      deviceCount: { type: 'number' },
    },
  },
};

/** `GET /api/v1/catalog/meta`. */
export const catalogMetaSchema = {
  type: 'object',
  required: ['version', 'deviceCount', 'updatedAt'],
  properties: {
    version: { type: 'string' },
    deviceCount: { type: 'number' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

/** `POST /api/v1/feedback`. */
export const feedbackResponseSchema = {
  type: 'object',
  required: ['requestId', 'received'],
  properties: {
    requestId: { type: 'string' },
    received: { type: 'boolean', enum: [true] },
  },
};

/** Единый формат ошибок docs/06 §6.5. */
export const apiErrorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'VALIDATION_ERROR',
            'UNAUTHORIZED',
            'DEVICE_NOT_FOUND',
            'TASK_NOT_FOUND',
            'RATE_LIMITED',
            'CATALOG_UNAVAILABLE',
            'INTERNAL_ERROR',
          ],
        },
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              issue: { type: 'string' },
            },
          },
        },
        requestId: { type: 'string' },
      },
    },
  },
};

export const healthLiveSchema = {
  type: 'object',
  required: ['status'],
  properties: { status: { type: 'string', enum: ['ok'] } },
};

export const healthReadySchema = {
  type: 'object',
  required: ['status', 'dependencies'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    dependencies: {
      type: 'object',
      required: ['mongodb', 'catalog'],
      properties: {
        mongodb: { type: 'string', enum: ['connected', 'disconnected'] },
        catalog: { type: 'string', enum: ['ready', 'loading', 'error'] },
      },
    },
  },
};

/** Упрощённая схема записи Device для admin-ответов (полная форма — packages/contracts). */
export const deviceRecordSchema = {
  type: 'object',
  description: 'Запись устройства справочника (форма Device из @esim-detector/contracts)',
  additionalProperties: true,
  properties: {
    _id: { type: 'string' },
    brand: { type: 'string' },
    brandTitle: { type: 'string' },
    displayName: { type: 'string' },
    platform: { type: 'string', enum: PLATFORM },
    deviceType: { type: 'string', enum: DEVICE_TYPE },
    status: { type: 'string' },
    esim: esimInfoSchema,
  },
};

export const catalogStatsSchema = {
  type: 'object',
  required: [
    'deviceCount',
    'updatedAt',
    'byBrand',
    'byDataConfidence',
    'openTaskCount',
    'screenSignatureCount',
  ],
  properties: {
    deviceCount: { type: 'number' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
    byBrand: { type: 'object', additionalProperties: { type: 'number' } },
    byDataConfidence: { type: 'object', additionalProperties: { type: 'number' } },
    openTaskCount: { type: 'number' },
    screenSignatureCount: { type: 'number' },
  },
};

export const reloadResultSchema = {
  type: 'object',
  required: ['deviceCount', 'screenSignatureReady'],
  properties: {
    deviceCount: { type: 'number' },
    screenSignatureReady: { type: 'boolean' },
  },
};

export const listChangesResponseSchema = {
  type: 'object',
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    total: { type: 'number' },
    page: { type: 'number' },
    pageSize: { type: 'number' },
  },
};

export const listTasksResponseSchema = {
  type: 'object',
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: true } },
    total: { type: 'number' },
    page: { type: 'number' },
    pageSize: { type: 'number' },
  },
};

export const taskDetailResponseSchema = {
  type: 'object',
  required: ['task', 'suggestions'],
  properties: {
    task: { type: 'object', additionalProperties: true },
    suggestions: {
      type: 'object',
      properties: {
        modelCodes: { type: 'array', items: { type: 'object', additionalProperties: true } },
        screenSignatures: { type: 'array', items: { type: 'object', additionalProperties: true } },
        names: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  },
};

export const resolveOutcomeSchema = {
  type: 'object',
  required: ['taskStatus'],
  properties: {
    taskStatus: { type: 'string', enum: ['resolved', 'rejected'] },
    device: deviceRecordSchema,
  },
};
