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
