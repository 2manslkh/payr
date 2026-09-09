import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localDockerHost, localTestConfig, validateLocalUrls } from "./local-test-config.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commands = {
  start: ["start", "-o", "json"],
  reset: ["db", "reset", "--local"],
  lint: ["db", "lint", "--local", "--level", "error", "--fail-on", "error"],
};

function projectWorkdir(config, root, generatedRoot) {
  const source = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
  // Replace only the four checked-in settings; fail closed if the template changes shape.
  const replacements = [
    [/^project_id = "payr"$/m, `project_id = "${config.projectId}"`],
    [/^port = 57321$/m, `port = ${config.apiPort}`],
    [/^port = 58322$/m, `port = ${config.dbPort}`],
    [/^shadow_port = 57320$/m, `shadow_port = ${config.shadowPort}`],
  ];
  let rendered = source;
  for (const [pattern, value] of replacements) {
    if (!pattern.test(rendered)) throw new Error("Unexpected local Supabase config template");
    rendered = rendered.replace(pattern, value);
  }
  if (!config.isolated) return root;
  const workdir = resolve(generatedRoot, config.projectId);
  const directory = resolve(workdir, "supabase");
  // Never follow generated-directory symlinks into another worktree.
  for (const path of [resolve(root, ".supabase"), generatedRoot, workdir, directory]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Generated config directories must not be symlinks");
    mkdirSync(path, { recursive: true });
  }
  const migrations = resolve(directory, "migrations"), sourceMigrations = resolve(root, "supabase/migrations");
  if (!existsSync(migrations)) symlinkSync(sourceMigrations, migrations, "dir");
  if (!lstatSync(migrations).isSymbolicLink() || realpathSync(migrations) !== realpathSync(sourceMigrations)) {
    throw new Error("Generated migrations must point to this worktree");
  }
  const configPath = resolve(directory, "config.toml");
  if (lstatSync(configPath, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Generated config must not be a symlink");
  writeFileSync(configPath, rendered, { mode: 0o600 });
  return workdir;
}

export function createLocalSupabase({ env = process.env, root = repositoryRoot,
  generatedRoot = resolve(root, ".supabase/test-projects"), exec = execFileSync } = {}) {
  const config = localTestConfig(env);
  // Discard inherited Supabase credentials and CLI environment overrides, including linked-project settings.
  const environment = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("SUPABASE_")));
  const capture = (file, args) => exec(file, args, { cwd: root, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const host = localDockerHost(environment, exec);
  // Pin both Supabase and fixture docker exec to the same validated daemon.
  environment.DOCKER_HOST = host;
  delete environment.DOCKER_CONTEXT;
  const cli = resolve(root, "node_modules/supabase/dist/supabase.js");
  const pinned = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).devDependencies.supabase;
  if (!/^\d+\.\d+\.\d+$/.test(pinned) || capture(process.execPath, [cli, "--version"]).trim() !== pinned) {
    throw new Error("Install the pinned Supabase CLI with pnpm install --frozen-lockfile");
  }
  const workdir = projectWorkdir(config, root, generatedRoot);
  const cliArgs = (args) => [cli, ...args, "--workdir", workdir];

  function validateContainer(name, internalPort, externalPort) {
    const [container] = JSON.parse(capture("docker", ["inspect", "--type", "container", name]));
    const bindings = container?.NetworkSettings?.Ports?.[internalPort];
    if (container?.Name !== `/${name}` || container?.Config?.Labels?.["com.supabase.cli.project"] !== config.projectId
      || !Array.isArray(bindings) || bindings.length === 0 || bindings.some((binding) => binding.HostPort !== String(externalPort))) {
      throw new Error("Running Docker project or port bindings do not match the selected local test project");
    }
  }
  function status() {
    validateContainer(config.container, "5432/tcp", config.dbPort);
    validateContainer(`supabase_kong_${config.projectId}`, "8000/tcp", config.apiPort);
    const result = JSON.parse(capture(process.execPath, cliArgs(["status", "-o", "json"])));
    validateLocalUrls(config, { SUPABASE_URL: result.API_URL, SUPABASE_DB_URL: result.DB_URL });
    if (typeof result.ANON_KEY !== "string" || !result.ANON_KEY || typeof result.SERVICE_ROLE_KEY !== "string" || !result.SERVICE_ROLE_KEY) {
      throw new Error("Local Supabase status is missing test credentials");
    }
    return result;
  }
  return {
    config, workdir,
    run(command) {
      if (!Object.hasOwn(commands, command)) throw new Error("Allowed local database commands: start, reset, lint, status");
      if (command === "start") {
        const existing = capture("docker", ["container", "ls", "--all", "--filter", `name=^/${config.container}$`, "--format", "{{.Names}}"]);
        if (existing.trim()) status();
      } else status();
      // Start's status output contains keys. Capture it; never print keys or write an env file.
      exec(process.execPath, cliArgs(commands[command]), { cwd: root, env: environment,
        stdio: command === "start" ? ["ignore", "pipe", "pipe"] : "inherit", maxBuffer: 16 * 1024 * 1024 });
    },
    testEnvironment() {
      const result = status();
      const child = { ...environment, PAYR_TEST_DB_CONTAINER: config.container,
        SUPABASE_URL: result.API_URL, SUPABASE_DB_URL: result.DB_URL,
        SUPABASE_ANON_KEY: result.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: result.SERVICE_ROLE_KEY };
      delete child.NODE_ENV;
      return child;
    },
  };
}
