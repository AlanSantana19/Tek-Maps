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
    showIp?: boolean;
    statusItemKey?: string;
    onlineValue?: string;
    offlineValue?: string;
    customIconUrl?: string;
    snapshot?: DeviceSnapshot;
    handles?: string[];
    directStatus?: "up" | "down" | "unknown";
  };
}

const INVISIBLE_HANDLE: CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  left: "50%",
  transform: "translate(-50%, -50%)",
};

export function DeviceNode({ data }: DeviceNodeProps) {
  const snapshot = data.snapshot;
  const iconSize = data.iconSize ?? 48;
  const labelFontSize = data.labelFontSize ?? 12;
  const labelPosition = data.labelPosition ?? "below";
  const showBackground = data.showBackground ?? true;
  const status = data.directStatus ?? statusFor(data, snapshot);
  const clampedSize = Math.max(16, Math.min(iconSize, 128));
  const style = { "--node-icon-size": `${clampedSize}px` } as CSSProperties;

  const showStatus = data.deviceType !== "cloud";
  const handleStyle: CSSProperties = { ...INVISIBLE_HANDLE, top: "50%" };

  return (
    <div className={`device-node topology-symbol ${showStatus ? status : ""} ${showBackground ? "" : "no-background"} label-${labelPosition}`} style={style}>
      <Handle type="target" position={Position.Left} id="center" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="center" style={handleStyle} />
      <div className={`topology-icon-wrap ${shapeFor(data.deviceType)} ${data.customIconUrl ? "" : iconToneFor(data.deviceType)}`}>
        {data.customIconUrl
          ? <img src={data.customIconUrl} alt={data.label} className="custom-icon-img" />
          : <TopologyGlyph type={data.deviceType} />}
        {showStatus && <span className={`topology-status ${status}`} />}
      </div>
      <div className="topology-label" style={{ fontSize: `${labelFontSize}px` }}>
        <strong>{data.label}</strong>
      </div>
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
    case "lte":
      return <LteDiagramGlyph />;
    case "olt":
      return <OltDiagramGlyph />;
    case "onu":
      return <OnuDiagramGlyph />;
    case "cloud":
      return <CloudDiagramGlyph />;
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

function LteDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 60" aria-hidden="true" className="diagram-glyph lte-glyph">
      {/* directional antenna panels */}
      <rect className="glyph-body" x="22" y="4" width="10" height="18" rx="2.5" />
      <rect className="glyph-body" x="35" y="4" width="10" height="18" rx="2.5" />
      <rect className="glyph-body" x="48" y="4" width="10" height="18" rx="2.5" />
      {/* panel detail marks */}
      <path className="glyph-mark" d="M24 10h6M24 16h6" />
      <path className="glyph-mark" d="M37 10h6M37 16h6" />
      <path className="glyph-mark" d="M50 10h6M50 16h6" />
      {/* mast */}
      <path className="glyph-body-stroke" d="M40 22 V44" />
      {/* crossbar */}
      <path className="glyph-mark" d="M28 30h24" />
      {/* base struts */}
      <path className="glyph-body-stroke" d="M40 44 L26 54 M40 44 L54 54" />
      <path className="glyph-mark" d="M22 54h36" />
      {/* signal arcs left */}
      <path className="glyph-body-stroke" d="M18 8 Q10 13 18 18" />
      {/* signal arcs right */}
      <path className="glyph-body-stroke" d="M62 8 Q70 13 62 18" />
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

function OltDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 60" aria-hidden="true" className="diagram-glyph olt-glyph">
      {/* chassis */}
      <rect className="glyph-body" x="4" y="4" width="72" height="20" rx="2.5" />
      {/* 4 SFP port slots */}
      <rect className="glyph-mark" x="8" y="8" width="9" height="8" rx="1.5" />
      <rect className="glyph-mark" x="21" y="8" width="9" height="8" rx="1.5" />
      <rect className="glyph-mark" x="34" y="8" width="9" height="8" rx="1.5" />
      <rect className="glyph-mark" x="47" y="8" width="9" height="8" rx="1.5" />
      {/* model label bar */}
      <path className="glyph-mark" d="M8 19h48" />
      {/* status LEDs */}
      <circle className="glyph-dot" cx="63" cy="10" r="2.5" />
      <circle className="glyph-dot" cx="71" cy="10" r="2.5" />
      <circle className="glyph-dot" cx="63" cy="18" r="2.5" />
      <circle className="glyph-dot" cx="71" cy="18" r="2.5" />
      {/* PON downlink trunk */}
      <path className="glyph-body-stroke" d="M40 24 L40 30" />
      {/* 1:2 split */}
      <path className="glyph-body-stroke" d="M20 38 L40 30 L60 38" />
      {/* second-level 1:2 splits */}
      <path className="glyph-body-stroke" d="M12 50 L20 38 L28 50" />
      <path className="glyph-body-stroke" d="M52 50 L60 38 L68 50" />
      {/* ONT endpoints */}
      <circle className="glyph-body" cx="12" cy="50" r="4" />
      <circle className="glyph-body" cx="28" cy="50" r="4" />
      <circle className="glyph-body" cx="52" cy="50" r="4" />
      <circle className="glyph-body" cx="68" cy="50" r="4" />
    </svg>
  );
}

function OnuDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph onu-glyph">
      <rect className="glyph-body" x="22" y="16" width="36" height="24" rx="4" />
      <path className="glyph-mark" d="M30 28h20" />
      <circle className="glyph-dot" cx="44" cy="22" r="2.5" />
      <path className="glyph-body-stroke" d="M40 40v8M32 48h16" />
    </svg>
  );
}

function CloudDiagramGlyph() {
  return (
    <svg viewBox="0 0 80 56" aria-hidden="true" className="diagram-glyph cloud-glyph">
      {/* cloud silhouette */}
      <path className="glyph-body" d="M18 44 Q8 44 8 34 Q8 26 16 24 Q16 12 28 12 Q32 4 44 10 Q50 4 58 10 Q70 12 68 24 Q76 26 74 36 Q72 44 62 44 Z" />
      {/* network lines inside cloud */}
      <path className="glyph-mark" d="M28 30h24M40 22v16" />
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
    case "lte":
      return "icon-lte";
    case "olt":
      return "icon-olt";
    case "onu":
      return "icon-onu";
    case "cloud":
      return "icon-cloud";
    default:
      return "icon-network";
  }
}
