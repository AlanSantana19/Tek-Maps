import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import type { DeviceSnapshot } from "../types";

export type CableType = "fiber" | "utp" | "radio";

const CABLE_TYPE_LABELS: Record<CableType, string> = {
  fiber: "Fibra",
  utp:   "UTP",
  radio: "Rádio",
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
  lineStyle?: "solid" | "dashed";
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

  // Ref to the invisible measure path — used for getTotalLength/getPointAtLength
  const measureRef = useRef<SVGPathElement>(null);

  // True midpoint of the real SVG path — initialised from getSmoothStepPath estimate
  const [midX, setMidX] = useState(labelX);
  const [midY, setMidY] = useState(labelY);

  // Fires synchronously before paint so the label jumps directly to the right place
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    if (len <= 0) return;
    const pt = el.getPointAtLength(len / 2);
    setMidX(pt.x);
    setMidY(pt.y);
  }, [edgePath]); // recalculate every time the path changes

  const configuredColor = data?.color ?? "#9ca3af";
  const strokeWidth     = data?.strokeWidth ?? 2;
  const showTraffic     = data?.showTraffic ?? true;
  const configuredDash  = data?.lineStyle === "dashed" ? "8 6" : undefined;

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

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />

      {/*
        Invisible path — same d as the cable.
        measureRef reads its true length/midpoint.
        pulsePathId lets animateMotion reference it.
      */}
      <path
        ref={measureRef}
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

      {/* TX / RX badge — positioned at the true SVG path midpoint */}
      <EdgeLabelRenderer>
        {showTraffic && hasInterfaces ? (
          <div
            className={`link-edge-label link-edge-traffic nodrag nopan${isDown ? " link-edge-down" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)` }}
          >
            {isDown ? (
              <span className="link-down-text">DOWN</span>
            ) : (
              <>
                {cableTypeLabel ? (
                  <span className="cable-type-badge" style={{ background: strokeColor }}>
                    {cableTypeLabel}
                  </span>
                ) : null}
                <span className="link-traffic-tx">TX: {formatBps(txBps)}</span>
                <span className="link-traffic-rx">RX: {formatBps(rxBps)}</span>
              </>
            )}

            <div className="link-edge-tooltip">
              {cableTypeLabel ? (
                <div className="tooltip-row">
                  <span><strong>Tipo:</strong> {cableTypeLabel}</span>
                </div>
              ) : null}
              {sourceIfName ? (
                <div className="tooltip-row">
                  <span>
                    <strong>Interface:</strong> {sourceIfName}
                    {data?.sourceInterfaceAlias ? ` (${data.sourceInterfaceAlias})` : ""}
                  </span>
                </div>
              ) : null}
              <div className="tooltip-row">
                <span><strong>Status:</strong> {isDown ? "DOWN" : (sourcePort?.operStatus ?? "desconhecido")}</span>
              </div>
              <div className="tooltip-row">
                <span><strong>TX:</strong> {formatBps(txBps)}</span>
                <span><strong>RX:</strong> {formatBps(rxBps)}</span>
              </div>
            </div>
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
