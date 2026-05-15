import type { DeviceAlert, DeviceMetric, DeviceSnapshot, DeviceStatus, PortMetric } from "../types.js";

interface ZabbixHost {
  hostid: string;
  host: string;
  name?: string;
  status: string;
  maintenance_status?: string;
}

interface ZabbixItem {
  hostid: string;
  itemid: string;
  name: string;
  key_: string;
  lastvalue?: string;
  units?: string;
  lastclock?: string;
}

interface ZabbixProblem {
  eventid: string;
  objectid: string;
  name: string;
  severity: string;
  clock: string;
}

export function normalizeStatus(host: ZabbixHost, problems: ZabbixProblem[]): DeviceStatus {
  if (host.maintenance_status === "1") {
    return "maintenance";
  }
  if (host.status !== "0") {
    return "unknown";
  }
  return problems.length > 0 ? "down" : "up";
}

export function mapZabbixSnapshots(
  hosts: ZabbixHost[],
  items: ZabbixItem[],
  problems: ZabbixProblem[]
): DeviceSnapshot[] {
  const itemsByHost = groupBy(items, (item) => item.hostid);
  const problemsByObject = groupBy(problems, (problem) => problem.objectid);
  const now = new Date().toISOString();

  return hosts.map((host) => {
    const hostItems = itemsByHost.get(host.hostid) ?? [];
    const hostProblems = problemsByObject.get(host.hostid) ?? [];

    return {
      hostId: host.hostid,
      hostName: host.host,
      visibleName: host.name || host.host,
      status: normalizeStatus(host, hostProblems),
      metrics: extractMetrics(hostItems),
      ports: extractPorts(hostItems),
      alerts: hostProblems.map<DeviceAlert>((problem) => ({
        eventId: problem.eventid,
        severity: Number(problem.severity),
        name: problem.name,
        clock: new Date(Number(problem.clock) * 1000).toISOString()
      })),
      syncedAt: now
    };
  });
}

function extractMetrics(items: ZabbixItem[]): DeviceMetric[] {
  const patterns = [
    { key: "cpu", label: "CPU", match: /cpu|processor/i },
    { key: "memory", label: "Memoria", match: /memory|vm\.memory|mem/i },
    { key: "disk", label: "Disco", match: /disk|vfs\.fs/i }
  ];

  return patterns.flatMap((pattern) => {
    const item = items.find((candidate) => pattern.match.test(candidate.key_) || pattern.match.test(candidate.name));
    if (!item) {
      return [];
    }

    return [{
      key: pattern.key,
      label: pattern.label,
      value: parseNumeric(item.lastvalue),
      unit: item.units,
      updatedAt: item.lastclock ? new Date(Number(item.lastclock) * 1000).toISOString() : undefined
    }];
  });
}

function extractPorts(items: ZabbixItem[]): PortMetric[] {
  const ports = new Map<string, PortMetric>();

  for (const item of items) {
    const portName = parsePortName(item.name) ?? parsePortName(item.key_);
    if (!portName) {
      continue;
    }

    const current = ports.get(portName) ?? { id: portName, name: portName, operStatus: "unknown" as const };
    const numeric = Number(item.lastvalue ?? 0);

    if (/in|incoming|ifHCInOctets|net\.if\.in/i.test(item.key_) || /bits received|inbound/i.test(item.name)) {
      current.inBps = numeric;
    } else if (/out|outgoing|ifHCOutOctets|net\.if\.out/i.test(item.key_) || /bits sent|outbound/i.test(item.name)) {
      current.outBps = numeric;
    } else if (/operstatus|oper status|status/i.test(item.key_) || /operational status/i.test(item.name)) {
      current.operStatus = item.lastvalue === "1" || /up/i.test(item.lastvalue ?? "") ? "up" : "down";
    }

    if (current.inBps !== undefined || current.outBps !== undefined) {
      const total = (current.inBps ?? 0) + (current.outBps ?? 0);
      current.utilizationPct = Math.min(100, Math.round((total / 1_000_000_000) * 100));
    }

    ports.set(portName, current);
  }

  return Array.from(ports.values()).slice(0, 64);
}

function parsePortName(input: string): string | null {
  const bracket = input.match(/\[(?<name>[^\]]+)\]/);
  if (bracket?.groups?.name) {
    return bracket.groups.name;
  }

  const quoted = input.match(/"(?<name>[^"]+)"/);
  return quoted?.groups?.name ?? null;
}

function parseNumeric(value: string | undefined): number | string {
  if (value === undefined) {
    return "n/a";
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : value;
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
