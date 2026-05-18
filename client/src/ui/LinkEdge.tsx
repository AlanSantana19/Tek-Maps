import { BaseEdge, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { createContext, useContext, useState } from "react";
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
  badgeFontSize?: number;
  showTraffic?: boolean;
  showLabel?: boolean;
  waypointDX?: number;
  waypointDY?: number;
  showSignal?: boolean;
  signalLabel?: string;
  signalTxMetricKey?: string;
  signalRxMetricKey?: string;
  signalHostId?: string;
};

export const SnapshotsContext = createContext<Map<string, DeviceSnapshot>>(new Map());

export function LinkEdge({
  id,
  source: _source,
  target: _target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data: rawData,
  style,
  markerEnd,
  selected
}: EdgeProps) {
  const data = rawData as LinkEdgePayload | undefined;
  const snapshots = useContext(SnapshotsContext);
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [tooltipAbove, setTooltipAbove] = useState(true);

  const waypointDX = data?.waypointDX ?? 0;
  const waypointDY = data?.waypointDY ?? 0;

  // Midpoint + user offset
  const wpX = (sourceX + targetX) / 2 + waypointDX;
  const wpY = (sourceY + targetY) / 2 + waypointDY;

  // Quadratic bezier control point so the curve passes through wpX/wpY at t=0.5
  const cpX = 2 * wpX - 0.5 * sourceX - 0.5 * targetX;
  const cpY = 2 * wpY - 0.5 * sourceY - 0.5 * targetY;

  const edgePath = `M ${sourceX} ${sourceY} Q ${cpX} ${cpY} ${targetX} ${targetY}`;

  const configuredColor = data?.color ?? "#9ca3af";
  const strokeWidth     = data?.strokeWidth ?? 2;
  const showTraffic     = data?.showTraffic ?? true;
  const badgeFontSize   = Math.min(24, Math.max(8, data?.badgeFontSize ?? 10));
  const configuredDash  = data?.lineStyle === "dashed"  ? "8 6"
                        : data?.lineStyle === "dotted"  ? "2 4"
                        : data?.lineStyle === "dashdot" ? "12 4 2 4"
                        : undefined;

  const sourceSnapshot = data?.sourceHostId ? snapshots.get(data.sourceHostId) : undefined;
  const sourcePort = data?.sourceOutInterface
    ? sourceSnapshot?.ports.find((p) => p.id === data!.sourceOutInterface)
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

  const showSignal = data?.showSignal ?? false;
  const signalLabel = data?.signalLabel;
  const signalHostId = data?.signalHostId ?? data?.sourceHostId;
  const signalMetrics = signalHostId ? (snapshots.get(signalHostId)?.metrics ?? []) : [];
  const signalTxItem = data?.signalTxMetricKey ? signalMetrics.find((m) => m.key === data!.signalTxMetricKey) : undefined;
  const signalRxItem = data?.signalRxMetricKey ? signalMetrics.find((m) => m.key === data!.signalRxMetricKey) : undefined;

  const hasSignalData = showSignal && (!!signalTxItem || !!signalRxItem);
  const showBadge     = showTraffic && hasInterfaces;

  const cableTypeLabel = (data?.showLabel ?? true) && data?.cableType ? CABLE_TYPE_LABELS[data.cableType] : undefined;
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

  function handleBadgeMouseEnter(e: React.MouseEvent) {
    setHovered(true);
    setTooltipAbove(e.clientY > 140);
  }

  function startWaypointDrag(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const newDX = flowPos.x - (sourceX + targetX) / 2;
      const newDY = flowPos.y - (sourceY + targetY) / 2;
      setEdges((edges) =>
        edges.map((edge) =>
          edge.id === id
            ? { ...edge, data: { ...(edge.data as object), waypointDX: newDX, waypointDY: newDY } }
            : edge
        )
      );
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function resetWaypoint(e: React.MouseEvent) {
    e.stopPropagation();
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === id
          ? { ...edge, data: { ...(edge.data as object), waypointDX: 0, waypointDY: 0 } }
          : edge
      )
    );
  }

  const showWaypointHandle = selected || waypointDX !== 0 || waypointDY !== 0;

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

      <EdgeLabelRenderer>
        {/* Draggable waypoint handle — shown when edge is selected or already offset */}
        {showWaypointHandle ? (
          <div
            className="nodrag nopan edge-waypoint-handle"
            onMouseDown={startWaypointDrag}
            onDoubleClick={resetWaypoint}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${wpX}px, ${wpY}px)`,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#1e293b",
              border: "2px solid #60a5fa",
              cursor: "grab",
              pointerEvents: "all",
              boxShadow: "0 0 6px rgba(96,165,250,0.5)",
              zIndex: 10,
            }}
            title="Arraste para curvar o cabo. Duplo clique para resetar."
          />
        ) : null}

        {/* TX/RX + Signal badge */}
        {showBadge ? (
          <div
            className="nodrag nopan"
            onMouseEnter={handleBadgeMouseEnter}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${wpX}px, ${wpY}px)`,
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
              <span style={{ color: "#ef4444", fontSize: Math.round(badgeFontSize * 1.1), fontWeight: 800, letterSpacing: "0.08em" }}>
                DOWN
              </span>
            ) : (
              <>
                {cableTypeLabel ? (
                  <div style={{ color: "#fff", fontSize: Math.round(badgeFontSize * 0.8), fontWeight: 700, letterSpacing: "0.04em" }}>
                    {cableTypeLabel}
                  </div>
                ) : null}
                <div style={{ color: "#34d399", fontSize: badgeFontSize, fontWeight: 600 }}>
                  TX: {formatBps(txBps)}
                </div>
                <div style={{ color: "#60a5fa", fontSize: badgeFontSize, fontWeight: 600 }}>
                  RX: {formatBps(rxBps)}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Hover tooltip */}
        {(showBadge || hasSignalData) && hovered ? (
          <div
            className="edge-tooltip"
            style={{
              position: "absolute",
              transform: `translate(-50%, ${tooltipAbove ? "calc(-100% - 10px)" : "10px"}) translate(${wpX}px, ${wpY}px)`,
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            {cableTypeLabel && (
              <div className="edge-tooltip-title">{cableTypeLabel}</div>
            )}
            {hasInterfaces && (
              <>
                <div className="edge-tooltip-row">
                  <span className="edge-tooltip-label">Status</span>
                  <span className={`edge-tooltip-value ${isDown ? "edge-tooltip-down" : "edge-tooltip-up"}`}>
                    {isDown ? "DOWN" : (sourcePort?.operStatus ?? "desconhecido")}
                  </span>
                </div>
                <div className="edge-tooltip-row">
                  <span className="edge-tooltip-label edge-tooltip-tx">TX</span>
                  <span className="edge-tooltip-value">{formatBps(txBps)}</span>
                </div>
                <div className="edge-tooltip-row">
                  <span className="edge-tooltip-label edge-tooltip-rx">RX</span>
                  <span className="edge-tooltip-value">{formatBps(rxBps)}</span>
                </div>
              </>
            )}
            {hasSignalData ? (
              <>
                {hasInterfaces && <div className="edge-tooltip-divider" />}
                {signalLabel && <div className="edge-tooltip-title">{signalLabel}</div>}
                {signalTxItem && (
                  <div className="edge-tooltip-row">
                    <span className="edge-tooltip-label edge-tooltip-tx">Sinal TX</span>
                    <span className="edge-tooltip-value">
                      {String(signalTxItem.value)}{signalTxItem.unit ? ` ${signalTxItem.unit}` : ""}
                    </span>
                  </div>
                )}
                {signalRxItem && (
                  <div className="edge-tooltip-row">
                    <span className="edge-tooltip-label edge-tooltip-rx">Sinal RX</span>
                    <span className="edge-tooltip-value">
                      {String(signalRxItem.value)}{signalRxItem.unit ? ` ${signalRxItem.unit}` : ""}
                    </span>
                  </div>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </EdgeLabelRenderer>
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
