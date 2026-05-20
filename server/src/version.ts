const BASE_VERSION = "0.4.0";

const commitCount = process.env.GIT_COMMIT_COUNT ?? "0";
const shortSha    = process.env.GIT_SHA ?? "local";
const buildDate   = process.env.BUILD_DATE ?? "";

// Build identifier: prefer git SHA, fall back to build date, then "local"
const buildId = shortSha !== "local" ? shortSha
              : buildDate            ? buildDate
              : "local";

export const appVersion = {
  name: "Tek Map",
  version: `${BASE_VERSION}.${commitCount}`,
  channel: "stable",
  build: buildId
};
