import QRCode from "qrcode";
import {
  Activity,
  Antenna,
  ArrowLeft,
  BarChart3,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Cloud,
  Copy,
  Download,
  Eye,
  Grid3x3,
  HardDrive,
  Image,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Link2,
  Magnet,
  MapIcon,
  Maximize2,
  Minimize2,
  MousePointer2,
  Network,
  Palette,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Router,
  Save,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  Workflow,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connection, Edge, Node, NodePositionChange, OnEdgesChange, OnNodesChange, ReactFlowInstance } from "@xyflow/react";
import type { DragEvent, FormEvent, MouseEvent } from "react";
import { Background, BackgroundVariant, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import { LinkEdge, SnapshotsContext } from "./LinkEdge";
import {
  AUTH_EXPIRED_EVENT,
  loginTotp,
  getTotpStatus,
  setupTotp,
  enableTotp,
  disableTotp,
  resetUserTotp,
  generateUserTotp,
  addGroupMember,
  apiGet,
  createAccessGroup,
  createAccessUser,
  createCustomIcon,
  getActivityLog,
  getAppVersion,
  getRecentEvents,
  saveRecentEvent,
  getCurrentUserPermissions,
  getLoginLogoConfig,
  getFaviconConfig,
  getNavLogoConfig,
  getMapPermissionAdminState,
  getOnlineUsers,
  getToken,
  getZabbixServerHosts,
  inspectZabbixItems,
  listAccessGroups,
  listCustomIcons,
  listGroupMembers,
  login,
  logout,
  openSnapshotsSocket,
  removeAccessGroup,
  removeAccessUser,
  removeCustomIcon,
  removeGroupMember,
  removeTopology,
  removeZabbixConfig,
  resetAccessUserPassword,
  saveTopology,
  saveZabbixConfig,
  testZabbixConfig,
  updateAccessGroup,
  updateAccessUser,
  updateGroupGranularPermissions,
  updateLoginLogoConfig,
  updateFaviconConfig,
  updateNavLogoConfig,
  updateUserGranularPermissions,
  updateZabbixConfig
} from "../api";
import type { AccessGroup, AccessGroupMember, AccessUser, ActivityLogEntry, AppVersion, CurrentUserPermissions, CustomIcon, DeviceSnapshot, FaviconConfig, GroupMapPermission, GroupMenuPermission, LoginLogoConfig, MapPermissionAdminState, NavLogoConfig, OnlineUser, PermissionKey, PortMetric, Topology, UserMapPermission, UserMenuPermission, ZabbixItemsInspection, ZabbixServerConfig } from "../types";
import { DeviceNode } from "./DeviceNode";

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };
const EMPTY_SNAPSHOTS = new Map<string, DeviceSnapshot>();
const CLIPBOARD_KEY = "tek-map-clipboard";

type SectionId = "dashboard" | "editor" | "viewer" | "server" | "admin" | "icons" | "branding";

type DeviceNodeData = {
  label: string;
  hostId?: string;
  deviceType: Topology["nodes"][number]["type"];
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
  customIconUrl?: string;
  snapshot?: DeviceSnapshot;
  handles?: string[];
};

type DeviceFlowNode = Node<DeviceNodeData, "device">;

type CableType = "fiber" | "utp" | "radio" | "wireless" | "vpn" | "other" | "signal";
type LineStyle = "solid" | "dashed" | "dotted" | "dashdot";

const CABLE_TYPE_PRESETS: Record<CableType, { label: string; color: string; lineStyle: LineStyle; strokeWidth: number; routing?: "straight" | "malleable" | "wave" }> = {
  fiber:    { label: "Fibra",           color: "#3b82f6", lineStyle: "solid",   strokeWidth: 2 },
  utp:      { label: "UTP",            color: "#f59e0b", lineStyle: "solid",   strokeWidth: 2 },
  radio:    { label: "Rádio",          color: "#a855f7", lineStyle: "dashed",  strokeWidth: 2 },
  wireless: { label: "Wireless",       color: "#10b981", lineStyle: "dotted",  strokeWidth: 2 },
  vpn:      { label: "VPN",           color: "#22c55e", lineStyle: "dashdot", strokeWidth: 2 },
  other:    { label: "Outro",          color: "#9ca3af", lineStyle: "solid",   strokeWidth: 2 },
  signal:   { label: "Sinal de Rádio", color: "#a855f7", lineStyle: "solid",   strokeWidth: 2, routing: "wave" },
};

function lineStyleDash(lineStyle: LineStyle | undefined): string | undefined {
  switch (lineStyle) {
    case "dashed":  return "8 6";
    case "dotted":  return "2 4";
    case "dashdot": return "12 4 2 4";
    default:        return undefined;
  }
}

function cablePreviewBackground(lineStyle: LineStyle, color: string): string {
  switch (lineStyle) {
    case "dashed":  return `repeating-linear-gradient(90deg, ${color} 0, ${color} 8px, transparent 8px, transparent 14px)`;
    case "dotted":  return `repeating-linear-gradient(90deg, ${color} 0, ${color} 2px, transparent 2px, transparent 6px)`;
    case "dashdot": return `repeating-linear-gradient(90deg, ${color} 0, ${color} 10px, transparent 10px, transparent 14px, ${color} 14px, ${color} 16px, transparent 16px, transparent 22px)`;
    default:        return color;
  }
}

type LinkEdgeData = {
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
  cableType?: CableType;
  color?: string;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  badgeFontSize?: number;
  showTraffic?: boolean;
  showLabel?: boolean;
  routing?: "straight" | "malleable" | "wave";
  waypoints?: Array<{ x: number; y: number }>;
  waypointDX?: number;
  waypointDY?: number;
  showSignal?: boolean;
  signalLabel?: string;
  signalTxMetricKey?: string;
  signalRxMetricKey?: string;
  signalHostId?: string;
  showRadioSignal?: boolean;
  radioSignalLabel?: string;
  radioSignalHostId?: string;
  radioSignalMetricKey?: string;
  linkRole?: "primary" | "backup";
  showLinkRole?: boolean;
  bandwidthLimit?: number;
};

type PaletteItem = {
  id: string;
  label: string;
  type: Topology["nodes"][number]["type"];
  icon: typeof Router;
};

type EditorTool = "select" | "cable" | PaletteItem["id"];

const paletteItems: PaletteItem[] = [
  { id: "host", label: "Host", type: "unknown", icon: HardDrive },
  { id: "router", label: "Router", type: "router", icon: Router },
  { id: "switch-l2", label: "Switch L2", type: "switch", icon: Network },
  { id: "switch-l3", label: "Switch L3", type: "switch", icon: Network },
  { id: "firewall", label: "Firewall", type: "firewall", icon: Shield },
  { id: "radio", label: "Radio", type: "radio", icon: Radio },
  { id: "server", label: "Servidor", type: "server", icon: Server },
  { id: "lte", label: "LTE", type: "lte", icon: Workflow },
  { id: "olt", label: "OLT", type: "olt", icon: Antenna },
  { id: "cloud", label: "Cloud", type: "cloud", icon: Cloud }
];

const menuItems: Array<{ id: SectionId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "editor", label: "Editor Maps", icon: MapIcon },
  { id: "viewer", label: "Live Viewer", icon: Eye },
  { id: "server", label: "Servidor", icon: Server },
  { id: "icons", label: "Icones", icon: Image },
  { id: "branding", label: "Personalizacao", icon: Palette },
  { id: "admin", label: "Admin", icon: Users }
];

// 1×1 transparent PNG — used to explicitly clear the favicon so the browser doesn't keep the cached one
const TRANSPARENT_FAVICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

function setFaviconHref(href: string) {
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((el) => el.remove());
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  document.head.appendChild(link);
}

async function applyFavicon(dataUrl: string, size = 16) {
  const img = new window.Image();
  await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = dataUrl; });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  setFaviconHref(canvas.toDataURL("image/png"));
}

function clearFavicon() {
  setFaviconHref(TRANSPARENT_FAVICON);
}

function snapshotLookupKey(hostId: string, zabbixServerId?: string) {
  return `${zabbixServerId ?? ""}:${hostId}`;
}

function buildSnapshotMap(snapshots: DeviceSnapshot[]) {
  const map = new Map<string, DeviceSnapshot>();
  for (const snapshot of snapshots) {
    map.set(snapshotLookupKey(snapshot.hostId, snapshot.zabbixServerId), snapshot);
    if (!map.has(snapshot.hostId)) {
      map.set(snapshot.hostId, snapshot);
    }
  }
  return map;
}

function getSnapshot(
  snapshotsByHost: Map<string, DeviceSnapshot>,
  hostId?: string,
  zabbixServerId?: string
) {
  if (!hostId) {
    return undefined;
  }
  return snapshotsByHost.get(snapshotLookupKey(hostId, zabbixServerId)) ?? snapshotsByHost.get(hostId);
}

const DEFAULT_LOGIN_LOGO_CONFIG: LoginLogoConfig = {
  width: 96,
  offsetX: 0,
  offsetY: 0,
  backgroundColor: "#0c0f14",
  titleColor: "#e7eef2"
};

