import assert from "node:assert/strict";
import { test } from "node:test";
import { localDockerHost, localTestConfig, validateLocalUrls, fixtureDatabaseContainer } from "./local-test-config.mjs";

const isolated = { DOCKER_HOST: "unix:///var/run/docker.sock", PAYR_TEST_PROJECT_ID: "payr-root-release-v170", PAYR_TEST_API_PORT: "59321",
  PAYR_TEST_DB_PORT: "59322", PAYR_TEST_SHADOW_PORT: "59320" };
const urls = { SUPABASE_URL: "http://127.0.0.1:59321",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:59322/postgres" };

test("keeps the default project and CI ports", () => {
  assert.deepEqual(localTestConfig({}), { projectId: "payr", apiPort: 57321, dbPort: 58322,
    shadowPort: 57320, container: "supabase_db_payr", isolated: false });
  assert.equal(fixtureDatabaseContainer({ DOCKER_HOST: "unix:///var/run/docker.sock", SUPABASE_URL: "http://127.0.0.1:57321",
    SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres" }), "supabase_db_payr");
});

test("isolates the complete port tuple and derives the container", () => {
  const config = localTestConfig(isolated);
  assert.equal(config.container, "supabase_db_payr-root-release-v170");
  assert.equal(config.isolated, true);
  assert.doesNotThrow(() => validateLocalUrls(config, urls));
  assert.equal(fixtureDatabaseContainer({ ...isolated, ...urls, PAYR_TEST_DB_CONTAINER: config.container }), config.container);
});

test("rejects partial opt-ins, retained project/ports, malformed names and port collisions", () => {
  for (const env of [
    { PAYR_TEST_PROJECT_ID: "payr" }, { PAYR_TEST_API_PORT: "59321" },
    { ...isolated, PAYR_TEST_PROJECT_ID: "payr" }, { ...isolated, PAYR_TEST_PROJECT_ID: "" },
    { ...isolated, PAYR_TEST_PROJECT_ID: "../payr" }, { ...isolated, PAYR_TEST_PROJECT_ID: "remote" },
    { ...isolated, PAYR_TEST_API_PORT: "57321" }, { ...isolated, PAYR_TEST_DB_PORT: "58322" },
    { ...isolated, PAYR_TEST_SHADOW_PORT: "57320" }, { ...isolated, PAYR_TEST_DB_PORT: "59321" },
    { ...isolated, PAYR_TEST_API_PORT: "059321" }, { ...isolated, PAYR_TEST_DB_PORT: "65536" },
    { ...isolated, PAYR_TEST_DB_PORT: "80" }, { ...isolated, PAYR_TEST_DB_PORT: "1e4" },
    { ...isolated, PAYR_TEST_SHADOW_PORT: undefined },
    { ...isolated, PAYR_TEST_DATABASE_CONTAINER: "supabase_db_payr" },
    { ...isolated, PAYR_TEST_DB_CONTAINER: "supabase_db_payr" },
  ]) assert.throws(() => localTestConfig(env));
});

test("rejects remote hosts, alternate ports and connection redirection before fixtures", () => {
  for (const patch of [
    { SUPABASE_URL: "https://example.supabase.co" },
    { SUPABASE_URL: "http://localhost:59321" },
    { SUPABASE_URL: "http://127.0.0.1:57321" },
    { SUPABASE_URL: "http://user:secret@127.0.0.1:59321" },
    { SUPABASE_URL: "http://127.0.0.1:59321/extra" },
    { SUPABASE_DB_URL: "postgresql://postgres:postgres@remote:59322/postgres" },
    { SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:58322/postgres" },
    { SUPABASE_DB_URL: "postgresql://other:postgres@127.0.0.1:59322/postgres" },
    { SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:59322/other" },
    { SUPABASE_DB_URL: `${urls.SUPABASE_DB_URL}?host=remote` },
    { SUPABASE_DB_URL: `${urls.SUPABASE_DB_URL}#fragment` },
  ]) assert.throws(() => fixtureDatabaseContainer({ ...isolated, ...urls, ...patch,
    PAYR_TEST_DB_CONTAINER: "supabase_db_payr-root-release-v170" }));
  assert.throws(() => fixtureDatabaseContainer({ ...isolated, ...urls }));
});

test("rejects remote Docker hosts and contexts, including a context overriding a local host", () => {
  for (const env of [{ DOCKER_HOST: "tcp://remote:2375" }, { DOCKER_CONTEXT: "remote" },
    { DOCKER_CONTEXT: "remote", DOCKER_HOST: "unix:///var/run/docker.sock" }]) {
    assert.throws(() => localDockerHost(env, () => JSON.stringify("ssh://remote")));
  }
  assert.equal(localDockerHost({ DOCKER_CONTEXT: "desktop-linux" }, () => JSON.stringify("unix:///local/docker.sock")), "unix:///local/docker.sock");
  assert.throws(() => fixtureDatabaseContainer({ ...isolated, ...urls, DOCKER_HOST: "tcp://remote:2375",
    PAYR_TEST_DB_CONTAINER: "supabase_db_payr-root-release-v170" }));
});
