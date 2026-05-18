import express from "express";
import { z } from "zod";
import { requireAuth, signUserToken } from "./auth.js";
import { appVersion } from "./version.js";
import type { AccessGroupRepository } from "./repositories/AccessGroupRepository.js";
import type { AccessUserRepository } from "./repositories/AccessUserRepository.js";
import type { CustomIconRepository } from "./repositories/CustomIconRepository.js";
import type { SettingsRepository } from "./repositories/SettingsRepository.js";
import type { TopologyRepository } from "./repositories/TopologyRepository.js";
import type { ZabbixCacheRepository } from "./repositories/ZabbixCacheRepository.js";
import { mapZabbixSnapshots } from "./zabbix/mapper.js";
import { ZabbixClient } from "./zabbix/ZabbixClient.js";

const topologySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  zabbixServerId: z.string().uuid().optional(),
  nodes: z.array(z.object({
    id: z.string(),
    hostId: z.string().optional(),
    type: z.enum(["switch", "router", "radio", "firewall", "server", "lte", "unknown"]),
    label: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    iconSize: z.number().min(16).max(128).optional(),
    labelFontSize: z.number().min(8).max(72).optional(),
    labelPosition: z.enum(["above", "below"]).optional(),
    color: z.string().max(20).optional(),
    showBackground: z.boolean().optional(),
    showIp: z.boolean().optional(),
    zabbixServerId: z.string().uuid().optional(),
    statusItemKey: z.string().max(180).optional(),
    onlineValue: z.string().max(80).optional(),
    offlineValue: z.string().max(80).optional(),
    advancedMode: z.boolean().optional(),
    customIconId: z.string().uuid().optional(),
    handles: z.array(z.string()).optional()
  })),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional(),
    sourceHostId: z.string().optional(),
    targetHostId: z.string().optional(),
    sourceOutInterface: z.string().max(120).optional(),
    sourceInInterface: z.string().max(120).optional(),
    targetInInterface: z.string().max(120).optional(),
    targetOutInterface: z.string().max(120).optional(),
    sourceOutItemId: z.string().max(120).optional(),
    sourceInItemId: z.string().max(120).optional(),
    targetInItemId: z.string().max(120).optional(),
    targetOutItemId: z.string().max(120).optional(),
    sourceStatusItemId: z.string().max(120).optional(),
    targetStatusItemId: z.string().max(120).optional(),
    sourceInterfaceName: z.string().max(180).optional(),
    targetInterfaceName: z.string().max(180).optional(),
    sourceInterfaceAlias: z.string().max(180).optional(),
    targetInterfaceAlias: z.string().max(180).optional(),
    sourceInterface: z.string().max(120).optional(),
    targetInterface: z.string().max(120).optional(),
    cableType: z.enum(["fiber", "utp", "radio", "wireless", "vpn", "other"]).optional(),
    color: z.string().max(20).optional(),
    strokeWidth: z.number().min(1).max(12).optional(),
    lineStyle: z.enum(["solid", "dashed", "dotted", "dashdot"]).optional(),
    badgeFontSize: z.number().min(8).max(24).optional(),
    showTraffic: z.boolean().optional(),
    showLabel: z.boolean().optional(),
    waypointDX: z.number().optional(),
    waypointDY: z.number().optional(),
    showSignal: z.boolean().optional(),
    signalLabel: z.string().max(120).optional(),
    signalTxMetricKey: z.string().max(240).optional(),
    signalRxMetricKey: z.string().max(240).optional(),
    signalHostId: z.string().optional()
  }))
});

const zabbixConfigSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  url: z.string().min(3).max(300),
  user: z.string().min(1).max(120),
  password: z.string().max(300).optional(),
  active: z.boolean().default(true)
});

const zabbixTestSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().min(3).max(300).optional(),
  user: z.string().min(1).max(120).optional(),
  password: z.string().max(300).optional()
});

const accessGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  role: z.enum(["admin", "operator", "viewer"])
});

const accessGroupMemberSchema = z.object({
  userId: z.string().uuid()
});

const accessUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  role: z.enum(["admin", "operator", "viewer"]),
  active: z.boolean().default(true),
  password: z.string().min(6).max(120).optional()
});

const accessUserUpdateSchema = accessUserSchema.omit({ password: true });

