import type { AccessGroup, AccessGroupMember, AccessUser, ActivityLogEntry, AppVersion, CurrentUserPermissions, CustomIcon, DeviceSnapshot, FaviconConfig, LoginLogoConfig, MapPermissionAdminState, NavLogoConfig, OltOnusResult, OnlineUser, PermissionKey, Topology, UserMapPermission, ZabbixHostsResult, ZabbixItemsInspection, ZabbixServerConfig, ZabbixTestResult } from "./types";

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

export type LoginResult =
  | { type: "ok"; token: string }
  | { type: "totp_required"; challengeToken: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error("Credenciais invalidas");
  }
  const payload = await response.json() as { token?: string; totp_required?: boolean; challenge_token?: string };
  if (payload.totp_required && payload.challenge_token) {
    return { type: "totp_required", challengeToken: payload.challenge_token };
  }
  setToken(payload.token!);
  return { type: "ok", token: payload.token! };
}

export async function loginTotp(challengeToken: string, code: string): Promise<string> {
  const response = await fetch("/api/auth/totp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_token: challengeToken, code })
  });
  if (!response.ok) {
    throw new Error("Codigo invalido");
  }
  const payload = await response.json() as { token: string };
  setToken(payload.token);
  return payload.token;
}

export async function getTotpStatus(): Promise<{ enabled: boolean }> {
  return apiGet<{ enabled: boolean }>("/api/me/totp");
}

export async function setupTotp(): Promise<{ secret: string; otpauth_uri: string; backup_codes: string[] }> {
  return apiSend<{ secret: string; otpauth_uri: string; backup_codes: string[] }>("/api/me/totp/setup", "POST", {});
}

export async function enableTotp(code: string): Promise<void> {
  await apiSend<{ enabled: boolean }>("/api/me/totp/enable", "POST", { code });
}

export async function disableTotp(code: string): Promise<void> {
  const response = await fetch("/api/me/totp", {
    method: "DELETE",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ code })
  });
  if (!response.ok) {
    throw new Error("Codigo invalido");
  }
}

export async function apiGet<T>(path: string, timeoutMs = 45_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { headers: authHeaders(), signal: controller.signal });
    if (!response.ok) {
      await throwApiError(response, `GET ${path} falhou: ${response.status}`);
    }
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Tempo limite excedido ao carregar ${path}. Verifique sua conexão.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getAppVersion() {
  return apiGet<AppVersion>("/api/version");
}

export async function getCurrentUserPermissions() {
  return apiGet<CurrentUserPermissions>("/api/me/permissions");
}

export async function getLoginLogoConfig() {
  return apiGet<LoginLogoConfig>("/api/branding/login-logo");
}

export async function getNavLogoConfig() {
  return apiGet<NavLogoConfig>("/api/branding/nav-logo");
}

export async function getFaviconConfig() {
  return apiGet<FaviconConfig>("/api/branding/favicon");
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown, timeoutMs = 45_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      await throwApiError(response, `${method} ${path} falhou: ${response.status}`);
    }
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Tempo limite excedido em ${method} ${path}. Verifique sua conexão.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

