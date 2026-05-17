import type http from "node:http";
import { WebSocketServer } from "ws";
import type { DeviceSnapshot } from "../types.js";

export class Hub {
  private readonly wss: WebSocketServer;

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    // Keep connections alive through proxies that close idle sockets
    setInterval(() => {
      for (const client of this.wss.clients) {
        if (client.readyState === client.OPEN) {
          client.ping();
        }
      }
    }, 30_000);
  }

  broadcastSnapshots(snapshots: DeviceSnapshot[]) {
    const message = JSON.stringify({ type: "zabbix.snapshots", payload: snapshots });
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  }
}
