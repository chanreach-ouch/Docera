# Stage 1: Build static assets
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve via Nginx unprivileged
FROM nginxinc/nginx-unprivileged:1.27-alpine-slim

USER root
# Ensure nginx mime.types includes .mjs as application/javascript for ES module workers
RUN grep -q "mjs" /etc/nginx/mime.types || sed -i 's/application\/javascript                           js;/application\/javascript                           js mjs;/' /etc/nginx/mime.types
USER 101

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
