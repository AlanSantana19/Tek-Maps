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

export interface TopologyNode {
  id: string;
  hostId?: string;
  type: "switch" | "router" | "radio" | "firewall" | "server" | "unknown";
  label: string;
  position: { x: number; y: number };
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Topology {
  id: string;
  name: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  updatedAt?: string;
}
