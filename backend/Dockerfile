# ---- Backend production image ----
FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# Applies pending migrations, then boots the API. Requires DATABASE_URL,
# JWT_SECRET, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, CORS_ORIGIN to be
# provided as environment variables at runtime (see DEPLOYMENT.md).
CMD ["npm", "run", "start:prod"]
