import { Handle, Position } from "@xyflow/react";
import { Cpu, HardDrive, MemoryStick, Radio, Router, Server, Shield, Workflow } from "lucide-react";
import type { DeviceSnapshot } from "../types";

interface DeviceNodeProps {
  data: {
    label: string;
    deviceType: string;
    snapshot?: DeviceSnapshot;
  };
}

export function DeviceNode({ data }: DeviceNodeProps) {
  const Icon = iconFor(data.deviceType);
  const snapshot = data.snapshot;
  const hotPorts = snapshot?.ports.filter((port) => port.operStatus === "up").slice(0, 6) ?? [];

  return (
    <div className={`device-node ${snapshot?.status ?? "unknown"}`}>
      <Handle type="target" position={Position.Left} />
      <div className="device-header">
        <Icon size={22} />
        <div>
          <strong>{data.label}</strong>
          <span>{snapshot?.status ?? "sem dados"}</span>
        </div>
      </div>
      <div className="metric-grid">
        {metric(snapshot, "cpu", Cpu)}
        {metric(snapshot, "memory", MemoryStick)}
        {metric(snapshot, "disk", HardDrive)}
      </div>
      <div className="ports">
        {hotPorts.map((port) => (
          <span key={port.id} title={`${port.name} ${port.utilizationPct ?? 0}%`}>
            {port.name}
          </span>
        ))}
      </div>
      {snapshot?.alerts.length ? <div className="alert-strip">{snapshot.alerts.length} alertas ativos</div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function metric(snapshot: DeviceSnapshot | undefined, key: string, Icon: typeof Cpu) {
  const value = snapshot?.metrics.find((item) => item.key === key);
  return (
    <div className="metric">
      <Icon size={15} />
      <span>{value ? `${value.value}${value.unit ?? ""}` : "n/a"}</span>
    </div>
  );
}

function iconFor(type: string) {
  switch (type) {
    case "firewall":
      return Shield;
    case "router":
      return Router;
    case "radio":
      return Radio;
    case "server":
      return Server;
    default:
      return Workflow;
  }
}
