import type pg from "pg";

export interface AccessGroupRecord {
  id: string;
  name: string;
  description?: string;
  role: "admin" | "operator" | "viewer";
  memberCount: number;
  createdAt: string;
}

export interface AccessGroupMemberRecord {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  joinedAt: string;
}

export class AccessGroupRepository {
  private ready: Promise<void> | null = null;
  constructor(private readonly db: pg.Pool) {}

  private ensureSchema(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this._runEnsure();
    return this.ready;
  }

  private async _runEnsure(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_groups (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT NOT NULL,
        description TEXT,
        role        TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin','operator','viewer')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_group_members (
        group_id  UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
        user_id   UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, user_id)
      )
    `);
  }

  async list(): Promise<AccessGroupRecord[]> {
    await this.ensureSchema();
    const result = await this.db.query(`
      SELECT g.id, g.name, g.description, g.role, g.created_at,
             COUNT(m.user_id)::int AS member_count
      FROM access_groups g
      LEFT JOIN access_group_members m ON m.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name ASC
    `);
    return result.rows.map(mapGroup);
  }

  async create(data: { name: string; description?: string; role: "admin" | "operator" | "viewer" }): Promise<AccessGroupRecord> {
    await this.ensureSchema();
    const result = await this.db.query(
      `INSERT INTO access_groups (name, description, role)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, role, created_at, 0::int AS member_count`,
      [data.name, data.description ?? null, data.role]
    );
    return mapGroup(result.rows[0]);
  }

  async update(id: string, data: { name: string; description?: string; role: "admin" | "operator" | "viewer" }): Promise<AccessGroupRecord | null> {
    await this.ensureSchema();
    const result = await this.db.query(
      `UPDATE access_groups SET name=$2, description=$3, role=$4, updated_at=now()
       WHERE id=$1
       RETURNING id, name, description, role, created_at`,
      [id, data.name, data.description ?? null, data.role]
    );
    if (!result.rows[0]) return null;
    const countResult = await this.db.query(
      `SELECT COUNT(*)::int AS member_count FROM access_group_members WHERE group_id=$1`,
      [id]
    );
    return mapGroup({ ...result.rows[0], member_count: countResult.rows[0]?.member_count ?? 0 });
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.db.query("DELETE FROM access_groups WHERE id=$1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async listMembers(groupId: string): Promise<AccessGroupMemberRecord[]> {
    await this.ensureSchema();
    const result = await this.db.query(
      `SELECT u.id AS user_id, u.name, u.email, u.role, m.joined_at
       FROM access_group_members m
       JOIN access_users u ON u.id = m.user_id
       WHERE m.group_id = $1
       ORDER BY u.name ASC`,
      [groupId]
    );
    return result.rows.map(mapMember);
  }

  async listGroupsForUser(userId: string): Promise<AccessGroupRecord[]> {
    await this.ensureSchema();
    const result = await this.db.query(`
      SELECT g.id, g.name, g.description, g.role, g.created_at,
             COUNT(m2.user_id)::int AS member_count
      FROM access_group_members m
      JOIN access_groups g ON g.id = m.group_id
      LEFT JOIN access_group_members m2 ON m2.group_id = g.id
      WHERE m.user_id = $1
      GROUP BY g.id
      ORDER BY g.name ASC
    `, [userId]);
    return result.rows.map(mapGroup);
  }

  async addMember(groupId: string, userId: string): Promise<void> {
    await this.ensureSchema();
    await this.db.query(
      `INSERT INTO access_group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [groupId, userId]
    );
  }

  async removeMember(groupId: string, userId: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.db.query(
      `DELETE FROM access_group_members WHERE group_id=$1 AND user_id=$2`,
      [groupId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function mapGroup(row: any): AccessGroupRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    role: row.role,
    memberCount: row.member_count ?? 0,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}

function mapMember(row: any): AccessGroupMemberRecord {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at?.toISOString?.() ?? row.joined_at
  };
}
