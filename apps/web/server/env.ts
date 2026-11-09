/** Validate only runtime-owned settings; unused providers remain optional in 0A. */
export function readRuntimeEnv(env: NodeJS.ProcessEnv) {
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  const probeToken = env.PROBE_TOKEN;
  if (probeToken !== undefined && !/^[A-Za-z0-9_-]{32,128}$/.test(probeToken)) {
    throw new Error("PROBE_TOKEN must contain 32–128 URL-safe characters.");
  }
  return { port, probeToken };
}
