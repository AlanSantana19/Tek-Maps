import crypto from "node:crypto";
import type pg from "pg";

export interface StoredZabbixConfig {
  id?: string;
  name?: string;
  url: string;
  user: string;
  password?: string;
  active?: boolean;
  updatedAt?: string;
}

export interface LoginLogoConfig {
  dataUrl?: string;
  width: number;
  offsetX: number;
  offsetY: number;
  backgroundColor: string;
  titleColor: string;
  updatedAt?: string;
}

export interface NavLogoConfig {
  dataUrl?: string;
  width: number;
  updatedAt?: string;
}

export interface FaviconConfig {
  dataUrl?: string;
  updatedAt?: string;
}

const DEFAULT_NAV_LOGO_CONFIG: NavLogoConfig = {
  width: 120
};

const DEFAULT_LOGIN_LOGO_CONFIG: LoginLogoConfig = {
  width: 96,
  offsetX: 0,
  offsetY: 0,
  backgroundColor: "#0c0f14",
  titleColor: "#e7eef2"
};

export class SettingsRepository {
  constructor(private readonly db: pg.Pool) {}

  async listZabbixServers(): Promise<StoredZabbixConfig[]> {
    const result = await this.db.query(
      `SELECT id, name, url, username, password, active, updated_at
       FROM zabbix_servers
       ORDER BY created_at ASC`
    );
    return result.rows.map(mapZabbixServer);
  }

  async getZabbixServer(id: string): Promise<StoredZabbixConfig | null> {
    const result = await this.db.query(
      `SELECT id, name, url, username, password, active, updated_at
       FROM zabbix_servers
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ? mapZabbixServer(result.rows[0]) : null;
  }

  async saveZabbixServer(config: StoredZabbixConfig): Promise<StoredZabbixConfig> {
    const id = config.id ?? crypto.randomUUID();
    const current = config.id ? await this.getZabbixServer(config.id) : null;
    const value = {
      name: config.name?.trim() || config.url,
      url: config.url,
      user: config.user,
      password: config.password || current?.password,
      active: config.active ?? true
    };

    const result = await this.db.query(
      `INSERT INTO zabbix_servers (id, name, url, username, password, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           url = EXCLUDED.url,
           username = EXCLUDED.username,
           password = EXCLUDED.password,
           active = EXCLUDED.active,
           updated_at = now()
       RETURNING id, name, url, username, password, active, updated_at`,
      [id, value.name, value.url, value.user, value.password, value.active]
    );

    return mapZabbixServer(result.rows[0]);
  }

  async removeZabbixServer(id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM zabbix_servers WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getZabbixConfig(): Promise<StoredZabbixConfig | null> {
    const servers = await this.listZabbixServers();
    if (servers[0]) {
      return servers[0];
    }

    const result = await this.db.query(
      "SELECT value, updated_at FROM app_settings WHERE key = $1",
      ["zabbix_config"]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      ...row.value,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
    };
  }

  async saveZabbixConfig(config: Omit<StoredZabbixConfig, "updatedAt">): Promise<StoredZabbixConfig> {
    return this.saveZabbixServer(config);
  }

  async getLoginLogoConfig(): Promise<LoginLogoConfig> {
    const result = await this.db.query(
      "SELECT value, updated_at FROM app_settings WHERE key = $1",
      ["login_logo_config"]
    );
    const row = result.rows[0];
    if (!row) {
      return DEFAULT_LOGIN_LOGO_CONFIG;
    }
    return normalizeLoginLogoConfig({
      ...row.value,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
    });
  }

  async saveLoginLogoConfig(config: LoginLogoConfig): Promise<LoginLogoConfig> {
    const value = normalizeLoginLogoConfig(config);
    const result = await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = now()
       RETURNING value, updated_at`,
      ["login_logo_config", JSON.stringify(value)]
    );
    return normalizeLoginLogoConfig({
      ...result.rows[0].value,
      updatedAt: result.rows[0].updated_at?.toISOString?.() ?? result.rows[0].updated_at
    });
  }

  async getNavLogoConfig(): Promise<NavLogoConfig> {
    const result = await this.db.query(
      "SELECT value, updated_at FROM app_settings WHERE key = $1",
      ["nav_logo_config"]
    );
    const row = result.rows[0];
    if (!row) {
      return DEFAULT_NAV_LOGO_CONFIG;
    }
    return normalizeNavLogoConfig({
      ...row.value,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
    });
  }

  async saveNavLogoConfig(config: NavLogoConfig): Promise<NavLogoConfig> {
    const value = normalizeNavLogoConfig(config);
    const result = await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = now()
       RETURNING value, updated_at`,
      ["nav_logo_config", JSON.stringify(value)]
    );
    return normalizeNavLogoConfig({
      ...result.rows[0].value,
      updatedAt: result.rows[0].updated_at?.toISOString?.() ?? result.rows[0].updated_at
    });
  }

  async getFaviconConfig(): Promise<FaviconConfig> {
    const result = await this.db.query(
      "SELECT value, updated_at FROM app_settings WHERE key = $1",
      ["favicon_config"]
    );
    const row = result.rows[0];
    if (!row) return {};
    return {
      dataUrl: typeof row.value?.dataUrl === "string" && row.value.dataUrl.startsWith("data:image/") ? row.value.dataUrl : undefined,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
    };
  }

  async saveFaviconConfig(config: FaviconConfig): Promise<FaviconConfig> {
    const value = {
      dataUrl: typeof config.dataUrl === "string" && config.dataUrl.startsWith("data:image/") ? config.dataUrl : undefined
    };
    const result = await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = now()
       RETURNING value, updated_at`,
      ["favicon_config", JSON.stringify(value)]
    );
    return {
      dataUrl: result.rows[0].value?.dataUrl,
      updatedAt: result.rows[0].updated_at?.toISOString?.() ?? result.rows[0].updated_at
    };
  }
}

function mapZabbixServer(row: any): StoredZabbixConfig {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    user: row.username,
    password: row.password,
    active: row.active,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function normalizeNavLogoConfig(input: Partial<NavLogoConfig>): NavLogoConfig {
  return {
    dataUrl: typeof input.dataUrl === "string" && input.dataUrl.startsWith("data:image/") ? input.dataUrl : undefined,
    width: clampNumber(input.width, 40, 240, DEFAULT_NAV_LOGO_CONFIG.width),
    updatedAt: input.updatedAt
  };
}

function normalizeLoginLogoConfig(input: Partial<LoginLogoConfig>): LoginLogoConfig {
  return {
    dataUrl: typeof input.dataUrl === "string" && input.dataUrl.startsWith("data:image/") ? input.dataUrl : undefined,
    width: clampNumber(input.width, 48, 240, DEFAULT_LOGIN_LOGO_CONFIG.width),
    offsetX: clampNumber(input.offsetX, -120, 120, DEFAULT_LOGIN_LOGO_CONFIG.offsetX),
    offsetY: clampNumber(input.offsetY, -80, 80, DEFAULT_LOGIN_LOGO_CONFIG.offsetY),
    backgroundColor: normalizeColor(input.backgroundColor, DEFAULT_LOGIN_LOGO_CONFIG.backgroundColor),
    titleColor: normalizeColor(input.titleColor, DEFAULT_LOGIN_LOGO_CONFIG.titleColor),
    updatedAt: input.updatedAt
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
