import crypto from "node:crypto";
import type pg from "pg";

export interface MapShareLink {
  token: string;
  topologyId: string;
  createdBy: string;
  expiresAt: string | null;
  createdAt: string;
}

export class MapShareRepository {
  private ready: Promise<void> | null = null;

  constructor(private readonly db: pg.Pool) {}

  async create(topologyId: string, createdBy: string, expiresAt: Date | null): Promise<MapShareLink> {
    await this.ensureTable();
    const token = crypto.randomBytes(24).toString("base64url");
    const result = await this.db.query(
      `INSERT INTO map_share_links (token, topology_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING token, topology_id, created_by, expires_at, created_at`,
      [token, topologyId, createdBy, expiresAt]
    );
    return mapRow(result.rows[0]);
  }

  async findByToken(token: string): Promise<MapShareLink | null> {
    await this.ensureTable();
    const result = await this.db.query(
      `SELECT token, topology_id, created_by, expires_at, created_at
       FROM map_share_links
       WHERE token = $1 AND (expires_at IS NULL OR expires_at > now())`,
      [token]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listByTopology(topologyId: string): Promise<MapShareLink[]> {
    await this.ensureTable();
    const result = await this.db.query(
      `SELECT token, topology_id, created_by, expires_at, created_at
       FROM map_share_links
       WHERE topology_id = $1 AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC`,
      [topologyId]
    );
    return result.rows.map(mapRow);
  }

  async revoke(token: string): Promise<boolean> {
    await this.ensureTable();
    const result = await this.db.query("DELETE FROM map_share_links WHERE token = $1", [token]);
    return (result.rowCount ?? 0) > 0;
  }

  async pruneExpired(): Promise<void> {
    await this.ensureTable();
    await this.db.query("DELETE FROM map_share_links WHERE expires_at IS NOT NULL AND expires_at <= now()");
  }

  private ensureTable(): Promise<void> {
    if (!this.ready) {
      this.ready = this.db.query(
        `CREATE TABLE IF NOT EXISTS map_share_links (
           token TEXT PRIMARY KEY,
           topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
           created_by TEXT NOT NULL,
           expires_at TIMESTAMPTZ,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      )
        .then(() => this.db.query(
          "ALTER TABLE map_share_links ALTER COLUMN expires_at DROP NOT NULL"
        ))
        .then(() => undefined)
        .catch(() => undefined); // coluna já é nullable — ignora erro idempotente
    }
    return this.ready;
  }
}

function mapRow(row: any): MapShareLink {
  return {
    token: row.token,
    topologyId: row.topology_id,
    createdBy: row.created_by,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : (row.expires_at ?? null),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}
