import type { DeviceSource } from '@esim-detector/contracts';

/**
 * Разбор и применение `data/catalog/code-suffixes.json` — курируемого ядра связок «суффикс
 * сервисного кода → регион продажи» (docs/09-decisions.md ADR-026/ADR-028, приложение А §А.10).
 *
 * Схема НЕ содержит поля влияния суффикса на статус eSIM ни в каком виде (ADR-028): таблица
 * отвечает только на вопрос «какому региону соответствует код», а не «поддерживает ли устройство
 * eSIM» — это исключено уже на уровне типов (`CodeSuffixEntry` ниже не имеет такого поля), а
 * `parseCodeSuffixes` дополнительно отклоняет запись целиком, если во входных данных встретилось
 * незнакомое поле (в т.ч. `esimEffect`/`support`/`status`) — попытка тихо просунуть такое поле
 * не проходит валидацию, а не игнорируется молча.
 *
 * Файл — курируемое ядро (ADR-026): каждая связка обязана иметь непустой `sources[]` с реальной
 * ссылкой на вендорский/операторский источник и датой сверки. Знание языковой модели (в том числе
 * согласие нескольких выгрузок партии 16, приложение А §А.10.4) источником не является и не
 * присваивает `verified` — оно только сузило перечень кандидатов для ручной сверки этим агентом.
 */

export type CodeSuffixRegion =
  'eu' | 'ru' | 'ca' | 'cn' | 'us' | 'kr' | 'in' | 'jp' | 'tr' | 'latam' | 'mea' | 'sea' | 'global';

const ALLOWED_REGIONS: readonly CodeSuffixRegion[] = [
  'eu',
  'ru',
  'ca',
  'cn',
  'us',
  'kr',
  'in',
  'jp',
  'tr',
  'latam',
  'mea',
  'sea',
  'global',
];

/** `Set<string>`, а не `Set<CodeSuffixRegion>` — так `.has(value: string)` не требует `as` на границе. */
const ALLOWED_REGIONS_SET: ReadonlySet<string> = new Set(ALLOWED_REGIONS);

function isCodeSuffixRegion(value: unknown): value is CodeSuffixRegion {
  return typeof value === 'string' && ALLOWED_REGIONS_SET.has(value);
}

/**
 * Разрешённые поля записи — ровно то, что фиксирует ADR-028, п.1 (`brand`, `code_suffix`,
 * `code_example` опционально, `region`, `sources[].url`/`checkedAt`) плюс `notes` по аналогии с
 * остальными файлами курируемого ядра. Присутствие любого другого поля (в первую очередь —
 * бывшего `esim_effect` схемы CSV партии 16, а также прямых значений типа `support`/`status`) —
 * ошибка данных, а не то, что можно отбросить и продолжить: попытка записать эффект на eSIM в
 * эту таблицу обязана быть замечена при разборе файла, а не молча проигнорирована.
 */
const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  'brand',
  'codeSuffix',
  'codeExample',
  'region',
  'sources',
  'notes',
]);

export interface CodeSuffixEntry {
  readonly brand: string;
  readonly codeSuffix: string;
  readonly codeExample?: string;
  readonly region: CodeSuffixRegion;
  readonly sources: readonly DeviceSource[];
  readonly notes?: string;
}

/** Ключ — `брэнд(нижний регистр)::суффикс(регистр сохранён)`, см. `tableKey`. */
export type CodeSuffixTable = ReadonlyMap<string, CodeSuffixEntry>;

export type CodeSuffixParseResult =
  | { readonly ok: true; readonly value: CodeSuffixTable }
  | { readonly ok: false; readonly errors: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Валидирует И преобразует один источник за один проход — без промежуточного `value is DeviceSource`
 * с последующим `as`: типовой предикат, который проверяет форму, но не выполняет само
 * преобразование (`checkedAt` строка → `Date`), был бы утверждением заведомо неполной проверки,
 * а не гарантией (ADR-016). Возвращает `undefined`, если хотя бы одно поле не подходит.
 */
function tryParseDeviceSource(value: unknown): DeviceSource | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { url, title, checkedAt } = value;
  if (!isNonEmptyString(url) || !isNonEmptyString(title)) {
    return undefined;
  }
  if (typeof checkedAt !== 'string' && !(checkedAt instanceof Date)) {
    return undefined;
  }
  const parsedDate = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return undefined;
  }
  return { url, title, checkedAt: parsedDate };
}

/** Ключ таблицы — регистр бренда не значим, регистр суффикса значим (ADR-028 п.3: точное совпадение). */
function tableKey(brand: string, codeSuffix: string): string {
  return `${brand.toLowerCase()}::${codeSuffix}`;
}

