import crypto from "node:crypto";
import type pg from "pg";

export interface CustomIconRecord {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export class CustomIconRepository {
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<CustomIconRecord[]> {
    const result = await this.db.query(
      "SELECT id, name, data_url, created_at FROM custom_icons ORDER BY created_at ASC"
    );
    return result.rows.map(mapIcon);
  }

  async create(name: string, dataUrl: string): Promise<CustomIconRecord> {
    const id = crypto.randomUUID();
    const result = await this.db.query(
      "INSERT INTO custom_icons (id, name, data_url, created_at) VALUES ($1, $2, $3, now()) RETURNING id, name, data_url, created_at",
      [id, name, dataUrl]
    );
    return mapIcon(result.rows[0]);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM custom_icons WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

function mapIcon(row: any): CustomIconRecord {
  return {
    id: row.id,
    name: row.name,
    dataUrl: row.data_url,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}
