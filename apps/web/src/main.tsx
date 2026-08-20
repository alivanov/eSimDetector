import { injectDesignTokensStyle } from '@esim-detector/widget';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

// Демонстрационное приложение не имеет теневого DOM — переменные токенов (`--esim-*`, ADR-012)
// публикуются в `:root` документа один раз при старте (`injectDesignTokensStyle`, ADR-038/ADR-039).
// Будущий Web Component (этап 6.3) вызовет ту же функцию с `shadowRoot` вместо `document`.
injectDesignTokensStyle(document);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Элемент #root не найден в index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
