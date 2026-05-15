FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package.json
RUN npm install --workspace server --include-workspace-root=false

FROM deps AS test
WORKDIR /app
COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
RUN npm run test --workspace server

FROM deps AS build
WORKDIR /app
COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
RUN npm run build --workspace server

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package.json
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/server/dist server/dist
EXPOSE 4000
CMD ["npm", "run", "start", "--workspace", "server"]