const passwordResetSchema = z.object({
  password: z.string().min(6).max(120)
});

const MAX_ICON_DATA_URL_BYTES = 1_500_000;

export function createRoutes(
  topologies: TopologyRepository,
  cache: ZabbixCacheRepository,
  settings: SettingsRepository,
  users: AccessUserRepository,
  icons: CustomIconRepository,
  groups: AccessGroupRepository
) {
  const router = express.Router();

  router.get("/health", (_req, res) => res.json({ ok: true }));
  router.get("/version", (_req, res) => res.json(appVersion));

  router.post("/auth/login", (req, res) => {
    const parsed = z.object({
      username: z.string().min(1),
      password: z.string()
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }

    void (async () => {
      const accessUser = await users.verify(parsed.data.username, parsed.data.password);
      if (!accessUser) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }

      res.json({ token: signUserToken({ email: accessUser.email, role: accessUser.role }) });
    })().catch((error) => {
      res.status(500).json({ error: "internal_error" });
      req.log?.error({ error }, "login failed");
    });
  });

  router.use(requireAuth);

  router.get("/zabbix/hosts", async (req, res, next) => {
    try {
      const serverId = typeof req.query.serverId === "string" ? req.query.serverId : undefined;
      res.json(await cache.list(serverId));
    } catch (error) {
      next(error);
    }
  });

  router.get("/server/zabbix", async (_req, res, next) => {
    try {
      const servers = await settings.listZabbixServers();
      res.json(servers.map(toPublicZabbixServer));
    } catch (error) {
      next(error);
    }
  });

  router.post("/server/zabbix", async (req, res, next) => {
    try {
      const parsed = zabbixConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_zabbix_config", details: parsed.error.flatten() });
        return;
      }
      const saved = await settings.saveZabbixConfig({
        ...parsed.data,
        url: normalizeZabbixUrl(parsed.data.url)
      });
      res.status(201).json(toPublicZabbixServer(saved));
    } catch (error) {
      next(error);
    }
  });

  router.put("/server/zabbix/:id", async (req, res, next) => {
    try {
      const parsed = zabbixConfigSchema.safeParse({ ...req.body, id: req.params.id });
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_zabbix_config", details: parsed.error.flatten() });
        return;
      }
      const saved = await settings.saveZabbixServer({
        ...parsed.data,
        url: normalizeZabbixUrl(parsed.data.url)
      });
      res.json(toPublicZabbixServer(saved));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/server/zabbix/:id", async (req, res, next) => {
    try {
      const removed = await settings.removeZabbixServer(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/server/zabbix/test", async (req, res) => {
    const parsed = zabbixTestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_zabbix_config", details: parsed.error.flatten() });
      return;
    }

    try {
      const saved = parsed.data.id ? await settings.getZabbixServer(parsed.data.id) : null;
      const url = parsed.data.url ?? saved?.url;
      const user = parsed.data.user ?? saved?.user;
      const password = parsed.data.password || saved?.password;
      if (!url || !user || !password) {
        res.status(400).json({ ok: false, message: "Informe URL, usuario e senha para validar" });
        return;
      }
      const client = new ZabbixClient({
        url: normalizeZabbixUrl(url),
        user,
        password,
        timeoutMs: 30000
      });
      await client.login();
      const version = await client.version();
      const [hostCount, monitoredHostCount] = await Promise.all([
        client.call<string>("host.get", { countOutput: true }),
        client.call<string>("host.get", { countOutput: true, monitored_hosts: true })
      ]);
      const hosts = Number(hostCount);
      const monitoredHosts = Number(monitoredHostCount);
      const message = monitoredHosts > 0
        ? `Conexao validada com sucesso. ${monitoredHosts} host(s) monitorado(s) acessivel(is)`
        : hosts > 0
          ? "Conexao validada, mas nenhum host monitorado esta acessivel para sincronizar"
          : "Conexao validada, mas nenhum host esta acessivel para este usuario";
      res.json({ ok: true, version, hostCount: hosts, monitoredHostCount: monitoredHosts, message });
    } catch (error) {
      res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao conectar ao Zabbix"
      });
    }
  });

  router.get("/server/zabbix/:id/hosts", async (req, res) => {
    try {
      const saved = await settings.getZabbixServer(req.params.id);
      if (!saved) {
        res.status(404).json({ error: "not_found", message: "Servidor Zabbix nao encontrado" });
        return;
      }
      if (!saved.url || !saved.user || !saved.password) {
        res.status(400).json({ error: "missing_zabbix_credentials", message: "Servidor Zabbix sem usuario ou senha salva" });
        return;
      }

      const client = new ZabbixClient({
        url: normalizeZabbixUrl(saved.url),
        user: saved.user,
        password: saved.password,
        timeoutMs: 30000
      });
      const hosts = await client.call<any[]>("host.get", {
        output: ["hostid", "host", "name", "status", "maintenance_status"],
        selectInterfaces: ["ip", "dns", "type", "main"],
        monitored_hosts: true,
        sortfield: "name",
        limit: 1000
      });
      const hostIds = hosts.map((host) => host.hostid);
      let icmpItems: any[] = [];
      let availabilityItems: any[] = [];
      if (hostIds.length > 0) {
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
        } catch {
          icmpItems = [];
          availabilityItems = [];
        }
      }
      const snapshots = mapZabbixSnapshots(hosts, mergeItemsById(icmpItems, availabilityItems), []).map((snapshot) => ({
        ...snapshot,
        zabbixServerId: saved.id
      }));

      res.json({
        server: toPublicZabbixServer(saved),
        hostCount: snapshots.length,
        hosts: snapshots
      });
    } catch (error) {
      res.status(502).json({
        error: "zabbix_hosts_failed",
        message: error instanceof Error ? error.message : "Falha ao consultar hosts do Zabbix"
      });
    }
  });

  router.get("/server/zabbix/:id/items", async (req, res) => {
    try {
      const saved = await settings.getZabbixServer(req.params.id);
      if (!saved) {
        res.status(404).json({ error: "not_found", message: "Servidor Zabbix nao encontrado" });
        return;
      }
      if (!saved.url || !saved.user || !saved.password) {
        res.status(400).json({ error: "missing_zabbix_credentials", message: "Servidor Zabbix sem usuario ou senha salva" });
        return;
      }

      const client = new ZabbixClient({
        url: normalizeZabbixUrl(saved.url),
        user: saved.user,
        password: saved.password,
        timeoutMs: 30000
      });
      const hosts = await client.call<any[]>("host.get", {
        output: ["hostid", "host", "name"],
        monitored_hosts: true,
        limit: 100,
        sortfield: "name"
      });
      const hostIds = hosts.map((host) => host.hostid);
      const [generalItems, interfaceItems] = hostIds.length > 0 ? await Promise.all([
        client.call<any[]>("item.get", {
          output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
          hostids: hostIds,
          monitored: true,
          sortfield: "name",
          limit: 5000
        }),
        client.call<any[]>("item.get", {
          output: ["itemid", "hostid", "name", "key_", "lastvalue", "units", "lastclock"],
          hostids: hostIds,
          monitored: true,
          searchByAny: true,
          search: { key_: ["net.if", "ifIn", "ifOut", "ifOper", "ifName", "ifDescr", "ifAlias", "ifHighSpeed"] },
          sortfield: "name"
        })
      ]) : [[], []];
      const merged = mergeItemsById(generalItems, interfaceItems);
      const itemsByHost = new Map<string, any[]>();
      for (const item of merged) {
        itemsByHost.set(item.hostid, [...(itemsByHost.get(item.hostid) ?? []), item]);
      }
      res.json({
        server: toPublicZabbixServer(saved),
        hostCount: hosts.length,
        itemCount: merged.length,
        hosts: hosts.map((host) => ({
          hostId: host.hostid,
          hostName: host.host,
          visibleName: host.name || host.host,
          items: (itemsByHost.get(host.hostid) ?? []).slice(0, 500).map((item) => ({
            itemId: item.itemid,
            name: item.name,
            key: item.key_,
            lastValue: item.lastvalue,
            units: item.units,
            updatedAt: item.lastclock ? new Date(Number(item.lastclock) * 1000).toISOString() : undefined
          }))
        }))
      });
    } catch (error) {
      res.status(502).json({
        error: "zabbix_items_failed",
        message: error instanceof Error ? error.message : "Falha ao consultar itens do Zabbix"
      });
    }
  });

  router.get("/admin/users", async (_req, res, next) => {
    try {
      res.json(await users.list());
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/users", async (req, res, next) => {
    try {
      const parsed = accessUserSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_user", details: parsed.error.flatten() });
        return;
      }
      res.status(201).json(await users.create(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/users/:id", async (req, res, next) => {
    try {
      const parsed = accessUserUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_user", details: parsed.error.flatten() });
        return;
      }

      const user = await users.update(req.params.id, parsed.data);
      if (!user) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/admin/users/:id/password", async (req, res, next) => {
    try {
      const parsed = passwordResetSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_password", details: parsed.error.flatten() });
        return;
      }

      const user = await users.resetPassword(req.params.id, parsed.data.password);
      if (!user) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/users/:id", async (req, res, next) => {
    try {
      const removed = await users.remove(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/groups", async (_req, res, next) => {
    try {
      res.json(await groups.list());
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/groups", async (req, res, next) => {
    try {
      const parsed = accessGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_group", details: parsed.error.flatten() });
        return;
      }
      res.status(201).json(await groups.create(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/groups/:id", async (req, res, next) => {
    try {
      const parsed = accessGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_group", details: parsed.error.flatten() });
        return;
      }
      const group = await groups.update(req.params.id, parsed.data);
      if (!group) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(group);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/groups/:id", async (req, res, next) => {
    try {
      const removed = await groups.remove(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/groups/:id/members", async (req, res, next) => {
    try {
      res.json(await groups.listMembers(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/groups/:id/members", async (req, res, next) => {
    try {
      const parsed = accessGroupMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_member", details: parsed.error.flatten() });
        return;
      }
      await groups.addMember(req.params.id, parsed.data.userId);
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/groups/:id/members/:userId", async (req, res, next) => {
    try {
      const removed = await groups.removeMember(req.params.id, req.params.userId);
      if (!removed) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/topologies", async (_req, res, next) => {
    try {
      res.json(await topologies.list());
    } catch (error) {
      next(error);
    }
  });

  router.get("/topologies/:id", async (req, res, next) => {
    try {
      const topology = await topologies.get(req.params.id);
      if (!topology) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.json(topology);
    } catch (error) {
      next(error);
    }
  });

  router.post("/topologies", async (req, res, next) => {
    try {
      const parsed = topologySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_topology", details: parsed.error.flatten() });
        return;
      }
      res.json(await topologies.upsert(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.put("/topologies/:id", async (req, res, next) => {
    try {
      const parsed = topologySchema.safeParse({ ...req.body, id: req.params.id });
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_topology", details: parsed.error.flatten() });
        return;
      }
      res.json(await topologies.upsert(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/topologies/:id", async (req, res, next) => {
    try {
      const removed = await topologies.remove(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/icons", async (_req, res, next) => {
    try {
      res.json(await icons.list());
    } catch (error) {
      next(error);
    }
  });

  router.post("/icons", async (req, res, next) => {
    try {
      const parsed = z.object({
        name: z.string().min(1).max(80),
        dataUrl: z.string().min(10).max(MAX_ICON_DATA_URL_BYTES)
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_icon", details: parsed.error.flatten() });
        return;
      }
      if (!parsed.data.dataUrl.startsWith("data:image/")) {
        res.status(400).json({ error: "invalid_icon", details: "dataUrl must be an image" });
        return;
      }
      res.status(201).json(await icons.create(parsed.data.name, parsed.data.dataUrl));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/icons/:id", async (req, res, next) => {
    try {
      const removed = await icons.remove(req.params.id);
      if (!removed) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function normalizeZabbixUrl(input: string) {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  if (/\/api_jsonrpc\.php$/i.test(withProtocol)) {
    return withProtocol;
  }
  return `${withProtocol.replace(/\/$/, "")}/api_jsonrpc.php`;
}

function toPublicZabbixServer(config: NonNullable<Awaited<ReturnType<SettingsRepository["getZabbixServer"]>>>) {
  return {
    id: config.id,
    name: config.name,
    url: config.url,
    user: config.user,
    active: config.active ?? true,
    hasPassword: Boolean(config.password),
    updatedAt: config.updatedAt
  };
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
