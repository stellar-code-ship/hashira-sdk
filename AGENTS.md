# @stellar-code/hashira

The published TypeScript client for [Hashira](https://hashira.stellarcode.space)'s `/api/v1`. Zero
dependencies, ESM, built on `fetch`.

## Why this is its own repository

It was first built inside Hashira's private monorepo, guarded by an allowlist, a `rootDir` that made
an import from the application a compile error, and a script that inspected the real tarball for
stray files and forbidden strings. All of that worked, and none of it was the right shape: every one
of those guards lived in the repository it was guarding, so the same change that leaked something
could weaken the guard, and CI would run the weakened guard from that change's own branch.

Here there is nothing secret to leak. That is a stronger guarantee than any script, and it is the
reason to keep this repository containing only the client. It also makes npm provenance possible,
which a private source repository forbids outright — npm rejects the whole publish with a 422.

**Nothing proprietary belongs in this repository.** Not a copied service, not an internal URL, not a
credential, not a schema that the API does not already expose. If something here needs knowledge
that only the private repository has, that knowledge belongs in the API's published contract
instead.

## The contract

`src/generated/*.gen.ts` is emitted by `bun run generate-api-types` from Hashira's OpenAPI document,
fetched over HTTP from `https://hashira.stellarcode.space/openapi.json`. The document is generated
from the very Zod schemas the API validates against, so it is the contract rather than a description
of one, and fetching it means there is no vendored copy to keep in step.

Point the generator at another deployment with `HASHIRA_OPENAPI_URL` — a local app, or staging —
rather than editing the script.

Generated files must never be edited by hand. `bun run check-api-types` proves the committed output
still matches the document and runs on every pull request; when it fails, the API moved and the fix
is to regenerate and review the diff.

Widening the client to another resource means adding its tag to `shippedTags` in
`scripts/generate-api-types.ts`, regenerating, and writing the resource class — in that order.

## Organization

- `src/` is the only directory that becomes `dist/`, and the only one that ships.
- `scripts/` and `tests/` are **siblings** of `src/`, never inside it, so neither can reach a
  tarball by accident.
- `src/hashira.ts` is the published entry point. It is not a barrel: its primary artifact is the
  `Hashira` class, and the `export type` lines beside it are the public type surface. There is no
  `index.ts` and there must not be one — the `exports` map in `package.json` plays that role.
- Relative imports carry explicit `.js` extensions, including when they name a `.ts` file. That is
  what `module: "nodenext"` requires, and what makes the emitted files resolvable by Node with no
  bundler in the way.
- `src/**` may not import Node built-ins, touch `process.env`, or reference browser globals. Biome
  enforces all three, because "zero dependencies, plain `fetch`, runs anywhere" has to be mechanical
  to stay true.
- Files and folders are `kebab-case`, except `AGENTS.md` and `CLAUDE.md`. Every file has one primary
  artifact.
- All source, comments and documentation are in English.

## Tests

`bun test --isolate tests`. `--isolate` gives every file a fresh global and module registry; without
it a module stub registered by one file outlives it and silently decides another file's result.

Unit tests inject a stub `fetch` through the client's own option rather than patching a global, so
they assert the request the SDK would actually send. `tests/package/` asserts the tarball's contents
through the same module the release uses, which keeps that guarantee exercised on every run instead
of only on release day.

## Release

```
bun run generate-api-types   # then review and commit any diff
bun run build
bun run test
bun run verify-package
```

Then bump `version`, update `CHANGELOG.md`, commit, and push a `v<version>` tag. CI re-runs every
check and publishes.

### The first release

npm's trusted publisher is configured on a package's own settings page, so the package has to exist
before OIDC can be aimed at it. `bootstrap-release.yml` resolves that once, with a granular token,
and is deleted afterwards. Provenance still applies to it: npm generates provenance from the OIDC
identity even when the publish authenticates with a token, so long as `id-token: write` is granted
and the source repository is public.

Two things about `npm unpublish` are worth knowing, and they are not equally binding.

A version number is never reusable, and that one is absolute: `0.1.0` and `0.1.1` were published
from the old monorepo and can never be published again, which is why this repository starts at
`0.2.0`.

npm's policy also states that unpublishing every version of a package blocks any publish of that
name for 24 hours. In practice that did not bite here — `0.2.0` published roughly ten minutes after
the package was removed. What did happen is that the first attempt failed with
`E409 Conflict — Failed to save packument. A common cause is if you try to publish a new package
before the previous package has been fully processed`, and a retry a few minutes later succeeded. So
treat an E409 straight after an unpublish as the registry still settling rather than as a day-long
lockout, and retry before rearranging anything around it.

### Authentication

Releases authenticate through **trusted publishing**: the workflow presents a GitHub OIDC token and
npm exchanges it for a short-lived credential. No npm token exists in this repository's secrets or
on any developer machine. The trusted publisher is registered on npmjs.com against this repository
and the workflow filename `release.yml`; renaming that file breaks releases until the publisher is
updated to match.

Two things about that are easy to trip over, and both fail without naming themselves.

Trusted publishing needs **npm 11.5.1 or later and Node 22.14 or later**, and the runner image ships
an older npm that fails with an authentication error rather than saying it is out of date — hence
the explicit upgrade step.

`actions/setup-node` with `registry-url` writes **two** lines into the `.npmrc`, and they pull in
opposite directions. `registry=https://registry.npmjs.org/` is required, because npm will not start
an OIDC exchange without knowing which registry to ask. But
`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` is fatal: npm reads it, concludes auth is
configured, and never reaches OIDC, publishing with the placeholder setup-node defines. So the
publish step deletes that one line and keeps the other. Dropping `registry-url` instead removes
both, which trades an `E404 ... or you do not have permission` for an `ENEEDAUTH` — neither of which
reads like what it is. See npm/documentation#1960 and actions/setup-node#1551.

Two guards protect that: the publish refuses to run if any auth token survives in the `.npmrc`, or
if no OIDC token is available. The first matters most, because a *real* token there would publish
successfully while proving nothing about trusted publishing.

A publish answers `PUT 202` rather than `201`: npm accepts it and validates before the version goes
live, so the registry briefly reports the new version as missing.

### Versioning

The package is in `0.x` while its surface settles — it covers one resource of the API's twelve.
From `1.0.0` on, **the major version is the API version**: `1.x` speaks `/api/v1`, and a future
`/api/v2` would ship as `2.0.0`. Neither phase gives the caller a version knob; `apiVersionPath` is
a constant and `baseUrl` takes an origin, so a client can never be aimed at an API it was not typed
against.
