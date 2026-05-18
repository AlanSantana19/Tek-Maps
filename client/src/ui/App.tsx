import {
  Activity,
  ArrowLeft,
  BarChart3,
  Cable,
  Check,
  Copy,
  Eye,
  HardDrive,
  Image,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Link2,
  MapIcon,
  Maximize2,
  Minimize2,
  MousePointer2,
  Network,
  Pencil,
  Plus,
  Radio,
  Router,
  Save,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
  Workflow,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Connection, Edge, Node, OnEdgesChange, OnNodesChange, ReactFlowInstance } from "@xyflow/react";
import type { DragEvent, FormEvent, MouseEvent } from "react";
import { Background, BackgroundVariant, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import { LinkEdge, SnapshotsContext } from "./LinkEdge";
import {
  AUTH_EXPIRED_EVENT,
  apiGet,
  createAccessUser,
  createCustomIcon,
  getAppVersion,
  getToken,
  getZabbixServerHosts,
  inspectZabbixItems,
  listCustomIcons,
  login,
  logout,
  openSnapshotsSocket,
  removeAccessUser,
  removeCustomIcon,
  removeTopology,
  removeZabbixConfig,
  resetAccessUserPassword,
  saveTopology,
  saveZabbixConfig,
  testZabbixConfig,
  updateAccessUser,
  updateZabbixConfig
} from "../api";
import type { AccessUser, AppVersion, CustomIcon, DeviceSnapshot, PortMetric, Topology, ZabbixItemsInspection, ZabbixServerConfig } from "../types";
import { DeviceNode } from "./DeviceNode";

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

type SectionId = "dashboard" | "editor" | "viewer" | "server" | "admin" | "icons";

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

type CableType = "fiber" | "utp" | "radio" | "wireless" | "vpn" | "other";
type LineStyle = "solid" | "dashed" | "dotted" | "dashdot";

const CABLE_TYPE_PRESETS: Record<CableType, { label: string; color: string; lineStyle: LineStyle; strokeWidth: number }> = {
  fiber:    { label: "Fibra",    color: "#3b82f6", lineStyle: "solid",   strokeWidth: 2 },
  utp:      { label: "UTP",     color: "#f59e0b", lineStyle: "solid",   strokeWidth: 2 },
  radio:    { label: "Rádio",   color: "#a855f7", lineStyle: "dashed",  strokeWidth: 2 },
  wireless: { label: "Wireless", color: "#10b981", lineStyle: "dotted",  strokeWidth: 2 },
  vpn:      { label: "VPN",     color: "#22c55e", lineStyle: "dashdot", strokeWidth: 2 },
  other:    { label: "Outro",   color: "#9ca3af", lineStyle: "solid",   strokeWidth: 2 },
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
  waypointDX?: number;
  waypointDY?: number;
};

type PaletteItem = {
  id: string;
  label: string;
  type: Topology["nodes"][number]["type"];
  icon: typeof Router;
};

type EditorTool = "select" | "delete" | "cable" | PaletteItem["id"];

const paletteItems: PaletteItem[] = [
  { id: "host", label: "Host", type: "unknown", icon: HardDrive },
  { id: "router", label: "Router", type: "router", icon: Router },
  { id: "switch-l2", label: "Switch L2", type: "switch", icon: Network },
  { id: "switch-l3", label: "Switch L3", type: "switch", icon: Network },
  { id: "firewall", label: "Firewall", type: "firewall", icon: Shield },
  { id: "radio", label: "Radio", type: "radio", icon: Radio },
  { id: "server", label: "Servidor", type: "server", icon: Server },
  { id: "lte", label: "LTE", type: "lte", icon: Workflow }
];

const menuItems: Array<{ id: SectionId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "editor", label: "Editor Maps", icon: MapIcon },
  { id: "viewer", label: "Live Viewer", icon: Eye },
  { id: "server", label: "Servidor", icon: Server },
  { id: "icons", label: "Icones", icon: Image },
  { id: "admin", label: "Admin", icon: Users }
];

