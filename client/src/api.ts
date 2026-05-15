import type { AccessUser, DeviceSnapshot, Topology, ZabbixServerConfig } from "./types";

const TOKEN_KEY = "tek-map-token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error("Credenciais invalidas");
  }
  const payload = await response.json() as { token: string };
  setToken(payload.token);
  return payload.token;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`GET ${path} falhou: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(payload?.message ?? payload?.error ?? `${method} ${path} falhou: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function saveTopology(topology: Topology): Promise<Topology & { id: string }> {
  const response = await fetch(topology.id ? `/api/topologies/${topology.id}` : "/api/topologies", {
    method: topology.id ? "PUT" : "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(topology)
  });
  if (!response.ok) {
    throw new Error(`Falha ao salvar topologia: ${response.status}`);
  }
  return response.json() as Promise<Topology & { id: string }>;
}

export async function saveZabbixConfig(config: { name: string; url: string; user: string; password?: string; active: boolean }) {
  return apiSend<ZabbixServerConfig>("/api/server/zabbix", "POST", config);
}

export async function updateZabbixConfig(config: { id: string; name: string; url: string; user: string; password?: string; active: boolean }) {
  return apiSend<ZabbixServerConfig>(`/api/server/zabbix/${config.id}`, "PUT", config);
}

export async function testZabbixConfig(config: { id?: string; url?: string; user?: string; password?: string }) {
  return apiSend<{ ok: boolean; version?: string; message: string }>("/api/server/zabbix/test", "POST", config);
}

export async function createAccessUser(user: Omit<AccessUser, "id" | "createdAt"> & { password?: string }) {
  return apiSend<AccessUser>("/api/admin/users", "POST", user);
}

export function openSnapshotsSocket(onMessage: (snapshots: DeviceSnapshot[]) => void) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data) as { type: string; payload: DeviceSnapshot[] };
    if (payload.type === "zabbix.snapshots") {
      onMessage(payload.payload);
    }
  });
  return socket;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
