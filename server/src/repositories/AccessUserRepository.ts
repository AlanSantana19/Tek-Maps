import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type pg from "pg";

const BCRYPT_ROUNDS = 12;
const SHA256_HASH_RE = /^[0-9a-f]{64}$/;

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

export interface UpdateAccessUser {
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
}

export class AccessUserRepository {
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<AccessUserRecord[]> {
    const result = await this.db.query(
      "SELECT id, name, email, role, active, created_at FROM access_users ORDER BY created_at DESC"
    );
    return result.rows.map(mapUser);
  }

  async getByEmail(email: string): Promise<AccessUserRecord | null> {
    const result = await this.db.query(
      `SELECT id, name, email, role, active, created_at
       FROM access_users
       WHERE lower(email) = lower($1)
         AND active = true`,
      [email]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async create(user: NewAccessUser): Promise<AccessUserRecord> {
    const id = crypto.randomUUID();
    const passwordHash = user.password ? await bcrypt.hash(user.password, BCRYPT_ROUNDS) : null;
    const result = await this.db.query(
      `INSERT INTO access_users (id, name, email, role, active, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       RETURNING id, name, email, role, active, created_at`,
      [id, user.name, user.email.toLowerCase(), user.role, user.active, passwordHash]
    );
    return mapUser(result.rows[0]);
  }

  async update(id: string, user: UpdateAccessUser): Promise<AccessUserRecord | null> {
    const result = await this.db.query(
      `UPDATE access_users
       SET name = $2,
           email = $3,
           role = $4,
           active = $5,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, email, role, active, created_at`,
      [id, user.name, user.email.toLowerCase(), user.role, user.active]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM access_users WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async resetPassword(id: string, password: string): Promise<AccessUserRecord | null> {
    const result = await this.db.query(
      `UPDATE access_users
       SET password_hash = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, email, role, active, created_at`,
      [id, await bcrypt.hash(password, BCRYPT_ROUNDS)]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async verify(login: string, password: string): Promise<AccessUserRecord | null> {
    const result = await this.db.query(
      `SELECT id, name, email, role, active, password_hash, created_at
       FROM access_users
       WHERE (lower(email) = lower($1) OR lower(name) = lower($1))
         AND active = true`,
      [login]
    );
    const row = result.rows[0];
    if (!row || !row.password_hash) return null;

    const storedHash: string = row.password_hash;
    let valid = false;

    if (SHA256_HASH_RE.test(storedHash)) {
      // Legacy SHA-256 hash — verify and migrate to bcrypt on success
      const sha256 = crypto.createHash("sha256").update(password).digest("hex");
      valid = sha256 === storedHash;
      if (valid) {
        const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await this.db.query(
          "UPDATE access_users SET password_hash = $1, updated_at = now() WHERE id = $2",
          [newHash, row.id]
        );
      }
    } else {
      valid = await bcrypt.compare(password, storedHash);
    }

    return valid ? mapUser(row) : null;
  }
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
