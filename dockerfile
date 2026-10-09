# ---- Build stage ----
FROM node:22-bookworm-slim AS builder
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate \
 && ls -la node_modules/.prisma/client
RUN npm run build

# ---- Production deps stage ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json ./
RUN npm install
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# ---- Final stage ----
FROM gcr.io/distroless/nodejs22-debian12 AS production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://neondb_owner:npg_UTAK3sqg9pkm@ep-jolly-snow-b4b986fe-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
EXPOSE 3000

USER nonroot
CMD ["dist/src/main.js"]

#build command (from project root): docker build -t qcms-backend:latest ./
#docker run -p 3000:3000 qcms-backend:latest