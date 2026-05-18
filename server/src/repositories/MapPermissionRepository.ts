import type pg from "pg";

export type PermissionKey = "view" | "edit";

export interface UserMapPermission {
  userId: string;
  topologyId: string;
  permissions: PermissionKey[];
  updatedAt?: string;
}

export interface UserMenuPermission {
  userId: string;
  menuId: string;
  permissions: PermissionKey[];
  updatedAt?: string;
}

export interface GroupMapPermission {
  groupId: string;
  topologyId: string;
  permissions: PermissionKey[];
  updatedAt?: string;
}

export interface GroupMenuPermission {
  groupId: string;
  menuId: string;
  permissions: PermissionKey[];
  updatedAt?: string;
}

export interface MapPermissionAuditEntry {
  id: number;
  actorEmail: string;
  userId: string;
  topologyId: string;
  previousPermissions: PermissionKey[];
  nextPermissions: PermissionKey[];
  createdAt: string;
}

export interface MenuPermissionAuditEntry {
  id: number;
  actorEmail: string;
  userId: string;
  menuId: string;
  previousPermissions: PermissionKey[];
  nextPermissions: PermissionKey[];
  createdAt: string;
}

export class MapPermissionRepository {
  constructor(private readonly db: pg.Pool) {}

  async list(): Promise<UserMapPermission[]> {
    await this.ensureTables();
    const result = await this.db.query(
      `SELECT user_id, topology_id, permissions, updated_at
       FROM access_user_map_permissions
       ORDER BY updated_at DESC`
    );
    return result.rows.map(mapPermission);
  }

  async listMenus(): Promise<UserMenuPermission[]> {
    await this.ensureTables();
    const result = await this.db.query(
      `SELECT user_id, menu_id, permissions, updated_at
       FROM access_user_menu_permissions
       ORDER BY updated_at DESC`
    );
    return result.rows.map(mapMenuPermission);
  }

  async listGroups(): Promise<GroupMapPermission[]> {
    await this.ensureTables();
    const result = await this.db.query(
      `SELECT group_id, topology_id, permissions, updated_at
       FROM access_group_map_permissions
       ORDER BY updated_at DESC`
    );
    return result.rows.map(mapGroupPermission);
  }

  async listGroupMenus(): Promise<GroupMenuPermission[]> {
    await this.ensureTables();
    const result = await this.db.query(
      `SELECT group_id, menu_id, permissions, updated_at
       FROM access_group_menu_permissions
       ORDER BY updated_at DESC`
    );
    return result.rows.map(mapGroupMenuPermission);
  }

