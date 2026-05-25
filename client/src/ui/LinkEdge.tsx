import { BaseEdge, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { createContext, useContext, useState } from "react";
import type { DeviceSnapshot } from "../types";

export type CableType = "fiber" | "utp" | "radio" | "wireless" | "vpn" | "other" | "signal";

const CABLE_TYPE_LABELS: Record<CableType, string> = {
  fiber:    "Fibra",
  utp:      "UTP",
  radio:    "Rádio",
  wireless: "Wireless",
  vpn:      "VPN",
  other:    "Outro",
  signal:   "Sinal de Rádio",
};

function generateWavePath(x1: number, y1: number, x2: number, y2: number, amplitude = 8): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 2) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const amp = Math.min(amplitude, len * 0.12);
  const halfCycleLen = 20;
  let n = Math.max(2, Math.round(len / halfCycleLen));
  if (n % 2 !== 0) n += 1;

  let d = `M ${x1} ${y1}`;
  for (let i = 0; i < n; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const ex = x1 + dx * t1;
    const ey = y1 + dy * t1;
    const c1x = x1 + dx * (t0 + (t1 - t0) / 3) + px * sign * amp;
    const c1y = y1 + dy * (t0 + (t1 - t0) / 3) + py * sign * amp;
    const c2x = x1 + dx * (t0 + 2 * (t1 - t0) / 3) + px * sign * amp;
    const c2y = y1 + dy * (t0 + 2 * (t1 - t0) / 3) + py * sign * amp;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
  }
  return d;
}

