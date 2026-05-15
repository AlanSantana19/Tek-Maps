import express from "express";
import { z } from "zod";
import { issueToken, requireAuth, signUserToken } from "./auth.js";
import type { AccessUserRepository } from "./repositories/AccessUserRepository.js";
import type { SettingsRepository } from "./repositories/SettingsRepository.js";
import type { TopologyRepository } from "./repositories/TopologyRepository.js";
import type { ZabbixCacheRepository } from "./repositories/ZabbixCacheRepository.js";
import { ZabbixClient } from "./zabbix/ZabbixClient.js";

const topologySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  nodes: z.array(z.object({
    id: z.string(),
    hostId: z.string().optional(),
    type: z.enum(["switch", "router", "radio", "firewall", "server", "unknown"]),
    label: z.string(),
    position: z.object({ x: z.number(), y: z.number() })
  })),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    label: z.string().optional()
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

const accessUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(180),
  role: z.enum(["admin", "operator", "viewer"]),
  active: z.boolean().default(true),
  password: z.string().min(6).max(120).optional()
});

export function createRoutes(
  topologies: TopologyRepository,
  cache: ZabbixCacheRepository,
  settings: SettingsRepository,
  users: AccessUserRepository
) {
  const router = express.Router();

  router.get("/health", (_req, res) => res.json({ ok: true }));

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
      if (accessUser) {
        res.json({ token: signUserToken({ email: accessUser.email, role: accessUser.role }) });
        return;
      }

      const token = issueToken(parsed.data.username, parsed.data.password);
      if (!token) {
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }

      res.json({ token });
    })().catch((error) => {
      res.status(500).json({ error: "internal_error" });
      req.log?.error({ error }, "login failed");
    });
  });

  router.post("/auth/login-legacy", (req, res) => {
    const parsed = z.object({ password: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }

    const token = issueToken("admin", parsed.data.password);
    if (!token) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    res.json({ token });
  });

  router.use(requireAuth);

  router.get("/zabbix/hosts", async (_req, res, next) => {
    try {
      res.json(await cache.list());
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
        timeoutMs: 8000
      });
      await client.login();
      const version = await client.version();
      res.json({ ok: true, version, message: "Conexao validada com sucesso" });
    } catch (error) {
      res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao conectar ao Zabbix"
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
