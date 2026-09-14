/**
 * Refuses to publish from anywhere but a tagged CI run.
 *
 * Wired to `prepublishOnly`, so it runs on any ordinary publish from this directory — including the
 * release workflow's, which publishes from here rather than from a pre-built tarball. It is still a
 * guard rail rather than a wall: `--ignore-scripts` walks straight past it. The wall is that no
 * long-lived npm token exists anywhere; releases authenticate through the workflow's OIDC identity,
 * so a local publish has nothing to authenticate with. This exists to say so plainly instead of
 * letting it surface as a confusing 401.
 */
const tagPrefix = "refs/tags/v";

const environment = process.env;
const isCi = environment.CI === "true" && environment.GITHUB_ACTIONS === "true";
const reference = environment.GITHUB_REF ?? "";

if (!isCi) {
	console.error(
		"assert-release-context: this package is published only from CI.\n" +
			"Push a `v<version>` tag and let .github/workflows/release.yml do it.\n" +
			"To inspect what would be published, run `bun run verify-package`.",
	);
	process.exit(1);
}

if (!reference.startsWith(tagPrefix)) {
	console.error(
		`assert-release-context: expected a tag starting with \`v\`, got ${reference || "(no GITHUB_REF)"}.`,
	);
	process.exit(1);
}

const taggedVersion = reference.slice(tagPrefix.length);
const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as { version: string };

if (manifest.version !== taggedVersion) {
	console.error(
		`assert-release-context: the tag says ${taggedVersion} but package.json says ${manifest.version}.\n` +
			"Bump the manifest and re-tag; a mismatch would publish a version nobody can trace back to a commit.",
	);
	process.exit(1);
}

console.log(`assert-release-context: publishing ${manifest.version} from ${reference}.`);
