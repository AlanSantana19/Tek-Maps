import { execSync } from "node:child_process";

const BASE_VERSION = "0.2.0";

function readGit(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

const commitCount = process.env.GIT_COMMIT_COUNT ?? readGit("git rev-list --count HEAD", "0");
const shortSha = process.env.GIT_SHA ?? readGit("git rev-parse --short HEAD", "unknown");

export const appVersion = {
  name: "Tek Map",
  version: `${BASE_VERSION}.${commitCount}`,
  channel: "9001-dev",
  build: shortSha
};
