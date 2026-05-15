import http from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { logger } from "./logger.js";
import { Hub } from "./realtime/Hub.js";
import { AccessUserRepository } from "./repositories/AccessUserRepository.js";
import { SettingsRepository } from "./repositories/SettingsRepository.js";
import { TopologyRepository } from "./repositories/TopologyRepository.js";
import { ZabbixCacheRepository } from "./repositories/ZabbixCacheRepository.js";
import { createRoutes } from "./routes.js";
import { ZabbixClient } from "./zabbix/ZabbixClient.js";
import { ZabbixSyncService } from "./zabbix/ZabbixSyncService.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

const topologyRepository = new TopologyRepository(pool);
const cacheRepository = new ZabbixCacheRepository(pool);
const settingsRepository = new SettingsRepository(pool);
const accessUserRepository = new AccessUserRepository(pool);
app.use("/api", createRoutes(topologyRepository, cacheRepository, settingsRepository, accessUserRepository));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error }, "request failed");
  res.status(500).json({ error: "internal_error" });
});

const server = http.createServer(app);
const hub = new Hub(server);
const zabbix = new ZabbixClient({
  url: config.ZABBIX_URL,
  user: config.ZABBIX_USER,
  password: config.ZABBIX_PASSWORD,
  timeoutMs: config.ZABBIX_REQUEST_TIMEOUT_MS
});
const sync = new ZabbixSyncService(zabbix, cacheRepository, config.ZABBIX_POLL_INTERVAL_MS);
sync.on("snapshots", (snapshots) => hub.broadcastSnapshots(snapshots));

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "tek-map api listening");
  sync.start();
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  logger.info("shutting down");
  sync.stop();
  server.close();
  await pool.end();
  process.exit(0);
}
