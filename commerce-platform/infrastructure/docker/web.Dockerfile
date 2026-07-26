FROM node:20-alpine AS build
ARG APP_PACKAGE
ARG NEXT_PUBLIC_COMMERCE_API_URL
ENV NEXT_PUBLIC_COMMERCE_API_URL=$NEXT_PUBLIC_COMMERCE_API_URL
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${APP_PACKAGE}"... build

FROM node:20-alpine AS runtime
ARG APP_PACKAGE
ENV NODE_ENV=production
ENV APP_PACKAGE=$APP_PACKAGE
WORKDIR /workspace
RUN corepack enable
COPY --from=build /workspace ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter \"$APP_PACKAGE\" start"]