export type Waypoint = { x: number; y: number };

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
  routing?: "straight" | "malleable" | "wave";
  waypointDX?: number;
  waypointDY?: number;
  showSignal?: boolean;
  signalLabel?: string;
  signalTxMetricKey?: string;
  signalRxMetricKey?: string;
  signalHostId?: string;
  showRadioSignal?: boolean;
  radioSignalLabel?: string;
  radioSignalHostId?: string;
  radioSignalMetricKey?: string;
  linkRole?: "primary" | "backup";
  showLinkRole?: boolean;
  bandwidthLimit?: number;
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
  selected,
}: EdgeProps) {
  const data = rawData as LinkEdgePayload | undefined;
  const snapshots = useContext(SnapshotsContext);
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [tooltipAbove, setTooltipAbove] = useState(true);

  const routing = data?.routing;
  const waypointDX = data?.waypointDX ?? 0;
  const waypointDY = data?.waypointDY ?? 0;

  // ── Path & badge position ──────────────────────────────────────────────────
  let edgePath: string;
  let badgeX: number;
  let badgeY: number;

  if (routing === "malleable") {
    const foldX = (sourceX + targetX) / 2 + waypointDX;
    edgePath = `M ${sourceX} ${sourceY} L ${foldX} ${sourceY} L ${foldX} ${targetY} L ${targetX} ${targetY}`;
    badgeX = foldX;
    badgeY = (sourceY + targetY) / 2;
  } else if (routing === "wave") {
    edgePath = generateWavePath(sourceX, sourceY, targetX, targetY);
    badgeX = (sourceX + targetX) / 2;
    badgeY = (sourceY + targetY) / 2;
  } else {
    edgePath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    badgeX = (sourceX + targetX) / 2;
    badgeY = (sourceY + targetY) / 2;
  }

  // ── Style ──────────────────────────────────────────────────────────────────
  const configuredColor = data?.color ?? "#9ca3af";
  const strokeWidth     = data?.strokeWidth ?? 2;
  const showTraffic     = data?.showTraffic ?? true;
  const badgeFontSize   = Math.min(24, Math.max(8, data?.badgeFontSize ?? 10));
  const configuredDash  = routing === "wave" ? undefined
                        : data?.lineStyle === "dashed"  ? "8 6"
                        : data?.lineStyle === "dotted"  ? "2 4"
                        : data?.lineStyle === "dashdot" ? "12 4 2 4"
                        : undefined;

  // ── Traffic ────────────────────────────────────────────────────────────────
  const sourceSnapshot = data?.sourceHostId ? snapshots.get(data.sourceHostId) : undefined;
  const sourcePort = data?.sourceOutInterface
    ? sourceSnapshot?.ports.find((p) => p.id === data!.sourceOutInterface)
    : undefined;

  const txBps = sourcePort?.outBps ?? 0;
  const rxBps = sourcePort?.inBps ?? 0;
  const hasInterfaces    = Boolean(data?.sourceOutInterface);
  const hasActiveTraffic = hasInterfaces && (txBps > 0 || rxBps > 0);
  const isDown           = sourcePort ? sourcePort.operStatus === "down" : false;

  // ── Bandwidth threshold ─────────────────────────────────────────────────────
  const bandwidthLimitBps = data?.bandwidthLimit ? data.bandwidthLimit * 1e6 : 0;
  const peakBps           = Math.max(txBps, rxBps);
  const utilizationPct    = bandwidthLimitBps > 0 && hasInterfaces ? (peakBps / bandwidthLimitBps) * 100 : 0;
  const bwCritical        = utilizationPct >= 100;
  const bwWarning         = utilizationPct >= 80 && !bwCritical;
  const bwThresholdColor  = bwCritical ? "#ef4444" : bwWarning ? "#f59e0b" : null;

  const strokeColor = isDown ? "#ef4444" : (bwThresholdColor ?? configuredColor);
  const strokeDash  = (isDown && routing !== "wave") ? "8 5" : configuredDash;

  const totalBps = txBps + rxBps;
  const animDur = totalBps >= 1e9 ? "0.6s"
                : totalBps >= 1e8 ? "1s"
                : totalBps >= 1e7 ? "1.5s"
                : totalBps >= 1e6 ? "2s"
                : "3s";

  // ── Signal ─────────────────────────────────────────────────────────────────
  const showSignal    = data?.showSignal ?? false;
  const signalLabel   = data?.signalLabel;
  const signalHostId  = data?.signalHostId ?? data?.sourceHostId;
  const signalMetrics = signalHostId ? (snapshots.get(signalHostId)?.metrics ?? []) : [];
  const signalTxItem  = data?.signalTxMetricKey ? signalMetrics.find((m) => m.key === data!.signalTxMetricKey) : undefined;
  const signalRxItem  = data?.signalRxMetricKey ? signalMetrics.find((m) => m.key === data!.signalRxMetricKey) : undefined;

  const hasSignalData  = showSignal && (!!signalTxItem || !!signalRxItem);

  // ── Radio Signal ────────────────────────────────────────────────────────────
  const showRadioSignal     = data?.showRadioSignal ?? false;
  const radioSignalLabel    = data?.radioSignalLabel;
  const radioSignalHostId   = data?.radioSignalHostId ?? data?.sourceHostId;
  const radioSignalMetrics  = radioSignalHostId ? (snapshots.get(radioSignalHostId)?.metrics ?? []) : [];
  const radioSignalItem     = data?.radioSignalMetricKey ? radioSignalMetrics.find((m) => m.key === data!.radioSignalMetricKey) : undefined;
  const hasRadioSignalData  = showRadioSignal && !!radioSignalItem;
  const showBadge      = showTraffic && hasInterfaces;
  const isMaleavel     = routing === "malleable";
  const isWave         = routing === "wave";
  const tracadoLabel   = isWave ? "Onda" : isMaleavel ? "Maleável/Dobrável" : "Reto";
  const cableTypeLabel = (data?.showLabel ?? true) && data?.cableType ? CABLE_TYPE_LABELS[data.cableType] : undefined;

  const edgeStyle = {
    ...style,
    stroke: selected ? "#60a5fa" : strokeColor,
    strokeWidth,
    strokeDasharray: strokeDash,
    opacity: isDown ? 0.75 : 1,
  };

  const linkRole     = data?.linkRole;
  const showLinkRole = data?.showLinkRole ?? true;

  const pulsePathId = `pulse-path-${id}`;
  const badgeW = 76;

  // ── Waypoint drag (malleable and legacy cables) ────────────────────────────
  function startWaypointDrag(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const fp = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      const newDX = fp.x - (sourceX + targetX) / 2;
      setEdges((edges) =>
        edges.map((edge) =>
          edge.id === id
            ? { ...edge, data: { ...(edge.data as object), waypointDX: newDX, waypointDY: 0 } }
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

  // Show the drag handle for bendable cables when selected or already bent
  const showHandle = routing === "malleable" && (selected || waypointDX !== 0 || waypointDY !== 0);

  function handleBadgeMouseEnter(e: React.MouseEvent) {
    setHovered(true);
    setTooltipAbove(e.clientY > 140);
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />

      {/* Wide transparent hit area — makes the full cable length hoverable for the tooltip */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={handleBadgeMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "default" }}
      />

      {/* Invisible path used as mpath target for animateMotion */}
      <path
        id={pulsePathId}
        d={edgePath}
        fill="none"
        stroke="none"
        strokeWidth={0}
        style={{ pointerEvents: "none" }}
      />

      {/* Animated pulse dot */}
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
        {/* Waypoint drag handle — only for bendable cables */}
        {showHandle ? (
          <div
            className="nodrag nopan edge-waypoint-handle"
            onMouseDown={startWaypointDrag}
            onDoubleClick={resetWaypoint}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${badgeX}px, ${badgeY}px)`,
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

        {/* TX/RX badge, cable type label, or invisible hover zone */}
        <div
          className="nodrag nopan"
          onMouseEnter={handleBadgeMouseEnter}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${badgeX}px, ${badgeY}px)`,
            pointerEvents: "all",
            cursor: "default",
            userSelect: "none",
            zIndex: showBadge || cableTypeLabel ? 11 : 8,
            ...(showBadge || cableTypeLabel
              ? {
                  background: isDown
                    ? "#1a0808"
                    : bwCritical ? "#2d0808"
                    : bwWarning  ? "#2a1500"
                    : "#0c0f14",
                  border: `1px solid ${
                    isDown      ? "#ef4444"
                    : bwCritical ? "#ef4444"
                    : bwWarning  ? "#f59e0b"
                    : "#273244"
                  }`,
                  borderRadius: 4,
                  padding: "3px 8px",
                  minWidth: showBadge ? badgeW : "auto",
                  textAlign: "center" as const,
                  lineHeight: 1.4,
                  boxShadow: bwCritical
                    ? "0 0 6px rgba(239,68,68,0.4)"
                    : bwWarning
                    ? "0 0 6px rgba(245,158,11,0.35)"
                    : isDown
                    ? undefined
                    : "0 1px 5px rgba(0,0,0,.5)",
                  ...(isDown ? { filter: "drop-shadow(0 0 4px rgba(239,68,68,0.35))" } : {}),
                }
              : { width: 24, height: 24 }),
          }}
        >
          {isDown ? (
            <span
              style={{
                color: "#ef4444",
                fontSize: Math.round(badgeFontSize * 1.1),
                fontWeight: 800,
                letterSpacing: "0.08em",
              }}
            >
              DOWN
            </span>
          ) : (
            <>
              {cableTypeLabel ? (
                <div
                  style={{
                    color: bwThresholdColor ?? "#fff",
                    fontSize: Math.round(badgeFontSize * 0.8),
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  {cableTypeLabel}
                </div>
              ) : null}
              {showBadge && (
                <>
                  <div style={{ color: "#34d399", fontSize: badgeFontSize, fontWeight: 600 }}>
                    &#8594; {formatBps(txBps)}
                  </div>
                  <div style={{ color: "#60a5fa", fontSize: badgeFontSize, fontWeight: 600 }}>
                    &#8592; {formatBps(rxBps)}
                  </div>
                  {bandwidthLimitBps > 0 && (
                    <div style={{
                      color: bwThresholdColor ?? "#6b7280",
                      fontSize: Math.round(badgeFontSize * 0.8),
                      fontWeight: bwThresholdColor ? 700 : 500,
                      letterSpacing: "0.04em",
                    }}>
                      {Math.round(utilizationPct)}%
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Hover tooltip */}
        {hovered ? (
          <div
            className="edge-tooltip"
            style={{
              position: "absolute",
              transform: `translate(-50%, ${tooltipAbove ? "calc(-100% - 10px)" : "10px"}) translate(${badgeX}px, ${badgeY}px)`,
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            {data?.cableType && (
              <div className="edge-tooltip-row">
                <span className="edge-tooltip-label">Tipo</span>
                <span className="edge-tooltip-value">{CABLE_TYPE_LABELS[data.cableType]}</span>
              </div>
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
                  <span className="edge-tooltip-label edge-tooltip-tx">&#8594;</span>
                  <span className="edge-tooltip-value">{formatBps(txBps)}</span>
                </div>
                <div className="edge-tooltip-row">
                  <span className="edge-tooltip-label edge-tooltip-rx">&#8592;</span>
                  <span className="edge-tooltip-value">{formatBps(rxBps)}</span>
                </div>
                {bandwidthLimitBps > 0 && (
                  <div className="edge-tooltip-row">
                    <span className="edge-tooltip-label">Utilização</span>
                    <span
                      className="edge-tooltip-value"
                      style={{ color: bwThresholdColor ?? undefined, fontWeight: bwThresholdColor ? 700 : undefined }}
                    >
                      {Math.round(utilizationPct)}% de {data!.bandwidthLimit! >= 1000
                        ? `${data!.bandwidthLimit! / 1000} Gbps`
                        : `${data!.bandwidthLimit} Mbps`}
                    </span>
                  </div>
                )}
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
                      {String(signalTxItem.value)}
                      {signalTxItem.unit ? ` ${signalTxItem.unit}` : ""}
                    </span>
                  </div>
                )}
                {signalRxItem && (
                  <div className="edge-tooltip-row">
                    <span className="edge-tooltip-label edge-tooltip-rx">Sinal RX</span>
                    <span className="edge-tooltip-value">
                      {String(signalRxItem.value)}
                      {signalRxItem.unit ? ` ${signalRxItem.unit}` : ""}
                    </span>
                  </div>
                )}
              </>
            ) : null}
            {hasRadioSignalData ? (
              <>
                {(hasInterfaces || hasSignalData) && <div className="edge-tooltip-divider" />}
                {radioSignalLabel && <div className="edge-tooltip-title">{radioSignalLabel}</div>}
                <div className="edge-tooltip-row">
                  <span className="edge-tooltip-label" style={{ color: "#a855f7" }}>Rádio</span>
                  <span className="edge-tooltip-value">
                    {String(radioSignalItem!.value)}
                    {radioSignalItem!.unit ? ` ${radioSignalItem!.unit}` : ""}
                  </span>
                </div>
              </>
            ) : null}
            {(hasInterfaces || hasSignalData || hasRadioSignalData) && linkRole && <div className="edge-tooltip-divider" />}
            {linkRole && (
              <div className="edge-tooltip-row">
                <span className="edge-tooltip-label">Papel</span>
                <span
                  className="edge-tooltip-value"
                  style={{ color: linkRole === "primary" ? "#22c55e" : "#f59e0b", fontWeight: 700 }}
                >
                  {linkRole === "primary" ? "Principal" : "Backup"}
                </span>
              </div>
            )}
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
