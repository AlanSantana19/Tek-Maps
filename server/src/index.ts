import http from "node:http";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { logger } from "./logger.js";
import { Hub } from "./realtime/Hub.js";
import { AccessGroupRepository } from "./repositories/AccessGroupRepository.js";
import { AccessUserRepository } from "./repositories/AccessUserRepository.js";
import { ActivityRepository } from "./repositories/ActivityRepository.js";
import { CustomIconRepository } from "./repositories/CustomIconRepository.js";
import { MapPermissionRepository } from "./repositories/MapPermissionRepository.js";
import { RecentEventRepository } from "./repositories/RecentEventRepository.js";
import { SettingsRepository } from "./repositories/SettingsRepository.js";
import { TopologyRepository } from "./repositories/TopologyRepository.js";
import { ZabbixCacheRepository } from "./repositories/ZabbixCacheRepository.js";
import { createRoutes } from "./routes.js";
import { ZabbixSyncService } from "./zabbix/ZabbixSyncService.js";

const app = express();
app.use(compression());
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));

const topologyRepository = new TopologyRepository(pool);
const cacheRepository = new ZabbixCacheRepository(pool);
const settingsRepository = new SettingsRepository(pool, config.JWT_SECRET);
const accessUserRepository = new AccessUserRepository(pool);
const accessGroupRepository = new AccessGroupRepository(pool);
const customIconRepository = new CustomIconRepository(pool);
const mapPermissionRepository = new MapPermissionRepository(pool);
const activityRepository = new ActivityRepository(pool);
const recentEventRepository = new RecentEventRepository(pool);

const server = http.createServer(app);
const hub = new Hub(server);

app.use("/api", createRoutes(topologyRepository, cacheRepository, settingsRepository, accessUserRepository, customIconRepository, accessGroupRepository, mapPermissionRepository, activityRepository, hub, recentEventRepository));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error }, "request failed");
  res.status(500).json({ error: "internal_error" });
});

const sync = new ZabbixSyncService(
  settingsRepository,
  cacheRepository,
  config.ZABBIX_POLL_INTERVAL_MS,
  config.ZABBIX_REQUEST_TIMEOUT_MS,
  {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Env Zabbix",
    url: config.ZABBIX_URL,
    user: config.ZABBIX_USER,
    password: config.ZABBIX_PASSWORD,
    active: true
  }
);
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
