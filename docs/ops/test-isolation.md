# Local database test isolation

The database and browser fixtures can erase data. A worktree by itself does not
isolate Docker containers. Keep the retained `payr` stack out of release testing
by selecting a dedicated local project and three unused ports explicitly.

With no isolation variables, the existing CI/default configuration stays `payr`,
API `57321`, Postgres `58322`, shadow `57320`. Setting **any** project/port variable
requires all four. `PAYR_TEST_PROJECT_ID` must start with `payr-`, contain lowercase
letters, digits and single hyphen separators, and be at most 63 characters.
The retained name `payr` is not a valid opt-in. All three ports must be distinct
integers from 1024 through 65535 and must avoid the retained stack's ports.

Run these commands sequentially in the coordinator's integrated, clean worktree.
First confirm `59320`, `59321`, `59322`, and browser port `3197` are unused and
that `payr-root-release-v170` belongs to this release. If occupied, select another
complete port tuple; do not stop somebody else's containers to free it.

```bash
(
  set -e
  export PAYR_TEST_PROJECT_ID=payr-root-release-v170
  export PAYR_TEST_API_PORT=59321
  export PAYR_TEST_DB_PORT=59322
  export PAYR_TEST_SHADOW_PORT=59320
  export PAYR_TEST_PORT=3197

  pnpm db:start
  pnpm db:status
  pnpm db:reset
  pnpm db:lint
  pnpm test:db:local
  pnpm release:prepare -- 1.7.0
)
```

`release:prepare` runs the required verification and browser gate and creates the
release version commit; only the coordinator executes it after integration.
Keep the same exports for any retries. Do not run DB and browser fixtures
concurrently against one project. `PAYR_TEST_PORT` controls only the Playwright
server; it is independent of the three Supabase ports.

The launchers invoke the repository's exact installed Supabase CLI pin (currently
`2.116.0`) and verify its version. Custom config is generated under ignored
`.supabase/test-projects/<project>/supabase/config.toml`. Its migration symlink
points to this worktree's `supabase/migrations`; migrations and the checked-in
config are not edited. Start, reset, lint and status all use the same explicit
`--workdir`. Reset and lint retain `--local`, and lint retains its error gate.
Additional CLI flags are not accepted by the database wrapper.

Before reset, lint, or test credential handoff, the launcher checks the local
Docker socket, exact container names, Supabase project labels, published API/DB
ports, and loopback status URLs. Starting an existing container requires those
checks too. Remote Docker hosts/contexts and mismatched projects or ports fail
closed. The label is defined by the [pinned Supabase CLI source](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/utils/docker.go).

The test launcher replaces inherited `SUPABASE_*` values with only the selected
stack's URLs and keys. It exports `PAYR_TEST_DB_CONTAINER` for the fixture guards
and pins Docker to the checked local socket. Do not set the container variable
manually. Custom fixtures require this handoff; the old
`PAYR_TEST_DATABASE_CONTAINER` shortcut is rejected. Fixture URL checks reject
remote hosts, alternate ports, user/database changes, and URL query overrides.
Credentials are neither printed nor copied to files. `pnpm db:status` prints
only the selected project and ports. Low-level `pnpm test:db` still supports the
default local environment, but custom runs should use `pnpm test:db:local`.

Run the isolation regression checks without a database:

```bash
pnpm test:release
pnpm test:unit src/lib/db/local-fixtures.test.ts
pnpm typecheck
```

These regressions mock Docker/CLI and fixture execution. Real start/reset/lint,
database tests, and the release gate must be executed by the coordinator; mocked
checks do not establish that ports are available or that migrations pass.