export function App() {
  const [token, setLocalToken] = useState(getToken());
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [editorMode, setEditorMode] = useState<"maps" | "canvas">("maps");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hosts, setHosts] = useState<DeviceSnapshot[]>([]);
  const [wsConnected, setWsConnected] = useState(true);
  const [topologies, setTopologies] = useState<Array<Topology & { id: string }>>([]);
  const [selectedTopology, setSelectedTopology] = useState<Topology & { id?: string }>({
    name: "Topologia principal",
    nodes: [],
    edges: []
  });
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [appVersion, setAppVersion] = useState<AppVersion | null>(null);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);

  const snapshotsByHost = useMemo(() => new Map(hosts.map((host) => [host.hostId, host])), [hosts]);
  const alertsCount = hosts.reduce((total, host) => total + host.alerts.length, 0);
  const downHosts = hosts.filter((host) => host.status === "down").length;

  useEffect(() => {
    function handleAuthExpired() {
      setLocalToken(null);
      setHosts([]);
      setNodes([]);
      setEdges([]);
      setError("Sessao expirada. Faca login novamente.");
      setActiveSection("dashboard");
      setEditorMode("maps");
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [setNodes, setEdges]);

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
        snapshot: node.data.hostId ? snapshotsByHost.get(String(node.data.hostId)) : undefined
      }
    })));
  }, [snapshotsByHost, setNodes]);

  async function loadInitialData() {
    try {
      const [hostData, topologies] = await Promise.all([
        apiGet<DeviceSnapshot[]>("/api/zabbix/hosts"),
        apiGet<Array<Topology & { id: string }>>("/api/topologies")
      ]);
      setHosts(hostData);
      setTopologies(topologies);
      const topology = topologies[0] ?? selectedTopology;
      setSelectedTopology(topology);
      setNodes(topology.nodes.map(toFlowNode(hostData, customIcons)));
      setEdges(topology.edges.map(toFlowEdge));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar dados");
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setLocalToken(await login(username, password));
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login falhou");
    }
  }

  function handleLogout() {
    logout();
    setLocalToken(null);
    setHosts([]);
    setNodes([]);
    setEdges([]);
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
    setNodes((current) => current.map((node) => ({
      ...node,
      data: { ...node.data, iconSize, labelFontSize }
    })));
  }

  function bulkUpdateEdges(badgeFontSize: number) {
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
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }

  function createLinkEdge(source: string, target: string, data: LinkEdgeData & { label?: string }) {
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
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
  }

  async function persistTopology() {
    setSaving(true);
    setError(null);
    try {
      const topology = await saveTopology({
        id: selectedTopology.id,
        name: selectedTopology.name,
        zabbixServerId: selectedTopology.zabbixServerId,
        nodes: nodes.map(fromFlowNode),
        edges: edges.map(fromFlowEdge)
      });
      setSelectedTopology(topology);
      setTopologies((current) => {
        const exists = current.some((item) => item.id === topology.id);
        return exists ? current.map((item) => item.id === topology.id ? topology : item) : [topology, ...current];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={handleLogin}>
          <Lock size={28} />
          <h1>Tek Map</h1>
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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Activity size={24} />
          <div>
            <strong>Tek Map</strong>
            <span>{hosts.length} hosts sincronizados</span>
            <small>{appVersion ? `v${appVersion.version} · ${appVersion.build}` : ""}</small>
          </div>
        </div>

        <nav className="side-nav" aria-label="Principal">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeSection === item.id ? "active" : ""}`}
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
          <button className="save-button" onClick={persistTopology} disabled={saving}>
            <Save size={18} />
            {saving ? "Salvando" : "Salvar topologia"}
          </button>
        </div> : null}

        {error ? <p className="error">{error}</p> : null}

        <button className="logout-button" onClick={handleLogout}>
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      <section className="content-shell">
        {activeSection === "dashboard" ? (
          <Dashboard hosts={hosts} nodesCount={nodes.length} edgesCount={edges.length} alertsCount={alertsCount} downHosts={downHosts} />
        ) : null}

        {activeSection === "editor" && editorMode === "maps" ? (
          <EditorMaps
            topologies={topologies}
            onTopologiesChange={setTopologies}
            onOpenTopology={openTopology}
          />
        ) : null}

        {activeSection === "editor" && editorMode === "canvas" ? (
          <TopologyEditor
            topologyName={selectedTopology.name}
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
            onNodesChange={onNodesChange}
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
          />
        ) : null}

        {activeSection === "viewer" ? (
          <LiveViewer snapshotsByHost={snapshotsByHost} customIcons={customIcons} />
        ) : null}
        {activeSection === "server" ? <ServerSettings /> : null}
        {activeSection === "icons" ? <CustomIconsPanel customIcons={customIcons} onCustomIconsChange={setCustomIcons} /> : null}
        {activeSection === "admin" ? <AdminUsers /> : null}
      </section>
    </main>
  );
}

function Dashboard({
  hosts,
  nodesCount,
  edgesCount,
  alertsCount,
  downHosts
}: {
  hosts: DeviceSnapshot[];
  nodesCount: number;
  edgesCount: number;
  alertsCount: number;
  downHosts: number;
}) {
  const syncTimes = hosts
    .map((host) => host.syncedAt)
    .sort();
  const latestSync = syncTimes[syncTimes.length - 1];

  return (
    <section className="page">
      <PageHeader title="Dashboard" subtitle="Resumo operacional da topologia e dos hosts monitorados." />
      <div className="summary-grid">
        <SummaryCard label="Hosts" value={hosts.length} />
        <SummaryCard label="Dispositivos no mapa" value={nodesCount} />
        <SummaryCard label="Links" value={edgesCount} />
        <SummaryCard label="Alertas" value={alertsCount} tone={alertsCount ? "warning" : "ok"} />
        <SummaryCard label="Indisponiveis" value={downHosts} tone={downHosts ? "danger" : "ok"} />
        <SummaryCard label="Ultima sync" value={latestSync ? new Date(latestSync).toLocaleString() : "Sem dados"} />
      </div>
      <section className="panel">
        <h2>Eventos recentes</h2>
        <div className="event-list">
          {hosts.flatMap((host) => host.alerts.map((alert) => ({ host, alert }))).slice(0, 8).map(({ host, alert }) => (
            <div className="event-row" key={alert.eventId}>
              <span className={`status-dot ${host.status}`} />
              <strong>{host.visibleName}</strong>
              <span>{alert.name}</span>
            </div>
          ))}
          {alertsCount === 0 ? <p className="empty-state">Nenhum alerta ativo encontrado.</p> : null}
        </div>
      </section>
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
  const [form, setForm] = useState({ name: "", zabbixServerId: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [busyMapId, setBusyMapId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      apiGet<ZabbixServerConfig[]>("/api/server/zabbix"),
      apiGet<Array<Topology & { id: string }>>("/api/topologies")
    ]).then(([serverData, topologyData]) => {
      setServers(serverData);
      onTopologiesChange(topologyData);
    }).catch(() => setStatus("Nao foi possivel carregar mapas e servidores."));
  }, [onTopologiesChange]);

  async function handleSaveMap(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.zabbixServerId) {
      setStatus("Informe servidor Zabbix e identificacao do mapa.");
      return;
    }

    setSavingMap(true);
    setStatus(null);
    try {
      const current = editingId ? topologies.find((topology) => topology.id === editingId) : null;
      const saved = await saveTopology({
        id: editingId ?? undefined,
        name: form.name.trim(),
        zabbixServerId: form.zabbixServerId,
        nodes: current?.nodes ?? [],
        edges: current?.edges ?? []
      });
      onTopologiesChange(editingId
        ? topologies.map((topology) => topology.id === saved.id ? saved : topology)
        : [saved, ...topologies]);
      setEditingId(null);
      setForm({ name: "", zabbixServerId: "" });
      setStatus(editingId ? "Mapa atualizado." : "Mapa salvo. Use Abrir para editar a topologia.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar mapa.");
    } finally {
      setSavingMap(false);
    }
  }

  function editMap(topology: Topology & { id: string }) {
    setEditingId(topology.id);
    setForm({ name: topology.name, zabbixServerId: topology.zabbixServerId ?? "" });
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
        setForm({ name: "", zabbixServerId: "" });
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

  return (
    <section className="page">
      <PageHeader title="Editor Maps" subtitle="Crie, localize e abra mapas de rede para montar topologias." />
      <div className="admin-layout">
        <form className="panel form-grid" onSubmit={handleSaveMap}>
          <h2>{editingId ? "Editar mapa" : "Novo mapa"}</h2>
          <label>
            Servidor Zabbix
            <select value={form.zabbixServerId} onChange={(event) => setForm({ ...form, zabbixServerId: event.target.value })}>
              <option value="">Selecione um servidor</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id ?? ""}>{server.name}</option>
              ))}
            </select>
          </label>
          <label>
            Identificacao do mapa
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Mapa matriz" />
          </label>
          <div className="action-row">
            {editingId ? (
              <button className="secondary-button" type="button" onClick={() => {
                setEditingId(null);
                setForm({ name: "", zabbixServerId: "" });
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
          <h2>Mapas criados</h2>
          {topologies.length === 0 ? (
            <button className="empty-create-button" type="button" onClick={() => setStatus("Preencha servidor Zabbix e identificacao para salvar um novo mapa.")}>
              <Plus size={32} />
            </button>
          ) : (
            <div className="map-list">
              {topologies.map((topology) => (
                <div className="map-row map-row-clickable" key={topology.id} onClick={() => onOpenTopology(topology)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenTopology(topology)}>
                  <div>
                    <strong>{topology.name}</strong>
                    <span>{serverName(topology.zabbixServerId)}</span>
                    <small>{topology.nodes.length} dispositivos - {topology.edges.length} links</small>
                  </div>
                  <div className="row-actions">
                    <button className="icon-action-button" type="button" onClick={(e) => { e.stopPropagation(); editMap(topology); }} title="Editar nome" aria-label={`Editar ${topology.name}`}>
                      <Pencil size={18} />
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
  onConnect
}: {
  topologyName: string;
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
  onSave: () => void;
  onNodesChange: OnNodesChange<DeviceFlowNode>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
}) {
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
    badgeFontSize: 10,
    showTraffic: true,
    showLabel: true
  });
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<DeviceFlowNode, Edge> | null>(null);
  const [zabbixServers, setZabbixServers] = useState<ZabbixServerConfig[]>([]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const configNode = nodes.find((node) => node.id === configNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const filteredHosts = deviceForm.zabbixServerId ? hosts.filter((host) => host.zabbixServerId === deviceForm.zabbixServerId) : hosts;
  const selectedHost = filteredHosts.find((host) => host.hostId === deviceForm.hostId) ?? hosts.find((host) => host.hostId === deviceForm.hostId);
  const statusItems = buildStatusItems(selectedHost);
  const draftSourceNode = nodes.find((node) => node.id === (selectedEdge?.source ?? linkDraft.sourceId));
  const draftTargetNode = nodes.find((node) => node.id === (selectedEdge?.target ?? linkDraft.targetId));
  const sourceInterfaces = interfaceOptionsForNode(draftSourceNode);
  const filteredSourceInterfaces = filterInterfaces(sourceInterfaces, linkForm.sourceSearch, onlyWithTraffic);
  const selectedSourceInterface = sourceInterfaces.find((port) => port.id === linkForm.sourceOutInterface);
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
    if (!hostPickerOpen || hostPickerServerId || zabbixServers.length === 0) {
      return;
    }
    const defaultServer = zabbixServers.find((server) => server.active) ?? zabbixServers[0];
    if (defaultServer.id) {
      void loadHostPickerHosts(defaultServer.id);
    }
  }, [hostPickerOpen, hostPickerServerId, zabbixServers]);

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

    if (activeTool === "delete") {
      onRemoveDeviceNode(node.id);
      closeDeviceConfig();
      return;
    }

    if (activeTool === "cable") {
      closeDeviceConfig();
      setLinkDraft((current) => {
        if (!current.sourceId || current.sourceId === node.id) {
          setLinkForm(defaultLinkForm());
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
      badgeFontSize: data?.badgeFontSize ?? 10,
      showTraffic: data?.showTraffic ?? true,
      showLabel: data?.showLabel ?? true
    });
  }

  function saveLinkConfig() {
    const port = selectedSourceInterface;
    const value = {
      label: linkForm.label.trim() || undefined,
      sourceHostId: draftSourceNode?.data.hostId,
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
      badgeFontSize: Number(linkForm.badgeFontSize) || 10,
      showTraffic: linkForm.showTraffic,
      showLabel: linkForm.showLabel
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
      zabbixServerId: node.data.zabbixServerId ?? "",
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
                className={`create-tool-button ${activeTool !== "select" && activeTool !== "delete" ? "active" : ""}`}
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
                  <button className={activeTool === "cable" ? "active" : ""} type="button" onClick={() => chooseCreateTool("cable")} role="menuitem">
                    <Cable size={17} />
                    <span>Cabo / Enlace</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button className={`tool-button danger ${activeTool === "delete" ? "active" : ""}`} type="button" onClick={() => chooseTool("delete")} title="Excluir" aria-label="Excluir">
              <Trash2 size={17} />
            </button>
            <button className={`tool-button ${bulkEditOpen ? "active" : ""}`} type="button" onClick={() => setBulkEditOpen((v) => !v)} title="Editar todos os elementos" aria-label="Editar todos os elementos">
              <Layers size={17} />
            </button>
          </div>
          <div className="editor-side-actions">
            <button className="tool-button save-tool-button" onClick={onSave} disabled={saving} title="Salvar" aria-label="Salvar">
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
          onEdgeClick={(_, edge) => activeTool === "delete" ? onRemoveLinkEdge(edge.id) : openLinkConfig(edge)}
          onPaneClick={handlePaneClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodesDraggable
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
              <select value={hostPickerServerId} onChange={(event) => void loadHostPickerHosts(event.target.value)}>
                <option value="">Selecione o servidor</option>
                {zabbixServers.map((server) => (
                  <option key={server.id ?? server.name} value={server.id ?? ""}>
                    {server.name}
                  </option>
                ))}
              </select>
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
                  <select value={deviceForm.zabbixServerId} onChange={(event) => setDeviceForm({ ...deviceForm, zabbixServerId: event.target.value, hostId: "", statusItemKey: "" })}>
                    <option value="">Selecione um servidor</option>
                    {zabbixServers.map((server) => (
                      <option key={server.id} value={server.id ?? ""}>{server.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label-row">
                    Host Zabbix
                    <small>{deviceForm.hostId ? `${Math.max(1, filteredHosts.findIndex((host) => host.hostId === deviceForm.hostId) + 1)}/${filteredHosts.length}` : `0/${filteredHosts.length}`}</small>
                  </span>
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
                Interface de Origem
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
                <span title={`${sourceInterfaces.length} interface(s) para origem`}>
                  Origem: {sourceInterfaces.length > 0 ? `${sourceInterfaces.length} interfaces` : draftSourceNode?.data.hostId ? "0 interfaces (sem dados de porta)" : "sem host vinculado"}
                </span>
              </div>
              {sourceInterfaces.length === 0 && draftSourceNode?.data.hostId ? (
                <p className="form-status">Interfaces nao encontradas para o host de origem. Verifique no painel Servidor se os itens ifHCInOctets/ifHCOutOctets ou net.if.in/net.if.out estao chegando do Zabbix. A sincronizacao ocorre a cada ciclo automatico.</p>
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
                    onClick={() => setLinkForm({ ...linkForm, cableType: id, color: preset.color, lineStyle: preset.lineStyle, strokeWidth: preset.strokeWidth })}
                  >
                    <span
                      className="cable-type-line"
                      style={{ background: cablePreviewBackground(preset.lineStyle, preset.color) }}
                    />
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

function LiveViewer({ snapshotsByHost, customIcons }: { snapshotsByHost: Map<string, DeviceSnapshot>; customIcons: CustomIcon[] }) {
  const [topologies, setTopologies] = useState<Array<Topology & { id: string }>>([]);
  const [selected, setSelected] = useState<(Topology & { id: string }) | null>(null);
  const [viewNodes, setViewNodes] = useState<DeviceFlowNode[]>([]);
  const [viewEdges, setViewEdges] = useState<Edge[]>([]);
  const [countdown, setCountdown] = useState(VIEWER_REFRESH_INTERVAL);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void apiGet<Array<Topology & { id: string }>>("/api/topologies").then(setTopologies).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    setViewNodes(selected.nodes.map(toFlowNode(Array.from(snapshotsByHost.values()), customIcons)));
    setViewEdges(selected.edges.map(toFlowEdge));
  }, [selected, snapshotsByHost, customIcons]);

  useEffect(() => {
    if (!selected) return;
    setCountdown(VIEWER_REFRESH_INTERVAL);

    const refresh = setInterval(async () => {
      try {
        const updated = await apiGet<Topology & { id: string }>(`/api/topologies/${selected.id}`);
        setSelected(updated);
      } catch { /* keep showing current */ }
      setCountdown(VIEWER_REFRESH_INTERVAL);
    }, VIEWER_REFRESH_INTERVAL * 1000);

    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);

    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [selected?.id]);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
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
    setViewNodes([]);
    setViewEdges([]);
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
        <span className="viewer-countdown">
          Atualiza em {countdown}s
        </span>
        <button className="viewer-bar-btn" onClick={toggleFullscreen} title={isFullscreen ? "Sair tela cheia" : "Tela cheia"}>
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button className="viewer-bar-btn viewer-exit" onClick={exitViewer} title="Sair">
          <X size={17} />
        </button>
      </div>
      <div className="viewer-canvas-wrap">
        <TopologyCanvas nodes={viewNodes} edges={viewEdges} snapshotsByHost={snapshotsByHost} readonly />
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
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as AccessUser["role"], active: true, password: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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
      resetForm();
      setStatus("Usuario criado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao salvar usuario.");
    }
  }

  function handleEdit(user: AccessUser) {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, role: user.role, active: user.active, password: "" });
    setStatus(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", email: "", role: "viewer", active: true, password: "" });
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

  return (
    <section className="page">
      <PageHeader title="Admin" subtitle="Crie usuarios e defina o nivel de acesso ao Tek Map." />
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
    </section>
  );
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
  nodesDraggable
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
}) {
  return (
    <section className="canvas">
      <SnapshotsContext.Provider value={snapshotsByHost ?? new Map()}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={onInit}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          connectionRadius={10}
          nodesDraggable={!readonly && (nodesDraggable ?? true)}
          nodesConnectable={!readonly}
          elementsSelectable={!readonly}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background variant={BackgroundVariant.Lines} gap={40} size={1} color="#1c2330" />
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
      <span>{label}</span>
      <strong>{value}</strong>
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
      <span className="iface-name">{interfaceLabel(port)}</span>
      {hasTraffic ? (
        <>
          <span className="iface-rx">RX: {formatBps(port.inBps)}</span>
          <span className="iface-tx">TX: {formatBps(port.outBps)}</span>
          {port.speedMbps ? <span className="iface-speed">Velocidade: {port.speedMbps} Mbps</span> : null}
          {port.utilizationPct !== undefined ? <span className="iface-util">Uso: {port.utilizationPct}%</span> : null}
          {port.operStatus ? <span className={`iface-status iface-status--${port.operStatus}`}>Link: {port.operStatus}</span> : null}
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
      cableType: edge.cableType,
      color: edge.color,
      strokeWidth: edge.strokeWidth,
      lineStyle: edge.lineStyle,
      badgeFontSize: edge.badgeFontSize,
      showTraffic: edge.showTraffic,
      showLabel: edge.showLabel,
      waypointDX: edge.waypointDX,
      waypointDY: edge.waypointDY
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
    waypointDX: data?.waypointDX,
    waypointDY: data?.waypointDY
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
    badgeFontSize: 10,
    showTraffic: true,
    showLabel: true
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
  return "unknown";
}
