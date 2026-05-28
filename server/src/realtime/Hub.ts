import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "../auth.js";
import type { DeviceSnapshot } from "../types.js";

interface OnlineUser {
  name: string;
  ip: string;
  connectedAt: string;
}

export class Hub {
  private readonly wss: WebSocketServer;
  private readonly onlineUsers = new Map<WebSocket, OnlineUser>();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      // Compresses each WebSocket frame (permessage-deflate, RFC 7692).
      // JSON repeats keys heavily — typical compression ratio 70-85%.
      // All modern mobile browsers negotiate this automatically.
      perMessageDeflate: {
        zlibDeflateOptions: { level: 1 },
        threshold: 512,
      },
    });

    this.wss.on("connection", (ws, req) => {
      const url = new URL(req.url ?? "/", "ws://localhost");
      const token = url.searchParams.get("token");
      if (token) {
        const payload = verifyToken(token);
        if (payload) {
          const forwarded = req.headers["x-forwarded-for"];
          const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim()
            ?? req.socket.remoteAddress
            ?? "desconhecido";
          this.onlineUsers.set(ws, { name: payload.name ?? payload.sub, ip, connectedAt: new Date().toISOString() });
        }
      }

      ws.on("close", () => {
        this.onlineUsers.delete(ws);
      });
    });

    setInterval(() => {
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        }
      }
    }, 30_000);
  }

  broadcastSnapshots(snapshots: DeviceSnapshot[]) {
    const message = JSON.stringify({ type: "zabbix.snapshots", payload: snapshots });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  getOnlineUsers(): OnlineUser[] {
    return Array.from(this.onlineUsers.values());
  }
}
