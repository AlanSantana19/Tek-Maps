import { describe, expect, it } from "vitest";
import { mapZabbixSnapshots, normalizeStatus } from "./mapper.js";

describe("zabbix mapper", () => {
  it("marks maintenance before alerts", () => {
    expect(normalizeStatus({ hostid: "1", host: "sw1", status: "0", maintenance_status: "1" }, [
      { eventid: "e1", objectid: "1", name: "Down", severity: "5", clock: "1700000000" }
    ])).toBe("maintenance");
  });

  it("extracts metrics, ports and alerts", () => {
    const snapshots = mapZabbixSnapshots(
      [{ hostid: "1", host: "sw1", name: "Switch 1", status: "0" }],
      [
        { hostid: "1", itemid: "i1", name: "CPU utilization", key_: "system.cpu.util", lastvalue: "22.34", units: "%" },
        { hostid: "1", itemid: "i2", name: "Interface [Gi0/1] bits received", key_: "net.if.in[Gi0/1]", lastvalue: "1000" },
        { hostid: "1", itemid: "i3", name: "Interface [Gi0/1] bits sent", key_: "net.if.out[Gi0/1]", lastvalue: "2000" }
      ],
      [{ eventid: "e1", objectid: "1", name: "Link down", severity: "4", clock: "1700000000" }]
    );

    expect(snapshots[0].status).toBe("down");
    expect(snapshots[0].metrics[0]).toMatchObject({ key: "cpu", value: 22.34 });
    expect(snapshots[0].ports[0]).toMatchObject({ name: "Gi0/1", inBps: 1000, outBps: 2000 });
    expect(snapshots[0].alerts[0]).toMatchObject({ name: "Link down", severity: 4 });
  });

  it("uses snmp availability when icmp ping item is missing", () => {
    expect(normalizeStatus(
      { hostid: "1", host: "sw1", status: "0" },
      [],
      [{ hostid: "1", itemid: "a1", name: "SNMP availability", key_: "zabbix[host,snmp,available]", lastvalue: "1" }]
    )).toBe("up");

    expect(normalizeStatus(
      { hostid: "1", host: "sw1", status: "0" },
      [],
      [{ hostid: "1", itemid: "a1", name: "SNMP availability", key_: "zabbix[host,snmp,available]", lastvalue: "2" }]
    )).toBe("down");
  });

  it("uses agent availability when icmp ping and snmp availability are missing", () => {
    expect(normalizeStatus(
      { hostid: "1", host: "srv1", status: "0" },
      [],
      [{ hostid: "1", itemid: "a1", name: "Agent ping", key_: "agent.ping", lastvalue: "1" }]
    )).toBe("up");
  });

  it("keeps icmp ping as the preferred status item", () => {
    expect(normalizeStatus(
      { hostid: "1", host: "sw1", status: "0" },
      [],
      [
        { hostid: "1", itemid: "i1", name: "ICMP ping", key_: "icmpping", lastvalue: "0" },
        { hostid: "1", itemid: "a1", name: "SNMP availability", key_: "zabbix[host,snmp,available]", lastvalue: "1" }
      ]
    )).toBe("down");
  });

  it("does not confuse icmp loss with icmp ping", () => {
    expect(normalizeStatus(
      { hostid: "1", host: "sw1", status: "0" },
      [],
      [
        { hostid: "1", itemid: "i1", name: "ICMP loss", key_: "icmppingloss", lastvalue: "0" },
        { hostid: "1", itemid: "i2", name: "ICMP ping", key_: "icmpping", lastvalue: "1" },
        { hostid: "1", itemid: "i3", name: "ICMP response time", key_: "icmppingsec", lastvalue: "0.02" }
      ]
    )).toBe("up");
  });

  // ─── VLAN interface parsing ────────────────────────────────────────────────

  it("extracts VLAN interface with net.if.in/out keys (Zabbix agent style)", () => {
    const [snap] = mapZabbixSnapshots(
      [{ hostid: "1", host: "router", status: "0" }],
      [
        { hostid: "1", itemid: "i1", name: "net.if.in[vlan10]", key_: "net.if.in[vlan10]", lastvalue: "80000000", units: "bps" },
        { hostid: "1", itemid: "i2", name: "net.if.out[vlan10]", key_: "net.if.out[vlan10]", lastvalue: "40000000", units: "bps" },
      ],
      []
    );
    const port = snap.ports.find((p) => p.name === "vlan10" || p.id === "vlan10");
    expect(port).toBeDefined();
    expect(port?.inBps).toBe(80000000);
    expect(port?.outBps).toBe(40000000);
    expect(port?.inItemId).toBe("i1");
    expect(port?.outItemId).toBe("i2");
  });

  it("extracts VLAN interface with quoted name and extra param (MikroTik/Linux style)", () => {
    const [snap] = mapZabbixSnapshots(
      [{ hostid: "1", host: "router", status: "0" }],
      [
        { hostid: "1", itemid: "i1", name: "Interface vlan100: Bits received", key_: "net.if.in[\"vlan100\",bits]", lastvalue: "50000000", units: "bps" },
        { hostid: "1", itemid: "i2", name: "Interface vlan100: Bits sent",     key_: "net.if.out[\"vlan100\",bits]", lastvalue: "25000000", units: "bps" },
      ],
      []
    );
    const port = snap.ports.find((p) => p.name === "vlan100" || p.id === "vlan100");
    expect(port).toBeDefined();
    expect(port?.inBps).toBe(50000000);
    expect(port?.outBps).toBe(25000000);
  });

  it("extracts VLAN interface from SNMP items with numeric SNMP index", () => {
    // SNMP templates use ifHCInOctets[{#SNMPINDEX}] + ifName[{#SNMPINDEX}]
    const [snap] = mapZabbixSnapshots(
      [{ hostid: "1", host: "router", status: "0" }],
      [
        { hostid: "1", itemid: "i1", name: "Interface vlan20: Bits received", key_: "ifHCInOctets[1020]", lastvalue: "12500000", units: "Bps" },
        { hostid: "1", itemid: "i2", name: "Interface vlan20: Bits sent",     key_: "ifHCOutOctets[1020]", lastvalue: "6250000",  units: "Bps" },
        { hostid: "1", itemid: "i3", name: "Interface vlan20: Operational status", key_: "ifOperStatus[1020]", lastvalue: "1", units: "" },
        { hostid: "1", itemid: "i4", name: "Interface vlan20: Interface name", key_: "ifName[1020]", lastvalue: "vlan20", units: "" },
      ],
      []
    );
    // SNMP index "1020" should be the port id
    const port = snap.ports.find((p) => p.index === "1020" || p.id === "1020");
    expect(port).toBeDefined();
    // Bps (bytes/sec) × 8 = bps
    expect(port?.inBps).toBe(12500000 * 8);
    expect(port?.outBps).toBe(6250000 * 8);
    expect(port?.operStatus).toBe("up");
    expect(port?.name).toBe("vlan20");
  });

  it("extracts VLAN interface from SNMP items when name comes from ifDescr", () => {
    const [snap] = mapZabbixSnapshots(
      [{ hostid: "1", host: "router", status: "0" }],
      [
        { hostid: "1", itemid: "i1", name: "ifHCInOctets.500",  key_: "ifHCInOctets.500",  lastvalue: "5000000", units: "Bps" },
        { hostid: "1", itemid: "i2", name: "ifHCOutOctets.500", key_: "ifHCOutOctets.500", lastvalue: "2500000", units: "Bps" },
        { hostid: "1", itemid: "i3", name: "ifDescr.500",       key_: "ifDescr.500",       lastvalue: "Vlan500", units: "" },
      ],
      []
    );
    const port = snap.ports.find((p) => p.index === "500" || p.id === "500");
    expect(port).toBeDefined();
    expect(port?.inBps).toBe(5000000 * 8);
    expect(port?.outBps).toBe(2500000 * 8);
    expect(port?.name).toBe("Vlan500");
  });

  it("shows vlan interface in the traffic filter (has inItemId/outItemId)", () => {
    const [snap] = mapZabbixSnapshots(
      [{ hostid: "1", host: "router", status: "0" }],
      [
        { hostid: "1", itemid: "i1", name: "net.if.in[vlan30]",  key_: "net.if.in[vlan30]",  lastvalue: "1000000", units: "bps" },
        { hostid: "1", itemid: "i2", name: "net.if.out[vlan30]", key_: "net.if.out[vlan30]", lastvalue: "500000",  units: "bps" },
      ],
      []
    );
    const port = snap.ports.find((p) => p.id === "vlan30" || p.name === "vlan30");
    expect(port?.inItemId).toBeDefined();
    expect(port?.outItemId).toBeDefined();
  });
});
