import crypto from "node:crypto";
import type pg from "pg";
import type { Topology } from "../types.js";

export class TopologyRepository {
  private ready: Promise<void> | null = null;
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<Topology[]> {
    await this.ensureColumns();
    const result = await this.db.query(
      "SELECT id, name, topology_type, zabbix_server_id, zabbix_server_ids, show_grid, nodes, edges, updated_at FROM topologies ORDER BY updated_at DESC"
    );
    return result.rows.map(mapTopology);
  }

  async get(id: string): Promise<Topology | null> {
    await this.ensureColumns();
    const result = await this.db.query(
      "SELECT id, name, topology_type, zabbix_server_id, zabbix_server_ids, show_grid, nodes, edges, updated_at FROM topologies WHERE id = $1",
      [id]
    );
    return result.rows[0] ? mapTopology(result.rows[0]) : null;
  }

  async upsert(topology: Omit<Topology, "id"> & { id?: string }): Promise<Topology> {
    await this.ensureColumns();
    const id = topology.id ?? crypto.randomUUID();
    const serverIds: string[] = topology.zabbixServerIds?.length
      ? topology.zabbixServerIds
      : (topology.zabbixServerId ? [topology.zabbixServerId] : []);
    const primaryServerId = serverIds[0] ?? null;
    const result = await this.db.query(
      `INSERT INTO topologies (id, name, topology_type, zabbix_server_id, zabbix_server_ids, show_grid, nodes, edges, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           topology_type = EXCLUDED.topology_type,
           zabbix_server_id = EXCLUDED.zabbix_server_id,
           zabbix_server_ids = EXCLUDED.zabbix_server_ids,
           show_grid = EXCLUDED.show_grid,
           nodes = EXCLUDED.nodes,
           edges = EXCLUDED.edges,
           updated_at = now()
       RETURNING id, name, topology_type, zabbix_server_id, zabbix_server_ids, show_grid, nodes, edges, updated_at`,
      [id, topology.name, topology.topologyType ?? null, primaryServerId, serverIds, topology.showGrid ?? true, JSON.stringify(topology.nodes), JSON.stringify(topology.edges)]
    );
    return mapTopology(result.rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM topologies WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private ensureColumns(): Promise<void> {
    if (!this.ready) {
      this.ready = this.db.query("ALTER TABLE topologies ADD COLUMN IF NOT EXISTS zabbix_server_id UUID")
        .then(() => this.db.query("ALTER TABLE topologies ADD COLUMN IF NOT EXISTS topology_type TEXT CHECK (topology_type IN ('isp', 'corporate'))"))
        .then(() => this.db.query("ALTER TABLE topologies ADD COLUMN IF NOT EXISTS zabbix_server_ids UUID[] NOT NULL DEFAULT '{}'"))
        .then(() => this.db.query("ALTER TABLE topologies ADD COLUMN IF NOT EXISTS show_grid BOOLEAN NOT NULL DEFAULT true"))
        .then(() => undefined);
    }
    return this.ready;
  }
}

function mapTopology(row: any): Topology {
  const rawIds: string[] = Array.isArray(row.zabbix_server_ids) ? row.zabbix_server_ids : [];
  const serverIds = rawIds.length > 0 ? rawIds : (row.zabbix_server_id ? [row.zabbix_server_id] : []);
  return {
    id: row.id,
    name: row.name,
    topologyType: row.topology_type ?? undefined,
    zabbixServerId: row.zabbix_server_id ?? undefined,
    zabbixServerIds: serverIds,
    showGrid: row.show_grid ?? true,
    nodes: row.nodes,
    edges: row.edges,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}
