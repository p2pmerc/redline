# Builds the web app and the API, then serves both from one Node process.
FROM node:24-slim AS build
WORKDIR /app
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY web web
COPY server server
RUN cd web && npm run build && cd ../server && npm run build

FROM node:24-slim
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/web/dist DATA_DIR=/data
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
EXPOSE 8080
CMD ["node", "server/dist/server-main.js"]