export async function getOltOnus(serverId: string, hostId: string) {
  return apiGet<OltOnusResult>(`/api/server/zabbix/${serverId}/hosts/${hostId}/onus`);
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

export async function resetUserTotp(id: string): Promise<void> {
  return apiDelete(`/api/admin/users/${id}/totp`);
}

export async function generateUserTotp(id: string): Promise<{ otpauth_uri: string; backup_codes: string[] }> {
  return apiSend<{ otpauth_uri: string; backup_codes: string[] }>(`/api/admin/users/${id}/totp`, "POST", {});
}

export async function resetAccessUserPassword(id: string, password: string) {
  return apiSend<AccessUser>(`/api/admin/users/${id}/password`, "PATCH", { password });
}

export async function listAccessGroups() {
  return apiGet<AccessGroup[]>("/api/admin/groups");
}

export async function createAccessGroup(data: { name: string; description?: string; role: "admin" | "operator" | "viewer" }) {
  return apiSend<AccessGroup>("/api/admin/groups", "POST", data);
}

export async function updateAccessGroup(id: string, data: { name: string; description?: string; role: "admin" | "operator" | "viewer" }) {
  return apiSend<AccessGroup>(`/api/admin/groups/${id}`, "PUT", data);
}

export async function removeAccessGroup(id: string) {
  return apiDelete(`/api/admin/groups/${id}`);
}

export async function listGroupMembers(groupId: string) {
  return apiGet<AccessGroupMember[]>(`/api/admin/groups/${groupId}/members`);
}

export async function addGroupMember(groupId: string, userId: string) {
  return apiSend<{ ok: boolean }>(`/api/admin/groups/${groupId}/members`, "POST", { userId });
}

export async function removeGroupMember(groupId: string, userId: string) {
  return apiDelete(`/api/admin/groups/${groupId}/members/${userId}`);
}

export async function getMapPermissionAdminState() {
  return apiGet<MapPermissionAdminState>("/api/admin/map-permissions");
}

export async function updateUserMapPermissions(userId: string, permissions: Array<{ topologyId: string; permissions: PermissionKey[] }>) {
  return apiSend<UserMapPermission[]>(`/api/admin/users/${userId}/map-permissions`, "PUT", { permissions });
}

export async function updateUserGranularPermissions(
  userId: string,
  payload: {
    menuPermissions: Array<{ menuId: string; permissions: PermissionKey[] }>;
    mapPermissions: Array<{ topologyId: string; permissions: PermissionKey[] }>;
  }
) {
  return apiSend<{ menuPermissions: unknown[]; mapPermissions: UserMapPermission[] }>(
    `/api/admin/users/${userId}/granular-permissions`,
    "PUT",
    payload
  );
}

export async function updateGroupGranularPermissions(
  groupId: string,
  payload: {
    menuPermissions: Array<{ menuId: string; permissions: PermissionKey[] }>;
    mapPermissions: Array<{ topologyId: string; permissions: PermissionKey[] }>;
  }
) {
  return apiSend<{ menuPermissions: unknown[]; mapPermissions: unknown[] }>(
    `/api/admin/groups/${groupId}/granular-permissions`,
    "PUT",
    payload
  );
}

export async function updateLoginLogoConfig(config: LoginLogoConfig) {
  return apiSend<LoginLogoConfig>("/api/admin/branding/login-logo", "PUT", config);
}

export async function updateNavLogoConfig(config: NavLogoConfig) {
  return apiSend<NavLogoConfig>("/api/admin/branding/nav-logo", "PUT", config);
}

export async function updateFaviconConfig(config: FaviconConfig) {
  return apiSend<FaviconConfig>("/api/admin/branding/favicon", "PUT", config);
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

export async function getActivityLog() {
  return apiGet<ActivityLogEntry[]>("/api/activity/log");
}

export async function getOnlineUsers() {
  return apiGet<OnlineUser[]>("/api/activity/online");
}

export interface RecentEventDto {
  id: string;
  type: string;
  label: string;
  detail?: string;
  createdAt: string;
}

export async function getRecentEvents() {
  return apiGet<RecentEventDto[]>("/api/events/recent");
}

export async function saveRecentEvent(event: { id: string; type: string; label: string; detail?: string }) {
  return apiSend<{ ok: boolean }>("/api/events/recent", "POST", event);
}

export function openSnapshotsSocket(
  onMessage: (snapshots: DeviceSnapshot[]) => void,
  onConnected?: (connected: boolean) => void
): { close: () => void } {
  let destroyed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1_000;

  function connect() {
    if (destroyed) return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const token = getToken();
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    socket = new WebSocket(`${protocol}://${window.location.host}/ws${query}`);

    socket.addEventListener("open", () => {
      backoff = 1_000;
      onConnected?.(true);
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { type: string; payload: DeviceSnapshot[] };
        if (payload.type === "zabbix.snapshots") {
          onMessage(payload.payload);
        }
      } catch { /* ignore malformed frames */ }
    });

    socket.addEventListener("close", () => {
      if (destroyed) return;
      onConnected?.(false);
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30_000);
        connect();
      }, backoff);
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  }

  connect();

  return {
    close() {
      destroyed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      socket?.close();
    }
  };
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
