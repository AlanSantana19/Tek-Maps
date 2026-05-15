FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY client/package.json client/package.json
RUN npm install --workspace client --include-workspace-root=false

FROM deps AS test
WORKDIR /app
COPY client client
RUN npm run test --workspace client

FROM deps AS build
WORKDIR /app
COPY client client
RUN npm run build --workspace client

FROM nginx:1.27-alpine AS runtime
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
