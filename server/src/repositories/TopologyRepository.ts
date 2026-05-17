import crypto from "node:crypto";
import type pg from "pg";
import type { Topology } from "../types.js";

export class TopologyRepository {
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<Topology[]> {
    await this.ensureColumns();
    const result = await this.db.query(
      "SELECT id, name, zabbix_server_id, nodes, edges, updated_at FROM topologies ORDER BY updated_at DESC"
    );
    return result.rows.map(mapTopology);
  }

  async get(id: string): Promise<Topology | null> {
    await this.ensureColumns();
    const result = await this.db.query(
      "SELECT id, name, zabbix_server_id, nodes, edges, updated_at FROM topologies WHERE id = $1",
      [id]
    );
    return result.rows[0] ? mapTopology(result.rows[0]) : null;
  }

  async upsert(topology: Omit<Topology, "id"> & { id?: string }): Promise<Topology> {
    await this.ensureColumns();
    const id = topology.id ?? crypto.randomUUID();
    const result = await this.db.query(
      `INSERT INTO topologies (id, name, zabbix_server_id, nodes, edges, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           zabbix_server_id = EXCLUDED.zabbix_server_id,
           nodes = EXCLUDED.nodes,
           edges = EXCLUDED.edges,
           updated_at = now()
       RETURNING id, name, zabbix_server_id, nodes, edges, updated_at`,
      [id, topology.name, topology.zabbixServerId ?? null, JSON.stringify(topology.nodes), JSON.stringify(topology.edges)]
    );
    return mapTopology(result.rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM topologies WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private async ensureColumns() {
    await this.db.query("ALTER TABLE topologies ADD COLUMN IF NOT EXISTS zabbix_server_id UUID");
  }
}

function mapTopology(row: any): Topology {
  return {
    id: row.id,
    name: row.name,
    zabbixServerId: row.zabbix_server_id ?? undefined,
    nodes: row.nodes,
    edges: row.edges,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}
