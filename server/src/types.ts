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

export interface TopologyNode {
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
  handles?: string[];
}

export interface TopologyEdge {
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
  bandwidthLimit?: number;
}

export interface Topology {
  id: string;
  name: string;
  topologyType?: "isp" | "corporate";
  zabbixServerId?: string;
  zabbixServerIds?: string[];
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  updatedAt?: string;
}
