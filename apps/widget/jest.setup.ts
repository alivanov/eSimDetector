// Регистрирует дополнительные матчеры (toBeVisible, toHaveTextContent, ...) для тестов
// Web Component на Testing Library — этап 6.3 и далее.
import '@testing-library/jest-dom';

// jsdom не реализует `HTMLCanvasElement.getContext('webgl')` (нет реального GPU) и печатает через
// собственный VirtualConsole сообщение "Not implemented" при каждом обращении к WebGL-зонду
// (`packages/signals-collector`, ADR-038) — ожидаемое и уже обработанное ограничение (сигнал
// `webgl` в результате просто отсутствует, `safeCall` не даёт исключению всплыть), а не дефект,
// поэтому в тестах, вызывающих реальный `collectSignals`, это сообщение в консоли — норма.
