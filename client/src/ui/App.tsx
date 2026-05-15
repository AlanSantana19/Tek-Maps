import {
  Activity,
  BarChart3,
  Eye,
  Lock,
  LogOut,
  MapIcon,
  Plus,
  Save,
  Server,
  Shield,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Connection, Edge, Node, OnEdgesChange, OnNodesChange } from "@xyflow/react";
import type { FormEvent } from "react";
import { addEdge, Background, Controls, MiniMap, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import {
  apiGet,
  createAccessUser,
  getToken,
  login,
  logout,
  openSnapshotsSocket,
  saveTopology,
  saveZabbixConfig,
  testZabbixConfig,
  updateZabbixConfig
} from "../api";
import type { AccessUser, DeviceSnapshot, Topology, ZabbixServerConfig } from "../types";
import { DeviceNode } from "./DeviceNode";

const nodeTypes = { device: DeviceNode };

type SectionId = "dashboard" | "editor" | "viewer" | "server" | "admin";

type DeviceNodeData = {
  label: string;
  hostId?: string;
  deviceType: Topology["nodes"][number]["type"];
  snapshot?: DeviceSnapshot;
};

type DeviceFlowNode = Node<DeviceNodeData, "device">;

const menuItems: Array<{ id: SectionId; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "editor", label: "Editor Maps", icon: MapIcon },
  { id: "viewer", label: "Live Viewer", icon: Eye },
  { id: "server", label: "Servidor", icon: Server },
  { id: "admin", label: "Admin", icon: Users }
];

