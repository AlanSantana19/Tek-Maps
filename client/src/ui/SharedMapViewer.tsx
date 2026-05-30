import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Maximize2, Minimize2, MapIcon } from "lucide-react";
import { getSharedTopology, getSharedStatus } from "../api";
import type { SharedEdgeStatus } from "../api";
import type { CustomIcon, MapShareLink, Topology } from "../types";
import { DeviceNode } from "./DeviceNode";
import { LinkEdge, SnapshotsContext } from "./LinkEdge";

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };
const EMPTY_SNAPSHOTS = new Map();
const STATUS_POLL_MS = 10_000;

// Topologia sanitizada — sem hostId, zabbixServerId, itemIds, metricKeys
type PublicNode = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  iconSize?: number;
  labelFontSize?: number;
  labelPosition?: "above" | "below";
  color?: string;
  showBackground?: boolean;
  showIp?: boolean;
  customIconId?: string;
  handles?: string[];
};

type SharedFlowNode = Node<{
  label: string;
  deviceType: string;
  iconSize?: number;
  labelFontSize?: number;
  labelPosition?: "above" | "below";
  color?: string;
  showBackground?: boolean;
  showIp?: boolean;
  customIconId?: string;
  customIconUrl?: string;
  directStatus?: "up" | "down" | "unknown";
  handles?: string[];
}, "device">;

function toFlowNode(node: PublicNode, iconById: Map<string, string>, statusById: Map<string, string>): SharedFlowNode {
  const rawStatus = statusById.get(node.id);
  const directStatus = rawStatus === "up" ? "up" : rawStatus === "down" ? "down" : "unknown";
  return {
    id: node.id,
    type: "device",
    position: node.position,
    data: {
      label: node.label,
      deviceType: node.type,
      iconSize: node.iconSize,
      labelFontSize: node.labelFontSize,
      labelPosition: node.labelPosition,
      color: node.color,
      showBackground: node.showBackground,
      showIp: false, // nunca exibe IP em link público
      customIconId: node.customIconId,
      customIconUrl: node.customIconId ? iconById.get(node.customIconId) : undefined,
      directStatus,
      handles: node.handles
    }
  };
}

