import type pg from "pg";
import type { DeviceSnapshot } from "../types.js";

export class ZabbixCacheRepository {
  constructor(private readonly db: pg.Pool) {}

  async replaceAll(snapshots: DeviceSnapshot[], zabbixServerId?: string): Promise<void> {
    await this.ensureSchema();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      if (zabbixServerId) {
        await client.query("DELETE FROM zabbix_host_cache WHERE zabbix_server_id = $1", [zabbixServerId]);
      }
      for (const snapshot of snapshots) {
        await client.query(
          `INSERT INTO zabbix_host_cache
             (zabbix_server_id, host_id, host_name, visible_name, status, metrics, ports, alerts, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
           ON CONFLICT (zabbix_server_id, host_id) DO UPDATE
           SET host_name = EXCLUDED.host_name,
               visible_name = EXCLUDED.visible_name,
               status = EXCLUDED.status,
               metrics = EXCLUDED.metrics,
               ports = EXCLUDED.ports,
               alerts = EXCLUDED.alerts,
               synced_at = EXCLUDED.synced_at`,
          [
            zabbixServerId ?? snapshot.zabbixServerId ?? null,
            snapshot.hostId,
            snapshot.hostName,
            snapshot.visibleName,
            snapshot.status,
            JSON.stringify(snapshot.metrics),
            JSON.stringify(snapshot.ports),
            JSON.stringify(snapshot.alerts),
            snapshot.syncedAt
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(zabbixServerId?: string): Promise<DeviceSnapshot[]> {
    await this.ensureSchema();
    const result = await this.db.query(
      `SELECT zabbix_server_id, host_id, host_name, visible_name, status, metrics, ports, alerts, synced_at
       FROM zabbix_host_cache
       WHERE ($1::uuid IS NULL OR zabbix_server_id = $1::uuid)
       ORDER BY visible_name ASC`
      , [zabbixServerId ?? null]
    );

    return result.rows.map((row) => ({
      zabbixServerId: row.zabbix_server_id,
      hostId: row.host_id,
      hostName: row.host_name,
      visibleName: row.visible_name,
      status: row.status,
      metrics: row.metrics,
      ports: row.ports,
      alerts: row.alerts,
      syncedAt: row.synced_at?.toISOString?.() ?? row.synced_at
    }));
  }

  private async ensureSchema(): Promise<void> {
    await this.db.query("ALTER TABLE zabbix_host_cache ADD COLUMN IF NOT EXISTS zabbix_server_id UUID");
    await this.db.query("UPDATE zabbix_host_cache SET zabbix_server_id = '00000000-0000-0000-0000-000000000000' WHERE zabbix_server_id IS NULL");
    await this.db.query("ALTER TABLE zabbix_host_cache ALTER COLUMN zabbix_server_id SET NOT NULL");
    await this.db.query("ALTER TABLE zabbix_host_cache DROP CONSTRAINT IF EXISTS zabbix_host_cache_pkey");
    await this.db.query("CREATE UNIQUE INDEX IF NOT EXISTS zabbix_host_cache_server_host_idx ON zabbix_host_cache (zabbix_server_id, host_id)");
  }
}
