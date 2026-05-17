import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { createContext, useContext } from "react";
import type { DeviceSnapshot } from "../types";

export type CableType = "fiber" | "utp" | "radio" | "wireless" | "vpn" | "other";

const CABLE_TYPE_LABELS: Record<CableType, string> = {
  fiber:    "Fibra",
  utp:      "UTP",
  radio:    "Rádio",
  wireless: "Wireless",
  vpn:      "VPN",
  other:    "Outro",
};

export type LinkEdgePayload = {
  sourceHostId?: string;
  targetHostId?: string;
  sourceOutInterface?: string;
  targetInInterface?: string;
  sourceInterfaceName?: string;
  targetInterfaceName?: string;
  sourceInterfaceAlias?: string;
  targetInterfaceAlias?: string;
  cableType?: CableType;
  color?: string;
  strokeWidth?: number;
  lineStyle?: "solid" | "dashed" | "dotted" | "dashdot";
  showTraffic?: boolean;
  showLabel?: boolean;
};

export const SnapshotsContext = createContext<Map<string, DeviceSnapshot>>(new Map());


export function LinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data: rawData,
  style,
  markerEnd,
  selected
}: EdgeProps) {
  const data = rawData as LinkEdgePayload | undefined;
  const snapshots = useContext(SnapshotsContext);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const configuredColor = data?.color ?? "#9ca3af";
  const strokeWidth     = data?.strokeWidth ?? 2;
  const showTraffic     = data?.showTraffic ?? true;
  const configuredDash  = data?.lineStyle === "dashed"  ? "8 6"
                        : data?.lineStyle === "dotted"  ? "2 4"
                        : data?.lineStyle === "dashdot" ? "12 4 2 4"
                        : undefined;

  const sourceSnapshot = data?.sourceHostId ? snapshots.get(data.sourceHostId) : undefined;
  const sourcePort = data?.sourceOutInterface
    ? sourceSnapshot?.ports.find((p) => p.id === data.sourceOutInterface)
    : undefined;

  const txBps = sourcePort?.outBps ?? 0;
  const rxBps = sourcePort?.inBps ?? 0;
  const hasInterfaces    = Boolean(data?.sourceOutInterface);
  const hasActiveTraffic = hasInterfaces && (txBps > 0 || rxBps > 0);
  const isDown           = sourcePort ? sourcePort.operStatus === "down" : false;

  const strokeColor = isDown ? "#ef4444" : configuredColor;
  const strokeDash  = isDown ? "8 5"     : configuredDash;

  const totalBps = txBps + rxBps;
  const animDur = totalBps >= 1e9 ? "0.6s"
                : totalBps >= 1e8 ? "1s"
                : totalBps >= 1e7 ? "1.5s"
                : totalBps >= 1e6 ? "2s"
                : "3s";

  const cableTypeLabel = data?.cableType ? CABLE_TYPE_LABELS[data.cableType] : undefined;
  const sourceIfName   = data?.sourceInterfaceName
    ?? (data?.sourceOutInterface ? `if-${data.sourceOutInterface}` : undefined);

  const edgeStyle = {
    ...style,
    stroke: selected ? "#60a5fa" : strokeColor,
    strokeWidth,
    strokeDasharray: strokeDash,
    opacity: isDown ? 0.75 : 1,
  };

  const pulsePathId = `pulse-path-${id}`;

  const badgeW = 76;

  const tooltipText = [
    cableTypeLabel   ? `Tipo: ${cableTypeLabel}` : null,
    sourceIfName     ? `Interface: ${sourceIfName}${data?.sourceInterfaceAlias ? ` (${data.sourceInterfaceAlias})` : ""}` : null,
    `Status: ${isDown ? "DOWN" : (sourcePort?.operStatus ?? "desconhecido")}`,
    `TX: ${formatBps(txBps)}`,
    `RX: ${formatBps(rxBps)}`,
  ].filter(Boolean).join("\n");

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />

      {/* Invisible path used as mpath target for animateMotion */}
      <path
        id={pulsePathId}
        d={edgePath}
        fill="none"
        stroke="none"
        strokeWidth={0}
        style={{ pointerEvents: "none" }}
      />

      {/* Animated pulse dot (source → target) */}
      {showTraffic && hasActiveTraffic && !isDown ? (
        <g>
          <circle r={strokeWidth + 5} fill={strokeColor} opacity={0.18}>
            <animateMotion dur={animDur} repeatCount="indefinite">
              <mpath href={`#${pulsePathId}`} />
            </animateMotion>
          </circle>
          <circle
            r={strokeWidth + 2}
            fill={strokeColor}
            style={{ filter: `drop-shadow(0 0 ${strokeWidth + 2}px ${strokeColor})` }}
          >
            <animateMotion dur={animDur} repeatCount="indefinite">
              <mpath href={`#${pulsePathId}`} />
            </animateMotion>
          </circle>
        </g>
      ) : null}

      {/* TX/RX badge — EdgeLabelRenderer renders in HTML space, tracks cable at any zoom/pan/drag */}
      {showTraffic && hasInterfaces ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            title={tooltipText}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              cursor: "default",
              background: isDown ? "#1a0808" : "#0c0f14",
              border: `1px solid ${isDown ? "#ef4444" : "#273244"}`,
              borderRadius: 4,
              padding: "3px 8px",
              minWidth: badgeW,
              textAlign: "center",
              userSelect: "none",
              lineHeight: 1.4,
              ...(isDown
                ? { filter: "drop-shadow(0 0 4px rgba(239,68,68,0.35))" }
                : { boxShadow: "0 1px 5px rgba(0,0,0,.5)" }),
            }}
          >
            {isDown ? (
              <span style={{ color: "#ef4444", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em" }}>
                DOWN
              </span>
            ) : (
              <>
                {cableTypeLabel ? (
                  <div style={{ color: "#fff", fontSize: 8, fontWeight: 700, letterSpacing: "0.04em" }}>
                    {cableTypeLabel}
                  </div>
                ) : null}
                <div style={{ color: "#34d399", fontSize: 10, fontWeight: 600 }}>
                  TX: {formatBps(txBps)}
                </div>
                <div style={{ color: "#60a5fa", fontSize: 10, fontWeight: 600 }}>
                  RX: {formatBps(rxBps)}
                </div>
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function formatBps(bps: number): string {
  if (bps === 0) return "--";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} Kbps`;
  return `${Math.round(bps)} bps`;
}
