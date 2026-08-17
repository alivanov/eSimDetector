# Сборка API для демонстрационного контура (docs/07-integration.md, раздел 7.6).
# На этапе фундамента образ не оптимизирован по размеру: копируется весь
# рабочий каталог монорепозитория. Разделение на слои для кэша сборки и
# отсечение dev-зависимостей в рантайм-образе — задача одного из следующих этапов.

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @esim-detector/api build

FROM node:24-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /workspace

COPY --from=build /workspace ./

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
