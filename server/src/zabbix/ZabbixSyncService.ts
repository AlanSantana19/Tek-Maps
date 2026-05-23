import { EventEmitter } from "node:events";
import { logger } from "../logger.js";
import type { SettingsRepository, StoredZabbixConfig } from "../repositories/SettingsRepository.js";
import type { ZabbixCacheRepository } from "../repositories/ZabbixCacheRepository.js";
import type { DeviceSnapshot } from "../types.js";
import { mapZabbixSnapshots } from "./mapper.js";
import { ZabbixClient } from "./ZabbixClient.js";

export class ZabbixSyncService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private quickTimer: NodeJS.Timeout | null = null;
  private running = false;
  private quickRunning = false;

  constructor(
    private readonly settings: SettingsRepository,
    private readonly cache: ZabbixCacheRepository,
    private readonly intervalMs: number,
    private readonly timeoutMs: number,
    private readonly quickIntervalMs: number = 5000,
    private readonly fallbackServer?: StoredZabbixConfig
  ) {
    super();
  }

  start() {
    void this.sync();
    this.timer = setInterval(() => void this.sync(), this.intervalMs);
    this.quickTimer = setInterval(() => void this.quickSync(), this.quickIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.quickTimer) {
      clearInterval(this.quickTimer);
      this.quickTimer = null;
    }
  }

  async quickSync(): Promise<void> {
    if (this.quickRunning) {
      return;
    }
    this.quickRunning = true;
    try {
      const configuredServers = await this.settings.listZabbixServers();
      const servers = configuredServers.filter((server) => server.active !== false && server.password);
      const targets = servers.length > 0 ? servers : this.fallbackServer?.password ? [this.fallbackServer] : [];
      await Promise.all(targets.map((server) => this.quickSyncServer(server)));
      this.emit("snapshots");
    } catch (error) {
      logger.warn({ error: error instanceof Error ? { message: error.message } : error }, "zabbix quick sync failed");
    } finally {
      this.quickRunning = false;
    }
  }

  private async quickSyncServer(server: StoredZabbixConfig): Promise<void> {
    if (!server.id || !server.password) {
      return;
    }
    try {
      const previousSnapshots = await this.cache.list(server.id);
      const previousByHost = new Map(previousSnapshots.map((s) => [s.hostId, s]));

      const client = new ZabbixClient({
        url: server.url,
        user: server.user,
        password: server.password,
        timeoutMs: this.timeoutMs
      });

      const hosts = await client.call<any[]>("host.get", {
        output: ["hostid", "host", "name", "status", "maintenance_status"],
        selectInterfaces: ["ip", "dns", "type", "main"],
        monitored_hosts: true
      });

      const hostIds = hosts.map((h) => h.hostid);
      if (hostIds.length === 0) {
        return;
      }

      const [icmpItems, availabilityItems, problems] = await Promise.all([
        client.call<any[]>("item.get", {
          output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
          hostids: hostIds,
          monitored: true,
          search: { key_: "icmpping" },
          limit: Math.max(200, hostIds.length * 4)
        }),
        client.call<any[]>("item.get", {
          output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
          hostids: hostIds,
          monitored: true,
          search: { key_: "available" },
          limit: Math.max(200, hostIds.length * 8)
        }),
        client.call<any[]>("problem.get", {
          output: ["eventid", "objectid", "name", "severity", "clock"],
          hostids: hostIds,
          recent: false,
          sortfield: ["eventid"],
          sortorder: "DESC"
        })
      ]);

      const statusItems = mergeItemsById(icmpItems, availabilityItems);
      const snapshots = mapZabbixSnapshots(hosts, statusItems, problems).map((s) => ({
        ...s,
        metrics: previousByHost.get(s.hostId)?.metrics ?? s.metrics,
        ports: previousByHost.get(s.hostId)?.ports ?? s.ports,
        zabbixServerId: server.id
      }));

      await this.cache.replaceAll(snapshots, server.id);
      logger.info({ serverId: server.id, hosts: snapshots.length }, "zabbix quick sync completed");
    } catch (error) {
      logger.warn({
        serverId: server.id,
        error: error instanceof Error ? { message: error.message } : error
      }, "zabbix quick sync server failed");
    }
  }

  async sync(): Promise<DeviceSnapshot[]> {
    if (this.running) {
      return [];
    }

    this.running = true;
    try {
      const configuredServers = await this.settings.listZabbixServers();
      const servers = configuredServers.filter((server) => server.active !== false && server.password);
      await Promise.all(configuredServers
        .filter((server) => server.active === false && server.id)
        .map((server) => this.cache.replaceAll([], server.id)));
      const targets = servers.length > 0 ? servers : this.fallbackServer?.password ? [this.fallbackServer] : [];
      const snapshots = (await Promise.all(targets.map((server) => this.syncServer(server)))).flat();
      this.emit("snapshots", snapshots);
      logger.info({ hosts: snapshots.length, servers: targets.length }, "zabbix sync completed");
      return snapshots;
    } catch (error) {
      logger.error({ error: error instanceof Error ? { message: error.message, stack: error.stack } : error }, "zabbix sync failed");
      this.emit("syncError", error);
      return [];
    } finally {
      this.running = false;
    }
  }

  private async syncServer(server: StoredZabbixConfig): Promise<DeviceSnapshot[]> {
    if (!server.id || !server.password) {
      return [];
    }

    try {
      const previousSnapshots = await this.cache.list(server.id);
      const previousByHost = new Map(previousSnapshots.map((snapshot) => [snapshot.hostId, snapshot]));
      const client = new ZabbixClient({
        url: server.url,
        user: server.user,
        password: server.password,
        timeoutMs: this.timeoutMs
      });

      const hosts = await client.call<any[]>("host.get", {
        output: ["hostid", "host", "name", "status", "maintenance_status"],
        selectInterfaces: ["ip", "dns", "type", "main"],
        monitored_hosts: true
      });

      const hostIds = hosts.map((host) => host.hostid);
      if (hostIds.length === 0) {
        logger.warn({ serverId: server.id, serverName: server.name }, "zabbix sync returned no monitored hosts");
        await this.cache.replaceAll([], server.id);
        return [];
      }

      let icmpItems: any[] = [];
      let availabilityItems: any[] = [];
      try {
        [icmpItems, availabilityItems] = await Promise.all([
          client.call<any[]>("item.get", {
            output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
            hostids: hostIds,
            monitored: true,
            search: { key_: "icmpping" },
            sortfield: "name",
            limit: Math.max(200, hostIds.length * 4)
          }),
          client.call<any[]>("item.get", {
            output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
            hostids: hostIds,
            monitored: true,
            search: { key_: "available" },
            sortfield: "name",
            limit: Math.max(200, hostIds.length * 8)
          })
        ]);
      } catch (error) {
        logger.warn({
          serverId: server.id,
          serverName: server.name,
          error: error instanceof Error ? { message: error.message } : error
        }, "zabbix sync could not load status items");
      }

      const baseStatusItems = mergeItemsById(icmpItems, availabilityItems);

      let itemResult: BatchItemsResult = { items: [], failedHostIds: new Set() };
      let interfaceItemResult: BatchItemsResult = { items: [], failedHostIds: new Set() };
      let problems: any[] = [];
      try {
        [itemResult, interfaceItemResult, problems] = await Promise.all([
          fetchItemsInBatches(client, hostIds),
          fetchInterfaceItemsInBatches(client, hostIds),
          client.call<any[]>("problem.get", {
            output: ["eventid", "objectid", "name", "severity", "clock"],
            hostids: hostIds,
            recent: false,
            sortfield: ["eventid"],
            sortorder: "DESC"
          })
        ]);
      } catch (error) {
        logger.warn({
          serverId: server.id,
          serverName: server.name,
          error: error instanceof Error ? { message: error.message } : error
        }, "zabbix sync falhou ao carregar itens, gravando apenas status base");
        const baseSnapshots = mapZabbixSnapshots(hosts, baseStatusItems, []).map((s) => ({
          ...s,
          metrics: previousByHost.get(s.hostId)?.metrics ?? s.metrics,
          ports: previousByHost.get(s.hostId)?.ports ?? s.ports,
          zabbixServerId: server.id
        }));
        await this.cache.replaceAll(baseSnapshots, server.id);
        return baseSnapshots;
      }

      const allItems = mergeItemsById(icmpItems, availabilityItems, itemResult.items, interfaceItemResult.items);
      const snapshots = mapZabbixSnapshots(hosts, allItems, problems).map((snapshot) => ({
        ...snapshot,
        metrics: itemResult.failedHostIds.has(snapshot.hostId)
          ? (previousByHost.get(snapshot.hostId)?.metrics?.length ? previousByHost.get(snapshot.hostId)!.metrics : snapshot.metrics)
          : snapshot.metrics,
        ports: interfaceItemResult.failedHostIds.has(snapshot.hostId)
          ? (previousByHost.get(snapshot.hostId)?.ports?.length ? previousByHost.get(snapshot.hostId)!.ports : snapshot.ports)
          : snapshot.ports,
        zabbixServerId: server.id
      }));
      logger.info({
        serverId: server.id,
        serverName: server.name,
        hosts: snapshots.length,
        totalItems: allItems.length,
        hostsWithPorts: snapshots.filter((s) => s.ports.length > 0).length
      }, "zabbix sync completed for server");
      await this.cache.replaceAll(snapshots, server.id);
      return snapshots;
    } catch (error) {
      logger.error({
        serverId: server.id,
        serverName: server.name,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error
      }, "zabbix server sync failed");
      return [];
    }
  }
}

