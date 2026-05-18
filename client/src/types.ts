export type DeviceStatus = "up" | "down" | "maintenance" | "unknown";

export interface DeviceMetric {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  updatedAt?: string;
}

export interface PortMetric {
  id: string;
  name: string;
  index?: string;
  alias?: string;
  description?: string;
  inItemId?: string;
  outItemId?: string;
  statusItemId?: string;
  speedItemId?: string;
  inBps?: number;
  outBps?: number;
  speedMbps?: number;
  utilizationPct?: number;
  operStatus?: "up" | "down" | "unknown";
}

export interface DeviceAlert {
  eventId: string;
  severity: number;
  name: string;
  clock: string;
}

export interface DeviceSnapshot {
  zabbixServerId?: string;
  hostId: string;
  hostName: string;
  visibleName: string;
  ip?: string;
  status: DeviceStatus;
  metrics: DeviceMetric[];
  ports: PortMetric[];
  alerts: DeviceAlert[];
  syncedAt: string;
}

export interface Topology {
  id?: string;
  name: string;
  zabbixServerId?: string;
  nodes: Array<{
    id: string;
    hostId?: string;
    type: "switch" | "router" | "radio" | "firewall" | "server" | "lte" | "unknown";
    label: string;
    position: { x: number; y: number };
    iconSize?: number;
    labelFontSize?: number;
    labelPosition?: "above" | "below";
    color?: string;
    showBackground?: boolean;
    showIp?: boolean;
    zabbixServerId?: string;
    statusItemKey?: string;
    onlineValue?: string;
    offlineValue?: string;
    advancedMode?: boolean;
    customIconId?: string;
    handles?: string[];
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    sourceHostId?: string;
    targetHostId?: string;
    sourceOutInterface?: string;
    sourceInInterface?: string;
    targetInInterface?: string;
    targetOutInterface?: string;
    sourceOutItemId?: string;
    sourceInItemId?: string;
    targetInItemId?: string;
    targetOutItemId?: string;
    sourceStatusItemId?: string;
    targetStatusItemId?: string;
    sourceInterfaceName?: string;
    targetInterfaceName?: string;
    sourceInterfaceAlias?: string;
    targetInterfaceAlias?: string;
    sourceInterface?: string;
    targetInterface?: string;
    cableType?: "fiber" | "utp" | "radio" | "wireless" | "vpn" | "other";
    color?: string;
    strokeWidth?: number;
    lineStyle?: "solid" | "dashed" | "dotted" | "dashdot";
    badgeFontSize?: number;
    showTraffic?: boolean;
    showLabel?: boolean;
    waypointDX?: number;
    waypointDY?: number;
    showSignal?: boolean;
    signalLabel?: string;
    signalTxMetricKey?: string;
    signalRxMetricKey?: string;
    signalHostId?: string;
  }>;
}

export interface ZabbixServerConfig {
  id?: string;
  name: string;
  url: string;
  user: string;
  active: boolean;
  hasPassword: boolean;
  updatedAt?: string;
}

export interface ZabbixTestResult {
  ok: boolean;
  version?: string;
  hostCount?: number;
  monitoredHostCount?: number;
  message: string;
}

export interface ZabbixItemsInspection {
  server: ZabbixServerConfig;
  hostCount: number;
  itemCount: number;
  hosts: Array<{
    hostId: string;
    hostName: string;
    visibleName: string;
    items: Array<{
      itemId: string;
      name: string;
      key: string;
      lastValue?: string;
      units?: string;
      updatedAt?: string;
    }>;
  }>;
}

export interface ZabbixHostsResult {
  server: ZabbixServerConfig;
  hostCount: number;
  hosts: DeviceSnapshot[];
}

export interface CustomIcon {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface AppVersion {
  name: string;
  version: string;
  channel: string;
  build: string;
}

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
  createdAt?: string;
}

export interface AccessGroup {
  id: string;
  name: string;
  description?: string;
  role: "admin" | "operator" | "viewer";
  memberCount: number;
  createdAt: string;
}

export interface AccessGroupMember {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  joinedAt: string;
}

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

export interface MapPermissionAdminState {
  users: AccessUser[];
  groups: AccessGroup[];
  topologies: Array<Topology & { id: string }>;
  permissions: UserMapPermission[];
  mapPermissions?: UserMapPermission[];
  menuPermissions: UserMenuPermission[];
  groupMapPermissions: GroupMapPermission[];
  groupMenuPermissions: GroupMenuPermission[];
  audit: MapPermissionAuditEntry[];
  menuAudit: MenuPermissionAuditEntry[];
}

export interface CurrentUserPermissions {
  user: AccessUser;
  fullAccess: boolean;
  menuPermissions: UserMenuPermission[];
  mapPermissions: UserMapPermission[];
}

export interface LoginLogoConfig {
  dataUrl?: string;
  width: number;
  offsetX: number;
  offsetY: number;
  backgroundColor: string;
  titleColor: string;
  updatedAt?: string;
}

export interface NavLogoConfig {
  dataUrl?: string;
  width: number;
  updatedAt?: string;
}

export interface FaviconConfig {
  dataUrl?: string;
  updatedAt?: string;
}
