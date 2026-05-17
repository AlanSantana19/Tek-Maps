import { Handle, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { DeviceSnapshot } from "../types";

interface DeviceNodeProps {
  data: {
    label: string;
    deviceType: string;
    iconSize?: number;
    labelFontSize?: number;
    labelPosition?: "above" | "below";
    showBackground?: boolean;
    statusItemKey?: string;
    onlineValue?: string;
    offlineValue?: string;
    customIconUrl?: string;
    snapshot?: DeviceSnapshot;
  };
}

export function DeviceNode({ data }: DeviceNodeProps) {
  const snapshot = data.snapshot;
  const iconSize = data.iconSize ?? 48;
  const labelFontSize = data.labelFontSize ?? 12;
  const labelPosition = data.labelPosition ?? "below";
  const showBackground = data.showBackground ?? true;
  const status = statusFor(data, snapshot);
  const style = { "--node-icon-size": `${Math.max(40, Math.min(iconSize, 96))}px` } as CSSProperties;

  return (
    <div className={`device-node topology-symbol ${status} ${showBackground ? "" : "no-background"} label-${labelPosition}`} style={style}>
      <Handle type="target" position={Position.Left} />
      <div className={`topology-icon-wrap ${shapeFor(data.deviceType)} ${data.customIconUrl ? "" : iconToneFor(data.deviceType)}`}>
        {data.customIconUrl
          ? <img src={data.customIconUrl} alt={data.label} className="custom-icon-img" />
          : <TopologyGlyph type={data.deviceType} />}
        <span className={`topology-status ${status}`} />
      </div>
      <div className="topology-label" style={{ fontSize: `${labelFontSize}px` }}>
        <strong>{data.label}</strong>
        {snapshot ? <span>{snapshot.hostName || snapshot.hostId}</span> : null}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function statusFor(data: DeviceNodeProps["data"], snapshot: DeviceSnapshot | undefined) {
  if (!snapshot || !data.statusItemKey) {
    return snapshot?.status ?? "unknown";
  }
  const value = valueFor(data.statusItemKey, snapshot);
  if (String(value) === String(data.onlineValue ?? "1")) return "up";
  if (String(value) === String(data.offlineValue ?? "2")) return "down";
  return snapshot.status;
}

function valueFor(key: string, snapshot: DeviceSnapshot) {
  if (key === "icmpping") {
    return snapshot.status === "up" ? 1 : 2;
  }
  if (key.startsWith("port:")) {
    const port = snapshot.ports.find((item) => item.id === key.slice(5));
    return port?.operStatus === "up" ? 1 : 2;
  }
  return snapshot.metrics.find((metricItem) => metricItem.key === key)?.value;
}

function shapeFor(_type: string) {
  return "diagram";
}

function TopologyGlyph({ type }: { type: string }) {
  switch (type) {
    case "firewall":
      return <FirewallDiagramGlyph />;
    case "router":
      return <RouterDiagramGlyph />;
    case "radio":
      return <RadioDiagramGlyph />;
    case "server":
      return <ServerDiagramGlyph />;
    case "switch":
      return <SwitchDiagramGlyph />;
    default:
      return <NetworkDiagramGlyph />;
  }
}

function RouterDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph router-glyph">
      <circle className="glyph-body" cx="40" cy="28" r="22" />
      {/* full cross through center */}
      <path className="glyph-mark" d="M40 6v44M18 28h44" />
      {/* arrowheads at cardinal edges */}
      <path className="glyph-mark" d="M36 10l4-4 4 4" />
      <path className="glyph-mark" d="M58 24l4 4-4 4" />
      <path className="glyph-mark" d="M36 46l4 4 4-4" />
      <path className="glyph-mark" d="M22 24l-4 4 4 4" />
    </svg>
  );
}

function SwitchDiagramGlyph() {
  return (
    <svg viewBox="0 0 96 56" aria-hidden="true" className="diagram-glyph switch-glyph">
      <rect className="glyph-body" x="4" y="12" width="88" height="30" rx="4" />
      {/* right-pointing arrow */}
      <path className="glyph-mark" d="M14 22h38M52 17l8 5-8 5" />
      {/* left-pointing arrow */}
      <path className="glyph-mark" d="M82 32H44M44 27l-8 5 8 5" />
      {/* port openings */}
      <path className="glyph-mark" d="M12 38h8M26 38h8M40 38h8M54 38h8M68 38h8M80 38h8" />
    </svg>
  );
}

function FirewallDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph firewall-glyph">
      <rect className="glyph-body" x="10" y="10" width="60" height="36" rx="2" />
      {/* horizontal course lines */}
      <path className="glyph-mark" d="M10 22h60M10 34h60" />
      {/* top course brick joints */}
      <path className="glyph-mark" d="M30 10v12M50 10v12" />
      {/* middle course brick joints (staggered) */}
      <path className="glyph-mark" d="M20 22v12M40 22v12M60 22v12" />
      {/* bottom course brick joints */}
      <path className="glyph-mark" d="M30 34v12M50 34v12" />
    </svg>
  );
}

function RadioDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph radio-glyph">
      {/* radiating arcs (large → small, drawn behind mast) */}
      <path className="glyph-body-stroke" d="M16 24C16 6 64 6 64 24" />
      <path className="glyph-body-stroke" d="M25 29C25 17 55 17 55 29" />
      {/* mast and base */}
      <path className="glyph-body-stroke" d="M40 50V22M28 50h24" />
      {/* transmitter point */}
      <circle className="glyph-body" cx="40" cy="22" r="4" />
    </svg>
  );
}

function ServerDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph server-glyph">
      <rect className="glyph-body" x="16" y="4" width="48" height="48" rx="3" />
      {/* rack unit dividers */}
      <path className="glyph-mark" d="M16 20h48M16 36h48" />
      {/* drive/label slots */}
      <path className="glyph-mark" d="M22 12h20M22 28h20M22 44h20" />
      {/* status LEDs */}
      <circle className="glyph-dot" cx="53" cy="12" r="3" />
      <circle className="glyph-dot" cx="53" cy="28" r="3" />
      <circle className="glyph-dot" cx="53" cy="44" r="3" />
    </svg>
  );
}

function NetworkDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph network-glyph">
      <circle className="glyph-body" cx="40" cy="14" r="7" />
      <circle className="glyph-body" cx="22" cy="40" r="7" />
      <circle className="glyph-body" cx="58" cy="40" r="7" />
      <path className="glyph-mark" d="M36 20L26 34M44 20l10 14M29 40h22" />
    </svg>
  );
}

function iconToneFor(type: string) {
  switch (type) {
    case "router":
      return "icon-router";
    case "switch":
      return "icon-switch";
    case "firewall":
      return "icon-firewall";
    case "radio":
      return "icon-radio";
    case "server":
      return "icon-server";
    default:
      return "icon-network";
  }
}
