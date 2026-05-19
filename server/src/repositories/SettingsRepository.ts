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
  title?: string;
  width: number;
  offsetX: number;
  offsetY: number;
  backgroundColor: string;
  titleColor: string;
  updatedAt?: string;
}

export interface NavLogoConfig {
  dataUrl?: string;
  title?: string;
  width: number;
  updatedAt?: string;
}

export interface FaviconConfig {
  dataUrl?: string;
  size?: number;
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
  private readonly encKey: Buffer;

  constructor(private readonly db: pg.Pool, jwtSecret: string) {
    // Derive a fixed 32-byte key from the JWT secret via SHA-256
    this.encKey = crypto.createHash("sha256").update(jwtSecret).digest();
  }

  private encryptPassword(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
  }

  private decryptPassword(stored: string | undefined): string | undefined {
    if (!stored) return undefined;
    if (!stored.startsWith("enc:v1:")) return stored; // legacy plaintext — transparently pass through
    const parts = stored.split(":");
    if (parts.length !== 5) return undefined;
    try {
      const iv  = Buffer.from(parts[2], "hex");
      const tag = Buffer.from(parts[3], "hex");
      const ct  = Buffer.from(parts[4], "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.encKey, iv);
      decipher.setAuthTag(tag);
      return decipher.update(ct).toString("utf8") + decipher.final("utf8");
    } catch {
      return undefined;
    }
  }

  async listZabbixServers(): Promise<StoredZabbixConfig[]> {
    const result = await this.db.query(
      `SELECT id, name, url, username, password, active, updated_at
       FROM zabbix_servers
       ORDER BY created_at ASC`
    );
    return result.rows.map((row) => {
      const mapped = mapZabbixServer(row);
      return { ...mapped, password: this.decryptPassword(mapped.password) };
    });
  }

  async getZabbixServer(id: string): Promise<StoredZabbixConfig | null> {
    const result = await this.db.query(
      `SELECT id, name, url, username, password, active, updated_at
       FROM zabbix_servers
       WHERE id = $1`,
      [id]
    );
    if (!result.rows[0]) return null;
    const mapped = mapZabbixServer(result.rows[0]);
    return { ...mapped, password: this.decryptPassword(mapped.password) };
  }

  async saveZabbixServer(config: StoredZabbixConfig): Promise<StoredZabbixConfig> {
    const id = config.id ?? crypto.randomUUID();
    // current?.password is already decrypted (from getZabbixServer)
    const current = config.id ? await this.getZabbixServer(config.id) : null;
    const plainPassword = config.password || current?.password;
    const storedPassword = plainPassword ? this.encryptPassword(plainPassword) : undefined;
    const value = {
      name: config.name?.trim() || config.url,
      url: config.url,
      user: config.user,
      password: storedPassword,
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

    const mapped = mapZabbixServer(result.rows[0]);
    return { ...mapped, password: this.decryptPassword(mapped.password) };
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
    if (!row) return { size: 16 };
    return {
      dataUrl: typeof row.value?.dataUrl === "string" && row.value.dataUrl.startsWith("data:image/") ? row.value.dataUrl : undefined,
      size: normalizeFaviconSize(row.value?.size),
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
    };
  }

  async saveFaviconConfig(config: FaviconConfig): Promise<FaviconConfig> {
    const value = {
      dataUrl: typeof config.dataUrl === "string" && config.dataUrl.startsWith("data:image/") ? config.dataUrl : undefined,
      size: normalizeFaviconSize(config.size)
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
      size: normalizeFaviconSize(result.rows[0].value?.size),
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
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined,
    width: clampNumber(input.width, 40, 240, DEFAULT_NAV_LOGO_CONFIG.width),
    updatedAt: input.updatedAt
  };
}

function normalizeLoginLogoConfig(input: Partial<LoginLogoConfig>): LoginLogoConfig {
  return {
    dataUrl: typeof input.dataUrl === "string" && input.dataUrl.startsWith("data:image/") ? input.dataUrl : undefined,
    title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : undefined,
    width: clampNumber(input.width, 48, 240, DEFAULT_LOGIN_LOGO_CONFIG.width),
    offsetX: clampNumber(input.offsetX, -120, 120, DEFAULT_LOGIN_LOGO_CONFIG.offsetX),
    offsetY: clampNumber(input.offsetY, -80, 80, DEFAULT_LOGIN_LOGO_CONFIG.offsetY),
    backgroundColor: normalizeColor(input.backgroundColor, DEFAULT_LOGIN_LOGO_CONFIG.backgroundColor),
    titleColor: normalizeColor(input.titleColor, DEFAULT_LOGIN_LOGO_CONFIG.titleColor),
    updatedAt: input.updatedAt
  };
}

function normalizeFaviconSize(value: unknown): number {
  return clampNumber(value, 8, 64, 16);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
