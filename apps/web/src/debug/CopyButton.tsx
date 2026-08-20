import { useState } from 'react';

import { copyToClipboard } from './clipboard';
import styles from './CopyButton.module.css';
import { debugAuxTexts } from './texts';

export interface CopyButtonProps {
  readonly value: string;
  readonly label?: string;
}

/** Кнопка «Скопировать» с кратковременным подтверждением — используется для `requestId` и для записи эталонной выборки. */
export function CopyButton({ value, label = debugAuxTexts.copyButton }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          void copyToClipboard(value).then((ok) => {
            setCopied(ok);
            if (ok) {
              setTimeout(() => {
                setCopied(false);
              }, 2000);
            }
          });
        }}
      >
        {label}
      </button>
      {copied ? <span className={styles.status}>{debugAuxTexts.copiedStatus}</span> : null}
    </span>
  );
}
