import type { AccessUser, AppVersion, CustomIcon, DeviceSnapshot, Topology, ZabbixHostsResult, ZabbixItemsInspection, ZabbixServerConfig, ZabbixTestResult } from "./types";

const TOKEN_KEY = "tek-map-token";
export const AUTH_EXPIRED_EVENT = "tek-map-auth-expired";

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
    await throwApiError(response, `GET ${path} falhou: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getAppVersion() {
  return apiGet<AppVersion>("/api/version");
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    await throwApiError(response, `${method} ${path} falhou: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(path, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!response.ok) {
    await throwApiError(response, `DELETE ${path} falhou: ${response.status}`);
  }
}

export async function saveTopology(topology: Topology): Promise<Topology & { id: string }> {
  const response = await fetch(topology.id ? `/api/topologies/${topology.id}` : "/api/topologies", {
    method: topology.id ? "PUT" : "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(topology)
  });
  if (!response.ok) {
    await throwApiError(response, `Falha ao salvar topologia: ${response.status}`);
  }
  return response.json() as Promise<Topology & { id: string }>;
}

export async function removeTopology(id: string) {
  return apiDelete(`/api/topologies/${id}`);
}

export async function saveZabbixConfig(config: { name: string; url: string; user: string; password?: string; active: boolean }) {
  return apiSend<ZabbixServerConfig>("/api/server/zabbix", "POST", config);
}

export async function updateZabbixConfig(config: { id: string; name: string; url: string; user: string; password?: string; active: boolean }) {
  return apiSend<ZabbixServerConfig>(`/api/server/zabbix/${config.id}`, "PUT", config);
}

export async function removeZabbixConfig(id: string) {
  return apiDelete(`/api/server/zabbix/${id}`);
}

export async function testZabbixConfig(config: { id?: string; url?: string; user?: string; password?: string }) {
  return apiSend<ZabbixTestResult>("/api/server/zabbix/test", "POST", config);
}

export async function inspectZabbixItems(id: string) {
  return apiGet<ZabbixItemsInspection>(`/api/server/zabbix/${id}/items`);
}

export async function getZabbixServerHosts(id: string) {
  return apiGet<ZabbixHostsResult>(`/api/server/zabbix/${id}/hosts`);
}

export async function createAccessUser(user: Omit<AccessUser, "id" | "createdAt"> & { password?: string }) {
  return apiSend<AccessUser>("/api/admin/users", "POST", user);
}

export async function updateAccessUser(user: Omit<AccessUser, "createdAt">) {
  return apiSend<AccessUser>(`/api/admin/users/${user.id}`, "PUT", {
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active
  });
}

export async function removeAccessUser(id: string) {
  return apiDelete(`/api/admin/users/${id}`);
}

export async function resetAccessUserPassword(id: string, password: string) {
  return apiSend<AccessUser>(`/api/admin/users/${id}/password`, "PATCH", { password });
}

export async function listCustomIcons() {
  return apiGet<CustomIcon[]>("/api/icons");
}

export async function createCustomIcon(name: string, dataUrl: string) {
  return apiSend<CustomIcon>("/api/icons", "POST", { name, dataUrl });
}

export async function removeCustomIcon(id: string) {
  return apiDelete(`/api/icons/${id}`);
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

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  if (response.status === 401) {
    logout();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  throw new Error(payload?.message ?? payload?.error ?? fallback);
}