export function App() {
  const [token, setLocalToken] = useState(getToken());
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const contentShellRef = useRef<HTMLElement>(null);
  const [editorMode, setEditorMode] = useState<"maps" | "canvas">("maps");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpChallenge, setTotpChallenge] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [hosts, setHosts] = useState<DeviceSnapshot[]>([]);
  const [wsConnected, setWsConnected] = useState(true);
  const [topologies, setTopologies] = useState<Array<Topology & { id: string }>>([]);
  const [selectedTopology, setSelectedTopology] = useState<Topology & { id?: string }>({
    name: "Topologia principal",
    showGrid: true,
    nodes: [],
    edges: []
  });
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Undo history
  const historyRef = useRef<Array<{ nodes: DeviceFlowNode[]; edges: Edge[] }>>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const nodesSnapRef = useRef(nodes);
  nodesSnapRef.current = nodes;
  const edgesSnapRef = useRef(edges);
  edgesSnapRef.current = edges;

  function pushHistory() {
    historyRef.current = [...historyRef.current.slice(-49), { nodes: nodesSnapRef.current, edges: edgesSnapRef.current }];
    setHistoryLength(historyRef.current.length);
  }

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const snapshot = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryLength(historyRef.current.length);
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setNodes, setEdges]);

  const isDraggingRef = useRef(false);
  const wrappedOnNodesChange: OnNodesChange<DeviceFlowNode> = useCallback((changes) => {
    const dragStart = changes.some(
      (c): c is NodePositionChange => c.type === "position" && c.dragging === true
    );
    const dragEnd = changes.some(
      (c): c is NodePositionChange => c.type === "position" && c.dragging === false
    );
    if (dragStart && !isDraggingRef.current) {
      isDraggingRef.current = true;
      historyRef.current = [...historyRef.current.slice(-49), { nodes: nodesSnapRef.current, edges: edgesSnapRef.current }];
      setHistoryLength(historyRef.current.length);
    }
    if (dragEnd) isDraggingRef.current = false;
    onNodesChange(changes);
  }, [onNodesChange]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [currentPermissions, setCurrentPermissions] = useState<CurrentUserPermissions | null>(null);
  const [loginLogoConfig, setLoginLogoConfig] = useState<LoginLogoConfig>(DEFAULT_LOGIN_LOGO_CONFIG);
  const [navLogoConfig, setNavLogoConfig] = useState<NavLogoConfig>({ width: 120 });
  const [faviconConfig, setFaviconConfig] = useState<FaviconConfig>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "1");

  const snapshotsByHost = useMemo(() => buildSnapshotMap(hosts), [hosts]);
  const alertsCount = hosts.reduce((total, host) => total + host.alerts.length, 0);
  const downHosts = hosts.filter((host) => host.status === "down").length;

  const hostsInMaps = useMemo(() => {
    const ids = new Set<string>();
    for (const topology of topologies) {
      for (const node of topology.nodes) {
        if (node.hostId) ids.add(node.hostId);
      }
    }
    return ids;
  }, [topologies]);

  const offlineHostsList = useMemo(
    () => hosts.filter((h) => h.status === "down" && hostsInMaps.has(h.hostId)),
    [hosts, hostsInMaps]
  );

  const hostToMaps = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const topology of topologies) {
      for (const node of topology.nodes) {
        if (!node.hostId) continue;
        const existing = map.get(node.hostId) ?? [];
        if (!existing.includes(topology.name)) map.set(node.hostId, [...existing, topology.name]);
      }
    }
    return map;
  }, [topologies]);

  const [hostEvents, setHostEvents] = useState<RecentEvent[]>([]);
  const prevHostStatusRef = useRef(new Map<string, string>());

  useEffect(() => {
    const prev = prevHostStatusRef.current;
    const newEvents: RecentEvent[] = [];
    for (const host of hosts) {
      const prevStatus = prev.get(host.hostId);
      const maps = hostToMaps.get(host.hostId) ?? [];
      if (maps.length === 0) continue;
      const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const detail = [...maps, time].join(" · ");
      if (prevStatus === undefined) {
        if (host.status === "down") {
          newEvents.push({ id: `${host.hostId}-down-init-${Date.now()}`, type: "host_down", label: host.visibleName, detail, timestamp: new Date() });
        }
      } else if (prevStatus !== host.status) {
        newEvents.push({
          id: `${host.hostId}-${host.status}-${Date.now()}`,
          type: host.status === "down" ? "host_down" : "host_up",
          label: host.visibleName,
          detail,
          timestamp: new Date()
        });
      }
      prev.set(host.hostId, host.status);
    }
    if (newEvents.length > 0) {
      for (const ev of newEvents) {
        void saveRecentEvent({ id: ev.id, type: ev.type, label: ev.label, detail: ev.detail }).catch(() => {});
      }
      setHostEvents((current) => [...newEvents, ...current]);
    }
  }, [hosts, hostToMaps]);

  type BandwidthAlert = {
    edgeId: string;
    topologyName: string;
    linkLabel?: string;
    sourceHostName: string;
    targetHostName?: string;
    utilizationPct: number;
    peakBps: number;
    limitMbps: number;
    level: "warning" | "critical";
  };

  const bandwidthAlerts = useMemo<BandwidthAlert[]>(() => {
    const result: BandwidthAlert[] = [];
    for (const topology of topologies) {
      for (const edge of topology.edges) {
        if (!edge.bandwidthLimit || !edge.sourceHostId || !edge.sourceOutInterface) continue;
        const sourceNode = topology.nodes.find((node) => node.id === edge.source);
        const snap = getSnapshot(snapshotsByHost, edge.sourceHostId, sourceNode?.zabbixServerId);
        const port = snap?.ports.find((p) => p.id === edge.sourceOutInterface);
        if (!port) continue;
        const peakBps = Math.max(port.outBps ?? 0, port.inBps ?? 0);
        const pct = (peakBps / (edge.bandwidthLimit * 1e6)) * 100;
        if (pct < 80) continue;
        const srcHost = hosts.find((h) => h.hostId === edge.sourceHostId);
        const dstHost = hosts.find((h) => h.hostId === edge.targetHostId);
        result.push({
          edgeId: edge.id,
          topologyName: topology.name,
          linkLabel: edge.label,
          sourceHostName: srcHost?.visibleName ?? edge.sourceHostId ?? "?",
          targetHostName: dstHost?.visibleName,
          utilizationPct: pct,
          peakBps,
          limitMbps: edge.bandwidthLimit,
          level: pct >= 100 ? "critical" : "warning",
        });
      }
    }
    return result.sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [topologies, snapshotsByHost, hosts]);
  const visibleMenuIds = useMemo(() => {
    if (!currentPermissions || currentPermissions.fullAccess) {
      return new Set<SectionId>(menuItems.map((item) => item.id));
    }
    return new Set<SectionId>(
      currentPermissions.menuPermissions
        .filter((entry) => entry.permissions.includes("view"))
        .map((entry) => entry.menuId as SectionId)
    );
  }, [currentPermissions]);
  const availableMenuItems = menuItems.filter((item) => visibleMenuIds.has(item.id));
  const canCustomizeBranding = currentPermissions?.user.role === "admin";
  const allowedTopologyIds = useMemo(() => {
    if (!currentPermissions || currentPermissions.fullAccess) {
      return null;
    }
    return new Set(currentPermissions.mapPermissions.filter((entry) => entry.permissions.includes("view")).map((entry) => entry.topologyId));
  }, [currentPermissions]);

  const applyVisibleTopologies = useCallback((items: Array<Topology & { id: string }>) => {
    setTopologies(allowedTopologyIds ? items.filter((topology) => allowedTopologyIds.has(topology.id)) : items);
  }, [allowedTopologyIds]);

  useEffect(() => {
    function handleAuthExpired() {
      setLocalToken(null);
      setHosts([]);
      setNodes([]);
      setEdges([]);
      setCurrentPermissions(null);
      setError("Sessao expirada. Faca login novamente.");
      setActiveSection("dashboard");
      setEditorMode("maps");
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [setNodes, setEdges]);

  useEffect(() => {
    void getLoginLogoConfig().then(setLoginLogoConfig).catch(() => {});
    void getNavLogoConfig().then(setNavLogoConfig).catch(() => {});
    void getFaviconConfig().then((cfg) => { setFaviconConfig(cfg); if (cfg.dataUrl) applyFavicon(cfg.dataUrl, cfg.size); else clearFavicon(); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (contentShellRef.current) contentShellRef.current.scrollTop = 0;
  }, [activeSection]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadInitialData();
    void getAppVersion().then(setAppVersion).catch(() => {});
    void listCustomIcons().then(setCustomIcons).catch(() => {});
    const socket = openSnapshotsSocket(setHosts, setWsConnected);
    return () => socket.close();
  }, [token]);

  useEffect(() => {
    setNodes((current) => current.map((node) => ({
      ...node,
      data: {
        ...node.data,
        snapshot: getSnapshot(snapshotsByHost, node.data.hostId ? String(node.data.hostId) : undefined, node.data.zabbixServerId)
      }
    })));
  }, [snapshotsByHost, setNodes]);

  async function loadInitialData() {
    try {
      const [hostData, topologies, permissions] = await Promise.all([
        apiGet<DeviceSnapshot[]>("/api/zabbix/hosts"),
        apiGet<Array<Topology & { id: string }>>("/api/topologies"),
        getCurrentUserPermissions()
      ]);
      setHosts(hostData);
      setCurrentPermissions(permissions);
      const permittedTopologyIds = permissions.fullAccess
        ? null
        : new Set(permissions.mapPermissions.filter((entry) => entry.permissions.includes("view")).map((entry) => entry.topologyId));
      const visibleTopologies = permittedTopologyIds
        ? topologies.filter((topology) => permittedTopologyIds.has(topology.id))
        : topologies;
      setTopologies(visibleTopologies);
      const topology = visibleTopologies[0] ?? selectedTopology;
      setSelectedTopology(topology);
      setNodes(topology.nodes.map(toFlowNode(hostData, customIcons)));
      setEdges(topology.edges.map(toFlowEdge));
      if (!permissions.fullAccess && !permissions.menuPermissions.some((entry) => entry.menuId === activeSection && entry.permissions.includes("view"))) {
        const firstMenu = menuItems.find((item) => permissions.menuPermissions.some((entry) => entry.menuId === item.id && entry.permissions.includes("view")));
        setActiveSection(firstMenu?.id ?? "dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await login(username, password);
      if (result.type === "totp_required") {
        setTotpChallenge(result.challengeToken);
        setPassword("");
      } else {
        setLocalToken(result.token);
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login falhou");
    }
  }

  async function handleTotpLogin(event: FormEvent) {
    event.preventDefault();
    if (!totpChallenge) return;
    setError(null);
    try {
      setLocalToken(await loginTotp(totpChallenge, totpCode));
      setTotpChallenge(null);
      setTotpCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Codigo invalido");
    }
  }

  function handleLogout() {
    logout();
    setLocalToken(null);
    setHosts([]);
    setNodes([]);
    setEdges([]);
    setCurrentPermissions(null);
    setActiveSection("dashboard");
    setEditorMode("maps");
  }

  function openTopology(topology: Topology & { id: string }) {
    setSelectedTopology(topology);
    setNodes(topology.nodes.map(toFlowNode(hosts, customIcons)));
    setEdges(topology.edges.map(toFlowEdge));
    setEditorMode("canvas");
  }

  function addHost(host: DeviceSnapshot) {
    const id = `node-${host.hostId}`;
    if (nodes.some((node) => node.id === id)) {
      return;
    }
    setNodes((current) => [
      ...current,
      {
        id,
        type: "device",
        position: { x: 160 + current.length * 40, y: 120 + current.length * 30 },
        data: {
          label: host.visibleName,
          hostId: host.hostId,
          deviceType: inferDeviceType(host.visibleName),
          snapshot: host
        }
      }
    ]);
  }

  function addHostAt(host: DeviceSnapshot, position?: { x: number; y: number }) {
    const id = `node-${host.hostId}`;
    if (nodes.some((node) => node.id === id)) {
      return id;
    }
    pushHistory();
    setNodes((current) => [
      ...current,
      {
        id,
        type: "device",
        position: position ?? { x: 160 + current.length * 40, y: 120 + current.length * 30 },
        data: {
          label: host.visibleName,
          hostId: host.hostId,
          deviceType: inferDeviceType(host.visibleName),
          iconSize: 48,
          labelPosition: "below",
          color: "#ffffff",
          showBackground: true,
          zabbixServerId: host.zabbixServerId,
          onlineValue: "1",
          offlineValue: "2",
          advancedMode: false,
          snapshot: host
        }
      }
    ]);
    return id;
  }

  function addPaletteNode(item: PaletteItem, position: { x: number; y: number }) {
    const id = `node-${item.id}-${Date.now()}`;
    pushHistory();
    setNodes((current) => [
      ...current,
      {
        id,
        type: "device",
        position,
        data: {
          label: item.label,
          deviceType: item.type,
          iconSize: 48,
          labelPosition: "below",
          color: "#ffffff",
          showBackground: true,
          onlineValue: "1",
          offlineValue: "2",
          advancedMode: false
        }
      }
    ]);
    return id;
  }

  function bindNodeToHost(nodeId: string, hostId: string) {
    const host = hosts.find((item) => item.hostId === hostId);
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          hostId: host?.hostId,
          label: host?.visibleName ?? node.data.label,
          snapshot: host
        }
      };
    }));
  }

  function updateDeviceNode(nodeId: string, value: {
    label: string;
    deviceType: Topology["nodes"][number]["type"];
    hostId?: string;
    position: { x: number; y: number };
    iconSize: number;
    labelFontSize: number;
    labelPosition: "above" | "below";
    color: string;
    showBackground: boolean;
    showIp: boolean;
    zabbixServerId?: string;
    statusItemKey?: string;
    onlineValue: string;
    offlineValue: string;
    advancedMode: boolean;
    customIconId?: string;
    customIconUrl?: string;
  }) {
    const host = value.hostId ? hosts.find((item) => item.hostId === value.hostId) : undefined;
    pushHistory();
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }
      return {
        ...node,
        position: value.position,
        data: {
          ...node.data,
          label: value.label,
          deviceType: value.deviceType,
          hostId: host?.hostId,
          iconSize: value.iconSize,
          labelFontSize: value.labelFontSize,
          labelPosition: value.labelPosition,
          color: value.color,
          showBackground: value.showBackground,
          showIp: value.showIp,
          zabbixServerId: value.zabbixServerId,
          statusItemKey: value.statusItemKey,
          onlineValue: value.onlineValue,
          offlineValue: value.offlineValue,
          advancedMode: value.advancedMode,
          customIconId: value.customIconId,
          customIconUrl: value.customIconUrl,
          snapshot: host
        }
      };
    }));
  }

  function bulkUpdateNodes(iconSize: number, labelFontSize: number) {
    pushHistory();
    setNodes((current) => current.map((node) => ({
      ...node,
      data: { ...node.data, iconSize, labelFontSize }
    })));
  }

  function bulkUpdateEdges(badgeFontSize: number) {
    pushHistory();
    setEdges((current) => current.map((edge) => ({
      ...edge,
      data: { ...edge.data, badgeFontSize }
    })));
  }

  function duplicateDeviceNode(nodeId: string) {
    const source = nodes.find((node) => node.id === nodeId);
    if (!source) {
      return null;
    }
    pushHistory();
    const id = `${source.id}-copy-${Date.now()}`;
    setNodes((current) => [
      ...current,
      {
        ...source,
        id,
        selected: false,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        data: { ...source.data, label: `${source.data.label} copia` }
      }
    ]);
    return id;
  }

  function removeDeviceNode(nodeId: string) {
    pushHistory();
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }

  function removeSelectedNodes(nodeIds: string[]) {
    if (nodeIds.length === 0) return;
    pushHistory();
    const idSet = new Set(nodeIds);
    setNodes((current) => current.filter((n) => !idSet.has(n.id)));
    setEdges((current) => current.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
  }

  function pasteClipboardNodes(newNodes: DeviceFlowNode[], newEdges: Edge[]) {
    pushHistory();
    setNodes((current) => [...current, ...newNodes]);
    setEdges((current) => [...current, ...newEdges]);
  }

  function createLinkEdge(source: string, target: string, data: LinkEdgeData & { label?: string }) {
    pushHistory();
    const sourceNode = nodes.find((node) => node.id === source);
    const targetNode = nodes.find((node) => node.id === target);
    const edge = buildLinkEdge({
      id: `edge-${source}-${target}-${Date.now()}`,
      source,
      target,
      label: data.label,
      data: {
        ...data,
        sourceHostId: sourceNode?.data.hostId,
        targetHostId: targetNode?.data.hostId
      }
    });
    setEdges((current) => [...current, edge]);
    return edge.id;
  }

  function updateLinkEdge(edgeId: string, value: LinkEdgeData & { label?: string }) {
    pushHistory();
    setEdges((current) => current.map((edge) => {
      if (edge.id !== edgeId) {
        return edge;
      }
      return buildLinkEdge({
        ...edge,
        label: value.label,
        data: { ...(edge.data as LinkEdgeData | undefined), ...value }
      });
    }));
  }

  function moveLinkEdge(edgeId: string, sourceId: string, targetId: string) {
    pushHistory();
    const sourceNode = nodes.find((n) => n.id === sourceId);
    const targetNode = nodes.find((n) => n.id === targetId);
    setEdges((current) => current.map((edge) => {
      if (edge.id !== edgeId) return edge;
      const data = edge.data as LinkEdgeData | undefined;
      return buildLinkEdge({
        ...edge,
        source: sourceId,
        target: targetId,
        data: {
          ...data,
          sourceHostId: sourceNode?.data.hostId,
          targetHostId: targetNode?.data.hostId,
          sourceOutInterface: undefined,
          sourceInItemId: undefined,
          sourceOutItemId: undefined,
          sourceStatusItemId: undefined,
          sourceInterfaceName: undefined,
          sourceInterfaceAlias: undefined,
        }
      });
    }));
  }

  function removeLinkEdge(edgeId: string) {
    pushHistory();
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
  }

  async function persistTopology(showGridOverride?: boolean) {
    const showGrid = showGridOverride ?? selectedTopology.showGrid ?? true;
    setSaving(true);
    setError(null);
    try {
      const topology = await saveTopology({
        id: selectedTopology.id,
        name: selectedTopology.name,
        zabbixServerId: selectedTopology.zabbixServerId,
        zabbixServerIds: selectedTopology.zabbixServerIds,
        showGrid,
        nodes: nodes.map(fromFlowNode),
        edges: edges.map(fromFlowEdge)
      });
      const savedTopology = { ...topology, showGrid: topology.showGrid ?? showGrid };
      setSelectedTopology(savedTopology);
      setTopologies((current) => {
        const exists = current.some((item) => item.id === savedTopology.id);
        return exists ? current.map((item) => item.id === savedTopology.id ? savedTopology : item) : [savedTopology, ...current];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    if (totpChallenge) {
      return (
        <main className="login-screen">
          <form className="login-panel" onSubmit={handleTotpLogin} style={{ background: loginLogoConfig.backgroundColor }}>
            <LoginLogoPreview config={loginLogoConfig} />
            <h1 style={{ color: loginLogoConfig.titleColor }}>{loginLogoConfig.title || "Tek Map"}</h1>
            <p className="login-totp-hint">Digite o codigo de 6 digitos do Google Authenticator.</p>
            <input
              className="totp-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              placeholder="000 000"
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              autoComplete="one-time-code"
              autoFocus
              maxLength={7}
            />
            <button type="submit">Verificar</button>
            <button type="button" className="secondary-button" onClick={() => { setTotpChallenge(null); setError(null); }}>
              Voltar
            </button>
            {error ? <p className="error">{error}</p> : null}
          </form>
        </main>
      );
    }
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={handleLogin} style={{ background: loginLogoConfig.backgroundColor }}>
          <LoginLogoPreview config={loginLogoConfig} />
          <h1 style={{ color: loginLogoConfig.titleColor }}>{loginLogoConfig.title || "Tek Map"}</h1>
          <input
            type="text"
            placeholder="Usuario ou email"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
          <button type="submit">Entrar</button>
          {error ? <p className="error">{error}</p> : null}
        </form>
      </main>
    );
  }

  function toggleSidebar() {
    setSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <main className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        <div className="brand">
          {navLogoConfig.dataUrl ? (
            <div className="brand-with-logo">
              <img src={navLogoConfig.dataUrl} alt="Logo" className="nav-logo-img" style={{ width: navLogoConfig.width }} />
              <span>{hosts.length} hosts sincronizados</span>
              <small>{appVersion ? `v${appVersion.version} · ${appVersion.build}` : ""}</small>
            </div>
          ) : (
            <>
              <Activity size={24} />
              <div className="brand-text">
                <strong>{navLogoConfig.title || "Tek Map"}</strong>
                <span>{hosts.length} hosts sincronizados</span>
                <small>{appVersion ? `v${appVersion.version} · ${appVersion.build}` : ""}</small>
              </div>
            </>
          )}
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="side-nav" aria-label="Principal">
          {availableMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeSection === item.id ? "active" : ""}`}
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => {
                  setActiveSection(item.id);
                  if (item.id === "editor") {
                    setEditorMode("maps");
                  }
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {activeSection === "editor" && editorMode === "canvas" ? <div className="sidebar-save">
          <input
            className="topology-name"
            value={selectedTopology.name}
            onChange={(event) => setSelectedTopology({ ...selectedTopology, name: event.target.value })}
          />
          <button className="save-button" onClick={() => persistTopology()} disabled={saving}>
            <Save size={18} />
            {saving ? "Salvando" : "Salvar topologia"}
          </button>
        </div> : null}

        {error ? <p className="error">{error}</p> : null}

        <button className="logout-button" onClick={handleLogout} title={sidebarCollapsed ? "Sair" : undefined}>
          <LogOut size={18} />
          <span>Sair</span>
        </button>
      </aside>

      <section className="content-shell" ref={contentShellRef}>
        {activeSection === "dashboard" ? (
          <Dashboard
            hosts={hosts}
            alertsCount={alertsCount}
            downHosts={downHosts}
            mapsCount={topologies.length}
            offlineHostsList={offlineHostsList}
            bandwidthAlerts={bandwidthAlerts}
            topologies={topologies}
            wsConnected={wsConnected}
            hostEvents={hostEvents}
          />
        ) : null}

        {activeSection === "editor" && editorMode === "maps" ? (
          <EditorMaps
            topologies={topologies}
            onTopologiesChange={applyVisibleTopologies}
            onOpenTopology={openTopology}
          />
        ) : null}

        {activeSection === "editor" && editorMode === "canvas" ? (
          <TopologyEditor
            topologyName={selectedTopology.name}
            topologyZabbixServerIds={selectedTopology.zabbixServerIds ?? (selectedTopology.zabbixServerId ? [selectedTopology.zabbixServerId] : [])}
            topologyShowGrid={selectedTopology.showGrid ?? true}
            snapshotsByHost={snapshotsByHost}
            hosts={hosts}
            nodes={nodes}
            edges={edges}
            saving={saving}
            customIcons={customIcons}
            onBack={() => setEditorMode("maps")}
            onAddPaletteNode={addPaletteNode}
            onAddHostAt={addHostAt}
            onUpdateDeviceNode={updateDeviceNode}
            onBulkUpdateNodes={bulkUpdateNodes}
            onBulkUpdateEdges={bulkUpdateEdges}
            onRemoveDeviceNode={removeDeviceNode}
            onDuplicateDeviceNode={duplicateDeviceNode}
            onCreateLinkEdge={createLinkEdge}
            onUpdateLinkEdge={updateLinkEdge}
            onMoveLinkEdge={moveLinkEdge}
            onRemoveLinkEdge={removeLinkEdge}
            onSave={persistTopology}
            onNodesChange={wrappedOnNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(connection) => {
              if (connection.source && connection.target) {
                createLinkEdge(connection.source, connection.target, {
                  label: "TX: -- Mbps / RX: -- Mbps",
                  showTraffic: true,
                  showLabel: true
                });
              }
            }}
            onPasteNodes={pasteClipboardNodes}
            onUndo={undo}
            canUndo={historyLength > 0}
            onRemoveSelectedNodes={removeSelectedNodes}
            onShowGridChange={(showGrid) => {
              setSelectedTopology((current) => ({ ...current, showGrid }));
              setTopologies((current) => current.map((topology) => (
                topology.id === selectedTopology.id ? { ...topology, showGrid } : topology
              )));
            }}
          />
        ) : null}

        {activeSection === "viewer" ? (
          <LiveViewer topologies={topologies} snapshotsByHost={snapshotsByHost} customIcons={customIcons} />
        ) : null}
        {activeSection === "server" ? <ServerSettings /> : null}
        {activeSection === "icons" ? <CustomIconsPanel customIcons={customIcons} onCustomIconsChange={setCustomIcons} /> : null}
        {activeSection === "branding" && canCustomizeBranding ? (
          <BrandingPanel
            loginConfig={loginLogoConfig}
            navConfig={navLogoConfig}
            faviconConfig={faviconConfig}
            onLoginConfigChange={setLoginLogoConfig}
            onNavConfigChange={setNavLogoConfig}
            onFaviconConfigChange={(cfg) => {
              setFaviconConfig(cfg);
              if (cfg.dataUrl) {
                applyFavicon(cfg.dataUrl, cfg.size);
              } else {
                clearFavicon();
              }
            }}
          />
        ) : null}
        {activeSection === "admin" ? <AdminUsers /> : null}
      </section>
    </main>
  );
}

function LoginLogoPreview({ config, compact = false }: { config: LoginLogoConfig; compact?: boolean }) {
  return (
    <div className={compact ? "login-logo-slot compact" : "login-logo-slot"} style={{ transform: `translate(${config.offsetX}px, ${config.offsetY}px)` }}>
      {config.dataUrl ? (
        <img src={config.dataUrl} alt="Logo" style={{ width: config.width }} />
      ) : (
        <Lock size={compact ? 28 : 44} />
      )}
    </div>
  );
}

function BrandingPanel({
  loginConfig,
  navConfig,
  faviconConfig,
  onLoginConfigChange,
  onNavConfigChange,
  onFaviconConfigChange
}: {
  loginConfig: LoginLogoConfig;
  navConfig: NavLogoConfig;
  faviconConfig: FaviconConfig;
  onLoginConfigChange: (config: LoginLogoConfig) => void;
  onNavConfigChange: (config: NavLogoConfig) => void;
  onFaviconConfigChange: (config: FaviconConfig) => void;
}) {
  const [loginDraft, setLoginDraft] = useState<LoginLogoConfig>(loginConfig);
  const [navDraft, setNavDraft] = useState<NavLogoConfig>(navConfig);
  const [faviconDraft, setFaviconDraft] = useState<FaviconConfig>(faviconConfig);
  const [loginStatus, setLoginStatus] = useState<string | null>(null);
  const [navStatus, setNavStatus] = useState<string | null>(null);
  const [faviconStatus, setFaviconStatus] = useState<string | null>(null);
  const [savingLogin, setSavingLogin] = useState(false);
  const [savingNav, setSavingNav] = useState(false);
  const [savingFavicon, setSavingFavicon] = useState(false);

  useEffect(() => setLoginDraft(loginConfig), [loginConfig]);
  useEffect(() => setNavDraft(navConfig), [navConfig]);
  useEffect(() => setFaviconDraft(faviconConfig), [faviconConfig]);

  async function handleLoginFile(file: File | undefined) {
    setLoginStatus(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLoginStatus("Selecione um arquivo de imagem."); return; }
    if (file.size > 1_500_000) { setLoginStatus("A imagem precisa ter ate 1,5 MB."); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLoginDraft((c) => ({ ...c, dataUrl }));
    } catch { setLoginStatus("Nao foi possivel ler a imagem."); }
  }

  async function handleNavFile(file: File | undefined) {
    setNavStatus(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNavStatus("Selecione um arquivo de imagem."); return; }
    if (file.size > 1_500_000) { setNavStatus("A imagem precisa ter ate 1,5 MB."); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setNavDraft((c) => ({ ...c, dataUrl }));
    } catch { setNavStatus("Nao foi possivel ler a imagem."); }
  }

  async function saveLogin() {
    setSavingLogin(true);
    setLoginStatus(null);
    try {
      const saved = await updateLoginLogoConfig(loginDraft);
      onLoginConfigChange(saved);
      setLoginStatus("Salvo.");
    } catch (err) {
      setLoginStatus(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally { setSavingLogin(false); }
  }

  async function saveNav() {
    setSavingNav(true);
    setNavStatus(null);
    try {
      const saved = await updateNavLogoConfig(navDraft);
      onNavConfigChange(saved);
      setNavStatus("Salvo.");
    } catch (err) {
      setNavStatus(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally { setSavingNav(false); }
  }

  async function handleFaviconFile(file: File | undefined) {
    setFaviconStatus(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) { setFaviconStatus("Selecione um arquivo de imagem."); return; }
    if (file.size > 500_000) { setFaviconStatus("A imagem precisa ter ate 500 KB."); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setFaviconDraft((c) => ({ ...c, dataUrl }));
    } catch { setFaviconStatus("Nao foi possivel ler a imagem."); }
  }

  async function persistFavicon(payload: FaviconConfig, successMsg: string): Promise<boolean> {
    setSavingFavicon(true);
    setFaviconStatus(null);
    try {
      const saved = await updateFaviconConfig(payload);
      onFaviconConfigChange(saved);
      setFaviconStatus(successMsg);
      return true;
    } catch (err) {
      setFaviconStatus(err instanceof Error ? err.message : "Falha ao salvar.");
      return false;
    } finally { setSavingFavicon(false); }
  }

  async function saveFavicon() {
    await persistFavicon(faviconDraft, "Salvo.");
  }

  async function resetFavicon() {
    if (await persistFavicon({ size: 16 }, "Restaurado.")) {
      setFaviconDraft({ size: 16 });
    }
  }

  return (
    <section className="page">
      <PageHeader title="Personalizacao" subtitle="Customize logos e cores da interface." />

      <div className="branding-sections">

        <div className="branding-block">
          <div className="branding-block-header">
            <Lock size={16} />
            <div>
              <strong>Logo da tela de login</strong>
              <span>Imagem exibida no painel de autenticacao</span>
            </div>
          </div>
          <div className="branding-layout">
            <section className="panel branding-form">
              <div className="branding-upload-zone" onClick={() => (document.getElementById("login-logo-input") as HTMLInputElement)?.click()}>
                {loginDraft.dataUrl ? (
                  <img src={loginDraft.dataUrl} alt="Preview" className="branding-upload-thumb" />
                ) : (
                  <div className="branding-upload-placeholder">
                    <Image size={28} />
                    <span>Clique para selecionar</span>
                    <small>PNG, JPG, SVG ou WebP · max 1,5 MB</small>
                  </div>
                )}
                <input
                  id="login-logo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(event) => void handleLoginFile(event.target.files?.[0])}
                />
              </div>
              <label>
                Tamanho
                <div className="range-row">
                  <input type="range" min={48} max={240} value={loginDraft.width} onChange={(event) => setLoginDraft({ ...loginDraft, width: Number(event.target.value) })} />
                  <span className="range-value">{loginDraft.width}px</span>
                </div>
              </label>
              <label>
                Titulo
                <input type="text" maxLength={60} placeholder="Tek Map" value={loginDraft.title ?? ""} onChange={(event) => setLoginDraft({ ...loginDraft, title: event.target.value })} />
              </label>
              <div className="two-col-fields">
                <label>
                  Posicao X
                  <input type="number" min={-120} max={120} value={loginDraft.offsetX} onChange={(event) => setLoginDraft({ ...loginDraft, offsetX: Number(event.target.value) })} />
                </label>
                <label>
                  Posicao Y
                  <input type="number" min={-80} max={80} value={loginDraft.offsetY} onChange={(event) => setLoginDraft({ ...loginDraft, offsetY: Number(event.target.value) })} />
                </label>
              </div>
              <div className="two-col-fields">
                <label>
                  <span className="color-label-text">Fundo</span>
                  <div className="color-input-wrap">
                    <input type="color" value={loginDraft.backgroundColor} onChange={(event) => setLoginDraft({ ...loginDraft, backgroundColor: event.target.value })} />
                    <span className="color-hex">{loginDraft.backgroundColor}</span>
                  </div>
                </label>
                <label>
                  <span className="color-label-text">Titulo</span>
                  <div className="color-input-wrap">
                    <input type="color" value={loginDraft.titleColor} onChange={(event) => setLoginDraft({ ...loginDraft, titleColor: event.target.value })} />
                    <span className="color-hex">{loginDraft.titleColor}</span>
                  </div>
                </label>
              </div>
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => setLoginDraft(DEFAULT_LOGIN_LOGO_CONFIG)}>
                  Restaurar padrao
                </button>
                <button className="save-button" type="button" onClick={() => void saveLogin()} disabled={savingLogin}>
                  <Save size={18} />
                  {savingLogin ? "Salvando" : "Salvar"}
                </button>
              </div>
              {loginStatus ? <p className="form-status">{loginStatus}</p> : null}
            </section>
            <section className="branding-preview-wrap">
              <p className="preview-label">Preview</p>
              <div className="login-preview-screen">
                <div className="login-panel preview" style={{ background: loginDraft.backgroundColor }}>
                  <LoginLogoPreview config={loginDraft} />
                  <h1 style={{ color: loginDraft.titleColor }}>{loginDraft.title || "Tek Map"}</h1>
                  <input disabled placeholder="Usuario ou email" />
                  <input disabled placeholder="Senha" />
                  <button type="button">Entrar</button>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="branding-block">
          <div className="branding-block-header">
            <Palette size={16} />
            <div>
              <strong>Logo da sidebar</strong>
              <span>Substitui o icone e o nome no canto superior esquerdo</span>
            </div>
          </div>
          <div className="branding-layout branding-layout--nav">
            <section className="panel branding-form">
              <div className="branding-upload-zone" onClick={() => (document.getElementById("nav-logo-input") as HTMLInputElement)?.click()}>
                {navDraft.dataUrl ? (
                  <img src={navDraft.dataUrl} alt="Preview" className="branding-upload-thumb" />
                ) : (
                  <div className="branding-upload-placeholder">
                    <Image size={28} />
                    <span>Clique para selecionar</span>
                    <small>PNG, JPG, SVG ou WebP · max 1,5 MB</small>
                  </div>
                )}
                <input
                  id="nav-logo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(event) => void handleNavFile(event.target.files?.[0])}
                />
              </div>
              <label>
                Titulo
                <input type="text" maxLength={60} placeholder="Tek Map" value={navDraft.title ?? ""} onChange={(event) => setNavDraft({ ...navDraft, title: event.target.value })} />
              </label>
              <label>
                Tamanho
                <div className="range-row">
                  <input type="range" min={40} max={200} value={navDraft.width} onChange={(event) => setNavDraft({ ...navDraft, width: Number(event.target.value) })} />
                  <span className="range-value">{navDraft.width}px</span>
                </div>
              </label>
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => setNavDraft({ width: 120 })}>
                  Restaurar padrao
                </button>
                <button className="save-button" type="button" onClick={() => void saveNav()} disabled={savingNav}>
                  <Save size={18} />
                  {savingNav ? "Salvando" : "Salvar"}
                </button>
              </div>
              {navStatus ? <p className="form-status">{navStatus}</p> : null}
            </section>
            <section className="branding-preview-wrap">
              <p className="preview-label">Preview</p>
              <div className="nav-logo-preview">
                <div className="nav-logo-preview-sidebar">
                  {navDraft.dataUrl ? (
                    <img src={navDraft.dataUrl} alt="Logo" className="nav-logo-img" style={{ width: navDraft.width }} />
                  ) : (
                    <div className="nav-logo-preview-default">
                      <Activity size={20} />
                      <span>{navDraft.title || "Tek Map"}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="branding-block">
          <div className="branding-block-header">
            <Image size={16} />
            <div>
              <strong>Favicon da aba</strong>
              <span>Icone exibido na aba do navegador</span>
            </div>
          </div>
          <div className="branding-layout branding-layout--nav">
            <section className="panel branding-form">
              <div className="branding-upload-zone" onClick={() => (document.getElementById("favicon-input") as HTMLInputElement)?.click()}>
                {faviconDraft.dataUrl ? (
                  <img src={faviconDraft.dataUrl} alt="Favicon" className="branding-upload-thumb favicon-thumb" />
                ) : (
                  <div className="branding-upload-placeholder">
                    <Image size={28} />
                    <span>Clique para selecionar</span>
                    <small>PNG, SVG ou ICO · max 500 KB · recomendado 32×32</small>
                  </div>
                )}
                <input
                  id="favicon-input"
                  type="file"
                  accept="image/png,image/svg+xml,image/x-icon,image/webp"
                  style={{ display: "none" }}
                  onChange={(event) => void handleFaviconFile(event.target.files?.[0])}
                />
              </div>
              <label>
                Tamanho
                <div className="range-row">
                  <input type="range" min={8} max={64} value={faviconDraft.size ?? 16} onChange={(event) => setFaviconDraft((c) => ({ ...c, size: Number(event.target.value) }))} />
                  <span className="range-value">{faviconDraft.size ?? 16}px</span>
                </div>
              </label>
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => void resetFavicon()} disabled={savingFavicon}>
                  Restaurar padrao
                </button>
                <button className="save-button" type="button" onClick={() => void saveFavicon()} disabled={savingFavicon}>
                  <Save size={18} />
                  {savingFavicon ? "Salvando" : "Salvar"}
                </button>
              </div>
              {faviconStatus ? <p className="form-status">{faviconStatus}</p> : null}
            </section>
            <section className="branding-preview-wrap">
              <p className="preview-label">Preview</p>
              <div className="favicon-preview">
                <div className="favicon-preview-tab">
                  {faviconDraft.dataUrl ? (
                    <img src={faviconDraft.dataUrl} alt="Favicon" width={faviconDraft.size ?? 16} height={faviconDraft.size ?? 16} style={{ objectFit: "contain" }} />
                  ) : (
                    <Palette size={14} />
                  )}
                  <span>Tek Map</span>
                </div>
              </div>
            </section>
          </div>
        </div>

      </div>
    </section>
  );
}

type BandwidthAlertItem = {
  edgeId: string;
  topologyName: string;
  linkLabel?: string;
  sourceHostName: string;
  targetHostName?: string;
  utilizationPct: number;
  peakBps: number;
  limitMbps: number;
  level: "warning" | "critical";
};

type RecentEvent = {
  id: string;
  type: "host_down" | "host_up" | "bw_warning" | "bw_critical";
  label: string;
  detail?: string;
  timestamp: Date;
};

function Dashboard({
  hosts,
  alertsCount,
  downHosts,
  mapsCount,
  offlineHostsList,
  bandwidthAlerts,
  topologies,
  wsConnected,
  hostEvents,
}: {
  hosts: DeviceSnapshot[];
  alertsCount: number;
  downHosts: number;
  mapsCount: number;
  offlineHostsList: DeviceSnapshot[];
  bandwidthAlerts: BandwidthAlertItem[];
  topologies: Array<Topology & { id: string }>;
  wsConnected: boolean;
  hostEvents: RecentEvent[];
}) {
  const syncTimes = hosts.map((host) => host.syncedAt).sort();
  const latestSync = syncTimes[syncTimes.length - 1];
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  const todayStr = new Date().toLocaleDateString();
  const todayLogs = activityLog.filter(
    (entry) => new Date(entry.createdAt).toLocaleDateString() === todayStr
  );
  const LOGS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(todayLogs.length / LOGS_PER_PAGE));
  const pagedLogs = todayLogs.slice((activityPage - 1) * LOGS_PER_PAGE, activityPage * LOGS_PER_PAGE);

  const [dbEvents, setDbEvents] = useState<RecentEvent[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const prevBwAlertEdgesRef = useRef(new Set<string>());

  const recentEvents = useMemo(() => {
    const hostEventIds = new Set(hostEvents.map((e) => e.id));
    const merged = [...hostEvents, ...dbEvents.filter((e) => !hostEventIds.has(e.id))];
    merged.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return merged;
  }, [hostEvents, dbEvents]);

  useEffect(() => { setEventsPage(1); }, [hostEvents]);

  useEffect(() => {
    const prev = prevBwAlertEdgesRef.current;
    const events: RecentEvent[] = [];
    const currentIds = new Set<string>();
    for (const alert of bandwidthAlerts) {
      currentIds.add(alert.edgeId);
      if (!prev.has(alert.edgeId)) {
        const linkName = alert.linkLabel
          ? alert.linkLabel
          : `${alert.sourceHostName}${alert.targetHostName ? ` → ${alert.targetHostName}` : ""}`;
        const limit = alert.limitMbps >= 1000 ? `${alert.limitMbps / 1000}Gbps` : `${alert.limitMbps}Mbps`;
        const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        events.push({
          id: `${alert.edgeId}-bw-${Date.now()}`,
          type: alert.level === "critical" ? "bw_critical" : "bw_warning",
          label: linkName,
          detail: `${Math.round(alert.utilizationPct)}% de ${limit} · ${alert.topologyName} · ${time}`,
          timestamp: new Date()
        });
      }
    }
    prevBwAlertEdgesRef.current = currentIds;
    if (events.length > 0) {
      for (const ev of events) {
        void saveRecentEvent({ id: ev.id, type: ev.type, label: ev.label, detail: ev.detail }).catch(() => {});
      }
      setDbEvents((current) => [...events, ...current]);
      setEventsPage(1);
    }
  }, [bandwidthAlerts]);

  useEffect(() => {
    function fetchDashboardData() {
      void getActivityLog().then(setActivityLog).catch(() => {});
      void getRecentEvents().then((rows) => {
        setDbEvents(rows.map((r) => ({ ...r, type: r.type as RecentEvent["type"], timestamp: new Date(r.createdAt) })));
      }).catch(() => {});
    }
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void getOnlineUsers().then(setOnlineUsers).catch(() => {});
    const interval = setInterval(() => {
      void getOnlineUsers().then(setOnlineUsers).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [wsConnected]);

  // Reset diário: limpa as listas e volta para página 1 quando virar o dia
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      setActivityLog([]);
      setActivityPage(1);
    }, msUntilMidnight);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="page">
      <PageHeader title="Dashboard" subtitle="Resumo operacional da topologia e dos hosts monitorados." />
      <div className="summary-grid">
        <SummaryCard label="Mapas" value={mapsCount} />
        <SummaryCard label="Hosts" value={hosts.length} />
        <SummaryCard label="Alertas" value={alertsCount} tone={alertsCount ? "warning" : "ok"} />
        <SummaryCard label="Indisponiveis" value={downHosts} tone={downHosts ? "danger" : "ok"} />
        <SummaryCard label="Ultima sync" value={latestSync ? new Date(latestSync).toLocaleString() : "Sem dados"} />
      </div>
      {bandwidthAlerts.length > 0 && (
        <div className="dashboard-panels">
          <section className="panel panel--bandwidth">
            <h2>Alertas de banda</h2>
            <div className="event-list">
              {bandwidthAlerts.map((alert) => (
                <div className="event-row" key={alert.edgeId}>
                  <span className={`status-dot ${alert.level === "critical" ? "down" : "bw-warning"}`} />
                  <div className="event-row-body">
                    <strong>
                      {alert.linkLabel
                        ? alert.linkLabel
                        : `${alert.sourceHostName}${alert.targetHostName ? ` → ${alert.targetHostName}` : ""}`}
                    </strong>
                    <span className="event-detail">{alert.topologyName}</span>
                  </div>
                  <span className={`event-badge ${alert.level === "critical" ? "event-badge--danger" : "event-badge--warning"}`}>
                    {Math.round(alert.utilizationPct)}%
                    {" "}de{" "}
                    {alert.limitMbps >= 1000 ? `${alert.limitMbps / 1000}Gbps` : `${alert.limitMbps}Mbps`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="dashboard-panels dashboard-panels--2col">
        <section className="panel panel--online">
          <h2>Online agora</h2>
          <div className="activity-list activity-list--scroll">
            {onlineUsers.length === 0 ? (
              <p className="empty-state">Nenhum usuario conectado.</p>
            ) : (
              onlineUsers.map((user, i) => (
                <div className="activity-row" key={`${user.name}-${i}`}>
                  <span className="activity-dot online" />
                  <span className="activity-name">{user.name}</span>
                  <span className="activity-action">{user.ip}</span>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="panel panel--activity">
          <h2>Atividade recente</h2>
          <div className="activity-list activity-list--scroll">
            {todayLogs.length === 0 ? (
              <p className="empty-state">Nenhuma atividade registrada hoje.</p>
            ) : (
              todayLogs.map((entry) => (
                <div className="activity-row activity-row--log activity-row--simple" key={entry.id}>
                  <span className={`activity-dot ${entry.action === "login" ? "login" : "edit"}`} />
                  <span className="activity-name">{entry.userName}</span>
                  <span className="activity-action">{entry.action === "login" ? "fez login" : `salvou "${entry.detail ?? "mapa"}"`}</span>
                  <span className="activity-time">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <div className="dashboard-panels">
        <section className="panel panel--events">
          <h2>Eventos recentes</h2>
          <div className="event-list event-list--scroll">
            {recentEvents.length === 0 ? (
              <p className="empty-state">Nenhum evento detectado nesta sessao.</p>
            ) : (
              recentEvents.map((event) => (
                <div className="event-row" key={event.id}>
                  <span className={`status-dot ${
                    event.type === "host_down" ? "down"
                    : event.type === "host_up" ? "up"
                    : event.type === "bw_critical" ? "down"
                    : "bw-warning"
                  }`} />
                  <div className="event-row-body">
                    <strong>{event.label}</strong>
                    <span className="event-detail">{event.detail ?? ""}</span>
                  </div>
                  <span className={`event-badge ${
                    event.type === "host_down" ? "event-badge--danger"
                    : event.type === "host_up" ? "event-badge--ok"
                    : event.type === "bw_critical" ? "event-badge--danger"
                    : "event-badge--warning"
                  }`}>
                    {event.type === "host_down" ? "OFFLINE"
                     : event.type === "host_up" ? "ONLINE"
                     : event.type === "bw_critical" ? "CRITICO"
                     : "ATENCAO"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function EditorMaps({
  topologies,
  onTopologiesChange,
  onOpenTopology
}: {
  topologies: Array<Topology & { id: string }>;
  onTopologiesChange: (topologies: Array<Topology & { id: string }>) => void;
  onOpenTopology: (topology: Topology & { id: string }) => void;
}) {
  const [servers, setServers] = useState<ZabbixServerConfig[]>([]);
  const [form, setForm] = useState({ name: "", topologyType: "" as "" | "isp" | "corporate", zabbixServerIds: [] as string[] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [busyMapId, setBusyMapId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function fetchData() {
      void Promise.all([
        apiGet<ZabbixServerConfig[]>("/api/server/zabbix"),
        apiGet<Array<Topology & { id: string }>>("/api/topologies")
      ]).then(([serverData, topologyData]) => {
        setServers(serverData);
        onTopologiesChange(topologyData);
      }).catch(() => setStatus("Nao foi possivel carregar mapas e servidores."));
    }
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [onTopologiesChange]);

  async function handleSaveMap(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || form.zabbixServerIds.length === 0) {
      setStatus("Informe ao menos um servidor Zabbix e a identificacao do mapa.");
      return;
    }

    setSavingMap(true);
    setStatus(null);
    try {
      const current = editingId ? topologies.find((topology) => topology.id === editingId) : null;
      const saved = await saveTopology({
        id: editingId ?? undefined,
        name: form.name.trim(),
        topologyType: form.topologyType || undefined,
        zabbixServerIds: form.zabbixServerIds,
        nodes: current?.nodes ?? [],
        edges: current?.edges ?? []
      });
      onTopologiesChange(editingId
        ? topologies.map((topology) => topology.id === saved.id ? saved : topology)
        : [saved, ...topologies]);
      setEditingId(null);
      setForm({ name: "", topologyType: "", zabbixServerIds: [] });
      setStatus(editingId ? "Mapa atualizado." : "Mapa salvo. Use Abrir para editar a topologia.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar mapa.");
    } finally {
      setSavingMap(false);
    }
  }

  function editMap(topology: Topology & { id: string }) {
    setEditingId(topology.id);
    setForm({ name: topology.name, topologyType: topology.topologyType ?? "", zabbixServerIds: topology.zabbixServerIds ?? (topology.zabbixServerId ? [topology.zabbixServerId] : []) });
    setStatus(null);
  }

  async function removeMap(topology: Topology & { id: string }) {
    if (!window.confirm(`Remover o mapa ${topology.name}?`)) {
      return;
    }

    setBusyMapId(topology.id);
    setStatus(null);
    try {
      await removeTopology(topology.id);
      onTopologiesChange(topologies.filter((item) => item.id !== topology.id));
      if (editingId === topology.id) {
        setEditingId(null);
        setForm({ name: "", topologyType: "", zabbixServerIds: [] });
      }
      setStatus("Mapa removido.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao remover mapa.");
    } finally {
      setBusyMapId(null);
    }
  }

  function serverName(id?: string) {
    return servers.find((server) => server.id === id)?.name ?? "Servidor nao vinculado";
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setStatus(null);
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Partial<Topology>;
      if (!data.name || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        setStatus("Arquivo invalido: JSON nao e uma topologia exportada.");
        return;
      }
      const { id: _id, ...rest } = data as Topology & { id?: string };
      const saved = await saveTopology({ ...rest, name: data.name, nodes: data.nodes, edges: data.edges });
      onTopologiesChange([saved, ...topologies]);
      setStatus(`Mapa "${saved.name}" importado com sucesso.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao importar arquivo.");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function exportTopology(topology: Topology & { id: string }) {
    const json = JSON.stringify(topology, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topology.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <PageHeader title="Editor Maps" subtitle="Crie, localize e abra mapas de rede para montar topologias." />
      <div className="admin-layout">
        <form className="panel form-grid" onSubmit={handleSaveMap}>
          <h2>{editingId ? "Editar mapa" : "Novo mapa"}</h2>
          <label>
            Servidor Zabbix
            <select
              multiple
              value={form.zabbixServerIds}
              onChange={(event) => setForm({ ...form, zabbixServerIds: Array.from(event.target.selectedOptions, (opt) => opt.value) })}
              size={Math.min(Math.max(servers.length, 2), 5)}
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id ?? ""}>{server.name}</option>
              ))}
            </select>
            <small className="field-hint">Segure Ctrl para selecionar mais de um</small>
          </label>
          <label>
            Identificacao do mapa
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Mapa matriz" />
          </label>
          <label>
            Tipo de topologia
            <select value={form.topologyType} onChange={(event) => setForm({ ...form, topologyType: event.target.value as "" | "isp" | "corporate" })}>
              <option value="">Nao especificado</option>
              <option value="isp">ISP</option>
              <option value="corporate">Corporativo</option>
            </select>
          </label>
          <div className="action-row">
            {editingId ? (
              <button className="secondary-button" type="button" onClick={() => {
                setEditingId(null);
                setForm({ name: "", topologyType: "", zabbixServerIds: [] });
              }}>
                Cancelar
              </button>
            ) : null}
            <button className="save-button" type="submit" disabled={savingMap || servers.length === 0}>
              <Save size={18} />
              {savingMap ? "Salvando" : "Salvar"}
            </button>
          </div>
          {status ? <p className="form-status">{status}</p> : null}
        </form>

        <section className="panel">
          <div className="panel-header-row">
            <h2>Mapas criados</h2>
            <button className="secondary-button" type="button" onClick={() => importInputRef.current?.click()} disabled={importing}>
              <Upload size={16} />
              {importing ? "Importando..." : "Importar mapa"}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => void handleImportFile(e.target.files?.[0])}
            />
          </div>
          {topologies.length === 0 ? (
            <button className="empty-create-button" type="button" onClick={() => setStatus("Preencha servidor Zabbix e identificacao para salvar um novo mapa.")}>
              <Plus size={32} />
            </button>
          ) : (
            <div className="map-list">
              {topologies.map((topology) => (
                <div className="map-row map-row-clickable" key={topology.id} onClick={() => onOpenTopology(topology)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenTopology(topology)}>
                  <div>
                    <div className="map-row-title">
                      <strong>{topology.name}</strong>
                      {topology.topologyType ? (
                        <span className={`topology-type-badge topology-type-badge--${topology.topologyType}`}>
                          {topology.topologyType === "isp" ? "ISP" : "Corporativo"}
                        </span>
                      ) : null}
                    </div>
                    <span>{topology.zabbixServerIds && topology.zabbixServerIds.length > 0 ? topology.zabbixServerIds.map((sid) => serverName(sid)).join(", ") : serverName(topology.zabbixServerId)}</span>
                    <small>{topology.nodes.length} dispositivos - {topology.edges.length} links</small>
                  </div>
                  <div className="row-actions">
                    <button className="icon-action-button" type="button" onClick={(e) => { e.stopPropagation(); editMap(topology); }} title="Editar nome" aria-label={`Editar ${topology.name}`}>
                      <Pencil size={18} />
                    </button>
                    <button className="icon-action-button" type="button" onClick={(e) => { e.stopPropagation(); exportTopology(topology); }} title="Exportar JSON" aria-label={`Exportar ${topology.name}`}>
                      <Download size={18} />
                    </button>
                    <button className="icon-action-button danger" type="button" onClick={(e) => { e.stopPropagation(); void removeMap(topology); }} disabled={busyMapId === topology.id} title="Remover" aria-label={`Remover ${topology.name}`}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function TopologyEditor({
  topologyName,
  topologyZabbixServerIds,
  topologyShowGrid,
  snapshotsByHost,
  hosts,
  nodes,
  edges,
  saving,
  customIcons,
  onBack,
  onAddPaletteNode,
  onAddHostAt,
  onUpdateDeviceNode,
  onBulkUpdateNodes,
  onBulkUpdateEdges,
  onRemoveDeviceNode,
  onDuplicateDeviceNode,
  onCreateLinkEdge,
  onUpdateLinkEdge,
  onMoveLinkEdge,
  onRemoveLinkEdge,
  onSave,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onPasteNodes,
  onUndo,
  canUndo,
  onRemoveSelectedNodes,
  onShowGridChange
}: {
  topologyName: string;
  topologyZabbixServerIds: string[];
  topologyShowGrid: boolean;
  snapshotsByHost: Map<string, DeviceSnapshot>;
  hosts: DeviceSnapshot[];
  nodes: DeviceFlowNode[];
  edges: Edge[];
  saving: boolean;
  customIcons: CustomIcon[];
  onBack: () => void;
  onAddPaletteNode: (item: PaletteItem, position: { x: number; y: number }) => string;
  onAddHostAt: (host: DeviceSnapshot, position?: { x: number; y: number }) => string;
  onUpdateDeviceNode: (nodeId: string, value: {
    label: string;
    deviceType: Topology["nodes"][number]["type"];
    hostId?: string;
    position: { x: number; y: number };
    iconSize: number;
    labelFontSize: number;
    labelPosition: "above" | "below";
    color: string;
    showBackground: boolean;
    showIp: boolean;
    zabbixServerId?: string;
    statusItemKey?: string;
    onlineValue: string;
    offlineValue: string;
    advancedMode: boolean;
    customIconId?: string;
    customIconUrl?: string;
    handles?: string[];
  }) => void;
  onBulkUpdateNodes: (iconSize: number, labelFontSize: number) => void;
  onBulkUpdateEdges: (badgeFontSize: number) => void;
  onRemoveDeviceNode: (nodeId: string) => void;
  onDuplicateDeviceNode: (nodeId: string) => string | null;
  onCreateLinkEdge: (source: string, target: string, value: LinkEdgeData & { label?: string }) => string;
  onUpdateLinkEdge: (edgeId: string, value: LinkEdgeData & { label?: string }) => void;
  onMoveLinkEdge: (edgeId: string, sourceId: string, targetId: string) => void;
  onRemoveLinkEdge: (edgeId: string) => void;
  onSave: (showGrid?: boolean) => void;
  onNodesChange: OnNodesChange<DeviceFlowNode>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  onPasteNodes: (newNodes: DeviceFlowNode[], newEdges: Edge[]) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRemoveSelectedNodes: (nodeIds: string[]) => void;
  onShowGridChange: (showGrid: boolean) => void;
}) {
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(topologyShowGrid);
  const [clipboardCount, setClipboardCount] = useState(() => {
    try {
      const raw = localStorage.getItem(CLIPBOARD_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw) as { nodes?: unknown[] };
      return data.nodes?.length ?? 0;
    } catch { return 0; }
  });
  const selectedCount = nodes.filter((n) => n.selected).length;

  const copySelectedNodes = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));
    const clipNodes = selected.map(fromFlowNode);
    const clipEdges = edges
      .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
      .map(fromFlowEdge);
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify({ nodes: clipNodes, edges: clipEdges }));
    setClipboardCount(clipNodes.length);
  }, [nodes, edges]);

  const pasteSelectedNodes = useCallback(() => {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { nodes: Topology["nodes"]; edges: Topology["edges"] };
      if (!data.nodes?.length) return;
      const idMap = new Map<string, string>();
      const remappedNodes = data.nodes.map((n) => {
        const newId = `node-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        idMap.set(n.id, newId);
        return { ...n, id: newId, position: { x: n.position.x + 40, y: n.position.y + 40 } };
      });
      const remappedEdges = (data.edges ?? [])
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          ...e,
          id: `edge-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!
        }));
      const flowNodes = remappedNodes.map(toFlowNode(hosts, customIcons));
      const flowEdges = remappedEdges.map(toFlowEdge);
      onPasteNodes(flowNodes, flowEdges);
      localStorage.removeItem(CLIPBOARD_KEY);
      setClipboardCount(0);
    } catch { /* ignore malformed clipboard */ }
  }, [hosts, customIcons, onPasteNodes]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const el = document.activeElement;
      const inInput =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);

      if ((e.key === "Delete" || e.key === "Backspace") && !inInput) {
        const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedIds.length > 0) { e.preventDefault(); onRemoveSelectedNodes(selectedIds); }
        return;
      }

      if (!e.ctrlKey && !e.metaKey) return;
      if (inInput) return;
      if (e.key === "c" || e.key === "C") copySelectedNodes();
      if (e.key === "v" || e.key === "V") pasteSelectedNodes();
      if (e.key === "z" || e.key === "Z") { e.preventDefault(); onUndo(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nodes, copySelectedNodes, pasteSelectedNodes, onUndo, onRemoveSelectedNodes]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<"basic" | "zabbix">("basic");
  const [deviceForm, setDeviceForm] = useState({
    label: "",
    deviceType: "unknown" as Topology["nodes"][number]["type"],
    hostId: "",
    x: 0,
    y: 0,
    iconSize: 48,
    labelFontSize: 12,
    labelPosition: "below" as "above" | "below",
    color: "#ffffff",
    showIp: false,
    showBackground: true,
    zabbixServerId: "",
    statusItemKey: "",
    onlineValue: "1",
    offlineValue: "2",
    advancedMode: false,
    customIconId: "" as string,
  });
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [hostPickerOpen, setHostPickerOpen] = useState(false);
  const [hostPickerServerId, setHostPickerServerId] = useState("");
  const [hostPickerHosts, setHostPickerHosts] = useState<DeviceSnapshot[]>([]);
  const [hostPickerSearch, setHostPickerSearch] = useState("");
  const [hostPickerLoading, setHostPickerLoading] = useState(false);
  const [hostPickerError, setHostPickerError] = useState("");
  const [hostPickerSelected, setHostPickerSelected] = useState<Set<string>>(new Set());
  const [hostPickerAnchor, setHostPickerAnchor] = useState<string | null>(null);
  const [hostPickerEditMenuOpen, setHostPickerEditMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ iconSize: 48, labelFontSize: 12, badgeFontSize: 10 });
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ sourceId?: string; targetId?: string }>({});
  const [onlyWithTraffic, setOnlyWithTraffic] = useState(true);
  const [linkForm, setLinkForm] = useState({
    label: "",
    sourceOutInterface: "",
    sourceSearch: "",
    cableType: "" as CableType | "",
    color: "#9ca3af",
    strokeWidth: 2,
    lineStyle: "solid" as LineStyle,
    routing: "straight" as "straight" | "malleable" | "wave",
    badgeFontSize: 10,
    showTraffic: true,
    showLabel: true,
    showSignal: false,
    signalLabel: "",
    signalTxMetricKey: "",
    signalRxMetricKey: "",
    signalHostId: "",
    showRadioSignal: false,
    radioSignalLabel: "",
    radioSignalHostId: "",
    radioSignalMetricKey: "",
    linkRole: "" as "primary" | "backup" | "",
    showLinkRole: true,
    bandwidthLimit: "" as number | "",
    bandwidthLimitUnit: "mbps" as "mbps" | "gbps",
  });
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<DeviceFlowNode, Edge> | null>(null);
  const [zabbixServers, setZabbixServers] = useState<ZabbixServerConfig[]>([]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const configNode = nodes.find((node) => node.id === configNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const [hostSearch, setHostSearch] = useState("");
  const filteredHosts = (deviceForm.zabbixServerId ? hosts.filter((host) => host.zabbixServerId === deviceForm.zabbixServerId) : hosts)
    .filter((host) => !hostSearch.trim() || `${host.visibleName} ${host.hostName}`.toLowerCase().includes(hostSearch.trim().toLowerCase()));
  const selectedHost = filteredHosts.find((host) => host.hostId === deviceForm.hostId) ?? hosts.find((host) => host.hostId === deviceForm.hostId);
  const statusItems = buildStatusItems(selectedHost);
  const draftSourceNode = nodes.find((node) => node.id === (selectedEdge?.source ?? linkDraft.sourceId));
  const draftTargetNode = nodes.find((node) => node.id === (selectedEdge?.target ?? linkDraft.targetId));
  const isSourceCloud = draftSourceNode?.data.deviceType === "cloud";
  const isTargetCloud = draftTargetNode?.data.deviceType === "cloud";
  const hasCloudEndpoint = isSourceCloud || isTargetCloud;
  const cloudMonitoredNode = hasCloudEndpoint ? (isSourceCloud ? draftTargetNode : draftSourceNode) : undefined;
  const effectiveInterfaceNode = cloudMonitoredNode ?? draftSourceNode;
  const sourceInterfaces = interfaceOptionsForNode(effectiveInterfaceNode);
  const filteredSourceInterfaces = filterInterfaces(sourceInterfaces, linkForm.sourceSearch, onlyWithTraffic);
  const selectedSourceInterface = sourceInterfaces.find((port) => port.id === linkForm.sourceOutInterface);
  const signalEffectiveHostId = linkForm.signalHostId || effectiveInterfaceNode?.data.hostId;
  const signalAllMetrics = signalEffectiveHostId ? (getSnapshot(snapshotsByHost, String(signalEffectiveHostId), draftSourceNode?.data.zabbixServerId)?.metrics ?? []) : [];
  const signalOpticalMetrics = signalAllMetrics.filter((m) => m.unit === "dBm" || /optical|sfp|pon|rx\.power|tx\.power|optic|rssi|snr|signal/i.test(m.key) || /optical|sfp|pon|rx power|tx power|rssi|snr/i.test(m.label));
  const signalOtherMetrics = signalAllMetrics.filter((m) => !signalOpticalMetrics.includes(m));
  const radioSignalHost = hosts.find((h) => `${h.zabbixServerId}:${h.hostId}` === linkForm.radioSignalHostId);
  const radioSignalAllMetrics = radioSignalHost ? (getSnapshot(snapshotsByHost, radioSignalHost.hostId, radioSignalHost.zabbixServerId)?.metrics ?? []) : [];
  const filteredHostPickerHosts = hostPickerHosts.filter((host) => {
    const search = hostPickerSearch.trim().toLowerCase();
    if (!search) {
      return true;
    }
    return `${host.visibleName} ${host.hostName}`.toLowerCase().includes(search);
  });
  const linkReady = Boolean(selectedEdge || (linkDraft.sourceId && linkDraft.targetId));

  useEffect(() => {
    void apiGet<ZabbixServerConfig[]>("/api/server/zabbix").then(setZabbixServers).catch(() => setZabbixServers([]));
  }, []);

  useEffect(() => {
    setShowGrid(topologyShowGrid);
  }, [topologyShowGrid]);

  useEffect(() => {
    if (!hostPickerOpen || hostPickerServerId || zabbixServers.length === 0) {
      return;
    }
    const allowedServers = topologyZabbixServerIds.length > 0
      ? zabbixServers.filter((s) => topologyZabbixServerIds.includes(s.id ?? ""))
      : zabbixServers;
    const defaultServer = allowedServers.find((server) => server.active) ?? allowedServers[0];
    if (defaultServer?.id) {
      void loadHostPickerHosts(defaultServer.id);
    }
  }, [hostPickerOpen, hostPickerServerId, zabbixServers, topologyZabbixServerIds]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        chooseTool("select");
        setCreateMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".create-tool-wrap")) {
        return;
      }
      setCreateMenuOpen(false);
    }

    if (!createMenuOpen) {
      return;
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [createMenuOpen]);

  function chooseTool(tool: EditorTool) {
    setActiveTool(tool);
    setCreateMenuOpen(false);
    setSelectedEdgeId(null);
    setLinkDraft({});
    closeDeviceConfig();
    setHostPickerOpen(tool === "host");
    if (tool !== "cable") {
      setLinkForm(defaultLinkForm());
    }
  }

  function chooseCreateTool(tool: EditorTool) {
    chooseTool(tool);
  }

  function zabbixServerName(id?: string) {
    return zabbixServers.find((server) => server.id === id)?.name ?? "Servidor nao identificado";
  }

  async function loadHostPickerHosts(serverId: string) {
    setHostPickerSearch("");
    if (!serverId) {
      setHostPickerServerId("");
      setHostPickerHosts([]);
      setHostPickerError("");
      return;
    }
    const selectedServer = zabbixServers.find((server) => server.id === serverId);
    console.log("[TekMap host picker] servidor Zabbix selecionado", selectedServer?.name ?? "nao encontrado");
    console.log("[TekMap host picker] ID do servidor selecionado", serverId);
    setHostPickerServerId(serverId);
    setHostPickerLoading(true);
    setHostPickerError("");
    try {
      const result = await getZabbixServerHosts(serverId);
      console.log("[TekMap host picker] resposta da API", result);
      console.log("[TekMap host picker] quantidade de hosts retornados", result.hosts.length);
      setHostPickerHosts(result.hosts);
    } catch (error) {
      console.error("[TekMap host picker] erro ao buscar hosts", error);
      setHostPickerHosts([]);
      setHostPickerError(error instanceof Error ? error.message : "Falha ao carregar hosts do Zabbix");
    } finally {
      setHostPickerLoading(false);
    }
  }

  function handlePaneClick(event: MouseEvent) {
    const item = paletteItems.find((entry) => entry.id === activeTool);
    if (!item || item.id === "host" || !flowInstance) {
      return;
    }

    const position = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = onAddPaletteNode(item, position);
    setSelectedNodeId(id);
    setActiveTool("select");
  }

  function handleNodeClick(node: DeviceFlowNode) {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);

    if (activeTool === "cable") {
      closeDeviceConfig();
      setLinkDraft((current) => {
        if (!current.sourceId || current.sourceId === node.id) {
          setLinkForm((prev) => ({ ...defaultLinkForm(), routing: prev.routing }));
          return { sourceId: node.id };
        }
        const sourceNode = nodes.find((item) => item.id === current.sourceId);
        if (sourceNode?.data.hostId && sourceNode.data.hostId === node.data.hostId) {
          return current;
        }
        return { sourceId: current.sourceId, targetId: node.id };
      });
      return;
    }

    openDeviceConfig(node);
  }

  function openLinkConfig(edge: Edge) {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    closeDeviceConfig();
    setActiveTool("select");
    setLinkDraft({});
    const data = edge.data as LinkEdgeData | undefined;
    const portId = data?.sourceOutInterface ?? data?.sourceInterface ?? "";
    setLinkForm({
      label: String(edge.label ?? ""),
      sourceOutInterface: portId,
      sourceSearch: "",
      cableType: (data?.cableType ?? "") as CableType | "",
      color: data?.color ?? "#9ca3af",
      strokeWidth: data?.strokeWidth ?? 2,
      lineStyle: data?.lineStyle ?? "solid",
      routing: data?.routing ?? "straight",
      badgeFontSize: data?.badgeFontSize ?? 10,
      showTraffic: data?.showTraffic ?? true,
      showLabel: data?.showLabel ?? true,
      showSignal: data?.showSignal ?? false,
      signalLabel: data?.signalLabel ?? "",
      signalTxMetricKey: data?.signalTxMetricKey ?? "",
      signalRxMetricKey: data?.signalRxMetricKey ?? "",
      signalHostId: data?.signalHostId ?? data?.sourceHostId ?? "",
      showRadioSignal: data?.showRadioSignal ?? false,
      radioSignalLabel: data?.radioSignalLabel ?? "",
      radioSignalHostId: data?.radioSignalHostId ?? data?.sourceHostId ?? "",
      radioSignalMetricKey: data?.radioSignalMetricKey ?? "",
      linkRole: (data?.linkRole ?? "") as "primary" | "backup" | "",
      showLinkRole: data?.showLinkRole ?? true,
      bandwidthLimitUnit: (data?.bandwidthLimit && data.bandwidthLimit >= 1000 && data.bandwidthLimit % 1 === 0) ? "gbps" : "mbps",
      bandwidthLimit: data?.bandwidthLimit
        ? (data.bandwidthLimit >= 1000 && data.bandwidthLimit % 1 === 0 ? data.bandwidthLimit / 1000 : data.bandwidthLimit)
        : "",
    });
  }

  function saveLinkConfig() {
    const port = selectedSourceInterface;
    const value = {
      label: linkForm.label.trim() || undefined,
      sourceHostId: (cloudMonitoredNode ?? draftSourceNode)?.data.hostId,
      targetHostId: draftTargetNode?.data.hostId,
      sourceOutInterface: linkForm.sourceOutInterface || undefined,
      targetInInterface: undefined as string | undefined,
      sourceOutItemId: port?.outItemId,
      sourceInItemId: port?.inItemId,
      sourceStatusItemId: port?.statusItemId,
      sourceInterfaceName: port?.name,
      sourceInterfaceAlias: port?.alias,
      targetInItemId: undefined as string | undefined,
      targetOutItemId: undefined as string | undefined,
      targetStatusItemId: undefined as string | undefined,
      targetInterfaceName: undefined as string | undefined,
      targetInterfaceAlias: undefined as string | undefined,
      cableType: linkForm.cableType || undefined,
      color: linkForm.color,
      strokeWidth: Number(linkForm.strokeWidth) || 2,
      lineStyle: linkForm.lineStyle,
      routing: linkForm.routing,
      // When switching to straight: clear any waypoints and legacy offsets
      ...(linkForm.routing === "straight"
        ? { waypoints: [] as Array<{ x: number; y: number }>, waypointDX: 0, waypointDY: 0 }
        : {}),
      badgeFontSize: Number(linkForm.badgeFontSize) || 10,
      showTraffic: linkForm.showTraffic,
      showLabel: linkForm.showLabel,
      showSignal: linkForm.showSignal,
      signalLabel: linkForm.signalLabel.trim() || undefined,
      signalTxMetricKey: linkForm.signalTxMetricKey || undefined,
      signalRxMetricKey: linkForm.signalRxMetricKey || undefined,
      signalHostId: linkForm.signalHostId || effectiveInterfaceNode?.data.hostId,
      showRadioSignal: linkForm.showRadioSignal,
      radioSignalLabel: linkForm.radioSignalLabel.trim() || undefined,
      radioSignalHostId: linkForm.radioSignalHostId || effectiveInterfaceNode?.data.hostId,
      radioSignalMetricKey: linkForm.radioSignalMetricKey || undefined,
      linkRole: linkForm.linkRole || undefined,
      showLinkRole: linkForm.showLinkRole,
      bandwidthLimit: linkForm.bandwidthLimit !== ""
        ? Number(linkForm.bandwidthLimit) * (linkForm.bandwidthLimitUnit === "gbps" ? 1000 : 1)
        : undefined,
    };

    if (selectedEdgeId) {
      onUpdateLinkEdge(selectedEdgeId, value);
      setSelectedEdgeId(null);
      return;
    }

    if (linkDraft.sourceId && linkDraft.targetId) {
      const id = onCreateLinkEdge(linkDraft.sourceId, linkDraft.targetId, value);
      setSelectedEdgeId(id);
      setLinkDraft({});
      setActiveTool("select");
    }
  }

  function removeSelectedLink() {
    if (!selectedEdgeId) {
      return;
    }
    onRemoveLinkEdge(selectedEdgeId);
    setSelectedEdgeId(null);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, item: PaletteItem) {
    event.dataTransfer.setData("application/tek-map-node", item.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const hostId = event.dataTransfer.getData("application/tek-map-host");
    if (hostId && flowInstance) {
      const host = hostPickerHosts.find((entry) => entry.hostId === hostId) ?? hosts.find((entry) => entry.hostId === hostId);
      if (host) {
        const position = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setSelectedNodeId(onAddHostAt(host, position));
        setActiveTool("select");
        setHostPickerOpen(false);
      }
      return;
    }

    const item = paletteItems.find((entry) => entry.id === event.dataTransfer.getData("application/tek-map-node"));
    if (!item || !flowInstance) {
      return;
    }

    const position = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setSelectedNodeId(onAddPaletteNode(item, position));
  }

  function addHostFromPicker(host: DeviceSnapshot) {
    setSelectedNodeId(onAddHostAt(host));
    setActiveTool("select");
    setHostPickerOpen(false);
    setHostPickerSelected(new Set());
    setHostPickerAnchor(null);
  }

  function handleHostPickerItemClick(host: DeviceSnapshot, event: React.MouseEvent, visibleList: DeviceSnapshot[]) {
    event.preventDefault();
    const id = host.hostId;

    if (event.shiftKey && hostPickerAnchor) {
      const anchorIdx = visibleList.findIndex((h) => h.hostId === hostPickerAnchor);
      const clickIdx  = visibleList.findIndex((h) => h.hostId === id);
      const [from, to] = anchorIdx <= clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
      const rangeIds = new Set(visibleList.slice(from, to + 1).map((h) => h.hostId));
      if (event.ctrlKey || event.metaKey) {
        setHostPickerSelected((prev) => new Set([...prev, ...rangeIds]));
      } else {
        setHostPickerSelected(rangeIds);
      }
      // anchor stays unchanged on shift
    } else if (event.ctrlKey || event.metaKey) {
      setHostPickerSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setHostPickerAnchor(id);
    } else {
      setHostPickerSelected(new Set([id]));
      setHostPickerAnchor(id);
    }
  }

  function addSelectedHostsFromPicker() {
    const toAdd = hostPickerHosts.filter((h) => hostPickerSelected.has(h.hostId));
    toAdd.forEach((host, i) => {
      onAddHostAt(host, undefined);
      // small cascade offset handled by addHostAt's default spread logic
      void i;
    });
    setHostPickerSelected(new Set());
    setHostPickerAnchor(null);
    setHostPickerOpen(false);
    setActiveTool("select");
  }

  function openDeviceConfig(node: DeviceFlowNode) {
    setSelectedNodeId(node.id);
    setConfigNodeId(node.id);
    setActiveModalTab("basic");
    setDeviceForm({
      label: String(node.data.label ?? ""),
      deviceType: node.data.deviceType,
      hostId: node.data.hostId ?? "",
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      iconSize: node.data.iconSize ?? 48,
      labelFontSize: node.data.labelFontSize ?? 12,
      labelPosition: node.data.labelPosition ?? "below",
      color: node.data.color ?? "#ffffff",
      showBackground: node.data.showBackground ?? true,
      showIp: node.data.showIp ?? false,
      zabbixServerId: node.data.zabbixServerId ?? (topologyZabbixServerIds.length === 1 ? topologyZabbixServerIds[0] : "") ?? "",
      statusItemKey: node.data.statusItemKey ?? "",
      onlineValue: node.data.onlineValue ?? "1",
      offlineValue: node.data.offlineValue ?? "2",
      advancedMode: node.data.advancedMode ?? false,
      customIconId: node.data.customIconId ?? "",
    });
  }

  function closeDeviceConfig() {
    setConfigNodeId(null);
  }

  function saveDeviceConfig() {
    if (!configNodeId) {
      return;
    }
    const selectedIcon = deviceForm.customIconId
      ? customIcons.find((ic) => ic.id === deviceForm.customIconId)
      : undefined;
    onUpdateDeviceNode(configNodeId, {
      label: deviceForm.label.trim() || "Device",
      deviceType: deviceForm.deviceType,
      hostId: deviceForm.hostId || undefined,
      position: { x: Number(deviceForm.x) || 0, y: Number(deviceForm.y) || 0 },
      iconSize: Number(deviceForm.iconSize) || 48,
      labelFontSize: Number(deviceForm.labelFontSize) || 12,
      labelPosition: deviceForm.labelPosition,
      color: deviceForm.color || "#ffffff",
      showBackground: deviceForm.showBackground,
      showIp: deviceForm.showIp,
      zabbixServerId: deviceForm.zabbixServerId || undefined,
      statusItemKey: deviceForm.statusItemKey || undefined,
      onlineValue: deviceForm.onlineValue || "1",
      offlineValue: deviceForm.offlineValue || "2",
      advancedMode: deviceForm.advancedMode,
      customIconId: selectedIcon?.id,
      customIconUrl: selectedIcon?.dataUrl,
    });
    closeDeviceConfig();
  }

  function duplicateSelectedDevice() {
    if (!selectedNodeId) {
      return;
    }
    const id = onDuplicateDeviceNode(selectedNodeId);
    if (id) {
      setSelectedNodeId(id);
      closeDeviceConfig();
    }
  }

  function removeSelectedDevice() {
    if (!selectedNodeId) {
      return;
    }
    onRemoveDeviceNode(selectedNodeId);
    setSelectedNodeId(null);
    closeDeviceConfig();
  }

  function applyBulkEdit() {
    onBulkUpdateNodes(bulkForm.iconSize, bulkForm.labelFontSize);
    onBulkUpdateEdges(bulkForm.badgeFontSize);
  }

  return (
    <section className="workbench">
      <section className="map-stage">
        <div className="editor-map-header">
          <button type="button" onClick={onBack} title="Voltar aos mapas" aria-label="Voltar aos mapas">
            <ArrowLeft size={18} />
          </button>
          <strong>{topologyName}</strong>
        </div>
        <div className="editor-side-toolbar">
          <div className="editor-actions" aria-label="Ferramentas do mapa">
            <button className={`tool-button ${activeTool === "select" ? "active" : ""}`} type="button" onClick={() => chooseTool("select")} title="Selecionar" aria-label="Selecionar">
              <MousePointer2 size={17} />
            </button>
            <div className="create-tool-wrap">
              <button
                className={`create-tool-button ${activeTool !== "select" ? "active" : ""}`}
                type="button"
                onClick={() => setCreateMenuOpen((current) => !current)}
                title="Adicionar elemento"
                aria-label="Adicionar elemento"
                aria-expanded={createMenuOpen}
              >
                <Plus size={20} />
              </button>
              {createMenuOpen ? (
                <div className="create-tool-menu" role="menu">
                  {paletteItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} className={activeTool === item.id ? "active" : ""} type="button" onClick={() => chooseCreateTool(item.id)} role="menuitem">
                        <Icon size={17} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                  <div className="create-tool-cable-section">
                    <Cable size={13} />
                    Cabo / Enlace
                  </div>
                  <button
                    className={`create-tool-cable-btn${activeTool === "cable" && linkForm.routing === "straight" ? " active" : ""}`}
                    type="button"
                    onClick={() => { setLinkForm({ ...defaultLinkForm(), routing: "straight" }); chooseCreateTool("cable"); }}
                    role="menuitem"
                  >
                    <span>Cabo Reto</span>
                  </button>
                  <button
                    className={`create-tool-cable-btn${activeTool === "cable" && linkForm.routing === "malleable" ? " active" : ""}`}
                    type="button"
                    onClick={() => { setLinkForm({ ...defaultLinkForm(), routing: "malleable" }); chooseCreateTool("cable"); }}
                    role="menuitem"
                  >
                    <span>Cabo Dobrável</span>
                  </button>
                  <button
                    className={`create-tool-cable-btn${activeTool === "cable" && linkForm.routing === "wave" ? " active" : ""}`}
                    type="button"
                    onClick={() => { setLinkForm({ ...defaultLinkForm(), routing: "wave", cableType: "signal", color: "#a855f7", lineStyle: "solid" }); chooseCreateTool("cable"); }}
                    role="menuitem"
                  >
                    <span>Sinal de Rádio</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button className={`tool-button ${bulkEditOpen ? "active" : ""}`} type="button" onClick={() => setBulkEditOpen((v) => !v)} title="Editar todos os elementos" aria-label="Editar todos os elementos">
              <Layers size={17} />
            </button>
            <div className="toolbar-divider" />
            <button
              className={`tool-button ${snapEnabled ? "active" : ""}`}
              type="button"
              onClick={() => setSnapEnabled((v) => !v)}
              title={snapEnabled ? "Snap to grid ativo — clique para desativar" : "Snap to grid inativo — clique para ativar"}
              aria-label="Alternar snap to grid"
            >
              <Magnet size={17} />
            </button>
            <button
              className={`tool-button ${showGrid ? "active" : ""}`}
              type="button"
              onClick={() => {
                const next = !showGrid;
                setShowGrid(next);
                onShowGridChange(next);
                onSave(next);
              }}
              title={showGrid ? "Grade visivel — clique para ocultar" : "Grade oculta — clique para mostrar"}
              aria-label="Alternar grade do mapa"
            >
              <Grid3x3 size={17} />
            </button>
            <button
              className="tool-button"
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title={canUndo ? "Desfazer — Ctrl+Z" : "Nada para desfazer"}
              aria-label="Desfazer última ação"
            >
              <RotateCcw size={17} />
            </button>
            <div className="toolbar-divider" />
            <div className="tool-button-wrap">
              <button
                className="tool-button danger"
                type="button"
                onClick={() => onRemoveSelectedNodes(nodes.filter((n) => n.selected).map((n) => n.id))}
                disabled={selectedCount === 0}
                title={selectedCount > 0 ? `Excluir selecionados (${selectedCount} nó${selectedCount !== 1 ? "s" : ""}) — Delete` : "Selecione nós para excluir — Delete"}
                aria-label="Excluir nós selecionados"
              >
                <Trash2 size={17} />
              </button>
              {selectedCount > 0 && <span className="tool-count-badge tool-count-badge--danger">{selectedCount}</span>}
            </div>
            <div className="tool-button-wrap">
              <button
                className="tool-button"
                type="button"
                onClick={copySelectedNodes}
                disabled={selectedCount === 0}
                title={selectedCount > 0 ? `Copiar seleção (${selectedCount} nó${selectedCount !== 1 ? "s" : ""}) — Ctrl+C` : "Selecione nós para copiar — Ctrl+C"}
                aria-label="Copiar nós selecionados"
              >
                <Copy size={17} />
              </button>
              {selectedCount > 0 && <span className="tool-count-badge">{selectedCount}</span>}
            </div>
            <div className="tool-button-wrap">
              <button
                className="tool-button"
                type="button"
                onClick={pasteSelectedNodes}
                disabled={clipboardCount === 0}
                title={clipboardCount > 0 ? `Colar (${clipboardCount} nó${clipboardCount !== 1 ? "s" : ""} no clipboard) — Ctrl+V` : "Clipboard vazio — Ctrl+V"}
                aria-label="Colar nós do clipboard"
              >
                <Clipboard size={17} />
              </button>
              {clipboardCount > 0 && <span className="tool-count-badge">{clipboardCount}</span>}
            </div>
          </div>
          <div className="editor-side-actions">
            <button className="tool-button save-tool-button" onClick={() => onSave(showGrid)} disabled={saving} title="Salvar" aria-label="Salvar">
              <Save size={18} />
            </button>
          </div>
        </div>
        <TopologyCanvas
          nodes={nodes}
          edges={edges}
          snapshotsByHost={snapshotsByHost}
          onInit={setFlowInstance}
          onNodeClick={(_, node) => handleNodeClick(node)}
          onEdgeClick={(_, edge) => openLinkConfig(edge)}
          onPaneClick={handlePaneClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodesDraggable
          snapEnabled={snapEnabled}
          showGrid={showGrid}
        />
      </section>
      {hostPickerOpen ? (
        <aside className="host-picker-panel" aria-label="Hosts Zabbix">
          <div className="element-editor-header">
            <div>
              <span className="element-kicker">Adicionar Host</span>
              <h2>Hosts Zabbix</h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div className="host-picker-edit-menu-wrap">
                <button
                  className="host-picker-edit-btn"
                  type="button"
                  onClick={() => setHostPickerEditMenuOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={hostPickerEditMenuOpen}
                  title="Opções de seleção"
                >
                  Edição ▾
                </button>
                {hostPickerEditMenuOpen ? (
                  <div className="host-picker-edit-dropdown" role="menu">
                    <button type="button" role="menuitem" onClick={() => {
                      setHostPickerSelected(new Set(filteredHostPickerHosts.map((h) => h.hostId)));
                      setHostPickerEditMenuOpen(false);
                    }}>Selecionar Tudo</button>
                    <button type="button" role="menuitem" onClick={() => {
                      setHostPickerSelected(new Set());
                      setHostPickerAnchor(null);
                      setHostPickerEditMenuOpen(false);
                    }}>Deselecionar Tudo</button>
                    <button type="button" role="menuitem" onClick={() => {
                      const visibleIds = new Set(filteredHostPickerHosts.map((h) => h.hostId));
                      setHostPickerSelected((prev) => new Set([...visibleIds].filter((id) => !prev.has(id))));
                      setHostPickerEditMenuOpen(false);
                    }}>Inverter Seleção</button>
                  </div>
                ) : null}
              </div>
              <button className="element-close-button" type="button" onClick={() => {
                setHostPickerOpen(false);
                setHostPickerEditMenuOpen(false);
              }} aria-label="Fechar">
                <X size={17} />
              </button>
            </div>
          </div>
          <div className="host-picker-controls">
            <label>
              <span>Servidor Zabbix</span>
              {topologyZabbixServerIds.length === 1 ? (
                <input
                  readOnly
                  value={zabbixServers.find((s) => s.id === topologyZabbixServerIds[0])?.name ?? topologyZabbixServerIds[0]}
                  className="server-locked-input"
                  title="Servidor fixado pelo mapa"
                />
              ) : (
                <select value={hostPickerServerId} onChange={(event) => void loadHostPickerHosts(event.target.value)}>
                  <option value="">Selecione o servidor</option>
                  {(topologyZabbixServerIds.length > 0
                    ? zabbixServers.filter((s) => topologyZabbixServerIds.includes(s.id ?? ""))
                    : zabbixServers
                  ).map((server) => (
                    <option key={server.id ?? server.name} value={server.id ?? ""}>
                      {server.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              <span>Pesquisar host</span>
              <input
                value={hostPickerSearch}
                onChange={(event) => setHostPickerSearch(event.target.value)}
                placeholder="Nome do host..."
              />
            </label>
          </div>
          <div className="host-picker-list" onMouseDown={() => setHostPickerEditMenuOpen(false)}>
            {hostPickerLoading ? <p className="empty-state">Carregando hosts do Zabbix...</p> : null}
            {hostPickerError ? <p className="empty-state">{hostPickerError}</p> : null}
            {!hostPickerLoading && !hostPickerError && hostPickerServerId ? (
              <p className="host-picker-count">{hostPickerHosts.length} hosts · {hostPickerSelected.size > 0 ? `${hostPickerSelected.size} selecionado${hostPickerSelected.size > 1 ? "s" : ""}` : "nenhum selecionado"}</p>
            ) : null}
            {!hostPickerLoading && !hostPickerError && filteredHostPickerHosts.map((host) => {
              const isSelected = hostPickerSelected.has(host.hostId);
              return (
                <button
                  key={host.hostId}
                  className={`host-picker-item${isSelected ? " host-picker-item--selected" : ""}`}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/tek-map-host", host.hostId);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={(e) => handleHostPickerItemClick(host, e, filteredHostPickerHosts)}
                  onDoubleClick={() => addHostFromPicker(host)}
                >
                  <span className={`status-dot ${host.status}`} />
                  <span>
                    <strong>{host.visibleName}</strong>
                    <small>{host.hostName}</small>
                  </span>
                </button>
              );
            })}
            {!hostPickerLoading && !hostPickerError && hostPickerServerId && filteredHostPickerHosts.length === 0 ? (
              <p className="empty-state">Nenhum host encontrado para este servidor.</p>
            ) : null}
            {!hostPickerServerId ? <p className="empty-state">Selecione um servidor Zabbix para listar os hosts.</p> : null}
          </div>
          {hostPickerSelected.size > 0 ? (
            <div className="host-picker-footer">
              <button className="element-save-button" type="button" onClick={addSelectedHostsFromPicker}>
                <Plus size={15} /> Adicionar {hostPickerSelected.size} host{hostPickerSelected.size > 1 ? "s" : ""}
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}
      {configNode ? (
        <aside className="element-editor-panel" role="dialog" aria-modal="true" aria-labelledby="element-editor-title">
          <div className="element-editor-header">
            <div>
              <span className="element-kicker">Elemento selecionado</span>
              <h2 id="element-editor-title">{deviceForm.label || "Editar Elemento"}</h2>
            </div>
            <button className="element-close-button" type="button" onClick={closeDeviceConfig} aria-label="Fechar">
              <X size={17} />
            </button>
          </div>

          <div className="element-summary">
            <div className={`element-preview-dot ${selectedHost?.status ?? "unknown"}`}>
              <Network size={24} />
            </div>
            <div>
              <strong>{selectedHost?.visibleName ?? (deviceForm.label || "Sem host vinculado")}</strong>
              <span>{selectedHost ? `${selectedHost.hostName} - ${selectedHost.status}` : "Configure o vinculo Zabbix"}</span>
            </div>
          </div>

          <div className="element-tabs" role="tablist">
            <button className={activeModalTab === "basic" ? "active" : ""} type="button" onClick={() => setActiveModalTab("basic")}>
              <SlidersHorizontal size={16} />
              Basico
            </button>
            <button className={activeModalTab === "zabbix" ? "active" : ""} type="button" onClick={() => setActiveModalTab("zabbix")}>
              <Link2 size={16} />
              Zabbix
            </button>
          </div>

          {activeModalTab === "basic" ? (
            <div className="element-form">
              <div className="element-section">
                <div className="element-section-title">
                  <SlidersHorizontal size={16} />
                  <span>Aparencia</span>
                </div>
                <label>
                  Label
                  <input value={deviceForm.label} onChange={(event) => setDeviceForm({ ...deviceForm, label: event.target.value })} />
                </label>
                <label>
                  Icone
                  <select value={deviceForm.deviceType} onChange={(event) => setDeviceForm({ ...deviceForm, deviceType: event.target.value as Topology["nodes"][number]["type"] })}>
                    <option value="unknown">Adicionar novo item</option>
                    <option value="router">Router</option>
                    <option value="switch">Switch</option>
                    <option value="radio">Radio</option>
                    <option value="firewall">Firewall</option>
                    <option value="server">Servidor</option>
                    <option value="lte">LTE</option>
                    <option value="olt">OLT</option>
                    <option value="cloud">Cloud</option>
                  </select>
                </label>
                {customIcons.length > 0 ? (
                  <label>
                    Icone personalizado
                    <select
                      value={deviceForm.customIconId}
                      onChange={(event) => setDeviceForm({ ...deviceForm, customIconId: event.target.value })}
                    >
                      <option value="">-- Nenhum --</option>
                      {customIcons.map((ic) => (
                        <option key={ic.id} value={ic.id}>{ic.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {deviceForm.customIconId ? (
                  <div className="custom-icon-preview">
                    <img
                      src={customIcons.find((ic) => ic.id === deviceForm.customIconId)?.dataUrl}
                      alt="preview"
                    />
                  </div>
                ) : null}
                <label>
                  Tam. ícone
                  <div className="font-size-control">
                    <button type="button" className="font-size-btn" onClick={() => setDeviceForm((f) => ({ ...f, iconSize: Math.max(16, f.iconSize - 8) }))}>−</button>
                    <input
                      type="number"
                      min={16}
                      max={128}
                      value={deviceForm.iconSize}
                      onChange={(event) => setDeviceForm({ ...deviceForm, iconSize: Math.min(128, Math.max(16, Number(event.target.value))) })}
                    />
                    <button type="button" className="font-size-btn" onClick={() => setDeviceForm((f) => ({ ...f, iconSize: Math.min(128, f.iconSize + 8) }))}>+</button>
                  </div>
                </label>
                <label>
                  Posição label
                  <select value={deviceForm.labelPosition} onChange={(event) => setDeviceForm({ ...deviceForm, labelPosition: event.target.value as "above" | "below" })}>
                    <option value="below">Abaixo</option>
                    <option value="above">Acima</option>
                  </select>
                </label>
                <label>
                  Tamanho da letra
                  <div className="font-size-control">
                    <button type="button" className="font-size-btn" onClick={() => setDeviceForm((f) => ({ ...f, labelFontSize: Math.max(8, f.labelFontSize - 1) }))}>−</button>
                    <input
                      type="number"
                      min={8}
                      max={32}
                      value={deviceForm.labelFontSize}
                      onChange={(event) => setDeviceForm({ ...deviceForm, labelFontSize: Math.min(32, Math.max(8, Number(event.target.value))) })}
                    />
                    <button type="button" className="font-size-btn" onClick={() => setDeviceForm((f) => ({ ...f, labelFontSize: Math.min(32, f.labelFontSize + 1) }))}>+</button>
                  </div>
                </label>
                <label>
                  Cor
                  <div className="color-row">
                    <input type="color" value={deviceForm.color} onChange={(event) => setDeviceForm({ ...deviceForm, color: event.target.value })} />
                    <input value={deviceForm.color} onChange={(event) => setDeviceForm({ ...deviceForm, color: event.target.value })} />
                  </div>
                </label>
                <label className="element-checkbox">
                  <input type="checkbox" checked={deviceForm.showBackground} onChange={(event) => setDeviceForm({ ...deviceForm, showBackground: event.target.checked })} />
                  <span>
                    Fundo do Elemento
                    <small>Quadro atras do icone</small>
                  </span>
                </label>
              </div>

              <div className="element-section">
                <div className="element-section-title">
                  <MapIcon size={16} />
                  <span>Posicao</span>
                </div>
                <div className="position-visual-box">
                  <span>Coordenadas no mapa</span>
                  <strong>X {Math.round(deviceForm.x)} / Y {Math.round(deviceForm.y)}</strong>
                </div>
                <div className="two-col-fields">
                  <label>
                    Posicao X
                    <input type="number" value={deviceForm.x} onChange={(event) => setDeviceForm({ ...deviceForm, x: Number(event.target.value) })} />
                  </label>
                  <label>
                    Posicao Y
                    <input type="number" value={deviceForm.y} onChange={(event) => setDeviceForm({ ...deviceForm, y: Number(event.target.value) })} />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="element-form zabbix-form">
              <div className="element-section">
                <div className="element-section-title">
                  <Server size={16} />
                  <span>Vinculo Zabbix</span>
                </div>
                <label>
                  Servidor Zabbix
                  {topologyZabbixServerIds.length === 1 ? (
                    <input
                      readOnly
                      value={zabbixServers.find((s) => s.id === topologyZabbixServerIds[0])?.name ?? topologyZabbixServerIds[0]}
                      className="server-locked-input"
                      title="Servidor fixado pelo mapa"
                    />
                  ) : (
                    <select value={deviceForm.zabbixServerId} onChange={(event) => { setDeviceForm({ ...deviceForm, zabbixServerId: event.target.value, hostId: "", statusItemKey: "" }); setHostSearch(""); }}>
                      <option value="">Selecione um servidor</option>
                      {(topologyZabbixServerIds.length > 0
                        ? zabbixServers.filter((s) => topologyZabbixServerIds.includes(s.id ?? ""))
                        : zabbixServers
                      ).map((server) => (
                        <option key={server.id} value={server.id ?? ""}>{server.name}</option>
                      ))}
                    </select>
                  )}
                </label>
                <label>
                  <span className="field-label-row">
                    Host Zabbix
                    <small>{deviceForm.hostId ? `${Math.max(1, filteredHosts.findIndex((host) => host.hostId === deviceForm.hostId) + 1)}/${filteredHosts.length}` : `0/${filteredHosts.length}`}</small>
                  </span>
                  <div className="host-search-box">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Pesquisar host..."
                      value={hostSearch}
                      onChange={(event) => setHostSearch(event.target.value)}
                    />
                  </div>
                  <select value={deviceForm.hostId} onChange={(event) => setDeviceForm({ ...deviceForm, hostId: event.target.value, statusItemKey: "" })}>
                    <option value="">Selecione um host</option>
                    {filteredHosts.map((host) => (
                      <option key={host.hostId} value={host.hostId}>{host.visibleName}</option>
                    ))}
                  </select>
                </label>
                <label className="advanced-toggle">
                  <span>Modo Avancado</span>
                  <input type="checkbox" checked={deviceForm.advancedMode} onChange={(event) => setDeviceForm({ ...deviceForm, advancedMode: event.target.checked })} />
                </label>
              </div>

              <div className="element-section">
                <section className="status-item-panel">
                  <div className="status-item-header">
                    <h3>Item de Status</h3>
                    <button type="button">
                      <Activity size={15} />
                      Sincronizar
                    </button>
                    <span>{selectedHost ? "Completo" : "Pendente"}</span>
                  </div>
                  <div className="host-badges">
                    <span>Host ID: {selectedHost?.hostId ?? "-"}</span>
                    <span>{statusItems.length} items</span>
                    <span>{selectedHost?.syncedAt ? new Date(selectedHost.syncedAt).toLocaleString() : "sem dados"}</span>
                  </div>
                  <label>
                    Item de monitoramento
                    <select value={deviceForm.statusItemKey} onChange={(event) => setDeviceForm({ ...deviceForm, statusItemKey: event.target.value })}>
                      <option value="">Selecione um item</option>
                      {statusItems.map((item) => (
                        <option key={item.key} value={item.key}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="status-values-grid">
                    <label>
                      <span><i className="status-indicator online" />Valor Online</span>
                      <input value={deviceForm.onlineValue} onChange={(event) => setDeviceForm({ ...deviceForm, onlineValue: event.target.value })} />
                    </label>
                    <label>
                      <span><i className="status-indicator offline" />Valor Offline</span>
                      <input value={deviceForm.offlineValue} onChange={(event) => setDeviceForm({ ...deviceForm, offlineValue: event.target.value })} />
                    </label>
                  </div>
                </section>
              </div>
            </div>
          )}

          <div className="element-footer">
            <button className="element-delete-button" type="button" onClick={removeSelectedDevice}><Trash2 size={16} />Excluir</button>
            <button className="element-dark-button" type="button" onClick={duplicateSelectedDevice}><Copy size={16} />Duplicar</button>
            <button className="element-cancel-button" type="button" onClick={closeDeviceConfig}>Cancelar</button>
            <button className="element-save-button" type="button" onClick={saveDeviceConfig}><Check size={16} />Salvar</button>
          </div>
        </aside>
      ) : null}
      {bulkEditOpen ? (
        <aside className="element-editor-panel" role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
          <div className="element-editor-header">
            <div>
              <span className="element-kicker">Edição em massa</span>
              <h2 id="bulk-edit-title">Todos os elementos</h2>
            </div>
            <button className="element-close-button" type="button" onClick={() => setBulkEditOpen(false)} aria-label="Fechar">
              <X size={17} />
            </button>
          </div>
          <div className="element-form">
            <div className="element-section">
              <div className="element-section-title">
                <Layers size={16} />
                <span>Aplicar a todos os nós</span>
              </div>
              <label>
                Tamanho do ícone
                <div className="font-size-control">
                  <button type="button" className="font-size-btn" onClick={() => setBulkForm((f) => ({ ...f, iconSize: Math.max(16, f.iconSize - 8) }))}>−</button>
                  <input type="number" min={16} max={128} value={bulkForm.iconSize} onChange={(e) => setBulkForm({ ...bulkForm, iconSize: Math.min(128, Math.max(16, Number(e.target.value))) })} />
                  <button type="button" className="font-size-btn" onClick={() => setBulkForm((f) => ({ ...f, iconSize: Math.min(128, f.iconSize + 8) }))}>+</button>
                </div>
              </label>
              <label>
                Tamanho da letra
                <div className="font-size-control">
                  <button type="button" className="font-size-btn" onClick={() => setBulkForm((f) => ({ ...f, labelFontSize: Math.max(8, f.labelFontSize - 1) }))}>−</button>
                  <input type="number" min={8} max={32} value={bulkForm.labelFontSize} onChange={(e) => setBulkForm({ ...bulkForm, labelFontSize: Math.min(32, Math.max(8, Number(e.target.value))) })} />
                  <button type="button" className="font-size-btn" onClick={() => setBulkForm((f) => ({ ...f, labelFontSize: Math.min(32, f.labelFontSize + 1) }))}>+</button>
                </div>
              </label>
              <label>
                Badge TX/RX (cabos)
                <div className="font-size-control">
                  <button type="button" className="font-size-btn" onClick={() => setBulkForm((f) => ({ ...f, badgeFontSize: Math.max(8, f.badgeFontSize - 2) }))}>−</button>
                  <input type="number" min={8} max={24} value={bulkForm.badgeFontSize} onChange={(e) => setBulkForm({ ...bulkForm, badgeFontSize: Math.min(24, Math.max(8, Number(e.target.value))) })} />
                  <button type="button" className="font-size-btn" onClick={() => setBulkForm((f) => ({ ...f, badgeFontSize: Math.min(24, f.badgeFontSize + 2) }))}>+</button>
                </div>
              </label>
            </div>
          </div>
          <div className="element-footer">
            <button className="element-save-button" type="button" onClick={applyBulkEdit}>
              <Check size={16} />
              Aplicar a todos
            </button>
          </div>
        </aside>
      ) : null}
      {(selectedEdge || (linkDraft.sourceId && linkDraft.targetId)) && !configNode ? (
        <aside className="element-editor-panel link-editor-panel" role="dialog" aria-modal="true" aria-labelledby="link-editor-title">
          <div className="element-editor-header">
            <div>
              <span className="element-kicker">Cabo selecionado</span>
              <h2 id="link-editor-title">{selectedEdge ? "Editar Enlace" : "Novo Enlace"}</h2>
            </div>
            <button className="element-close-button" type="button" onClick={() => {
              setSelectedEdgeId(null);
              setLinkDraft({});
            }} aria-label="Fechar">
              <X size={17} />
            </button>
          </div>

          <div className="element-summary">
            <div className="element-preview-dot">
              <Cable size={24} />
            </div>
            <div>
              <strong>{draftSourceNode?.data.label ?? "Origem"} &gt; {draftTargetNode?.data.label ?? "Destino"}</strong>
              <span>{selectedEdge ? "Interfaces carregadas a partir dos hosts do enlace" : "Selecione as interfaces do enlace"}</span>
            </div>
          </div>

          <div className="element-form">
            <div className="element-section">
              <div className="element-section-title">
                <Link2 size={16} />
                <span>Conexao</span>
              </div>
              <div className="endpoint-select-row">
                <label>
                  Origem
                  <select
                    value={selectedEdge?.source ?? linkDraft.sourceId ?? ""}
                    onChange={(e) => {
                      const newSourceId = e.target.value;
                      const otherNodeId = newSourceId === (selectedEdge?.source ?? linkDraft.sourceId)
                        ? (selectedEdge?.target ?? linkDraft.targetId)
                        : (selectedEdge?.source ?? linkDraft.sourceId);
                      if (selectedEdgeId && selectedEdge) {
                        onMoveLinkEdge(selectedEdgeId, newSourceId, otherNodeId ?? selectedEdge.target);
                      } else {
                        setLinkDraft({ sourceId: newSourceId, targetId: otherNodeId ?? linkDraft.targetId });
                      }
                      setLinkForm((f) => ({ ...f, sourceOutInterface: "" }));
                    }}
                  >
                    {[draftSourceNode, draftTargetNode].filter(Boolean).map((n) => (
                      <option key={n!.id} value={n!.id}>{n!.data.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="swap-endpoints-btn"
                  title="Trocar origem e destino"
                  onClick={() => {
                    if (selectedEdgeId && selectedEdge) {
                      onMoveLinkEdge(selectedEdgeId, selectedEdge.target, selectedEdge.source);
                    } else if (linkDraft.sourceId || linkDraft.targetId) {
                      setLinkDraft({ sourceId: linkDraft.targetId, targetId: linkDraft.sourceId });
                    }
                    setLinkForm((f) => ({ ...f, sourceOutInterface: "" }));
                  }}
                >
                  ⇄
                </button>
                <label>
                  Destino
                  <input value={draftTargetNode?.data.label ?? ""} readOnly />
                </label>
              </div>
              <label>
                {hasCloudEndpoint ? "Interface de chegada no host" : "Interface de Origem"}
              </label>
              <label className="traffic-filter-toggle">
                <input type="checkbox" checked={onlyWithTraffic} onChange={(e) => setOnlyWithTraffic(e.target.checked)} />
                Apenas interfaces com tráfego
              </label>
              <div className="iface-select-group">
                <div className="iface-search-box">
                  <Search size={13} />
                  <input
                    value={linkForm.sourceSearch}
                    onChange={(event) => setLinkForm({ ...linkForm, sourceSearch: event.target.value })}
                    placeholder="Buscar interface..."
                  />
                  {linkForm.sourceSearch && (
                    <button type="button" className="iface-search-clear" onClick={() => setLinkForm({ ...linkForm, sourceSearch: "" })}><X size={12} /></button>
                  )}
                </div>
                <select value={linkForm.sourceOutInterface} onChange={(event) => setLinkForm({ ...linkForm, sourceOutInterface: event.target.value })}>
                  <option value="">Selecione a interface...</option>
                  {filteredSourceInterfaces.map((item) => (
                    <option key={item.id} value={item.id}>{interfaceLabel(item)}</option>
                  ))}
                </select>
              </div>
              <InterfaceMetricSummary port={selectedSourceInterface} />
              <div className="iface-diagnostics">
                <span title={`${sourceInterfaces.length} interface(s) para ${hasCloudEndpoint ? "host" : "origem"}`}>
                  {hasCloudEndpoint ? "Host" : "Origem"}: {sourceInterfaces.length > 0 ? `${sourceInterfaces.length} interfaces` : effectiveInterfaceNode?.data.hostId ? "0 interfaces (sem dados de porta)" : "sem host vinculado"}
                </span>
              </div>
              {sourceInterfaces.length === 0 && effectiveInterfaceNode?.data.hostId ? (
                <p className="form-status">Interfaces nao encontradas para o host. Verifique no painel Servidor se os itens ifHCInOctets/ifHCOutOctets ou net.if.in/net.if.out estao chegando do Zabbix. A sincronizacao ocorre a cada ciclo automatico.</p>
              ) : null}
            </div>

            <div className="element-section">
              <div className="element-section-title">
                <SlidersHorizontal size={16} />
                <span>Visual do cabo</span>
              </div>
              <label>
                Nome do link/cabo
                <input value={linkForm.label} onChange={(event) => setLinkForm({ ...linkForm, label: event.target.value })} placeholder="Backbone / Uplink" />
              </label>
              <label>Tipo de cabo</label>
              <div className="cable-type-selector">
                {(Object.entries(CABLE_TYPE_PRESETS) as [CableType, typeof CABLE_TYPE_PRESETS[CableType]][]).map(([id, preset]) => (
                  <button
                    key={id}
                    type="button"
                    className={`cable-type-btn${linkForm.cableType === id ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, cableType: id, color: preset.color, lineStyle: preset.lineStyle, strokeWidth: preset.strokeWidth, ...(preset.routing ? { routing: preset.routing } : {}) })}
                  >
                    {preset.routing === "wave" ? (
                      <svg className="cable-type-wave-preview" viewBox="0 0 48 8" width="48" height="8" fill="none">
                        <path d={`M 0 4 C 4 0 8 8 12 4 C 16 0 20 8 24 4 C 28 0 32 8 36 4 C 40 0 44 8 48 4`} stroke={preset.color} strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <span
                        className="cable-type-line"
                        style={{ background: cablePreviewBackground(preset.lineStyle, preset.color) }}
                      />
                    )}
                    {preset.label}
                  </button>
                ))}
                {linkForm.cableType && (
                  <button type="button" className="cable-type-clear" onClick={() => setLinkForm({ ...linkForm, cableType: "" })}>✕</button>
                )}
              </div>
              <div className="two-col-fields">
                <label>
                  Cor do cabo
                  <div className="color-row">
                    <input type="color" value={linkForm.color} onChange={(event) => setLinkForm({ ...linkForm, color: event.target.value })} />
                    <input value={linkForm.color} onChange={(event) => setLinkForm({ ...linkForm, color: event.target.value })} />
                  </div>
                </label>
                <label>
                  Espessura
                  <input type="number" min={1} max={12} value={linkForm.strokeWidth} onChange={(event) => setLinkForm({ ...linkForm, strokeWidth: Number(event.target.value) })} />
                </label>
              </div>
              <label>
                Tipo de linha
                <select value={linkForm.lineStyle} onChange={(event) => setLinkForm({ ...linkForm, lineStyle: event.target.value as LineStyle })}>
                  <option value="solid">Sólida</option>
                  <option value="dashed">Tracejada</option>
                  <option value="dotted">Pontilhada</option>
                  <option value="dashdot">Traço-Ponto</option>
                </select>
              </label>
              <label>
                Traçado do cabo
                <div className="cable-routing-toggle">
                  <button
                    type="button"
                    className={`cable-routing-btn${linkForm.routing === "straight" ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, routing: "straight" })}
                  >
                    Reto
                  </button>
                  <button
                    type="button"
                    className={`cable-routing-btn${linkForm.routing === "malleable" ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, routing: "malleable" })}
                  >
                    Maleável
                  </button>
                  <button
                    type="button"
                    className={`cable-routing-btn${linkForm.routing === "wave" ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, routing: "wave" })}
                  >
                    Onda
                  </button>
                </div>
              </label>
              <label>
                Papel no anel / redundância
                <div className="cable-routing-toggle">
                  <button
                    type="button"
                    className={`cable-routing-btn${linkForm.linkRole === "" ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, linkRole: "" })}
                  >
                    Nenhum
                  </button>
                  <button
                    type="button"
                    className={`cable-routing-btn${linkForm.linkRole === "primary" ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, linkRole: "primary" })}
                    style={linkForm.linkRole === "primary" ? { color: "#22c55e", borderColor: "#22c55e" } : {}}
                  >
                    Principal
                  </button>
                  <button
                    type="button"
                    className={`cable-routing-btn${linkForm.linkRole === "backup" ? " active" : ""}`}
                    onClick={() => setLinkForm({ ...linkForm, linkRole: "backup" })}
                    style={linkForm.linkRole === "backup" ? { color: "#f59e0b", borderColor: "#f59e0b" } : {}}
                  >
                    Backup
                  </button>
                </div>
              </label>
              {linkForm.linkRole && (
                <label className="element-checkbox">
                  <input
                    type="checkbox"
                    checked={linkForm.showLinkRole}
                    onChange={(e) => setLinkForm({ ...linkForm, showLinkRole: e.target.checked })}
                  />
                  <span>Exibir badge de papel no cabo</span>
                </label>
              )}
              <label>
                Limite de banda
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    min={0}
                    step={linkForm.bandwidthLimitUnit === "gbps" ? 0.1 : 1}
                    placeholder={linkForm.bandwidthLimitUnit === "gbps" ? "Ex: 1, 10" : "Ex: 100, 1000"}
                    value={linkForm.bandwidthLimit}
                    onChange={(e) => setLinkForm({ ...linkForm, bandwidthLimit: e.target.value === "" ? "" : Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <div className="cable-routing-toggle" style={{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className={`cable-routing-btn${linkForm.bandwidthLimitUnit === "mbps" ? " active" : ""}`}
                      onClick={() => {
                        const v = linkForm.bandwidthLimit !== "" ? Number(linkForm.bandwidthLimit) * 1000 : "";
                        setLinkForm({ ...linkForm, bandwidthLimitUnit: "mbps", bandwidthLimit: v });
                      }}
                    >Mbps</button>
                    <button
                      type="button"
                      className={`cable-routing-btn${linkForm.bandwidthLimitUnit === "gbps" ? " active" : ""}`}
                      onClick={() => {
                        const v = linkForm.bandwidthLimit !== "" ? Number(linkForm.bandwidthLimit) / 1000 : "";
                        setLinkForm({ ...linkForm, bandwidthLimitUnit: "gbps", bandwidthLimit: v });
                      }}
                    >Gbps</button>
                  </div>
                </div>
              </label>
              <label className="element-checkbox">
                <input type="checkbox" checked={linkForm.showTraffic} onChange={(event) => setLinkForm({ ...linkForm, showTraffic: event.target.checked })} />
                <span>Exibir trafego no cabo</span>
              </label>
              <label>
                Tamanho badge TX/RX
                <div className="font-size-control">
                  <button type="button" className="font-size-btn" onClick={() => setLinkForm((f) => ({ ...f, badgeFontSize: Math.max(8, f.badgeFontSize - 2) }))}>−</button>
                  <input
                    type="number"
                    min={8}
                    max={24}
                    value={linkForm.badgeFontSize}
                    onChange={(event) => setLinkForm({ ...linkForm, badgeFontSize: Math.min(24, Math.max(8, Number(event.target.value))) })}
                  />
                  <button type="button" className="font-size-btn" onClick={() => setLinkForm((f) => ({ ...f, badgeFontSize: Math.min(24, f.badgeFontSize + 2) }))}>+</button>
                </div>
              </label>
              <label className="element-checkbox">
                <input type="checkbox" checked={linkForm.showLabel} onChange={(event) => setLinkForm({ ...linkForm, showLabel: event.target.checked })} />
                <span>Exibir nome do cabo</span>
              </label>
            </div>

            <div className="element-section">
              <div className="element-section-title"><Activity size={14} />Sinal Óptico</div>
              <label className="element-checkbox">
                <input type="checkbox" checked={linkForm.showSignal} onChange={(e) => setLinkForm({ ...linkForm, showSignal: e.target.checked })} />
                <span>Exibir sinal no tooltip do cabo</span>
              </label>
              {linkForm.showSignal && (
                <>
                  <div className="two-col-fields">
                    <label>
                      Equipamento
                      <select value={linkForm.signalHostId} onChange={(e) => setLinkForm({ ...linkForm, signalHostId: e.target.value, signalTxMetricKey: "", signalRxMetricKey: "" })}>
                        {draftSourceNode?.data.hostId && !isSourceCloud && (
                          <option value={draftSourceNode.data.hostId}>Origem: {draftSourceNode.data.label}</option>
                        )}
                        {draftTargetNode?.data.hostId && !isTargetCloud && (
                          <option value={draftTargetNode.data.hostId}>Destino: {draftTargetNode.data.label}</option>
                        )}
                      </select>
                    </label>
                    <label>
                      Rótulo
                      <input
                        value={linkForm.signalLabel}
                        onChange={(e) => setLinkForm({ ...linkForm, signalLabel: e.target.value })}
                        placeholder="ex: Óptica, RSSI..."
                      />
                    </label>
                  </div>
                  <label>
                    Potência TX
                    <select value={linkForm.signalTxMetricKey} onChange={(e) => setLinkForm({ ...linkForm, signalTxMetricKey: e.target.value })}>
                      <option value="">— nenhuma —</option>
                      {signalOpticalMetrics.length > 0 && (
                        <optgroup label="Óptico / Sinal">
                          {signalOpticalMetrics.map((m) => (
                            <option key={m.key} value={m.key}>{m.label || m.key}</option>
                          ))}
                        </optgroup>
                      )}
                      {signalOtherMetrics.length > 0 && (
                        <optgroup label="Outros">
                          {signalOtherMetrics.map((m) => (
                            <option key={m.key} value={m.key}>{m.label || m.key}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  <label>
                    Potência RX
                    <select value={linkForm.signalRxMetricKey} onChange={(e) => setLinkForm({ ...linkForm, signalRxMetricKey: e.target.value })}>
                      <option value="">— nenhuma —</option>
                      {signalOpticalMetrics.length > 0 && (
                        <optgroup label="Óptico / Sinal">
                          {signalOpticalMetrics.map((m) => (
                            <option key={m.key} value={m.key}>{m.label || m.key}</option>
                          ))}
                        </optgroup>
                      )}
                      {signalOtherMetrics.length > 0 && (
                        <optgroup label="Outros">
                          {signalOtherMetrics.map((m) => (
                            <option key={m.key} value={m.key}>{m.label || m.key}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="element-section">
              <div className="element-section-title"><Activity size={14} />Fusão Sinal de Rádio</div>
              <label className="element-checkbox">
                <input type="checkbox" checked={linkForm.showRadioSignal} onChange={(e) => setLinkForm({ ...linkForm, showRadioSignal: e.target.checked })} />
                <span>Exibir sinal de rádio no tooltip</span>
              </label>
              {linkForm.showRadioSignal && (
                <>
                  <div className="two-col-fields">
                    <label>
                      Rádio
                      <select value={linkForm.radioSignalHostId} onChange={(e) => setLinkForm({ ...linkForm, radioSignalHostId: e.target.value, radioSignalMetricKey: "" })}>
                        <option value="">— selecione —</option>
                        {hosts.map((h) => (
                          <option key={`${h.zabbixServerId}:${h.hostId}`} value={`${h.zabbixServerId}:${h.hostId}`}>{h.visibleName || h.hostName}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Rótulo
                      <input
                        value={linkForm.radioSignalLabel}
                        onChange={(e) => setLinkForm({ ...linkForm, radioSignalLabel: e.target.value })}
                        placeholder="ex: RSSI, SNR..."
                      />
                    </label>
                  </div>
                  <label>
                    Sinal de Rádio
                    <select value={linkForm.radioSignalMetricKey} onChange={(e) => setLinkForm({ ...linkForm, radioSignalMetricKey: e.target.value })}>
                      <option value="">— nenhuma —</option>
                      {radioSignalAllMetrics.map((m) => (
                        <option key={m.key} value={m.key}>{m.label || m.key}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="element-footer">
            <button className="element-delete-button" type="button" onClick={selectedEdge ? removeSelectedLink : () => setLinkDraft({})} disabled={!selectedEdge && !linkDraft.sourceId}><Trash2 size={16} />Excluir</button>
            <button className="element-dark-button" type="button" onClick={() => setLinkForm(defaultLinkForm())}>Limpar</button>
            <button className="element-cancel-button" type="button" onClick={() => {
              setSelectedEdgeId(null);
              setLinkDraft({});
            }}>Cancelar</button>
            <button className="element-save-button" type="button" onClick={saveLinkConfig} disabled={!linkReady}>
              <Check size={16} />
              {selectedEdge ? "Salvar" : "Criar"}
            </button>
          </div>
        </aside>
      ) : null}
    </section>
  );
}

const VIEWER_REFRESH_INTERVAL = 10;

function LiveViewer({
  topologies: availableTopologies,
  snapshotsByHost,
  customIcons
}: {
  topologies: Array<Topology & { id: string }>;
  snapshotsByHost: Map<string, DeviceSnapshot>;
  customIcons: CustomIcon[];
}) {
  const [topologies, setTopologies] = useState<Array<Topology & { id: string }>>(availableTopologies);
  const [selected, setSelected] = useState<(Topology & { id: string }) | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<ReactFlowInstance<DeviceFlowNode, Edge> | null>(null);

  const viewNodes = useMemo(
    () => selected ? selected.nodes.map(toFlowNode(Array.from(snapshotsByHost.values()), customIcons)) : [],
    [selected, snapshotsByHost, customIcons]
  );
  const viewEdges = useMemo(
    () => selected ? selected.edges.map(toFlowEdge) : [],
    [selected]
  );

  useEffect(() => {
    setTopologies(availableTopologies);
    if (selected) {
      const updated = availableTopologies.find((topology) => topology.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [availableTopologies, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setRefreshKey((k) => k + 1);

    const refresh = setInterval(async () => {
      try {
        const updated = await apiGet<Topology & { id: string }>(`/api/topologies/${selected.id}`);
        const local = availableTopologies.find((topology) => topology.id === updated.id);
        setSelected({ ...updated, showGrid: local?.showGrid ?? updated.showGrid });
      } catch {
        setSelected(null);
      }
      setRefreshKey((k) => k + 1);
    }, VIEWER_REFRESH_INTERVAL * 1000);

    return () => clearInterval(refresh);
  }, [selected?.id, availableTopologies]);

  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => {
      const w = frameRef.current?.offsetWidth ?? window.innerWidth;
      rfInstanceRef.current?.fitView({ padding: 5 / Math.max(w - 10, 1), duration: 350 });
    }, 150);
    return () => clearTimeout(timer);
  }, [selected?.id]);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        const w = frameRef.current?.offsetWidth ?? window.innerWidth;
        rfInstanceRef.current?.fitView({ padding: 5 / Math.max(w - 10, 1), duration: 350 });
      }, 300);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frameRef.current?.requestFullscreen();
    }
  }

  function exitViewer() {
    if (document.fullscreenElement) void document.exitFullscreen();
    setSelected(null);
  }

  if (!selected) {
    return (
      <section className="page viewer-page">
        <PageHeader title="Live Viewer" subtitle="Selecione um mapa para monitorar em tempo real." />
        {topologies.length === 0 ? (
          <p className="viewer-empty">Nenhum mapa salvo. Crie um no Editor Maps primeiro.</p>
        ) : (
          <div className="viewer-map-grid">
            {topologies.map((t) => (
              <button key={t.id} className="viewer-map-card" onClick={() => setSelected(t)}>
                <MapIcon size={36} />
                <strong>{t.name}</strong>
                <span>{t.nodes.length} nós · {t.edges.length} links</span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div ref={frameRef} className={`viewer-live${isFullscreen ? " viewer-fullscreen" : ""}`}>
      <div className="viewer-bar">
        <span className="viewer-bar-title">
          <Activity size={15} />
          {selected.name}
        </span>
        <button className="viewer-bar-btn" onClick={toggleFullscreen} title={isFullscreen ? "Sair tela cheia" : "Tela cheia"}>
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button className="viewer-bar-btn viewer-exit" onClick={exitViewer} title="Sair">
          <X size={17} />
        </button>
      </div>
      <div className="viewer-canvas-wrap">
        <TopologyCanvas
          key={selected.id}
          nodes={viewNodes}
          edges={viewEdges}
          snapshotsByHost={snapshotsByHost}
          readonly
          showGrid={selected.showGrid ?? true}
          onInit={(inst) => { rfInstanceRef.current = inst; }}
        />
      </div>
    </div>
  );
}

function ServerSettings() {
  const [servers, setServers] = useState<ZabbixServerConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", user: "", password: "", active: true });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<ZabbixItemsInspection | null>(null);

  useEffect(() => {
    void apiGet<ZabbixServerConfig[]>("/api/server/zabbix").then(setServers).catch(() => setStatus("Nao foi possivel carregar os servidores."));
  }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const saved = editingId
        ? await updateZabbixConfig({ id: editingId, ...form })
        : await saveZabbixConfig(form);
      setServers((current) => {
        if (!editingId) {
          return [...current, saved];
        }
        return current.map((server) => server.id === saved.id ? saved : server);
      });
      resetZabbixForm();
      setStatus(editingId ? "Servidor atualizado." : "Servidor adicionado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar configuracao.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(server?: ZabbixServerConfig) {
    const targetId = server?.id ?? "form";
    setTestingId(targetId);
    setStatus(null);
    try {
      const result = await testZabbixConfig(server?.id ? { id: server.id } : form);
      const label = server?.name || form.name || "Servidor";
      const version = result.version ? `. Versao ${result.version}` : "";
      const counts = result.hostCount !== undefined && result.monitoredHostCount !== undefined
        ? `. Hosts acessiveis: ${result.hostCount}; monitorados: ${result.monitoredHostCount}`
        : "";
      setStatus(`${label}: ${result.message}${version}${counts}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao validar conexao.");
    } finally {
      setTestingId(null);
    }
  }

  function editServer(server: ZabbixServerConfig) {
    setEditingId(server.id ?? null);
    setForm({
      name: server.name,
      url: server.url,
      user: server.user,
      password: "",
      active: server.active
    });
    setStatus(null);
  }

  async function removeServer(server: ZabbixServerConfig) {
    if (!server.id || !window.confirm(`Remover o servidor ${server.name}?`)) {
      return;
    }

    setRemovingId(server.id);
    setStatus(null);
    try {
      await removeZabbixConfig(server.id);
      setServers((current) => current.filter((item) => item.id !== server.id));
      if (editingId === server.id) {
        resetZabbixForm();
      }
      setStatus("Servidor removido.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao remover servidor.");
    } finally {
      setRemovingId(null);
    }
  }

  async function inspectItems(server: ZabbixServerConfig) {
    if (!server.id) {
      return;
    }
    setInspectingId(server.id);
    setStatus(null);
    try {
      setInspection(await inspectZabbixItems(server.id));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao consultar itens do Zabbix.");
    } finally {
      setInspectingId(null);
    }
  }

  function resetZabbixForm() {
    setEditingId(null);
    setForm({ name: "", url: "", user: "", password: "", active: true });
  }

  return (
    <section className="page">
      <PageHeader title="Servidor" subtitle="Cadastre e valide uma ou mais conexoes com servidores Zabbix." />
      <div className="admin-layout">
        <form className="panel form-grid" onSubmit={handleSave}>
          <h2>{editingId ? "Editar Zabbix" : "Adicionar Zabbix"}</h2>
          <label>
            Nome
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Zabbix matriz" />
          </label>
          <label>
            IP, dominio ou URL da API
            <input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="http://172.17.0.1:7000/api_jsonrpc.php" />
          </label>
          <label>
            Usuario
            <input value={form.user} onChange={(event) => setForm({ ...form, user: event.target.value })} placeholder="Admin" />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={editingId ? "Deixe vazio para manter a senha atual" : "Senha do usuario Zabbix"}
            />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Servidor ativo
          </label>
          <div className="action-row">
            {editingId ? (
              <button className="secondary-button" type="button" onClick={resetZabbixForm}>
                Cancelar
              </button>
            ) : null}
            <button className="secondary-button" type="button" onClick={() => handleTest()} disabled={testingId === "form"}>
              <Shield size={18} />
              {testingId === "form" ? "Validando" : "Validar formulario"}
            </button>
            <button className="save-button" type="submit" disabled={saving}>
              <Save size={18} />
              {saving ? "Salvando" : editingId ? "Atualizar" : "Adicionar"}
            </button>
          </div>
          {status ? <p className="form-status">{status}</p> : null}
        </form>

        <section className="panel">
          <h2>Servidores Zabbix</h2>
          <div className="server-list">
            {servers.map((server) => (
              <div className="server-row" key={server.id}>
                <div>
                  <strong>{server.name}</strong>
                  <span>{server.url}</span>
                  <small>{server.user} - {server.hasPassword ? "senha salva" : "sem senha"} - {server.active ? "ativo" : "inativo"}</small>
                </div>
                <div className="row-actions">
                  <button className="icon-action-button" type="button" onClick={() => editServer(server)} title="Editar" aria-label={`Editar ${server.name}`}>
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => handleTest(server)}
                    disabled={testingId === server.id}
                    title="Validar"
                    aria-label={`Validar ${server.name}`}
                  >
                    <Shield size={18} />
                  </button>
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => inspectItems(server)}
                    disabled={inspectingId === server.id}
                    title="Ver itens"
                    aria-label={`Ver itens de ${server.name}`}
                  >
                    <Activity size={18} />
                  </button>
                  <button
                    className="icon-action-button danger"
                    type="button"
                    onClick={() => removeServer(server)}
                    disabled={removingId === server.id}
                    title="Remover"
                    aria-label={`Remover ${server.name}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {servers.length === 0 ? <p className="empty-state">Nenhum servidor Zabbix cadastrado.</p> : null}
          </div>
          {inspection ? (
            <section className="items-inspection">
              <div className="status-item-header">
                <h3>Itens recebidos - {inspection.server.name}</h3>
                <button type="button" onClick={() => setInspection(null)}>Fechar</button>
                <span>{inspection.itemCount} itens</span>
              </div>
              <div className="host-badges">
                <span>{inspection.hostCount} hosts consultados</span>
                <span>limite 500 itens</span>
              </div>
              <div className="inspection-host-list">
                {inspection.hosts.map((host) => (
                  <details className="inspection-host" key={host.hostId}>
                    <summary>{host.visibleName} <span>{host.items.length} itens</span></summary>
                    <div className="inspection-items">
                      {host.items.map((item) => (
                        <div className="inspection-item" key={item.itemId}>
                          <strong>{item.name}</strong>
                          <code>{item.key}</code>
                          <small>ID {item.itemId} - {item.lastValue ?? "-"} {item.units ?? ""}</small>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function CustomIconsPanel({ customIcons, onCustomIconsChange }: { customIcons: CustomIcon[]; onCustomIconsChange: (icons: CustomIcon[]) => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Selecione um arquivo de imagem (PNG, SVG, JPG).");
      return;
    }
    if (file.size > 1_100_000) {
      setStatus("Imagem muito grande. Limite: 1 MB.");
      return;
    }
    const iconName = name.trim() || file.name.replace(/\.[^.]+$/, "");
    setUploading(true);
    setStatus(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const created = await createCustomIcon(iconName, dataUrl);
      onCustomIconsChange([...customIcons, created]);
      setName("");
      setStatus("Icone importado com sucesso.");
    } catch {
      setStatus("Falha ao importar icone.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeCustomIcon(id);
      onCustomIconsChange(customIcons.filter((ic) => ic.id !== id));
    } catch {
      setStatus("Falha ao remover icone.");
    }
  }

  return (
    <section className="page">
      <PageHeader
        title="Ícones personalizados"
        subtitle="Importe imagens PNG, SVG ou JPG para usar como ícones nos mapas de rede."
      />
      <div className="panel icons-panel">
        <div className="icon-upload-form">
          <div className="icon-upload-form-row">
            <div className="icon-upload-name-wrap">
              <Pencil size={14} />
              <input
                type="text"
                placeholder="Nome do ícone (opcional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={uploading}
              />
            </div>
            <label className={`icon-upload-btn ${uploading ? "disabled" : ""}`}>
              <Plus size={16} />
              {uploading ? "Importando..." : "Importar imagem"}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <small>PNG, SVG ou JPG · máx 1 MB</small>
        </div>

        {status ? <p className="admin-status">{status}</p> : null}

        {customIcons.length === 0 ? (
          <p className="admin-empty">Nenhum ícone importado ainda.</p>
        ) : (
          <div className="icon-grid">
            {customIcons.map((ic) => (
              <div key={ic.id} className="icon-card">
                <img src={ic.dataUrl} alt={ic.name} />
                <span>{ic.name}</span>
                <button className="icon-card-remove" onClick={() => void handleRemove(ic.id)} title="Remover">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function AdminUsers() {
  const [adminTab, setAdminTab] = useState<"users" | "groups" | "permissions" | "account">("users");

  return (
    <section className="page">
      <PageHeader title="Admin" subtitle="Crie usuarios e defina o nivel de acesso ao Tek Map." />
      <div className="element-tabs" role="tablist" style={{ marginBottom: 18, maxWidth: 640, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <button role="tab" className={adminTab === "users" ? "active" : ""} onClick={() => setAdminTab("users")}>Usuarios</button>
        <button role="tab" className={adminTab === "groups" ? "active" : ""} onClick={() => setAdminTab("groups")}>Grupos</button>
        <button role="tab" className={adminTab === "permissions" ? "active" : ""} onClick={() => setAdminTab("permissions")}>Permissoes</button>
        <button role="tab" className={adminTab === "account" ? "active" : ""} onClick={() => setAdminTab("account")}>Conta</button>
      </div>
      {adminTab === "users" ? <AdminUsersTab /> : null}
      {adminTab === "groups" ? <AdminGroupsTab /> : null}
      {adminTab === "permissions" ? <AdminMapPermissionsTab /> : null}
      {adminTab === "account" ? <AccountPanel /> : null}
    </section>
  );
}

function AdminUsersTab() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as AccessUser["role"], active: true, password: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ qrDataUrl: string; backupCodes: string[] } | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);

  useEffect(() => {
    void apiGet<AccessUser[]>("/api/admin/users").then(setUsers).catch(() => setStatus("Nao foi possivel carregar usuarios."));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    try {
      if (editingId) {
        const updated = await updateAccessUser({ id: editingId, name: form.name, email: form.email, role: form.role, active: form.active });
        setUsers((current) => current.map((user) => user.id === updated.id ? updated : user));
        resetForm();
        setStatus("Usuario atualizado.");
        return;
      }

      const created = await createAccessUser(form);
      setUsers((current) => [created, ...current]);
      setEditingId(created.id);
      setForm({ name: created.name, email: created.email, role: created.role, active: created.active, password: "" });
      setStatus("Usuario criado. Configure o 2FA abaixo se necessario.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar usuario.");
    }
  }

  async function handleActivateTotp(userId: string) {
    setTotpBusy(true);
    try {
      const data = await generateUserTotp(userId);
      const qrDataUrl = await QRCode.toDataURL(data.otpauth_uri, { width: 200 });
      setTotpSetup({ qrDataUrl, backupCodes: data.backup_codes });
      setUsers((current) => current.map((u) => u.id === userId ? { ...u, totpEnabled: true } : u));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao ativar 2FA.");
    } finally { setTotpBusy(false); }
  }

  async function handleDisableTotp(userId: string) {
    setTotpBusy(true);
    setTotpSetup(null);
    try {
      await resetUserTotp(userId);
      setUsers((current) => current.map((u) => u.id === userId ? { ...u, totpEnabled: false } : u));
      setStatus("2FA desativado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao desativar 2FA.");
    } finally { setTotpBusy(false); }
  }

  function handleEdit(user: AccessUser) {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, role: user.role, active: user.active, password: "" });
    setStatus(null);
    setTotpSetup(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", email: "", role: "viewer", active: true, password: "" });
    setTotpSetup(null);
  }

  async function handleResetPassword(user: AccessUser) {
    const password = window.prompt(`Nova senha para ${user.name}`);
    if (password === null) {
      return;
    }
    if (password.length < 6) {
      setStatus("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setStatus(null);
    setBusyUserId(user.id);
    try {
      await resetAccessUserPassword(user.id, password);
      setStatus("Senha redefinida.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao redefinir senha.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(user: AccessUser) {
    if (!window.confirm(`Remover o usuario ${user.name}?`)) {
      return;
    }

    setStatus(null);
    setBusyUserId(user.id);
    try {
      await removeAccessUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setStatus("Usuario removido.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao remover usuario.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleResetTotp(user: AccessUser) {
    if (!window.confirm(`Desativar o 2FA de ${user.name}?`)) return;
    setStatus(null);
    setBusyUserId(user.id);
    try {
      await resetUserTotp(user.id);
      setUsers((current) => current.map((u) => u.id === user.id ? { ...u, totpEnabled: false } : u));
      setStatus("2FA desativado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao desativar 2FA.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="admin-layout">
      <form className="panel form-grid" onSubmit={handleSubmit}>
        <h2>{editingId ? "Editar usuario" : "Novo usuario"}</h2>
        <label>
          Nome
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label>
          Perfil
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AccessUser["role"] })}>
            <option value="admin">Admin</option>
            <option value="operator">Operador</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        {!editingId ? (
          <label>
            Senha inicial
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
        ) : null}
        <label className="check-row">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Acesso ativo
        </label>
        {editingId ? (() => {
          const editingUser = users.find((u) => u.id === editingId);
          const isTotpActive = editingUser?.totpEnabled ?? false;
          return (
            <div className="totp-admin-section">
              <div className="totp-admin-header">
                <Shield size={15} />
                <strong>Autenticacao em dois fatores</strong>
                <span className={`state-pill ${isTotpActive ? "active" : ""}`} style={{ marginLeft: "auto" }}>
                  {isTotpActive ? "Ativo" : "Inativo"}
                </span>
              </div>
              {totpSetup ? (
                <div className="totp-admin-setup">
                  <p>Escaneie o QR code no Google Authenticator e guarde os codigos de recuperacao:</p>
                  <img src={totpSetup.qrDataUrl} alt="QR Code 2FA" />
                  <div className="totp-backup-codes">
                    {totpSetup.backupCodes.map((c) => <code key={c}>{c}</code>)}
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setTotpSetup(null)}>Fechar</button>
                </div>
              ) : (
                <div className="action-row">
                  <button type="button" className="secondary-button" disabled={totpBusy} onClick={() => void handleActivateTotp(editingId)}>
                    <Shield size={15} />
                    {isTotpActive ? "Reconfigurar 2FA" : "Ativar 2FA"}
                  </button>
                  {isTotpActive && (
                    <button type="button" className="secondary-button" disabled={totpBusy} onClick={() => void handleDisableTotp(editingId)}>
                      Desativar 2FA
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })() : null}

        <div className="action-row">
          {editingId ? (
            <button className="secondary-button" type="button" onClick={resetForm}>
              Cancelar
            </button>
          ) : null}
          <button className="save-button" type="submit">
            {editingId ? <Save size={18} /> : <Plus size={18} />}
            {editingId ? "Salvar usuario" : "Criar usuario"}
          </button>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </form>
      <section className="panel">
        <h2>Usuarios cadastrados</h2>
        <div className="user-list">
          {users.map((user) => (
            <div className="user-row" key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <span className="role-pill">{user.role}</span>
              <span className={`state-pill ${user.active ? "active" : ""}`}>{user.active ? "Ativo" : "Inativo"}</span>
              <span className={`state-pill ${user.totpEnabled ? "active" : ""}`} title="Autenticacao em dois fatores">2FA {user.totpEnabled ? "Ativo" : "Inativo"}</span>
              <div className="row-actions">
                <button
                  className="icon-action-button"
                  type="button"
                  onClick={() => handleEdit(user)}
                  disabled={busyUserId === user.id}
                  aria-label={`Editar ${user.name}`}
                  title="Editar"
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="icon-action-button"
                  type="button"
                  onClick={() => handleResetPassword(user)}
                  disabled={busyUserId === user.id}
                  aria-label={`Resetar senha de ${user.name}`}
                  title="Resetar senha"
                >
                  <KeyRound size={18} />
                </button>
                {user.totpEnabled && (
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => handleResetTotp(user)}
                    disabled={busyUserId === user.id}
                    aria-label={`Desativar 2FA de ${user.name}`}
                    title="Desativar 2FA"
                  >
                    <Shield size={18} />
                  </button>
                )}
                <button
                  className="icon-action-button danger"
                  type="button"
                  onClick={() => handleRemove(user)}
                  disabled={busyUserId === user.id}
                  aria-label={`Remover ${user.name}`}
                  title="Remover"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 ? <p className="empty-state">Nenhum usuario criado ainda.</p> : null}
        </div>
      </section>
    </div>
  );
}

const permissionLabels: Record<PermissionKey, string> = {
  view: "Visualizar",
  edit: "Editar"
};

const permissionOrder: PermissionKey[] = ["view", "edit"];

const permissionMenus: Array<{ id: SectionId; label: string }> = menuItems.map((item) => ({
  id: item.id,
  label: item.label
}));

function AdminMapPermissionsTab() {
  const [state, setState] = useState<MapPermissionAdminState | null>(null);
  const [subjectType, setSubjectType] = useState<"users" | "groups">("users");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [draftMaps, setDraftMaps] = useState<UserMapPermission[]>([]);
  const [draftMenus, setDraftMenus] = useState<UserMenuPermission[]>([]);
  const [draftGroupMaps, setDraftGroupMaps] = useState<GroupMapPermission[]>([]);
  const [draftGroupMenus, setDraftGroupMenus] = useState<GroupMenuPermission[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  useEffect(() => {
    void getMapPermissionAdminState()
      .then((data) => {
        setState(data);
        const firstUserId = data.users[0]?.id ?? "";
        const firstGroupId = data.groups[0]?.id ?? "";
        setSelectedUserId(firstUserId);
        setSelectedGroupId(firstGroupId);
        setDraftMaps(data.mapPermissions ?? data.permissions);
        setDraftMenus(data.menuPermissions);
        setDraftGroupMaps(data.groupMapPermissions);
        setDraftGroupMenus(data.groupMenuPermissions);
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : "Nao foi possivel carregar permissoes."));
  }, []);

  const selectedUser = state?.users.find((user) => user.id === selectedUserId);
  const selectedGroup = state?.groups.find((group) => group.id === selectedGroupId);
  const selectedSubjectId = subjectType === "users" ? selectedUserId : selectedGroupId;
  const selectedSubjectLabel = subjectType === "users" ? selectedUser?.name : selectedGroup?.name;
  const selectedMapPermissions = useMemo(() => {
    const map = new Map<string, PermissionKey[]>();
    if (subjectType === "users") {
      for (const entry of draftMaps.filter((item) => item.userId === selectedUserId)) map.set(entry.topologyId, entry.permissions);
    } else {
      for (const entry of draftGroupMaps.filter((item) => item.groupId === selectedGroupId)) map.set(entry.topologyId, entry.permissions);
    }
    return map;
  }, [draftMaps, draftGroupMaps, selectedGroupId, selectedUserId, subjectType]);
  const selectedMenuPermissions = useMemo(() => {
    const map = new Map<string, PermissionKey[]>();
    if (subjectType === "users") {
      for (const entry of draftMenus.filter((item) => item.userId === selectedUserId)) map.set(entry.menuId, entry.permissions);
    } else {
      for (const entry of draftGroupMenus.filter((item) => item.groupId === selectedGroupId)) map.set(entry.menuId, entry.permissions);
    }
    return map;
  }, [draftGroupMenus, draftMenus, selectedGroupId, selectedUserId, subjectType]);
  const selectedMapCount = [...selectedMapPermissions.values()].filter((permissions) => permissions.length > 0).length;
  const selectedMenuCount = [...selectedMenuPermissions.values()].filter((permissions) => permissions.length > 0).length;
  const totalMaps = state?.topologies.length ?? 0;
  const changedUserIds = state ? changedPermissionUserIds(
    draftMaps,
    state.mapPermissions ?? state.permissions,
    draftMenus,
    state.menuPermissions
  ) : [];
  const changedGroupIds = state ? changedGroupPermissionIds(draftGroupMaps, state.groupMapPermissions, draftGroupMenus, state.groupMenuPermissions) : [];
  const hasChanges = changedUserIds.length > 0 || changedGroupIds.length > 0;

  function toggleMapPermission(topologyId: string, permission: PermissionKey, checked: boolean) {
    if (subjectType === "users") {
      setDraftMaps((current) => updatePermissionRows(current, selectedUserId, "topologyId", topologyId, permission, checked));
    } else {
      setDraftGroupMaps((current) => updatePermissionRows(current, selectedGroupId, "topologyId", topologyId, permission, checked, "groupId"));
    }
  }

  function toggleMenuPermission(menuId: string, permission: PermissionKey, checked: boolean) {
    if (subjectType === "users") {
      setDraftMenus((current) => updatePermissionRows(current, selectedUserId, "menuId", menuId, permission, checked));
    } else {
      setDraftGroupMenus((current) => updatePermissionRows(current, selectedGroupId, "menuId", menuId, permission, checked, "groupId"));
    }
  }

  async function savePermissions(scope: "selected" | "all") {
    const usersToSave = subjectType === "users" ? (scope === "selected" ? [selectedUserId].filter(Boolean) : changedUserIds) : [];
    const groupsToSave = subjectType === "groups" ? (scope === "selected" ? [selectedGroupId].filter(Boolean) : changedGroupIds) : [];
    if (usersToSave.length === 0 && groupsToSave.length === 0) return;
    setSavingPermissions(true);
    setStatus(null);
    try {
      await Promise.all(usersToSave.map((userId) => updateUserGranularPermissions(userId, {
        menuPermissions: draftMenus
          .filter((entry) => entry.userId === userId)
          .map((entry) => ({ menuId: entry.menuId, permissions: entry.permissions })),
        mapPermissions: draftMaps
          .filter((entry) => entry.userId === userId)
          .map((entry) => ({ topologyId: entry.topologyId, permissions: entry.permissions }))
      })));
      await Promise.all(groupsToSave.map((groupId) => updateGroupGranularPermissions(groupId, {
        menuPermissions: draftGroupMenus
          .filter((entry) => entry.groupId === groupId)
          .map((entry) => ({ menuId: entry.menuId, permissions: entry.permissions })),
        mapPermissions: draftGroupMaps
          .filter((entry) => entry.groupId === groupId)
          .map((entry) => ({ topologyId: entry.topologyId, permissions: entry.permissions }))
      })));
      const refreshed = await getMapPermissionAdminState();
      setState(refreshed);
      setDraftMaps(refreshed.mapPermissions ?? refreshed.permissions);
      setDraftMenus(refreshed.menuPermissions);
      setDraftGroupMaps(refreshed.groupMapPermissions);
      setDraftGroupMenus(refreshed.groupMenuPermissions);
      setStatus(scope === "all" ? "Permissoes de todos os usuarios salvas." : "Permissoes salvas.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar permissoes.");
    } finally {
      setSavingPermissions(false);
    }
  }

  if (!state) {
    return <section className="panel"><p className="empty-state">Carregando permissoes...</p></section>;
  }

  return (
    <div className="permission-layout">
      <section className="panel permission-users-panel">
        <h2>{subjectType === "users" ? "Usuarios" : "Grupos"}</h2>
        <div className="element-tabs" role="tablist" style={{ marginBottom: 12 }}>
          <button className={subjectType === "users" ? "active" : ""} type="button" onClick={() => setSubjectType("users")}>Usuarios</button>
          <button className={subjectType === "groups" ? "active" : ""} type="button" onClick={() => setSubjectType("groups")}>Grupos</button>
        </div>
        <div className="permission-user-list">
          {subjectType === "users" ? state.users.map((user) => {
            const mapCount = draftMaps.filter((entry) => entry.userId === user.id && entry.permissions.length > 0).length;
            const menuCount = draftMenus.filter((entry) => entry.userId === user.id && entry.permissions.length > 0).length;
            const changed = changedUserIds.includes(user.id);
            return (
              <button
                key={user.id}
                className={`permission-user-button ${selectedUserId === user.id ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedUserId(user.id)}
              >
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <em>{changed ? "Alterado" : `${menuCount}/${permissionMenus.length} menus · ${mapCount}/${totalMaps} mapas`}</em>
              </button>
            );
          }) : state.groups.map((group) => {
            const mapCount = draftGroupMaps.filter((entry) => entry.groupId === group.id && entry.permissions.length > 0).length;
            const menuCount = draftGroupMenus.filter((entry) => entry.groupId === group.id && entry.permissions.length > 0).length;
            const changed = changedGroupIds.includes(group.id);
            return (
              <button
                key={group.id}
                className={`permission-user-button ${selectedGroupId === group.id ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
              >
                <span>
                  <strong>{group.name}</strong>
                  <small>{group.memberCount} membro(s)</small>
                </span>
                <em>{changed ? "Alterado" : `${menuCount}/${permissionMenus.length} menus · ${mapCount}/${totalMaps} mapas`}</em>
              </button>
            );
          })}
          {subjectType === "users" && state.users.length === 0 ? <p className="empty-state">Nenhum usuario criado ainda.</p> : null}
          {subjectType === "groups" && state.groups.length === 0 ? <p className="empty-state">Nenhum grupo criado ainda.</p> : null}
        </div>
      </section>

      <section className="panel permission-editor-panel">
        <div className="permission-editor-header">
          <div>
            <h2>{selectedSubjectLabel ? `Permissoes de ${selectedSubjectLabel}` : "Permissoes granulares"}</h2>
            <p>{selectedMenuCount} menu(s) e {selectedMapCount} de {totalMaps} mapa(s) com acesso configurado.</p>
          </div>
          <div className="permission-summary">
            <span className="role-pill">{subjectType === "users" ? (selectedUser?.role ?? "sem usuario") : (selectedGroup?.role ?? "sem grupo")}</span>
            {subjectType === "users" ? <span className={`state-pill ${selectedUser?.active ? "active" : ""}`}>{selectedUser?.active ? "Ativo" : "Inativo"}</span> : null}
          </div>
        </div>

        <h3 className="permission-section-title">Menus</h3>
        <div className="permission-table" role="table" aria-label="Permissoes por menu">
          <div className="permission-table-row permission-table-head" role="row">
            <span>Menu</span>
            {permissionOrder.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}
            <span>Estado</span>
          </div>
          {permissionMenus.map((menu) => {
            const permissions = selectedMenuPermissions.get(menu.id) ?? [];
            return (
              <div className="permission-table-row" role="row" key={menu.id}>
                <div className="permission-map-cell">
                  <strong>{menu.label}</strong>
                  <small>Menu principal</small>
                </div>
                {permissionOrder.map((permission) => (
                  <label className="permission-check" key={permission}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={(event) => toggleMenuPermission(menu.id, permission, event.target.checked)}
                      disabled={!selectedSubjectId}
                    />
                    <span>{permissionLabels[permission]}</span>
                  </label>
                ))}
                <PermissionState permissions={permissions} />
              </div>
            );
          })}
        </div>

        <h3 className="permission-section-title">Mapas</h3>
        <div className="permission-table" role="table" aria-label="Permissoes por mapa">
          <div className="permission-table-row permission-table-head" role="row">
            <span>Mapa</span>
            {permissionOrder.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}
            <span>Estado</span>
          </div>
          {state.topologies.map((topology) => {
            const permissions = selectedMapPermissions.get(topology.id) ?? [];
            return (
              <div className="permission-table-row" role="row" key={topology.id}>
                <div className="permission-map-cell">
                  <strong>{topology.name}</strong>
                  <small>{topology.nodes.length} dispositivos - {topology.edges.length} links</small>
                </div>
                {permissionOrder.map((permission) => (
                  <label className="permission-check" key={permission}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={(event) => toggleMapPermission(topology.id, permission, event.target.checked)}
                      disabled={!selectedSubjectId}
                    />
                    <span>{permissionLabels[permission]}</span>
                  </label>
                ))}
                <PermissionState permissions={permissions} />
              </div>
            );
          })}
          {state.topologies.length === 0 ? <p className="empty-state">Nenhum mapa criado ainda.</p> : null}
        </div>

        <div className="permission-save-row">
          {status ? <p className="form-status">{status}</p> : null}
          <button className="secondary-button" type="button" onClick={() => void savePermissions("selected")} disabled={!selectedSubjectId || savingPermissions || !hasChanges}>
            Salvar atual
          </button>
          <button className="save-button" type="button" onClick={() => void savePermissions("all")} disabled={savingPermissions || !hasChanges}>
            <Save size={18} />
            {savingPermissions ? "Salvando" : `Salvar alteracoes (${subjectType === "users" ? changedUserIds.length : changedGroupIds.length})`}
          </button>
        </div>
      </section>

      <section className="panel permission-audit-panel">
        <h2>Historico recente</h2>
        <div className="permission-audit-list">
          {[...state.menuAudit.map((entry) => ({ ...entry, kind: "Menu" as const })), ...state.audit.map((entry) => ({ ...entry, kind: "Mapa" as const }))]
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, 30)
            .map((entry) => {
            const user = state.users.find((item) => item.id === entry.userId);
            const resourceName = entry.kind === "Menu"
              ? permissionMenus.find((item) => item.id === entry.menuId)?.label
              : state.topologies.find((item) => item.id === entry.topologyId)?.name;
            return (
              <div className="permission-audit-row" key={`${entry.kind}-${entry.id}`}>
                <strong>{user?.name ?? "Usuario removido"}</strong>
                <span>{entry.kind}: {resourceName ?? "Item removido"}</span>
                <small>{entry.actorEmail} - {new Date(entry.createdAt).toLocaleString()}</small>
              </div>
            );
          })}
          {state.audit.length === 0 && state.menuAudit.length === 0 ? <p className="empty-state">Nenhuma alteracao registrada ainda.</p> : null}
        </div>
      </section>
    </div>
  );
}

function normalizePermissionRows(rows: UserMapPermission[]) {
  return rows
    .map((entry) => ({
      userId: entry.userId,
      topologyId: entry.topologyId,
      permissions: permissionOrder.filter((permission) => entry.permissions.includes(permission))
    }))
    .filter((entry) => entry.permissions.length > 0)
    .sort((left, right) => `${left.userId}:${left.topologyId}`.localeCompare(`${right.userId}:${right.topologyId}`));
}

function normalizeMenuPermissionRows(rows: UserMenuPermission[]) {
  return rows
    .map((entry) => ({
      userId: entry.userId,
      menuId: entry.menuId,
      permissions: permissionOrder.filter((permission) => entry.permissions.includes(permission))
    }))
    .filter((entry) => entry.permissions.length > 0)
    .sort((left, right) => `${left.userId}:${left.menuId}`.localeCompare(`${right.userId}:${right.menuId}`));
}

function changedPermissionUserIds(
  draftMaps: UserMapPermission[],
  savedMaps: UserMapPermission[],
  draftMenus: UserMenuPermission[],
  savedMenus: UserMenuPermission[]
) {
  const users = new Set([...draftMaps, ...savedMaps, ...draftMenus, ...savedMenus].map((entry) => entry.userId));
  return [...users].filter((userId) => (
    JSON.stringify(normalizePermissionRows(draftMaps.filter((entry) => entry.userId === userId))) !== JSON.stringify(normalizePermissionRows(savedMaps.filter((entry) => entry.userId === userId))) ||
    JSON.stringify(normalizeMenuPermissionRows(draftMenus.filter((entry) => entry.userId === userId))) !== JSON.stringify(normalizeMenuPermissionRows(savedMenus.filter((entry) => entry.userId === userId)))
  ));
}

function normalizeGroupPermissionRows(rows: GroupMapPermission[]) {
  return rows
    .map((entry) => ({
      groupId: entry.groupId,
      topologyId: entry.topologyId,
      permissions: permissionOrder.filter((permission) => entry.permissions.includes(permission))
    }))
    .filter((entry) => entry.permissions.length > 0)
    .sort((left, right) => `${left.groupId}:${left.topologyId}`.localeCompare(`${right.groupId}:${right.topologyId}`));
}

function normalizeGroupMenuPermissionRows(rows: GroupMenuPermission[]) {
  return rows
    .map((entry) => ({
      groupId: entry.groupId,
      menuId: entry.menuId,
      permissions: permissionOrder.filter((permission) => entry.permissions.includes(permission))
    }))
    .filter((entry) => entry.permissions.length > 0)
    .sort((left, right) => `${left.groupId}:${left.menuId}`.localeCompare(`${right.groupId}:${right.menuId}`));
}

function changedGroupPermissionIds(
  draftMaps: GroupMapPermission[],
  savedMaps: GroupMapPermission[],
  draftMenus: GroupMenuPermission[],
  savedMenus: GroupMenuPermission[]
) {
  const groups = new Set([...draftMaps, ...savedMaps, ...draftMenus, ...savedMenus].map((entry) => entry.groupId));
  return [...groups].filter((groupId) => (
    JSON.stringify(normalizeGroupPermissionRows(draftMaps.filter((entry) => entry.groupId === groupId))) !== JSON.stringify(normalizeGroupPermissionRows(savedMaps.filter((entry) => entry.groupId === groupId))) ||
    JSON.stringify(normalizeGroupMenuPermissionRows(draftMenus.filter((entry) => entry.groupId === groupId))) !== JSON.stringify(normalizeGroupMenuPermissionRows(savedMenus.filter((entry) => entry.groupId === groupId)))
  ));
}

function updatePermissionRows<T extends { permissions: PermissionKey[] }>(
  current: T[],
  subjectId: string,
  resourceKey: keyof Omit<T, "userId" | "groupId" | "permissions" | "updatedAt">,
  resourceId: string,
  permission: PermissionKey,
  checked: boolean,
  subjectKey: "userId" | "groupId" = "userId"
) {
  const otherRows = current.filter((entry) => !(String((entry as any)[subjectKey]) === subjectId && String(entry[resourceKey]) === resourceId));
  const currentPermissions = current.find((entry) => String((entry as any)[subjectKey]) === subjectId && String(entry[resourceKey]) === resourceId)?.permissions ?? [];
  const next = new Set(currentPermissions);
  if (checked) {
    next.add(permission);
    if (permission === "edit") next.add("view");
  } else {
    next.delete(permission);
    if (permission === "view") next.delete("edit");
  }
  const permissions = permissionOrder.filter((key) => next.has(key));
  return permissions.length > 0
    ? [...otherRows, { [subjectKey]: subjectId, [resourceKey]: resourceId, permissions } as T]
    : otherRows;
}

function PermissionState({ permissions }: { permissions: PermissionKey[] }) {
  return (
    <div className="permission-state-cell">
      {permissions.length > 0 ? permissions.map((permission) => (
        <span className="permission-pill" key={permission}>{permissionLabels[permission]}</span>
      )) : <span className="permission-pill muted">Sem acesso</span>}
    </div>
  );
}

function AdminGroupsTab() {
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [form, setForm] = useState({ name: "", description: "", role: "viewer" as AccessGroup["role"] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<AccessGroup | null>(null);
  const [members, setMembers] = useState<AccessGroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<AccessUser[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void listAccessGroups().then(setGroups).catch(() => setStatus("Nao foi possivel carregar grupos."));
    void apiGet<AccessUser[]>("/api/admin/users").then(setAllUsers).catch(() => {});
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    try {
      if (editingId) {
        const updated = await updateAccessGroup(editingId, { name: form.name, description: form.description || undefined, role: form.role });
        setGroups((current) => current.map((g) => g.id === updated.id ? updated : g));
        resetForm();
        setStatus("Grupo atualizado.");
      } else {
        const created = await createAccessGroup({ name: form.name, description: form.description || undefined, role: form.role });
        setGroups((current) => [created, ...current]);
        resetForm();
        setStatus("Grupo criado.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar grupo.");
    }
  }

  function handleEdit(group: AccessGroup) {
    setEditingId(group.id);
    setForm({ name: group.name, description: group.description ?? "", role: group.role });
    setSelectedGroup(null);
    setStatus(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", description: "", role: "viewer" });
  }

  async function handleRemoveGroup(group: AccessGroup) {
    if (!window.confirm(`Remover o grupo "${group.name}"?`)) return;
    setStatus(null);
    setBusyId(group.id);
    try {
      await removeAccessGroup(group.id);
      setGroups((current) => current.filter((g) => g.id !== group.id));
      if (selectedGroup?.id === group.id) setSelectedGroup(null);
      setStatus("Grupo removido.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao remover grupo.");
    } finally {
      setBusyId(null);
    }
  }

  async function openMembers(group: AccessGroup) {
    setSelectedGroup(group);
    setAddUserId("");
    setStatus(null);
    try {
      const list = await listGroupMembers(group.id);
      setMembers(list);
    } catch {
      setStatus("Nao foi possivel carregar membros.");
    }
  }

  async function handleAddMember() {
    if (!selectedGroup || !addUserId) return;
    setBusyId("add");
    try {
      await addGroupMember(selectedGroup.id, addUserId);
      const list = await listGroupMembers(selectedGroup.id);
      setMembers(list);
      setGroups((current) => current.map((g) => g.id === selectedGroup.id ? { ...g, memberCount: list.length } : g));
      setAddUserId("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao adicionar membro.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroup) return;
    setBusyId(userId);
    try {
      await removeGroupMember(selectedGroup.id, userId);
      const list = await listGroupMembers(selectedGroup.id);
      setMembers(list);
      setGroups((current) => current.map((g) => g.id === selectedGroup.id ? { ...g, memberCount: list.length } : g));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao remover membro.");
    } finally {
      setBusyId(null);
    }
  }

  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="admin-layout">
      <form className="panel form-grid" onSubmit={handleSubmit}>
        <h2>{editingId ? "Editar grupo" : "Novo grupo"}</h2>
        <label>
          Nome
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Descricao
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label>
          Perfil padrao
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AccessGroup["role"] })}>
            <option value="admin">Admin</option>
            <option value="operator">Operador</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <div className="action-row">
          {editingId ? (
            <button className="secondary-button" type="button" onClick={resetForm}>Cancelar</button>
          ) : null}
          <button className="save-button" type="submit">
            {editingId ? <Save size={18} /> : <Plus size={18} />}
            {editingId ? "Salvar grupo" : "Criar grupo"}
          </button>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </form>

      {selectedGroup ? (
        <section className="panel">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button className="icon-action-button" type="button" onClick={() => setSelectedGroup(null)} title="Voltar">
              <ArrowLeft size={18} />
            </button>
            <h2 style={{ margin: 0 }}>Membros — {selectedGroup.name}</h2>
          </div>
          {availableUsers.length > 0 ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <select
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Selecione um usuario...</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
              <button
                className="save-button"
                type="button"
                onClick={handleAddMember}
                disabled={!addUserId || busyId === "add"}
              >
                <Users size={16} />
                Adicionar
              </button>
            </div>
          ) : null}
          <div className="user-list">
            {members.map((member) => (
              <div className="user-row" key={member.userId}>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.email}</span>
                </div>
                <span className="role-pill">{member.role}</span>
                <div className="row-actions">
                  <button
                    className="icon-action-button danger"
                    type="button"
                    onClick={() => handleRemoveMember(member.userId)}
                    disabled={busyId === member.userId}
                    title="Remover do grupo"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {members.length === 0 ? <p className="empty-state">Nenhum membro neste grupo.</p> : null}
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>Grupos cadastrados</h2>
          <div className="user-list">
            {groups.map((group) => (
              <div className="user-row" key={group.id} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto auto auto" }}>
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.description ?? ""}</span>
                </div>
                <span className="role-pill">{group.role}</span>
                <span style={{ color: "#94a3b8", fontSize: 12, whiteSpace: "nowrap" }}>{group.memberCount} membro(s)</span>
                <div className="row-actions">
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => openMembers(group)}
                    title="Gerenciar membros"
                  >
                    <Users size={18} />
                  </button>
                  <button
                    className="icon-action-button"
                    type="button"
                    onClick={() => handleEdit(group)}
                    disabled={busyId === group.id}
                    title="Editar"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-action-button danger"
                    type="button"
                    onClick={() => handleRemoveGroup(group)}
                    disabled={busyId === group.id}
                    title="Remover"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {groups.length === 0 ? <p className="empty-state">Nenhum grupo criado ainda.</p> : null}
          </div>
        </section>
      )}
    </div>
  );
}

const ALIGN_THRESHOLD = 10;

function nodeRect(node: DeviceFlowNode) {
  const w = node.measured?.width ?? 80;
  const h = node.measured?.height ?? 80;
  return {
    left: node.position.x,
    cx: node.position.x + w / 2,
    right: node.position.x + w,
    top: node.position.y,
    cy: node.position.y + h / 2,
    bottom: node.position.y + h,
    w,
    h,
  };
}

function computeSnap(dragged: DeviceFlowNode, others: DeviceFlowNode[]) {
  const d = nodeRect(dragged);
  let snapX: number | null = null;
  let snapY: number | null = null;
  let minXDist = ALIGN_THRESHOLD + 1;
  let minYDist = ALIGN_THRESHOLD + 1;
  const gx = new Set<number>();
  const gy = new Set<number>();

  for (const other of others) {
    const o = nodeRect(other);

    const xSnaps: [number, number, number][] = [
      [d.left, o.left, 0], [d.left, o.cx, 0], [d.left, o.right, 0],
      [d.cx, o.left, d.w / 2], [d.cx, o.cx, d.w / 2], [d.cx, o.right, d.w / 2],
      [d.right, o.left, d.w], [d.right, o.cx, d.w], [d.right, o.right, d.w],
    ];
    for (const [dRef, oRef, offset] of xSnaps) {
      const dist = Math.abs(dRef - oRef);
      if (dist < ALIGN_THRESHOLD) {
        gx.add(oRef);
        if (dist < minXDist) { minXDist = dist; snapX = oRef - offset; }
      }
    }

    const ySnaps: [number, number, number][] = [
      [d.top, o.top, 0], [d.top, o.cy, 0], [d.top, o.bottom, 0],
      [d.cy, o.top, d.h / 2], [d.cy, o.cy, d.h / 2], [d.cy, o.bottom, d.h / 2],
      [d.bottom, o.top, d.h], [d.bottom, o.cy, d.h], [d.bottom, o.bottom, d.h],
    ];
    for (const [dRef, oRef, offset] of ySnaps) {
      const dist = Math.abs(dRef - oRef);
      if (dist < ALIGN_THRESHOLD) {
        gy.add(oRef);
        if (dist < minYDist) { minYDist = dist; snapY = oRef - offset; }
      }
    }
  }

  return { snapX, snapY, gx: Array.from(gx), gy: Array.from(gy) };
}

function TopologyCanvas({
  nodes,
  edges,
  snapshotsByHost,
  readonly = false,
  onInit,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  onDrop,
  onDragOver,
  onNodesChange,
  onEdgesChange,
  onConnect,
  nodesDraggable,
  snapEnabled = true,
  showGrid = true
}: {
  nodes: DeviceFlowNode[];
  edges: Edge[];
  snapshotsByHost?: Map<string, DeviceSnapshot>;
  readonly?: boolean;
  onInit?: (instance: ReactFlowInstance<DeviceFlowNode, Edge>) => void;
  onNodeClick?: (event: MouseEvent, node: DeviceFlowNode) => void;
  onEdgeClick?: (event: MouseEvent, edge: Edge) => void;
  onPaneClick?: (event: MouseEvent) => void;
  onDrop?: (event: DragEvent) => void;
  onDragOver?: (event: DragEvent) => void;
  onNodesChange?: OnNodesChange<DeviceFlowNode>;
  onEdgesChange?: OnEdgesChange<Edge>;
  onConnect?: (connection: Connection) => void;
  nodesDraggable?: boolean;
  snapEnabled?: boolean;
  showGrid?: boolean;
}) {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<DeviceFlowNode, Edge> | null>(null);
  const [guideFlowX, setGuideFlowX] = useState<number[]>([]);
  const [guideFlowY, setGuideFlowY] = useState<number[]>([]);
  const canvasRef = useRef<HTMLElement>(null);

  const handleNodeDrag = useCallback(
    (_: MouseEvent, draggedNode: DeviceFlowNode, draggedNodes: DeviceFlowNode[]) => {
      if (draggedNodes.length !== 1) { setGuideFlowX([]); setGuideFlowY([]); return; }
      const others = nodes.filter(n => n.id !== draggedNode.id);
      const { gx, gy } = computeSnap(draggedNode, others);
      setGuideFlowX(gx);
      setGuideFlowY(gy);
    },
    [nodes]
  );

  const handleNodeDragStop = useCallback(
    (_: MouseEvent, draggedNode: DeviceFlowNode, draggedNodes: DeviceFlowNode[]) => {
      setGuideFlowX([]);
      setGuideFlowY([]);
      if (draggedNodes.length !== 1 || !onNodesChange) return;
      const others = nodes.filter(n => n.id !== draggedNode.id);
      const { snapX, snapY } = computeSnap(draggedNode, others);
      if (snapX === null && snapY === null) return;
      onNodesChange([{
        id: draggedNode.id,
        type: "position",
        position: {
          x: snapX ?? draggedNode.position.x,
          y: snapY ?? draggedNode.position.y,
        },
        dragging: false,
      }]);
    },
    [nodes, onNodesChange]
  );

  const viewport = rfInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };

  return (
    <section className="canvas canvas--alignable" ref={canvasRef}>
      {guideFlowX.map((fx, i) => (
        <div
          key={`gx-${i}`}
          className="align-guide align-guide--vertical"
          style={{ left: Math.round(viewport.x + fx * viewport.zoom) }}
        />
      ))}
      {guideFlowY.map((fy, i) => (
        <div
          key={`gy-${i}`}
          className="align-guide align-guide--horizontal"
          style={{ top: Math.round(viewport.y + fy * viewport.zoom) }}
        />
      ))}
      <SnapshotsContext.Provider value={snapshotsByHost ?? EMPTY_SNAPSHOTS}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => {
            setRfInstance(inst);
            onInit?.(inst);
          }}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDrag={readonly ? undefined : handleNodeDrag}
          onNodeDragStop={readonly ? undefined : handleNodeDragStop}
          connectionRadius={10}
          nodesDraggable={!readonly && (nodesDraggable ?? true)}
          nodesConnectable={!readonly}
          elementsSelectable={!readonly}
          snapToGrid={!readonly && snapEnabled}
          snapGrid={[4, 4]}
          proOptions={{ hideAttribution: true }}
          fitView={!readonly}
          fitViewOptions={!readonly ? { padding: 0.12 } : undefined}
        >
          {showGrid ? <Background variant={BackgroundVariant.Lines} gap={40} size={1} color="#1c2330" /> : null}
        </ReactFlow>
      </SnapshotsContext.Provider>
    </section>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warning" | "danger" }) {
  return (
    <article className={`summary-card ${tone ?? ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function InterfaceMetricSummary({ port }: { port?: PortMetric }) {
  if (!port) {
    return null;
  }

  const hasTraffic = port.inItemId || port.outItemId;

  return (
    <div className="interface-metric-summary">
      {hasTraffic ? (
        <>
          <span className="iface-rx">&#8592; {formatBps(port.inBps)}</span>
          <span className="iface-tx">&#8594; {formatBps(port.outBps)}</span>
          {port.speedMbps ? <span className="iface-speed">Velocidade: {port.speedMbps} Mbps</span> : null}
          {port.utilizationPct !== undefined ? <span className="iface-util">Uso: {port.utilizationPct}%</span> : null}
          {port.operStatus ? <span className={`iface-status iface-status--${port.operStatus}`}>{port.operStatus === "up" ? "UP" : port.operStatus === "down" ? "DOWN" : port.operStatus.toUpperCase()}</span> : null}
        </>
      ) : (
        <span className="iface-no-traffic">Sem dados de tráfego associados</span>
      )}
    </div>
  );
}

function toFlowNode(hosts: DeviceSnapshot[], icons: CustomIcon[]) {
  const byHost = new Map(hosts.map((host) => [host.hostId, host]));
  const byIconId = new Map(icons.map((ic) => [ic.id, ic.dataUrl]));
  return (node: Topology["nodes"][number]): DeviceFlowNode => ({
    id: node.id,
    type: "device",
    position: node.position,
    data: {
      label: node.label,
      hostId: node.hostId,
      deviceType: node.type,
      iconSize: node.iconSize,
      labelFontSize: node.labelFontSize,
      labelPosition: node.labelPosition,
      color: node.color,
      showBackground: node.showBackground,
      showIp: node.showIp,
      zabbixServerId: node.zabbixServerId,
      statusItemKey: node.statusItemKey,
      onlineValue: node.onlineValue,
      offlineValue: node.offlineValue,
      advancedMode: node.advancedMode,
      customIconId: node.customIconId,
      customIconUrl: node.customIconId ? byIconId.get(node.customIconId) : undefined,
      snapshot: node.hostId ? byHost.get(node.hostId) : undefined,
      handles: node.handles
    }
  });
}

function fromFlowNode(node: DeviceFlowNode): Topology["nodes"][number] {
  return {
    id: node.id,
    hostId: node.data.hostId ? String(node.data.hostId) : undefined,
    type: String(node.data.deviceType ?? "unknown") as Topology["nodes"][number]["type"],
    label: String(node.data.label ?? node.id),
    position: node.position,
    iconSize: node.data.iconSize,
    labelFontSize: node.data.labelFontSize,
    labelPosition: node.data.labelPosition,
    color: node.data.color,
    showBackground: node.data.showBackground,
    showIp: node.data.showIp,
    zabbixServerId: node.data.zabbixServerId,
    statusItemKey: node.data.statusItemKey,
    onlineValue: node.data.onlineValue,
    offlineValue: node.data.offlineValue,
    advancedMode: node.data.advancedMode,
    customIconId: node.data.customIconId,
    handles: node.data.handles
  };
}

function inferCableType(color?: string, lineStyle?: string): CableType | undefined {
  if (!color) return undefined;
  for (const [type, preset] of Object.entries(CABLE_TYPE_PRESETS) as [CableType, typeof CABLE_TYPE_PRESETS[CableType]][]) {
    if (preset.color === color && preset.lineStyle === (lineStyle ?? "solid")) return type;
  }
  return undefined;
}

function toFlowEdge(edge: Topology["edges"][number]): Edge {
  return buildLinkEdge({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    data: {
      sourceHostId: edge.sourceHostId,
      targetHostId: edge.targetHostId,
      sourceOutInterface: edge.sourceOutInterface,
      sourceInInterface: edge.sourceInInterface,
      targetInInterface: edge.targetInInterface,
      targetOutInterface: edge.targetOutInterface,
      sourceOutItemId: edge.sourceOutItemId,
      sourceInItemId: edge.sourceInItemId,
      targetInItemId: edge.targetInItemId,
      targetOutItemId: edge.targetOutItemId,
      sourceStatusItemId: edge.sourceStatusItemId,
      targetStatusItemId: edge.targetStatusItemId,
      sourceInterfaceName: edge.sourceInterfaceName,
      targetInterfaceName: edge.targetInterfaceName,
      sourceInterfaceAlias: edge.sourceInterfaceAlias,
      targetInterfaceAlias: edge.targetInterfaceAlias,
      sourceInterface: edge.sourceInterface,
      targetInterface: edge.targetInterface,
      cableType: edge.cableType ?? inferCableType(edge.color, edge.lineStyle),
      color: edge.color,
      strokeWidth: edge.strokeWidth,
      lineStyle: edge.lineStyle,
      badgeFontSize: edge.badgeFontSize,
      showTraffic: edge.showTraffic,
      showLabel: edge.showLabel,
      routing: edge.routing,
      waypoints: edge.waypoints,
      waypointDX: edge.waypointDX,
      waypointDY: edge.waypointDY,
      showSignal: edge.showSignal,
      signalLabel: edge.signalLabel,
      signalTxMetricKey: edge.signalTxMetricKey,
      signalRxMetricKey: edge.signalRxMetricKey,
      signalHostId: edge.signalHostId,
      showRadioSignal: edge.showRadioSignal,
      radioSignalLabel: edge.radioSignalLabel,
      radioSignalHostId: edge.radioSignalHostId,
      radioSignalMetricKey: edge.radioSignalMetricKey,
      bandwidthLimit: edge.bandwidthLimit,
    }
  });
}

function fromFlowEdge(edge: Edge): Topology["edges"][number] {
  const data = edge.data as LinkEdgeData | undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: String(edge.label ?? "") || undefined,
    sourceHostId: data?.sourceHostId,
    targetHostId: data?.targetHostId,
    sourceOutInterface: data?.sourceOutInterface,
    sourceInInterface: data?.sourceInInterface,
    targetInInterface: data?.targetInInterface,
    targetOutInterface: data?.targetOutInterface,
    sourceOutItemId: data?.sourceOutItemId,
    sourceInItemId: data?.sourceInItemId,
    targetInItemId: data?.targetInItemId,
    targetOutItemId: data?.targetOutItemId,
    sourceStatusItemId: data?.sourceStatusItemId,
    targetStatusItemId: data?.targetStatusItemId,
    sourceInterfaceName: data?.sourceInterfaceName,
    targetInterfaceName: data?.targetInterfaceName,
    sourceInterfaceAlias: data?.sourceInterfaceAlias,
    targetInterfaceAlias: data?.targetInterfaceAlias,
    sourceInterface: data?.sourceOutInterface ?? data?.sourceInterface,
    targetInterface: data?.targetInInterface ?? data?.targetInterface,
    cableType: data?.cableType,
    color: data?.color,
    strokeWidth: data?.strokeWidth,
    lineStyle: data?.lineStyle,
    badgeFontSize: data?.badgeFontSize,
    showTraffic: data?.showTraffic,
    showLabel: data?.showLabel,
    routing: data?.routing,
    waypoints: data?.waypoints,
    waypointDX: data?.waypointDX,
    waypointDY: data?.waypointDY,
    showSignal: data?.showSignal,
    signalLabel: data?.signalLabel,
    signalTxMetricKey: data?.signalTxMetricKey,
    signalRxMetricKey: data?.signalRxMetricKey,
    signalHostId: data?.signalHostId,
    showRadioSignal: data?.showRadioSignal,
    radioSignalLabel: data?.radioSignalLabel,
    radioSignalHostId: data?.radioSignalHostId,
    radioSignalMetricKey: data?.radioSignalMetricKey,
    bandwidthLimit: data?.bandwidthLimit,
  };
}

function buildLinkEdge(edge: Pick<Edge, "id" | "source" | "target"> & { label?: unknown; data?: LinkEdgeData }): Edge {
  const data = {
    color: "#9ca3af",
    strokeWidth: 2,
    lineStyle: "solid" as const,
    showTraffic: true,
    showLabel: true,
    ...edge.data
  };
  return {
    id: edge.id,
    type: "link",
    source: edge.source,
    target: edge.target,
    label: undefined,
    data,
    animated: false,
    markerEnd: undefined,
    style: {
      stroke: data.color,
      strokeWidth: data.strokeWidth,
      strokeDasharray: lineStyleDash(data.lineStyle)
    }
  };
}

function defaultLinkForm() {
  return {
    label: "",
    sourceOutInterface: "",
    sourceSearch: "",
    cableType: "" as CableType | "",
    color: "#9ca3af",
    strokeWidth: 2,
    lineStyle: "solid" as LineStyle,
    routing: "straight" as "straight" | "malleable" | "wave",
    badgeFontSize: 10,
    showTraffic: true,
    showLabel: true,
    showSignal: false,
    signalLabel: "",
    signalTxMetricKey: "",
    signalRxMetricKey: "",
    signalHostId: "",
    showRadioSignal: false,
    radioSignalLabel: "",
    radioSignalHostId: "",
    radioSignalMetricKey: "",
    linkRole: "" as "primary" | "backup" | "",
    showLinkRole: true,
    bandwidthLimit: "" as number | "",
    bandwidthLimitUnit: "mbps" as "mbps" | "gbps",
  };
}

function interfaceOptionsForNode(node: DeviceFlowNode | undefined) {
  return node?.data.snapshot?.ports ?? [];
}

function filterInterfaces(ports: PortMetric[], search: string, onlyWithTraffic = false) {
  let result = onlyWithTraffic ? ports.filter((port) => port.inItemId || port.outItemId) : ports;
  const term = search.trim().toLowerCase();
  if (term) {
    result = result.filter((port) => interfaceLabel(port).toLowerCase().includes(term));
  }
  return result;
}

function interfaceSelectLabel(port: PortMetric): string {
  const label = interfaceLabel(port);
  const hasIn = Boolean(port.inItemId);
  const hasOut = Boolean(port.outItemId);
  if (hasIn && hasOut) return `[RX/TX] ${label}`;
  if (hasIn) return `[RX] ${label}`;
  if (hasOut) return `[TX] ${label}`;
  return label;
}

function formatBps(bps: number | undefined): string {
  if (bps === undefined) return "—";
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function interfaceLabel(port: PortMetric) {
  if (port.name) {
    return port.name;
  }
  if (port.description && port.alias && port.description !== port.alias) {
    return `${port.description} - ${port.alias}`;
  }
  return port.description || port.alias || `Interface indice ${port.index ?? port.id}`;
}

function cableStepText(draft: { sourceId?: string; targetId?: string }) {
  if (!draft.sourceId) {
    return "Clique no host de origem do cabo";
  }
  if (!draft.targetId) {
    return "Origem selecionada. Clique no host de destino";
  }
  return "Selecione as interfaces e crie o cabo";
}

function buildStatusItems(host: DeviceSnapshot | undefined): Array<{ key: string; label: string; value?: string | number }> {
  if (!host) {
    return [{ key: "icmpping", label: "★ ICMP ping" }];
  }
  const metricItems = host.metrics.map((metric) => ({ key: metric.key, label: metric.label || metric.key, value: metric.value }));
  const portItems = host.ports.map((port) => ({ key: `port:${port.id}`, label: `Interface ${port.name}`, value: port.operStatus === "up" ? 1 : 2 }));
  const items = [{ key: "icmpping", label: "★ ICMP ping", value: host.status === "up" ? 1 : 2 }, ...metricItems, ...portItems];
  return items;
}

function inferDeviceType(name: string): Topology["nodes"][number]["type"] {
  if (/fw|firewall/i.test(name)) return "firewall";
  if (/router|rt-/i.test(name)) return "router";
  if (/radio|ap-|wireless/i.test(name)) return "radio";
  if (/server|srv/i.test(name)) return "server";
  if (/switch|sw-/i.test(name)) return "switch";
  if (/\bolt\b/i.test(name)) return "olt";
  if (/\bcloud\b/i.test(name)) return "cloud";
  return "unknown";
}

function AccountPanel() {
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<"idle" | "setup" | "confirm" | "backup" | "disable">("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getTotpStatus().then((r) => setTotpEnabled(r.enabled)).catch(() => setTotpEnabled(false));
  }, []);

  async function startSetup() {
    setLoading(true);
    setStatus(null);
    try {
      const data = await setupTotp();
      const dataUrl = await QRCode.toDataURL(data.otpauth_uri, { width: 200 });
      setQrDataUrl(dataUrl);
      setOtpauthUri(data.otpauth_uri);
      setSecret(data.secret);
      setBackupCodes(data.backup_codes);
      setStep("setup");
    } catch {
      setStatus("Falha ao gerar QR code.");
    } finally { setLoading(false); }
  }

  async function confirmEnable() {
    if (!code) return;
    setLoading(true);
    setStatus(null);
    try {
      await enableTotp(code.replace(/\s/g, ""));
      setTotpEnabled(true);
      setStep("backup");
      setCode("");
    } catch {
      setStatus("Codigo invalido. Tente novamente.");
    } finally { setLoading(false); }
  }

  async function confirmDisable() {
    if (!code) return;
    setLoading(true);
    setStatus(null);
    try {
      await disableTotp(code.replace(/\s/g, ""));
      setTotpEnabled(false);
      setStep("idle");
      setCode("");
      setStatus("2FA desativado com sucesso.");
    } catch {
      setStatus("Codigo invalido. Tente novamente.");
    } finally { setLoading(false); }
  }

  return (
    <section className="page">
      <PageHeader title="Conta" subtitle="Gerencie a seguranca da sua conta." />
      <div className="branding-sections">
        <div className="branding-block">
          <div className="branding-block-header">
            <KeyRound size={16} />
            <div>
              <strong>Autenticacao em dois fatores (2FA)</strong>
              <span>Use o Google Authenticator para gerar codigos de acesso.</span>
            </div>
          </div>

          {totpEnabled === null && <p className="form-status">Carregando...</p>}

          {totpEnabled === false && step === "idle" && (
            <div className="branding-form">
              <p style={{ marginBottom: 12 }}>O 2FA esta <strong>desativado</strong>. Ative para maior seguranca.</p>
              <button className="save-button" type="button" onClick={() => void startSetup()} disabled={loading}>
                Ativar 2FA
              </button>
              {status ? <p className="form-status">{status}</p> : null}
            </div>
          )}

          {totpEnabled === false && step === "setup" && (
            <div className="branding-form">
              <p>1. Escaneie o QR code com o Google Authenticator:</p>
              {qrDataUrl && <img src={qrDataUrl} alt="QR Code 2FA" style={{ display: "block", margin: "12px 0", borderRadius: 8 }} />}
              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted, #9ca3af)" }}>Ou insira o codigo manualmente</summary>
                <code style={{ display: "block", marginTop: 6, fontSize: 13, wordBreak: "break-all" }}>{secret}</code>
              </details>
              <p>2. Digite o codigo gerado pelo app para confirmar:</p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000 000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={7}
                autoFocus
              />
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => { setStep("idle"); setCode(""); setStatus(null); }}>Cancelar</button>
                <button className="save-button" type="button" onClick={() => void confirmEnable()} disabled={loading || !code}>Confirmar</button>
              </div>
              {status ? <p className="form-status error">{status}</p> : null}
            </div>
          )}

          {step === "backup" && (
            <div className="branding-form">
              <p><strong>2FA ativado com sucesso!</strong></p>
              <p style={{ marginTop: 8 }}>Salve estes codigos de recuperacao em um lugar seguro. Cada um so pode ser usado uma vez:</p>
              <div className="totp-backup-codes">
                {backupCodes.map((c) => <code key={c}>{c}</code>)}
              </div>
              <button className="save-button" type="button" style={{ marginTop: 12 }} onClick={() => setStep("idle")}>Concluir</button>
            </div>
          )}

          {totpEnabled === true && step === "idle" && (
            <div className="branding-form">
              <p style={{ marginBottom: 12 }}>O 2FA esta <strong>ativado</strong>.</p>
              <button className="secondary-button" type="button" onClick={() => { setStep("disable"); setCode(""); setStatus(null); }}>
                Desativar 2FA
              </button>
              {status ? <p className="form-status">{status}</p> : null}
            </div>
          )}

          {totpEnabled === true && step === "disable" && (
            <div className="branding-form">
              <p>Digite um codigo do Google Authenticator (ou codigo de recuperacao) para desativar o 2FA:</p>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000 000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={10}
                autoFocus
              />
              <div className="action-row">
                <button className="secondary-button" type="button" onClick={() => { setStep("idle"); setCode(""); setStatus(null); }}>Cancelar</button>
                <button className="save-button" type="button" onClick={() => void confirmDisable()} disabled={loading || !code}>Desativar</button>
              </div>
              {status ? <p className="form-status error">{status}</p> : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
