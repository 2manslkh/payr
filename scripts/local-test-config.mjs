import { execFileSync } from "node:child_process";
const portKeys = ["PAYR_TEST_API_PORT", "PAYR_TEST_DB_PORT", "PAYR_TEST_SHADOW_PORT"];
const retainedPorts = new Set([57320, 57321, 58322, 57323, 57324, 57327, 57329, 8083]);

export function localTestConfig(env = process.env) {
  const isolated = ["PAYR_TEST_PROJECT_ID", ...portKeys].some((key) => env[key] !== undefined);
  let projectId = "payr", apiPort = 57321, dbPort = 58322, shadowPort = 57320;
  if (isolated) {
    projectId = env.PAYR_TEST_PROJECT_ID;
    if (typeof projectId !== "string" || !/^payr-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId) || projectId.length > 63) {
      throw new Error("PAYR_TEST_PROJECT_ID must be a distinct payr- prefixed local project (maximum 63 characters)");
    }
    [apiPort, dbPort, shadowPort] = portKeys.map((key) => {
      const value = env[key];
      if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || Number(value) < 1024 || Number(value) > 65535
        || retainedPorts.has(Number(value))) throw new Error(`${key} must be an explicit unused port from 1024–65535 outside the retained Payr ports`);
      return Number(value);
    });
    if (new Set([apiPort, dbPort, shadowPort]).size !== 3) throw new Error("Local test ports must be distinct");
  }
  const container = `supabase_db_${projectId}`;
  if (env.PAYR_TEST_DATABASE_CONTAINER !== undefined) throw new Error("Replace PAYR_TEST_DATABASE_CONTAINER with the explicit project and port configuration");
  if (env.PAYR_TEST_DB_CONTAINER !== undefined && env.PAYR_TEST_DB_CONTAINER !== container) {
    throw new Error("PAYR_TEST_DB_CONTAINER does not match the selected local project");
  }
  return { projectId, apiPort, dbPort, shadowPort, container, isolated };
}

export function validateLocalUrls(config, env) {
  try {
    const api = new URL(env.SUPABASE_URL), database = new URL(env.SUPABASE_DB_URL);
    if (api.origin !== `http://127.0.0.1:${config.apiPort}` || api.username || api.password
      || api.pathname !== "/" || api.search || api.hash
      || database.protocol !== "postgresql:" || database.hostname !== "127.0.0.1"
      || database.port !== String(config.dbPort) || database.username !== "postgres" || database.pathname !== "/postgres"
      || database.search || database.hash) throw new Error();
  } catch {
    throw new Error("Fixture URLs must match the selected local project's loopback API and Postgres ports");
  }
}

export function localDockerHost(env = process.env, exec = execFileSync) {
  if (env.DOCKER_HOST !== undefined && !/^unix:\/\/\//.test(env.DOCKER_HOST)) {
    throw new Error("Local fixtures refuse remote Docker hosts");
  }
  const host = env.DOCKER_CONTEXT || !env.DOCKER_HOST
    ? JSON.parse(exec("docker", ["context", "inspect", ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []),
      "--format", "{{json .Endpoints.docker.Host}}"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))
    : env.DOCKER_HOST;
  if (typeof host !== "string" || !/^unix:\/\/\//.test(host)) throw new Error("Local tests require a Docker daemon on a local Unix socket");
  return host;
}

export function fixtureDatabaseContainer(env = process.env) {
  const config = localTestConfig(env);
  validateLocalUrls(config, env);
  if (config.isolated && env.PAYR_TEST_DB_CONTAINER !== config.container) {
    throw new Error("Isolated fixtures require the validated PAYR_TEST_DB_CONTAINER from the local test launcher");
  }
  localDockerHost(env);
  return config.container;
}
