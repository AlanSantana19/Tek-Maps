import { render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { DeviceNode } from "./DeviceNode";

describe("DeviceNode", () => {
  it("renders device status, metrics and alerts", () => {
    render(
      <ReactFlowProvider>
        <DeviceNode data={{
          label: "Switch Core",
          deviceType: "switch",
          snapshot: {
            hostId: "1",
            hostName: "sw-core",
            visibleName: "Switch Core",
            status: "down",
            syncedAt: new Date().toISOString(),
            metrics: [{ key: "cpu", label: "CPU", value: 71, unit: "%" }],
            ports: [{ id: "Gi0/1", name: "Gi0/1", operStatus: "up", utilizationPct: 18 }],
            alerts: [{ eventId: "e1", severity: 5, name: "Unavailable", clock: new Date().toISOString() }]
          }
        }} />
      </ReactFlowProvider>
    );

    expect(screen.getByText("Switch Core")).toBeTruthy();
    expect(screen.getByText("down")).toBeTruthy();
    expect(screen.getByText("71%")).toBeTruthy();
    expect(screen.getByText("1 alertas ativos")).toBeTruthy();
  });
});
