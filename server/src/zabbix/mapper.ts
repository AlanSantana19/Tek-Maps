import type { DeviceAlert, DeviceMetric, DeviceSnapshot, DeviceStatus, PortMetric } from "../types.js";

interface ZabbixHost {
  hostid: string;
  host: string;
  name?: string;
  status: string;
  maintenance_status?: string;
  interfaces?: Array<{ ip: string; main?: string; type?: string }>;
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

export function normalizeStatus(host: ZabbixHost, problems: ZabbixProblem[], items: ZabbixItem[] = []): DeviceStatus {
  if (host.maintenance_status === "1") {
    return "maintenance";
  }
  if (host.status !== "0") {
    return "unknown";
  }
  const icmpPing = items.find((item) => isIcmpPingItem(item));
  if (icmpPing) {
    return Number(icmpPing.lastvalue ?? 0) > 0 ? "up" : "down";
  }
  const availabilityStatus = availabilityStatusFromItems(items);
  if (availabilityStatus) {
    return availabilityStatus;
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

    const primaryInterface = host.interfaces?.find((iface) => iface.main === "1") ?? host.interfaces?.[0];
    const ip = primaryInterface?.ip && primaryInterface.ip !== "0.0.0.0" ? primaryInterface.ip : undefined;

    return {
      hostId: host.hostid,
      hostName: host.host,
      visibleName: host.name || host.host,
      ip,
      status: normalizeStatus(host, hostProblems, hostItems),
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

  const standard = patterns.flatMap((pattern) => {
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

  const optical = items
    .filter((item) =>
      item.units === "dBm" ||
      /optical|sfp|pon|rx\.power|tx\.power|optic/i.test(item.key_) ||
      /optical|sfp|pon|rx power|tx power|optical power/i.test(item.name)
    )
    .map<DeviceMetric>((item) => ({
      key: item.key_,
      label: item.name,
      value: parseNumeric(item.lastvalue),
      unit: item.units || "dBm",
      updatedAt: item.lastclock ? new Date(Number(item.lastclock) * 1000).toISOString() : undefined
    }));

  const radio = items
    .filter((item) =>
      !optical.some((o) => o.key === item.key_) &&
      (
        /rssi|snr|signal|ccq|noise|airmax|modulation|frequency|channel|tx\.rate|rx\.rate|capacity|ack\.timeout|distance|radio/i.test(item.key_) ||
        /rssi|snr|signal strength|signal quality|ccq|noise floor|airmax|modulation|frequency|channel|tx rate|rx rate|radio/i.test(item.name)
      )
    )
    .map<DeviceMetric>((item) => ({
      key: item.key_,
      label: item.name,
      value: parseNumeric(item.lastvalue),
      unit: item.units,
      updatedAt: item.lastclock ? new Date(Number(item.lastclock) * 1000).toISOString() : undefined
    }));

  return [...standard, ...optical, ...radio];
}

function extractPorts(items: ZabbixItem[]): PortMetric[] {
  const ports = new Map<string, PortMetric>();

  for (const item of items) {
    const index = parseInterfaceIndex(item.key_) ?? parseInterfaceIndex(item.name);
    const portName = parsePortName(item.name) ?? parsePortName(item.key_);
    const key = index ?? portName;
    if (!key) {
      continue;
    }

    const labelName = extractInterfaceNameFromLabel(item.name);
    const current: PortMetric = ports.get(key) ?? {
      id: key,
      name: labelName ?? (portName && !looksLikeMetricKey(portName) ? portName : `Interface indice ${key}`),
      index: index ?? undefined,
      operStatus: "unknown" as const
    };
    const numeric = Number(item.lastvalue ?? 0);
    const lastValue = item.lastvalue?.trim();

    // Apply label-extracted name to existing ports that still have placeholder names
    if (labelName && /^Interface indice /.test(current.name)) {
      current.name = labelName;
    }

    if (/ifName/i.test(item.key_) || /^Interface name/i.test(item.name)) {
      current.name = lastValue || current.name;
    } else if (/ifAlias/i.test(item.key_) || /alias/i.test(item.name)) {
      current.alias = lastValue || current.alias;
    } else if (/ifDescr/i.test(item.key_) || /description|descr/i.test(item.name)) {
      current.description = lastValue || current.description;
      if (!current.name || /^Interface indice /.test(current.name)) {
        current.name = lastValue || current.name;
      }
    } else if (/ifHCInOctets|ifInOctets|net\.if\.in\[/i.test(item.key_) || /\bbits received\b|\bbits in\b|\btraffic in\b|\bincoming traffic\b/i.test(item.name)) {
      current.inBps = toBitsPerSec(numeric, item.units);
      current.inItemId = item.itemid;
    } else if (/ifHCOutOctets|ifOutOctets|net\.if\.out\[/i.test(item.key_) || /\bbits sent\b|\bbits out\b|\btraffic out\b|\boutgoing traffic\b/i.test(item.name)) {
      current.outBps = toBitsPerSec(numeric, item.units);
      current.outItemId = item.itemid;
    } else if (/ifOperStatus|net\.if\.status\[/i.test(item.key_) || /operational status|link status/i.test(item.name)) {
      current.operStatus = item.lastvalue === "1" || /up/i.test(item.lastvalue ?? "") ? "up" : "down";
      current.statusItemId = item.itemid;
    } else if (/ifHighSpeed|net\.if\.speed\[/i.test(item.key_) || /\binterface speed\b|\blink speed\b/i.test(item.name)) {
      const speedMbps = Number(item.lastvalue ?? 0);
      if (speedMbps > 0) current.speedMbps = speedMbps;
      current.speedItemId = item.itemid;
    }

    if (current.inBps !== undefined || current.outBps !== undefined) {
      const speedBps = (current.speedMbps ?? 0) * 1_000_000;
      if (speedBps > 0) {
        const total = (current.inBps ?? 0) + (current.outBps ?? 0);
        current.utilizationPct = Math.min(100, Math.round((total / speedBps) * 100));
      }
    }

    ports.set(key, current);
  }

  return Array.from(ports.values())
    .filter((port) => port.inItemId || port.outItemId || port.statusItemId || port.speedItemId)
    .map((port) => ({
      ...port,
      id: port.index ?? port.id,
      name: friendlyInterfaceName(port)
    }))
    .slice(0, 512);
}

function friendlyInterfaceName(port: PortMetric): string {
  const name = cleanInterfaceValue(port.name) || cleanInterfaceValue(port.description);
  const alias = cleanInterfaceValue(port.alias);
  if (name && alias && alias !== name) {
    return `${name} - ${alias}`;
  }
  return name || alias || `Interface indice ${port.index ?? port.id}`;
}

function cleanInterfaceValue(value: string | undefined): string | undefined {
  if (!value || value === "0" || value === "n/a") {
    return undefined;
  }
  return value;
}

function parseInterfaceIndex(input: string): string | null {
  // Pure digit in brackets: net.if.in[10]
  const bracket = input.match(/\[(?<index>\d+)\]/);
  if (bracket?.groups?.index) {
    return bracket.groups.index;
  }

  // Trailing digit(s) after a dot inside brackets: net.if.in[ifHCInOctets.10]
  const bracketWithKey = input.match(/\[[^\]]*?\.(\d+)\]$/);
  if (bracketWithKey?.[1]) {
    return bracketWithKey[1];
  }

  // Trailing digit(s) after a dot at end of string: net.if.status.10
  const dotted = input.match(/(?:^|\.)(?<index>\d+)$/);
  if (dotted?.groups?.index) {
    return dotted.groups.index;
  }

  return null;
}

function extractInterfaceNameFromLabel(itemName: string): string | null {
  // Match "Interface {name}: {metric description}" - common in MikroTik/RouterOS templates
  const match = itemName.match(/^Interface\s+(.+?)\s*:/i);
  if (!match?.[1]) return null;
  const name = match[1].trim();
  // Reject generic metric descriptor words that aren't interface names
  if (/^(name|description|alias|status|speed|type|errors|discards|packets|bits|bytes|traffic)/i.test(name)) {
    return null;
  }
  return name || null;
}

function looksLikeMetricKey(value: string): boolean {
  return /^(ifHC|ifIn|ifOut|ifOper|ifName|ifDescr|ifAlias|ifHigh|ifType|net\.if|oid\[)/i.test(value) ||
    /^\d[\d.]*$/.test(value);
}

function extractPortsLegacy(items: ZabbixItem[]): PortMetric[] {
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
  const bracket = input.match(/\[([^\]]+)\]/);
  if (bracket) {
    const raw = bracket[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (raw) return raw;
  }
  const quoted = input.match(/"([^"]+)"/);
  return quoted?.[1] ?? null;
}

function parseNumeric(value: string | undefined): number | string {
  if (value === undefined) {
    return "n/a";
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : value;
}

function availabilityStatusFromItems(items: ZabbixItem[]): DeviceStatus | null {
  const availabilityItems = items
    .filter((item) => isAvailabilityItem(item))
    .sort((left, right) => availabilityPriority(left) - availabilityPriority(right));

  for (const item of availabilityItems) {
    const status = statusFromAvailabilityItem(item);
    if (status !== "unknown") {
      return status;
    }
  }

  return availabilityItems.length > 0 ? "unknown" : null;
}

function isIcmpPingItem(item: ZabbixItem): boolean {
  return item.key_ === "icmpping" || /^ICMP ping$/i.test(item.name.trim());
}

function isAvailabilityItem(item: ZabbixItem): boolean {
  return /zabbix\[host,(agent|snmp|jmx|ipmi),available\]/i.test(item.key_) ||
    /^agent\.ping/i.test(item.key_) ||
    /(?:snmp|agent|zabbix agent).*availab/i.test(item.name);
}

function availabilityPriority(item: ZabbixItem): number {
  if (/zabbix\[host,snmp,available\]/i.test(item.key_)) return 1;
  if (/zabbix\[host,agent,available\]/i.test(item.key_) || /^agent\.ping/i.test(item.key_)) return 2;
  return 3;
}

function statusFromAvailabilityItem(item: ZabbixItem): DeviceStatus {
  const value = item.lastvalue?.trim();
  if (!value) {
    return "unknown";
  }

  if (/^agent\.ping/i.test(item.key_)) {
    return Number(value) > 0 ? "up" : "down";
  }

  if (/zabbix\[host,(agent|snmp|jmx|ipmi),available\]/i.test(item.key_)) {
    if (value === "1") return "up";
    if (value === "2") return "down";
    return "unknown";
  }

  if (/available|up|online/i.test(value)) return "up";
  if (/unavailable|down|offline/i.test(value)) return "down";
  return Number(value) > 0 ? "up" : "unknown";
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function toBitsPerSec(value: number, units: string | undefined): number {
  if (units === "Bps") return value * 8;
  return value;
}
