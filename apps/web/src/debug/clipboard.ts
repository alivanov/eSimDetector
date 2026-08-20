/** Копирование в буфер обмена — используется и для `requestId`, и для записи эталонной выборки. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
