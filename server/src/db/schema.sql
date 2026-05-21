CREATE TABLE IF NOT EXISTS topologies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  zabbix_server_id UUID,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zabbix_host_cache (
  zabbix_server_id UUID,
  host_id TEXT PRIMARY KEY,
  host_name TEXT NOT NULL,
  visible_name TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  ports JSONB NOT NULL DEFAULT '[]'::jsonb,
  alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zabbix_servers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT,
  totp_secret TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT false,
  totp_backup_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE topologies ADD COLUMN IF NOT EXISTS topology_type TEXT CHECK (topology_type IN ('isp', 'corporate'));
ALTER TABLE topologies ADD COLUMN IF NOT EXISTS zabbix_server_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE access_users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE access_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE access_users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS custom_icons (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  data_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_user_map_permissions (
  user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
  topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
  permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topology_id)
);

CREATE TABLE IF NOT EXISTS access_user_map_permission_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
  topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
  previous_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  next_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_user_menu_permissions (
  user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
  menu_id TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_id)
);

CREATE TABLE IF NOT EXISTS access_user_menu_permission_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
  menu_id TEXT NOT NULL,
  previous_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  next_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','operator','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_group_members (
  group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES access_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS access_group_map_permissions (
  group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  topology_id UUID NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
  permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, topology_id)
);

CREATE TABLE IF NOT EXISTS access_group_menu_permissions (
  group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  menu_id TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, menu_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agm_user_id          ON access_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_agm_group_id         ON access_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_agmp_group_id        ON access_group_map_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_agmenup_group_id     ON access_group_menu_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_aump_user_id         ON access_user_map_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_aump_updated_at      ON access_user_map_permissions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aumpa_created_at     ON access_user_map_permission_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aumpa_user_id        ON access_user_map_permission_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_aumenup_user_id      ON access_user_menu_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_aumenupa_created_at  ON access_user_menu_permission_audit(created_at DESC);