/** Разбор `data/catalog/code-suffixes.json` из недоверенных внешних данных (ADR-016: без `as`). */
export function parseCodeSuffixes(value: unknown): CodeSuffixParseResult {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['code-suffixes.json: ожидался массив записей'] };
  }

  const errors: string[] = [];
  const table = new Map<string, CodeSuffixEntry>();

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`[${index}]: ожидался объект`);
      return;
    }

    for (const key of Object.keys(item)) {
      if (!ALLOWED_FIELDS.has(key)) {
        errors.push(
          `[${index}]: неизвестное поле "${key}" — схема курируемого ядра не содержит влияния ` +
            'суффикса на статус eSIM (docs/09-decisions.md ADR-028)',
        );
      }
    }

    const { brand, codeSuffix, codeExample, region, sources, notes } = item;
    if (!isNonEmptyString(brand)) {
      errors.push(`[${index}].brand: ожидалась непустая строка`);
      return;
    }
    if (!isNonEmptyString(codeSuffix)) {
      errors.push(`[${index}].codeSuffix: ожидалась непустая строка`);
      return;
    }
    if (!isCodeSuffixRegion(region)) {
      errors.push(`[${index}].region: ожидалось одно из ${ALLOWED_REGIONS.join('/')}`);
      return;
    }
    if (codeExample !== undefined && !isNonEmptyString(codeExample)) {
      errors.push(`[${index}].codeExample: ожидалась непустая строка либо отсутствие поля`);
      return;
    }
    if (notes !== undefined && !isNonEmptyString(notes)) {
      errors.push(`[${index}].notes: ожидалась непустая строка либо отсутствие поля`);
      return;
    }
    if (!Array.isArray(sources) || sources.length === 0) {
      // ADR-026: verified-запись курируемого ядра обязана иметь непустой sources[].
      errors.push(`[${index}].sources: ожидался непустой массив (ADR-026)`);
      return;
    }
    const parsedSources: DeviceSource[] = [];
    let sourcesOk = true;
    sources.forEach((rawSource, sourceIndex) => {
      const parsedSource = tryParseDeviceSource(rawSource);
      if (parsedSource === undefined) {
        errors.push(`[${index}].sources[${sourceIndex}]: ожидались поля url/title/checkedAt`);
        sourcesOk = false;
        return;
      }
      parsedSources.push(parsedSource);
    });
    if (!sourcesOk) {
      return;
    }

    const key = tableKey(brand, codeSuffix);
    if (table.has(key)) {
      errors.push(`[${index}]: связка "${brand}"+"${codeSuffix}" уже встречалась в файле`);
      return;
    }

    table.set(key, {
      brand: brand.toLowerCase(),
      codeSuffix,
      region,
      sources: parsedSources,
      ...(codeExample !== undefined ? { codeExample } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: table };
}

/**
 * Регион по связке «бренд + суффикс» — ADR-028 п.3: ТОЛЬКО точное совпадение (регистр бренда не
 * значим, регистр суффикса значим) с проверенной связкой курируемого ядра. Никакого частичного
 * совпадения, префиксов или "похожести" — гарантия точности связки существует только потому, что
 * сравнение точное; ослабление здесь тихо превращает верифицированные данные в догадку.
 */
export function resolveVerifiedRegion(
  brand: string,
  codeSuffix: string,
  table: CodeSuffixTable,
): CodeSuffixRegion | undefined {
  return table.get(tableKey(brand, codeSuffix))?.region;
}

/**
 * Исход резолюции суффикса как дискриминированный тип, а не `region | undefined` — ADR-028 п.4:
 * "неподтверждённый или неизвестный суффикс никогда не даёт отрицательного ответа, только
 * уточнение". Тип `SuffixOutcome` физически не содержит варианта, из которого можно было бы
 * получить `not_supported`/`supported` за пределами известного региона: у отсутствия связи в
 * таблице есть только один возможный исход — `clarification_required`, и это гарантия на уровне
 * типов, а не соглашение, которое можно нарушить в будущем коде, вызывающем эту функцию.
 */
export type SuffixOutcome =
  | { readonly kind: 'region_known'; readonly region: CodeSuffixRegion }
  | { readonly kind: 'clarification_required' };

export function resolveSuffixOutcome(
  brand: string,
  codeSuffix: string,
  table: CodeSuffixTable,
): SuffixOutcome {
  const region = resolveVerifiedRegion(brand, codeSuffix, table);
  return region === undefined
    ? { kind: 'clarification_required' }
    : { kind: 'region_known', region };
}
