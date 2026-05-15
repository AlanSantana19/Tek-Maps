import crypto from "node:crypto";
import type pg from "pg";

export interface AccessUserRecord {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
  createdAt?: string;
}

export interface NewAccessUser {
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
  password?: string;
}

export class AccessUserRepository {
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<AccessUserRecord[]> {
    const result = await this.db.query(
      "SELECT id, name, email, role, active, created_at FROM access_users ORDER BY created_at DESC"
    );
    return result.rows.map(mapUser);
  }

  async create(user: NewAccessUser): Promise<AccessUserRecord> {
    const id = crypto.randomUUID();
    const passwordHash = user.password ? hashPassword(user.password) : null;
    const result = await this.db.query(
      `INSERT INTO access_users (id, name, email, role, active, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       RETURNING id, name, email, role, active, created_at`,
      [id, user.name, user.email.toLowerCase(), user.role, user.active, passwordHash]
    );
    return mapUser(result.rows[0]);
  }

  async verify(login: string, password: string): Promise<AccessUserRecord | null> {
    const result = await this.db.query(
      `SELECT id, name, email, role, active, created_at
       FROM access_users
       WHERE (lower(email) = lower($1)
           OR lower(name) = lower($1))
         AND password_hash = $2
         AND active = true`,
      [login, hashPassword(password)]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }
}

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function mapUser(row: any): AccessUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}
