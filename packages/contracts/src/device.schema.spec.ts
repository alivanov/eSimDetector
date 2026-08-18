import { deviceSchema, parseDevice, safeParseDevice } from './device.schema';
import { buildSampleDevice } from './test-fixtures';

describe('deviceSchema', () => {
  it('принимает валидную запись и сохраняет все поля', () => {
    const sample = buildSampleDevice();
    const parsed = parseDevice(sample);

    expect(parsed._id).toBe('samsung-galaxy-s24-ultra');
    expect(parsed.esim.support).toBe('supported');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('приводит строковые даты (внешние данные, JSON) к Date (z.coerce.date)', () => {
    const raw = {
      ...buildSampleDevice(),
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      provenance: {
        source: 'curated',
        batchId: null,
        importedAt: '2024-01-01T00:00:00.000Z',
        agreementCount: null,
      },
    };

    const parsed = parseDevice(raw);

    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.provenance.importedAt).toBeInstanceOf(Date);
  });

  it('не приводит к типу утверждением `as` — ошибка схемы возвращается как ZodError, а не бросает произвольное значение', () => {
    const result = safeParseDevice({ not: 'a device' });

    expect(result.success).toBe(false);
    expect(result.device).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it('отклоняет запись без обязательного поля', () => {
    const { _id, ...withoutId } = buildSampleDevice();
    void _id;

    const result = deviceSchema.safeParse(withoutId);

    expect(result.success).toBe(false);
  });

  it('отклоняет неизвестное значение перечисления', () => {
    const raw = { ...buildSampleDevice(), platform: 'symbian' };

    const result = deviceSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  it('принимает запись с esim.support: conditional, у которой заполнены conditions и clarifyingQuestion', () => {
    const conditional = buildSampleDevice({
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [
          {
            scope: 'region',
            value: 'CN',
            support: 'not_supported',
            note: 'версия для КНР без eSIM',
          },
        ],
        clarifyingQuestion: {
          kind: 'region',
          question: 'Устройство приобретено в Китае?',
          options: [
            { value: 'yes', label: 'Да' },
            { value: 'no', label: 'Нет' },
          ],
        },
        notes: '',
      },
    });

    const result = deviceSchema.safeParse(conditional);

    expect(result.success).toBe(true);
  });

  it('отклоняет условие с support: conditional внутри esim.conditions (запрещённая вложенность)', () => {
    const raw = {
      ...buildSampleDevice(),
      esim: {
        support: 'conditional',
        dualSim: 'physical+esim',
        maxProfiles: 2,
        conditions: [{ scope: 'region', value: 'CN', support: 'conditional', note: '...' }],
        clarifyingQuestion: {
          kind: 'region',
          question: '...',
          options: [{ value: 'yes', label: 'Да' }],
        },
        notes: '',
      },
    };

    const result = deviceSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });
});
