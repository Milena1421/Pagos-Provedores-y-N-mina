FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8080
ENV VITE_SUPABASE_URL=""
ENV VITE_SUPABASE_ANON_KEY=""
ENV GEMINI_API_KEY=""

RUN rm /etc/nginx/conf.d/default.conf && \
    printf '%s\n' \
    'server {' \
    '  listen ${PORT};' \
    '  server_name _;' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '' \
    '  location / {' \
    '    try_files $uri $uri/ /index.html;' \
    '  }' \
    '' \
    '  location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {' \
    '    expires 30d;' \
    '    add_header Cache-Control "public, max-age=2592000, immutable";' \
    '    try_files $uri =404;' \
    '  }' \
    '}' > /etc/nginx/templates/default.conf.template

RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'cat > /usr/share/nginx/html/env-config.js <<EOF' \
    'window.__APP_CONFIG__ = {' \
    '  VITE_SUPABASE_URL: "${VITE_SUPABASE_URL}",' \
    '  VITE_SUPABASE_ANON_KEY: "${VITE_SUPABASE_ANON_KEY}",' \
    '  GEMINI_API_KEY: "${GEMINI_API_KEY}"' \
    '};' \
    'EOF' \
    > /docker-entrypoint.d/40-env-config.sh && \
    chmod +x /docker-entrypoint.d/40-env-config.sh

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