function mergeItemsById(...groups: any[][]): any[] {
  const items = new Map<string, any>();
  for (const group of groups) {
    for (const item of group) {
      items.set(item.itemid, item);
    }
  }
  return [...items.values()];
}

const HOST_BATCH_SIZE = 20;
const ITEM_OUTPUT = ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"] as const;

type BatchItemsResult = {
  items: any[];
  failedHostIds: Set<string>;
};

async function fetchItemsInBatches(client: ZabbixClient, hostIds: string[]): Promise<BatchItemsResult> {
  const items: any[] = [];
  const failedHostIds = new Set<string>();
  for (let i = 0; i < hostIds.length; i += HOST_BATCH_SIZE) {
    const batch = hostIds.slice(i, i + HOST_BATCH_SIZE);
    try {
      const batchItems = await client.call<any[]>("item.get", {
        output: ITEM_OUTPUT,
        hostids: batch,
        monitored: true,
        sortfield: "name"
      });
      items.push(...batchItems);
    } catch (error) {
      batch.forEach((hostId) => failedHostIds.add(hostId));
      logger.warn(
        { batchStart: i, batchSize: batch.length, error: error instanceof Error ? error.message : error },
        "item batch falhou, continuando com demais batches"
      );
    }
  }
  return { items, failedHostIds };
}

async function fetchInterfaceItemsInBatches(client: ZabbixClient, hostIds: string[]): Promise<BatchItemsResult> {
  const items: any[] = [];
  const failedHostIds = new Set<string>();
  for (let i = 0; i < hostIds.length; i += HOST_BATCH_SIZE) {
    const batch = hostIds.slice(i, i + HOST_BATCH_SIZE);
    try {
      const batchItems = await client.call<any[]>("item.get", {
        output: ITEM_OUTPUT,
        hostids: batch,
        monitored: true,
        searchByAny: true,
        search: { key_: ["net.if", "ifHC", "ifIn", "ifOut", "ifOper", "ifName", "ifDescr", "ifAlias", "ifHighSpeed", "ifSpeed"] },
        sortfield: "name"
      });
      items.push(...batchItems);
    } catch (error) {
      batch.forEach((hostId) => failedHostIds.add(hostId));
      logger.warn(
        { batchStart: i, batchSize: batch.length, error: error instanceof Error ? error.message : error },
        "interface item batch falhou, continuando"
      );
    }
  }
  return { items, failedHostIds };
}
