import crypto from "node:crypto";
import type pg from "pg";
import type { Topology } from "../types.js";

export class TopologyRepository {
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<Topology[]> {
    const result = await this.db.query(
      "SELECT id, name, nodes, edges, updated_at FROM topologies ORDER BY updated_at DESC"
    );
    return result.rows.map(mapTopology);
  }

  async get(id: string): Promise<Topology | null> {
    const result = await this.db.query(
      "SELECT id, name, nodes, edges, updated_at FROM topologies WHERE id = $1",
      [id]
    );
    return result.rows[0] ? mapTopology(result.rows[0]) : null;
  }

  async upsert(topology: Omit<Topology, "id"> & { id?: string }): Promise<Topology> {
    const id = topology.id ?? crypto.randomUUID();
    const result = await this.db.query(
      `INSERT INTO topologies (id, name, nodes, edges, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, now())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           nodes = EXCLUDED.nodes,
           edges = EXCLUDED.edges,
           updated_at = now()
       RETURNING id, name, nodes, edges, updated_at`,
      [id, topology.name, JSON.stringify(topology.nodes), JSON.stringify(topology.edges)]
    );
    return mapTopology(result.rows[0]);
  }
}

function mapTopology(row: any): Topology {
  return {
    id: row.id,
    name: row.name,
    nodes: row.nodes,
    edges: row.edges,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}
