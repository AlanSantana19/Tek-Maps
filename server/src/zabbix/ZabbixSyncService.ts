import { EventEmitter } from "node:events";
import { logger } from "../logger.js";
import type { ZabbixCacheRepository } from "../repositories/ZabbixCacheRepository.js";
import type { DeviceSnapshot } from "../types.js";
import { mapZabbixSnapshots } from "./mapper.js";
import type { ZabbixClient } from "./ZabbixClient.js";

export class ZabbixSyncService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly client: ZabbixClient,
    private readonly cache: ZabbixCacheRepository,
    private readonly intervalMs: number
  ) {
    super();
  }

  start() {
    void this.sync();
    this.timer = setInterval(() => void this.sync(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sync(): Promise<DeviceSnapshot[]> {
    if (this.running) {
      return [];
    }

    this.running = true;
    try {
      const hosts = await this.client.call<any[]>("host.get", {
        output: ["hostid", "host", "name", "status", "maintenance_status"],
        selectInterfaces: ["ip", "dns", "type", "main"],
        monitored_hosts: true
      });

      const hostIds = hosts.map((host) => host.hostid);
      if (hostIds.length === 0) {
        await this.cache.replaceAll([]);
        return [];
      }

      const [items, problems] = await Promise.all([
        this.client.call<any[]>("item.get", {
          output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
          hostids: hostIds,
          monitored: true,
          filter: { status: "0" },
          sortfield: "name",
          limit: Math.max(500, hostIds.length * 80)
        }),
        this.client.call<any[]>("problem.get", {
          output: ["eventid", "objectid", "name", "severity", "clock"],
          hostids: hostIds,
          recent: false,
          sortfield: ["eventid"],
          sortorder: "DESC"
        })
      ]);

      const snapshots = mapZabbixSnapshots(hosts, items, problems);
      await this.cache.replaceAll(snapshots);
      this.emit("snapshots", snapshots);
      logger.info({ hosts: snapshots.length }, "zabbix sync completed");
      return snapshots;
    } catch (error) {
      logger.error({ error }, "zabbix sync failed");
      this.emit("syncError", error);
      return [];
    } finally {
      this.running = false;
    }
  }
}
