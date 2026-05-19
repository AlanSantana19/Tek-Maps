import type pg from "pg";

export interface ActivityLogEntry {
  id: number;
  userEmail: string;
  userName: string;
  action: string;
  detail?: string;
  ip?: string;
  createdAt: string;
}

export class ActivityRepository {
  constructor(private readonly db: pg.Pool) {}

  async ensureTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id BIGSERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        ip TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(
      "CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)"
    );
  }

  async log(entry: { userEmail: string; userName: string; action: string; detail?: string; ip?: string }): Promise<void> {
    await this.ensureTable();
    await this.db.query(
      "INSERT INTO activity_log (user_email, user_name, action, detail, ip) VALUES ($1, $2, $3, $4, $5)",
      [entry.userEmail, entry.userName, entry.action, entry.detail ?? null, entry.ip ?? null]
    );
  }

  async list(limit = 50): Promise<ActivityLogEntry[]> {
    await this.ensureTable();
    const result = await this.db.query(
      "SELECT id, user_email, user_name, action, detail, ip, created_at FROM activity_log ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      userEmail: row.user_email,
      userName: row.user_name,
      action: row.action,
      detail: row.detail ?? undefined,
      ip: row.ip ?? undefined,
      createdAt: row.created_at?.toISOString?.() ?? row.created_at
    }));
  }
}
