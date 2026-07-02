# ---- Frontend production image ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# VITE_API_URL is baked into the static build at build time.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
