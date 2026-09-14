/**
 * Proves that the published tarball carries only what this package means to ship.
 *
 * This repository is public and holds nothing but the client, so the hard part of the old boundary
 * — keeping a private monorepo's source out of the tarball — is now structural rather than
 * something a script has to police. What is left is still worth checking on every release: that the
 * tarball is exactly the built output and its documents, that it drags in no dependencies, and that
 * no absolute build path or stray credential rode along inside a file nobody reads.
 *
 * It stays an allowlist rather than a denylist, because a denylist only ever excludes what somebody
 * thought of.
 *
 * `--ignore-scripts` on the pack below is load-bearing: `bun pm pack` runs `prepack`, so wiring
 * this script into `prepack` without it would recurse pack → prepack → pack forever. That is also
 * why this package has no `prepack` script and the release pipeline sequences build → verify →
 * publish explicitly.
 */

import type { TarEntry } from "./read-tar-entries.js";
import { readTarEntries } from "./read-tar-entries.js";

/** Exactly what may appear in the tarball. npm always adds package.json, README and LICENSE. */
const allowedPathPatterns: RegExp[] = [
	/^package\.json$/,
	/^README\.md$/,
	/^LICENSE$/,
	/^CHANGELOG\.md$/,
	/^dist\/[a-z0-9-]+\.(js|d\.ts)$/,
	/^dist\/(generated|resources)\/[a-z0-9-]+(\.gen)?\.(js|d\.ts)$/,
];

/**
 * Strings that must never appear in anything published.
 *
 * Each one belongs to something outside this package: the application's source tree, its runtime
 * dependencies, its secrets, a build machine's filesystem, or the repository's proprietary licence.
 * A hit means a layer above this one failed, so the message should say which string and where.
 */
const forbiddenMarkers: string[] = [
	// A credential or an internal address in a published file got there by mistake.
	"DATABASE_URL",
	"AWS_SECRET_ACCESS_KEY",
	"postgres://",
	"-----BEGIN",
	// A build machine's filesystem, usually through a leaked source map.
	"/home/",
	"/Users/",
	"/tmp/",
	"node_modules/",
	// A path alias does not survive a correct build.
	'from "@/',
	'import("@/',
];

const tarballSizeCeiling = 200_000;
const entrySizeCeiling = 262_144;

function textOf(entries: TarEntry[], name: string): string {
	const entry = entries.find((candidate) => candidate.name === name);

	if (entry === undefined) {
		throw new Error(`the tarball has no ${name}`);
	}

	return new TextDecoder().decode(entry.bytes);
}

function collectExportTargets(node: unknown, found: string[] = []): string[] {
	if (typeof node === "string") {
		found.push(node);
	} else if (typeof node === "object" && node !== null) {
		for (const value of Object.values(node)) {
			collectExportTargets(value, found);
		}
	}

	return found;
}

function countOf(value: unknown): number {
	if (Array.isArray(value)) {
		return value.length;
	}

	return typeof value === "object" && value !== null ? Object.keys(value).length : 0;
}

export async function verifyPackageContents(): Promise<{
	paths: string[];
	tarballPath: string;
	size: number;
}> {
	// Local to the call, never module state: the tarball test calls this more than once in one
	// process, and a shared array would carry a previous run's failures into the next.
	const failures: string[] = [];

	const check = (condition: boolean, message: string): void => {
		if (!condition) {
			failures.push(message);
		}
	};

	const packed = await Bun.$`bun pm pack --ignore-scripts --quiet`.quiet().nothrow();

	if (packed.exitCode !== 0) {
		throw new Error(`bun pm pack failed:\n${packed.stderr.toString()}`);
	}

	const tarballPath = packed.stdout.toString().trim().split("\n").at(-1) ?? "";
	const tarball = Bun.file(tarballPath);
	const size = tarball.size;
	const entries = readTarEntries(Bun.gunzipSync(await tarball.bytes()));

	// npm prefixes every entry with `package/`.
	const paths = entries.map((entry) => entry.name.replace(/^package\//, "")).sort();

	for (const path of paths) {
		check(
			allowedPathPatterns.some((pattern) => pattern.test(path)),
			`unexpected entry in the tarball: ${path}`,
		);
	}

	const manifest = JSON.parse(textOf(entries, "package/package.json")) as Record<string, unknown>;

	for (const key of [
		"dependencies",
		"peerDependencies",
		"optionalDependencies",
		// The packer copies `node_modules/<name>` straight into the tarball for these, which makes
		// them the one dependency field that can carry somebody else's source into ours.
		"bundledDependencies",
		"bundleDependencies",
	]) {
		check(countOf(manifest[key]) === 0, `${key} must be empty, found ${countOf(manifest[key])} entries`);
	}

	check(manifest.private !== true, "private must not be set on a package meant to be published");
	check(manifest.type === "module", 'type must be "module"');
	check(manifest.license === "MIT", `license must be MIT, found ${String(manifest.license)}`);

	const publishConfig = (manifest.publishConfig ?? {}) as Record<string, unknown>;
	check(publishConfig.access === "public", 'publishConfig.access must be "public"');

	// The repository is public, so npm will attest the build. That attestation is the only way a
	// consumer can verify a tarball came from this source at this commit, so losing it should fail
	// the release rather than pass quietly.
	check(
		publishConfig.provenance === true,
		"publishConfig.provenance must be true — a public repository can and should attest its builds",
	);

	const repository = (manifest.repository ?? {}) as Record<string, unknown>;
	check(
		typeof repository.url === "string" && repository.url.includes("hashira-sdk"),
		"repository.url must name this repository — npm provenance will not attest without a match",
	);

	// Reading the targets out of the manifest means adding an export subpath extends this check on
	// its own, with no second list to keep in step.
	for (const target of collectExportTargets(manifest.exports)) {
		const wanted = target.replace(/^\.\//, "");

		check(paths.includes(wanted), `exports names ${target}, which is not in the tarball`);
	}

	for (const entry of entries) {
		const text = new TextDecoder("utf-8", { fatal: false }).decode(entry.bytes);

		for (const marker of forbiddenMarkers) {
			check(!text.includes(marker), `forbidden marker ${JSON.stringify(marker)} found in ${entry.name}`);
		}

		check(
			entry.size <= entrySizeCeiling,
			`${entry.name} is ${entry.size} bytes, over the ${entrySizeCeiling}-byte per-file ceiling`,
		);
	}

	check(
		size <= tarballSizeCeiling,
		`the tarball is ${size} bytes, over the ${tarballSizeCeiling}-byte ceiling`,
	);

	if (failures.length > 0) {
		throw new Error(
			`the package would publish something it must not:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
		);
	}

	return { paths, tarballPath, size };
}

if (import.meta.main) {
	try {
		const { paths, tarballPath, size } = await verifyPackageContents();

		console.log(`${paths.length} entries, ${size} bytes:`);
		console.log(paths.map((path) => `  ${path}`).join("\n"));
		console.log(`\nVerified tarball: ${tarballPath}`);
	} catch (error) {
		console.error(`verify-package-contents: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
