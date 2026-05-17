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
});