function toFlowEdge(edge: Topology["edges"][number], edgeStatus?: SharedEdgeStatus): Edge {
  const data = {
    color: edge.color ?? "#9ca3af",
    strokeWidth: edge.strokeWidth ?? 2,
    lineStyle: edge.lineStyle ?? "solid",
    showTraffic: edgeStatus !== undefined,
    showLabel: edge.showLabel,
    cableType: edge.cableType,
    routing: edge.routing,
    waypointDX: edge.waypointDX,
    waypointDY: edge.waypointDY,
    showSignal: edge.showSignal,
    signalLabel: edge.signalLabel,
    showRadioSignal: edge.showRadioSignal,
    radioSignalLabel: edge.radioSignalLabel,
    bandwidthLimit: edge.bandwidthLimit,
    sourceInterfaceName: edge.sourceInterfaceName,
    targetInterfaceName: edge.targetInterfaceName,
    sourceInterfaceAlias: edge.sourceInterfaceAlias,
    targetInterfaceAlias: edge.targetInterfaceAlias,
    // Valores pré-calculados pelo servidor — sem expor IDs internos
    precomputedTxBps: edgeStatus?.txBps,
    precomputedRxBps: edgeStatus?.rxBps,
    precomputedIsDown: edgeStatus?.isDown
  };
  return {
    id: edge.id,
    type: "link",
    source: edge.source,
    target: edge.target,
    label: undefined,
    data,
    animated: false,
    style: { stroke: data.color, strokeWidth: data.strokeWidth }
  };
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Nunca expira";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function SharedMapViewer({ token }: { token: string }) {
  const [topology, setTopology] = useState<{ nodes: PublicNode[]; edges: Topology["edges"]; name: string; showGrid?: boolean } | null>(null);
  const [shareLink, setShareLink] = useState<MapShareLink | null>(null);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusById, setStatusById] = useState<Map<string, string>>(new Map());
  const [edgeStatusById, setEdgeStatusById] = useState<Map<string, SharedEdgeStatus>>(new Map());
  const frameRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance<any, any> | null>(null);

  const iconById = useMemo(
    () => new Map(customIcons.map((ic) => [ic.id, ic.dataUrl])),
    [customIcons]
  );

  // Carrega topologia sanitizada + ícones, depois centraliza o canvas
  useEffect(() => {
    getSharedTopology(token)
      .then(({ topology: t, shareLink: sl, customIcons: ic }) => {
        setTopology(t as any);
        setShareLink(sl);
        setCustomIcons(ic);
        // Aguarda o ReactFlow renderizar os nós antes de centralizar
        setTimeout(() => {
          const w = frameRef.current?.offsetWidth ?? window.innerWidth;
          rfRef.current?.fitView({ padding: 5 / Math.max(w - 10, 1), duration: 350 });
        }, 200);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Polling de status — sem WebSocket, sem IPs
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const { nodes, edges } = await getSharedStatus(token);
        if (alive) {
          setStatusById(new Map(nodes.map((n) => [n.nodeId, n.status])));
          setEdgeStatusById(new Map(edges.map((e) => [e.edgeId, e])));
        }
      } catch { /* silent */ }
    }
    void poll();
    const interval = setInterval(() => void poll(), STATUS_POLL_MS);
    return () => { alive = false; clearInterval(interval); };
  }, [token]);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        const w = frameRef.current?.offsetWidth ?? window.innerWidth;
        rfRef.current?.fitView({ padding: 5 / Math.max(w - 10, 1), duration: 350 });
      }, 300);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen();
  }

  const handleInit = useCallback((instance: ReactFlowInstance<any, any>) => {
    rfRef.current = instance;
  }, []);

  const flowNodes = useMemo(
    () => (topology?.nodes ?? []).map((n) => toFlowNode(n, iconById, statusById)),
    [topology, iconById, statusById]
  );
  const flowEdges = useMemo(
    () => (topology?.edges ?? []).map((e) => toFlowEdge(e, edgeStatusById.get(e.id))),
    [topology, edgeStatusById]
  );

  if (loading) {
    return (
      <div className="shared-viewer-shell">
        <div className="shared-viewer-loading">
          <MapIcon size={40} />
          <p>Carregando mapa...</p>
        </div>
      </div>
    );
  }

  if (error || !topology) {
    return (
      <div className="shared-viewer-shell">
        <div className="shared-viewer-error">
          <MapIcon size={40} />
          <h2>Link invalido ou expirado</h2>
          <p>{error ?? "Este link de compartilhamento nao existe ou ja expirou."}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={frameRef} className={`viewer-live shared-viewer-live${isFullscreen ? " viewer-fullscreen" : ""}`}>
      {isFullscreen ? (
        <div className="viewer-fs-name">{topology.name}</div>
      ) : (
        <div className="viewer-bar">
          <span className="viewer-bar-title">
            <Activity size={15} />
            {topology.name}
          </span>
          {shareLink && (
            <span className="shared-viewer-expiry">
              {formatExpiry(shareLink.expiresAt)}
            </span>
          )}
          <button className="viewer-bar-btn" onClick={toggleFullscreen} title="Tela cheia">
            <Maximize2 size={17} />
          </button>
        </div>
      )}
      <div className="viewer-canvas-wrap">
        <section className="canvas">
          <SnapshotsContext.Provider value={EMPTY_SNAPSHOTS}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
              onInit={handleInit}
            >
              {(topology.showGrid ?? true) && (
                <Background variant={BackgroundVariant.Lines} gap={40} size={1} color="#1c2330" />
              )}
            </ReactFlow>
          </SnapshotsContext.Provider>
        </section>
      </div>
    </div>
  );
}
