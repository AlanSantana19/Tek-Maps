import type pg from "pg";

export interface RecentEventRow {
  id: string;
  type: string;
  label: string;
  detail?: string;
  createdAt: string;
}

export class RecentEventRepository {
  private ready: Promise<void> | null = null;
  private insertCount = 0;

  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<RecentEventRow[]> {
    await this.ensureOnce();
    const result = await this.db.query(
      `SELECT id, type, label, detail, created_at
       FROM recent_events
       WHERE created_at > now() - interval '24 hours'
       ORDER BY created_at DESC
       LIMIT 500`
    );
    return result.rows.map(mapRow);
  }

  async insert(event: { id: string; type: string; label: string; detail?: string }): Promise<void> {
    await this.ensureOnce();
    await this.db.query(
      `INSERT INTO recent_events (id, type, label, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, event.label, event.detail ?? null]
    );
    // limpa eventos antigos a cada 50 inserts, nao em todo insert
    if (++this.insertCount % 50 === 0) {
      void this.db.query(`DELETE FROM recent_events WHERE created_at < now() - interval '24 hours'`).catch(() => {});
    }
  }

  private ensureOnce(): Promise<void> {
    if (!this.ready) {
      this.ready = this.db.query(`
        CREATE TABLE IF NOT EXISTS recent_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          label TEXT NOT NULL,
          detail TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `).then(() => this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_recent_events_created_at ON recent_events(created_at DESC)
      `)).then(() => undefined);
    }
    return this.ready;
  }
}

function mapRow(row: any): RecentEventRow {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    detail: row.detail ?? undefined,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}
