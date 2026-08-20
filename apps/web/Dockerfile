# Сборка демонстрационного приложения и статики виджета для демонстрационного контура
# (docs/07-integration.md §7.6). Тот же порядок, что apps/api/Dockerfile (этап фундамента):
# копируется весь рабочий каталог монорепозитория, сборка не оптимизирована по размеру слоёв.

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN pnpm install --frozen-lockfile
# "..." — сборка пакета и ВСЕХ его зависимостей рабочего пространства в топологическом порядке
# (тот же приём, что apps/api/Dockerfile). Обе точки сборки apps/widget/src (docs/07 §7.2/§7.9,
# ADR-040) нужны раздельно: библиотечная сборка виджета в один файл `widget/v1/esim-widget.js`
# (эта строка) — самостоятельный артефакт, копируемый ниже в статику nginx; apps/web использует
# тот же исходник напрямую через обычный импорт пакета (ADR-038/ADR-039), поэтому вторая строка
# строит демонстрационное приложение отдельно, не полагаясь на dist виджета.
RUN pnpm --filter @esim-detector/widget... build
RUN pnpm --filter @esim-detector/web... build

FROM nginx:1.27-alpine AS runtime
# Переменная окружения по образцу существующих сервисов docker-compose.yml (задача этапа 6.4,
# п.4) — рабочее значение по умолчанию без файла .env (docs/07 §7.6): совпадает с именем сервиса
# api в docker-compose.yml. Шаблон подставляет её в конфиг nginx при старте контейнера.
ENV API_UPSTREAM=api:3000

COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY --from=build /workspace/apps/widget/dist/widget /usr/share/nginx/html/widget
# Страница-пример подключения виджета одним тегом <script> (apps/widget/example/index.html,
# этап 6.3) — адрес docs/07 §7.6 обновлён этим агентом на /widget-example/.
COPY --from=build /workspace/apps/widget/example/index.html /usr/share/nginx/html/widget-example/index.html

EXPOSE 8080
