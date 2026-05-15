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
  inBps?: number;
  outBps?: number;
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
  hostId: string;
  hostName: string;
  visibleName: string;
  status: DeviceStatus;
  metrics: DeviceMetric[];
  ports: PortMetric[];
  alerts: DeviceAlert[];
  syncedAt: string;
}

export interface Topology {
  id?: string;
  name: string;
  nodes: Array<{
    id: string;
    hostId?: string;
    type: "switch" | "router" | "radio" | "firewall" | "server" | "unknown";
    label: string;
    position: { x: number; y: number };
  }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
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

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  active: boolean;
  createdAt?: string;
}
