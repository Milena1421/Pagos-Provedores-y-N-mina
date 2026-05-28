FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG GEMINI_API_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN test -n "$VITE_SUPABASE_URL" || (echo "Missing build arg: VITE_SUPABASE_URL" && exit 1)
RUN test -n "$VITE_SUPABASE_ANON_KEY" || (echo "Missing build arg: VITE_SUPABASE_ANON_KEY" && exit 1)
RUN test -n "$GEMINI_API_KEY" || (echo "Missing build arg: GEMINI_API_KEY" && exit 1)

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

ENV PORT=8080

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

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
