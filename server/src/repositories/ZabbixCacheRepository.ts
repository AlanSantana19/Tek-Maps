import type pg from "pg";
import type { DeviceSnapshot } from "../types.js";

export class ZabbixCacheRepository {
  constructor(private readonly db: pg.Pool) {}

  async replaceAll(snapshots: DeviceSnapshot[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      for (const snapshot of snapshots) {
        await client.query(
          `INSERT INTO zabbix_host_cache
             (host_id, host_name, visible_name, status, metrics, ports, alerts, synced_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
           ON CONFLICT (host_id) DO UPDATE
           SET host_name = EXCLUDED.host_name,
               visible_name = EXCLUDED.visible_name,
               status = EXCLUDED.status,
               metrics = EXCLUDED.metrics,
               ports = EXCLUDED.ports,
               alerts = EXCLUDED.alerts,
               synced_at = EXCLUDED.synced_at`,
          [
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

  async list(): Promise<DeviceSnapshot[]> {
    const result = await this.db.query(
      `SELECT host_id, host_name, visible_name, status, metrics, ports, alerts, synced_at
       FROM zabbix_host_cache
       ORDER BY visible_name ASC`
    );

    return result.rows.map((row) => ({
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
}
