# Tek Map

Aplicacao web para topologia de rede interativa com sincronizacao de metricas via Zabbix API.

## Stack

- Frontend: React, Vite, React Flow, WebSocket
- Backend: Node.js, Express, WebSocket, PostgreSQL
- Testes: Vitest
- Persistencia: PostgreSQL para topologias e cache de metricas

## Configuracao

1. Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

Variaveis principais:

- `DATABASE_URL`: conexao PostgreSQL.
- `JWT_SECRET`: segredo para assinar tokens locais.
- `ZABBIX_URL`: endpoint JSON-RPC, normalmente `https://seu-zabbix/api_jsonrpc.php`.
- `ZABBIX_USER` e `ZABBIX_PASSWORD`: usuario dedicado de API no Zabbix, com permissao somente aos grupos de hosts monitorados.
- `ZABBIX_POLL_INTERVAL_MS`: intervalo de sincronizacao. Use valores conservadores em ambientes grandes.

2. Suba com containers:

```bash
docker compose up --build
```

Frontend: `http://sygtek.com.br:9000`

API: `http://localhost:4000`

PostgreSQL fica exposto em `localhost:5433` por padrao para evitar conflito com instalacoes locais. Para mudar:

```bash
POSTGRES_PORT=5432 docker compose up --build
```

Para publicar em outro host/porta HTTP, ajuste `HTTP_PORT` no `.env`. Por padrao, o container publica o frontend em `9000`, entao o acesso fica em `http://sygtek.com.br:9000`. Aponte o DNS de `sygtek.com.br` para o IP do servidor Debian:

```text
A     @      31.97.171.29
A     www    31.97.171.29
```

Para usar uma instancia Zabbix real, exporte as variaveis antes do `docker compose up` ou coloque em `.env`:

```bash
ZABBIX_URL=https://zabbix.example.com/api_jsonrpc.php
ZABBIX_USER=api-user
ZABBIX_PASSWORD=api-password
JWT_SECRET=um-segredo-com-mais-de-16-caracteres
ADMIN_PASSWORD=senha-da-aplicacao
```

3. Fluxo local sem containers:

```bash
docker compose up -d postgres
```

Instale dependencias:

```bash
npm install
```

Rode backend e frontend:

```bash
npm run dev
```

- API local: `http://localhost:4000`
- Frontend local: `http://localhost:5173`

## Autenticacao local

Este exemplo usa login local simplificado para proteger a API da aplicacao:

- Usuario: `admin`
- Senha: valor de `ADMIN_PASSWORD`, ou `admin` em desenvolvimento.

Em producao, substitua por SSO/OIDC ou um provedor corporativo.

## Como funciona a integracao Zabbix

O backend autentica via `user.login` e guarda o token somente em memoria. O `ZabbixSyncService` faz polling periodico com chamadas agregadas:

- `host.get` para inventario basico e interfaces.
- `item.get` para ultimos valores de CPU, memoria, disco e portas.
- `problem.get` para alertas ativos.

Os dados sao normalizados por host, salvos em cache no PostgreSQL e enviados aos clientes conectados por WebSocket.

## Topologia

O frontend permite:

- adicionar devices a partir dos hosts sincronizados do Zabbix;
- arrastar e reposicionar devices;
- conectar devices;
- salvar e recarregar a topologia;
- receber metricas em tempo real via WebSocket;
- usar zoom e pan no canvas.

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run lint
```

## Producao

Recomendacoes antes de deploy:

- usar HTTPS entre browser, API e Zabbix;
- armazenar segredos em vault/secret manager;
- limitar permissoes do usuario Zabbix;
- ajustar `ZABBIX_POLL_INTERVAL_MS` conforme volume de hosts;
- colocar a API atras de reverse proxy com rate limit;
- habilitar backups do PostgreSQL.
