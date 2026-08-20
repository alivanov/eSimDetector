import type { ApiReason } from '@esim-detector/widget';

import styles from './ReasonsTable.module.css';
import { debugAuxTexts } from './texts';

export interface ReasonsTableProps {
  readonly reasons: readonly ApiReason[] | undefined;
}

/**
 * Таблица `reasons[]` — главный предъявляемый артефакт стенда (ADR-010, критерий К3): код и
 * деталь каждого сработавшего правила БУКВАЛЬНО из ответа API, без интерпретации.
 */
export function ReasonsTable({ reasons }: ReasonsTableProps) {
  if (reasons === undefined) {
    return <p className={styles.empty}>{debugAuxTexts.noReasonsYet}</p>;
  }
  if (reasons.length === 0) {
    return <p className={styles.empty}>{debugAuxTexts.reasonsEmpty}</p>;
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{debugAuxTexts.reasonCodeColumn}</th>
          <th scope="col">{debugAuxTexts.reasonDetailColumn}</th>
        </tr>
      </thead>
      <tbody>
        {reasons.map((reason, index) => (
          <tr key={`${reason.code}-${String(index)}`}>
            <td className={styles.code}>{reason.code}</td>
            <td>{reason.detail ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