  async listAudit(limit = 30): Promise<MapPermissionAuditEntry[]> {
    await this.ensureTables();
    const result = await this.db.query(
      `SELECT id, actor_email, user_id, topology_id, previous_permissions, next_permissions, created_at
       FROM access_user_map_permission_audit
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(mapAuditEntry);
  }

  async listMenuAudit(limit = 30): Promise<MenuPermissionAuditEntry[]> {
    await this.ensureTables();
    const result = await this.db.query(
      `SELECT id, actor_email, user_id, menu_id, previous_permissions, next_permissions, created_at
       FROM access_user_menu_permission_audit
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows.map(mapMenuAuditEntry);
  }

  async replaceForUser(
    userId: string,
    entries: Array<{ topologyId: string; permissions: PermissionKey[] }>,
    actorEmail: string
  ): Promise<UserMapPermission[]> {
    await this.ensureTables();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT topology_id, permissions
         FROM access_user_map_permissions
         WHERE user_id = $1`,
        [userId]
      );
      const previousByTopology = new Map<string, PermissionKey[]>(
        previous.rows.map((row) => [row.topology_id, normalizePermissions(row.permissions)])
      );

      await client.query("DELETE FROM access_user_map_permissions WHERE user_id = $1", [userId]);

      for (const entry of entries) {
        const permissions = normalizePermissions(entry.permissions);
        if (permissions.length === 0) {
          continue;
        }

        await client.query(
          `INSERT INTO access_user_map_permissions (user_id, topology_id, permissions, updated_at)
           VALUES ($1, $2, $3::text[], now())`,
          [userId, entry.topologyId, permissions]
        );
      }

      const topologyIds = new Set([
        ...previousByTopology.keys(),
        ...entries.map((entry) => entry.topologyId)
      ]);
      for (const topologyId of topologyIds) {
        const previousPermissions = previousByTopology.get(topologyId) ?? [];
        const nextPermissions = normalizePermissions(entries.find((entry) => entry.topologyId === topologyId)?.permissions ?? []);
        if (samePermissions(previousPermissions, nextPermissions)) {
          continue;
        }
        await client.query(
          `INSERT INTO access_user_map_permission_audit
             (actor_email, user_id, topology_id, previous_permissions, next_permissions, created_at)
           VALUES ($1, $2, $3, $4::text[], $5::text[], now())`,
          [actorEmail, userId, topologyId, previousPermissions, nextPermissions]
        );
      }

      const saved = await client.query(
        `SELECT user_id, topology_id, permissions, updated_at
         FROM access_user_map_permissions
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId]
      );
      await client.query("COMMIT");
      return saved.rows.map(mapPermission);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceMenusForUser(
    userId: string,
    entries: Array<{ menuId: string; permissions: PermissionKey[] }>,
    actorEmail: string
  ): Promise<UserMenuPermission[]> {
    await this.ensureTables();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT menu_id, permissions
         FROM access_user_menu_permissions
         WHERE user_id = $1`,
        [userId]
      );
      const previousByMenu = new Map<string, PermissionKey[]>(
        previous.rows.map((row) => [row.menu_id, normalizePermissions(row.permissions)])
      );

      await client.query("DELETE FROM access_user_menu_permissions WHERE user_id = $1", [userId]);

      for (const entry of entries) {
        const permissions = normalizePermissions(entry.permissions);
        if (permissions.length === 0) {
          continue;
        }

        await client.query(
          `INSERT INTO access_user_menu_permissions (user_id, menu_id, permissions, updated_at)
           VALUES ($1, $2, $3::text[], now())`,
          [userId, entry.menuId, permissions]
        );
      }

      const menuIds = new Set([
        ...previousByMenu.keys(),
        ...entries.map((entry) => entry.menuId)
      ]);
      for (const menuId of menuIds) {
        const previousPermissions = previousByMenu.get(menuId) ?? [];
        const nextPermissions = normalizePermissions(entries.find((entry) => entry.menuId === menuId)?.permissions ?? []);
        if (samePermissions(previousPermissions, nextPermissions)) {
          continue;
        }
        await client.query(
          `INSERT INTO access_user_menu_permission_audit
             (actor_email, user_id, menu_id, previous_permissions, next_permissions, created_at)
           VALUES ($1, $2, $3, $4::text[], $5::text[], now())`,
          [actorEmail, userId, menuId, previousPermissions, nextPermissions]
        );
      }

      const saved = await client.query(
        `SELECT user_id, menu_id, permissions, updated_at
         FROM access_user_menu_permissions
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId]
      );
      await client.query("COMMIT");
      return saved.rows.map(mapMenuPermission);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceForGroup(groupId: string, entries: Array<{ topologyId: string; permissions: PermissionKey[] }>): Promise<GroupMapPermission[]> {
    await this.ensureTables();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM access_group_map_permissions WHERE group_id = $1", [groupId]);
      for (const entry of entries) {
        const permissions = normalizePermissions(entry.permissions);
        if (permissions.length === 0) continue;
        await client.query(
          `INSERT INTO access_group_map_permissions (group_id, topology_id, permissions, updated_at)
           VALUES ($1, $2, $3::text[], now())`,
          [groupId, entry.topologyId, permissions]
        );
      }
      const saved = await client.query(
        `SELECT group_id, topology_id, permissions, updated_at
         FROM access_group_map_permissions
         WHERE group_id = $1
         ORDER BY updated_at DESC`,
        [groupId]
      );
      await client.query("COMMIT");
      return saved.rows.map(mapGroupPermission);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceMenusForGroup(groupId: string, entries: Array<{ menuId: string; permissions: PermissionKey[] }>): Promise<GroupMenuPermission[]> {
    await this.ensureTables();
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM access_group_menu_permissions WHERE group_id = $1", [groupId]);
      for (const entry of entries) {
        const permissions = normalizePermissions(entry.permissions);
        if (permissions.length === 0) continue;
        await client.query(
          `INSERT INTO access_group_menu_permissions (group_id, menu_id, permissions, updated_at)
           VALUES ($1, $2, $3::text[], now())`,
          [groupId, entry.menuId, permissions]
        );
      }
      const saved = await client.query(
        `SELECT group_id, menu_id, permissions, updated_at
         FROM access_group_menu_permissions
         WHERE group_id = $1
         ORDER BY updated_at DESC`,
        [groupId]
      );
      await client.query("COMMIT");
      return saved.rows.map(mapGroupMenuPermission);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureTables() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_user_map_permissions (
        user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
        topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
        permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, topology_id)
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_user_map_permission_audit (
        id BIGSERIAL PRIMARY KEY,
        actor_email TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
        topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
        previous_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        next_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_user_menu_permissions (
        user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
        menu_id TEXT NOT NULL,
        permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, menu_id)
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_user_menu_permission_audit (
        id BIGSERIAL PRIMARY KEY,
        actor_email TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
        menu_id TEXT NOT NULL,
        previous_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        next_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_group_map_permissions (
        group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
        topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
        permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, topology_id)
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_group_menu_permissions (
        group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
        menu_id TEXT NOT NULL,
        permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (group_id, menu_id)
      )
    `);
  }
}

function normalizePermissions(value: unknown): PermissionKey[] {
  const allowed: PermissionKey[] = ["view", "edit"];
  const source = Array.isArray(value) ? value : [];
  return allowed.filter((permission) => source.includes(permission));
}

function samePermissions(left: PermissionKey[], right: PermissionKey[]) {
  return left.length === right.length && left.every((permission) => right.includes(permission));
}

function mapPermission(row: any): UserMapPermission {
  return {
    userId: row.user_id,
    topologyId: row.topology_id,
    permissions: normalizePermissions(row.permissions),
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function mapMenuPermission(row: any): UserMenuPermission {
  return {
    userId: row.user_id,
    menuId: row.menu_id,
    permissions: normalizePermissions(row.permissions),
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function mapGroupPermission(row: any): GroupMapPermission {
  return {
    groupId: row.group_id,
    topologyId: row.topology_id,
    permissions: normalizePermissions(row.permissions),
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function mapGroupMenuPermission(row: any): GroupMenuPermission {
  return {
    groupId: row.group_id,
    menuId: row.menu_id,
    permissions: normalizePermissions(row.permissions),
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at
  };
}

function mapAuditEntry(row: any): MapPermissionAuditEntry {
  return {
    id: Number(row.id),
    actorEmail: row.actor_email,
    userId: row.user_id,
    topologyId: row.topology_id,
    previousPermissions: normalizePermissions(row.previous_permissions),
    nextPermissions: normalizePermissions(row.next_permissions),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}

function mapMenuAuditEntry(row: any): MenuPermissionAuditEntry {
  return {
    id: Number(row.id),
    actorEmail: row.actor_email,
    userId: row.user_id,
    menuId: row.menu_id,
    previousPermissions: normalizePermissions(row.previous_permissions),
    nextPermissions: normalizePermissions(row.next_permissions),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at
  };
}