export function App() {
  const [token, setLocalToken] = useState(getToken());
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [hosts, setHosts] = useState<DeviceSnapshot[]>([]);
  const [selectedTopology, setSelectedTopology] = useState<Topology & { id?: string }>({
    name: "Topologia principal",
    nodes: [],
    edges: []
  });
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const snapshotsByHost = useMemo(() => new Map(hosts.map((host) => [host.hostId, host])), [hosts]);
  const alertsCount = hosts.reduce((total, host) => total + host.alerts.length, 0);
  const downHosts = hosts.filter((host) => host.status === "down").length;

  useEffect(() => {
    if (!token) {
      return;
    }

    void loadInitialData();
    const socket = openSnapshotsSocket(setHosts);
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
      const topology = topologies[0] ?? selectedTopology;
      setSelectedTopology(topology);
      setNodes(topology.nodes.map(toFlowNode(hostData)));
      setEdges(topology.edges.map((edge) => ({ ...edge, animated: true })));
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

  async function persistTopology() {
    setSaving(true);
    setError(null);
    try {
      const topology = await saveTopology({
        id: selectedTopology.id,
        name: selectedTopology.name,
        nodes: nodes.map(fromFlowNode),
        edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
      });
      setSelectedTopology(topology);
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
          </div>
        </div>

        <nav className="side-nav" aria-label="Principal">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeSection === item.id ? "active" : ""}`}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-save">
          <input
            className="topology-name"
            value={selectedTopology.name}
            onChange={(event) => setSelectedTopology({ ...selectedTopology, name: event.target.value })}
          />
          <button className="save-button" onClick={persistTopology} disabled={saving}>
            <Save size={18} />
            {saving ? "Salvando" : "Salvar topologia"}
          </button>
        </div>

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

        {activeSection === "editor" ? (
          <EditorMaps
            hosts={hosts}
            nodes={nodes}
            edges={edges}
            saving={saving}
            onAddHost={addHost}
            onSave={persistTopology}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(connection) => setEdges((current) => addEdge({ ...connection, animated: true }, current))}
          />
        ) : null}

        {activeSection === "viewer" ? <LiveViewer nodes={nodes} edges={edges} /> : null}
        {activeSection === "server" ? <ServerSettings /> : null}
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
  hosts,
  nodes,
  edges,
  saving,
  onAddHost,
  onSave,
  onNodesChange,
  onEdgesChange,
  onConnect
}: {
  hosts: DeviceSnapshot[];
  nodes: DeviceFlowNode[];
  edges: Edge[];
  saving: boolean;
  onAddHost: (host: DeviceSnapshot) => void;
  onSave: () => void;
  onNodesChange: OnNodesChange<DeviceFlowNode>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
}) {
  return (
    <section className="workbench">
      <div className="workbench-panel">
        <PageHeader title="Editor Maps" subtitle="Adicione hosts, mova dispositivos e conecte links da topologia." />
        <button className="save-button" onClick={onSave} disabled={saving}>
          <Save size={18} />
          {saving ? "Salvando" : "Salvar"}
        </button>
        <section className="host-list">
          {hosts.map((host) => (
            <button key={host.hostId} className="host-row" onClick={() => onAddHost(host)}>
              <span className={`status-dot ${host.status}`} />
              <span>{host.visibleName}</span>
              <small>{host.alerts.length} alertas</small>
            </button>
          ))}
        </section>
      </div>
      <TopologyCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
      />
    </section>
  );
}

function LiveViewer({ nodes, edges }: { nodes: DeviceFlowNode[]; edges: Edge[] }) {
  return (
    <section className="page viewer-page">
      <PageHeader title="Live Viewer" subtitle="Visualizacao em tempo real da topologia sincronizada." />
      <div className="viewer-frame">
        <TopologyCanvas nodes={nodes} edges={edges} readonly />
      </div>
    </section>
  );
}

function ServerSettings() {
  const [servers, setServers] = useState<ZabbixServerConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", user: "", password: "", active: true });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

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
      setStatus(result.version ? `${label}: ${result.message}. Versao ${result.version}` : `${label}: ${result.message}`);
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
                  <button className="secondary-button" type="button" onClick={() => editServer(server)}>
                    Editar
                  </button>
                  <button className="secondary-button" type="button" onClick={() => handleTest(server)} disabled={testingId === server.id}>
                    <Shield size={18} />
                    {testingId === server.id ? "Validando" : "Validar"}
                  </button>
                </div>
              </div>
            ))}
            {servers.length === 0 ? <p className="empty-state">Nenhum servidor Zabbix cadastrado.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as AccessUser["role"], active: true, password: "" });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<AccessUser[]>("/api/admin/users").then(setUsers).catch(() => setStatus("Nao foi possivel carregar usuarios."));
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    try {
      const created = await createAccessUser(form);
      setUsers((current) => [created, ...current]);
      setForm({ name: "", email: "", role: "viewer", active: true, password: "" });
      setStatus("Usuario criado.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao criar usuario.");
    }
  }

  return (
    <section className="page">
      <PageHeader title="Admin" subtitle="Crie usuarios e defina o nivel de acesso ao Tek Map." />
      <div className="admin-layout">
        <form className="panel form-grid" onSubmit={handleCreate}>
          <h2>Novo usuario</h2>
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
          <label>
            Senha inicial
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Acesso ativo
          </label>
          <button className="save-button" type="submit">
            <Plus size={18} />
            Criar usuario
          </button>
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
  readonly = false,
  onNodesChange,
  onEdgesChange,
  onConnect
}: {
  nodes: DeviceFlowNode[];
  edges: Edge[];
  readonly?: boolean;
  onNodesChange?: OnNodesChange<DeviceFlowNode>;
  onEdgesChange?: OnEdgesChange<Edge>;
  onConnect?: (connection: Connection) => void;
}) {
  return (
    <section className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        elementsSelectable={!readonly}
        fitView
      >
        <Background />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
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

function toFlowNode(hosts: DeviceSnapshot[]) {
  const byHost = new Map(hosts.map((host) => [host.hostId, host]));
  return (node: Topology["nodes"][number]): DeviceFlowNode => ({
    id: node.id,
    type: "device",
    position: node.position,
    data: {
      label: node.label,
      hostId: node.hostId,
      deviceType: node.type,
      snapshot: node.hostId ? byHost.get(node.hostId) : undefined
    }
  });
}

function fromFlowNode(node: DeviceFlowNode): Topology["nodes"][number] {
  return {
    id: node.id,
    hostId: node.data.hostId ? String(node.data.hostId) : undefined,
    type: String(node.data.deviceType ?? "unknown") as Topology["nodes"][number]["type"],
    label: String(node.data.label ?? node.id),
    position: node.position
  };
}

function inferDeviceType(name: string): Topology["nodes"][number]["type"] {
  if (/fw|firewall/i.test(name)) return "firewall";
  if (/router|rt-/i.test(name)) return "router";
  if (/radio|ap-|wireless/i.test(name)) return "radio";
  if (/server|srv/i.test(name)) return "server";
  if (/switch|sw-/i.test(name)) return "switch";
  return "unknown";
}
