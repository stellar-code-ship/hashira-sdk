import { describe, expect, it } from "bun:test";

import { verifyPackageContents } from "../../scripts/verify-package-contents.js";

/**
 * The repository's hardest rule is that only `packages/sdk` may ever reach npm. Asserting it here,
 * through the very module the release pipeline uses, is what keeps it exercised on every test run
 * rather than only on release day.
 */
describe("the published tarball", () => {
	it("contains the package and nothing else", async () => {
		const distributionEntry = Bun.file(new URL("../../dist/hashira.js", import.meta.url));

		if (!(await distributionEntry.exists())) {
			throw new Error("dist is missing — run `bun run build` before this test, as the turbo task does.");
		}

		const { paths } = await verifyPackageContents();

		expect(paths).toEqual([
			"CHANGELOG.md",
			"LICENSE",
			"README.md",
			"dist/api-version.d.ts",
			"dist/api-version.js",
			"dist/generated/emails.gen.d.ts",
			"dist/generated/emails.gen.js",
			"dist/generated/error-codes.gen.d.ts",
			"dist/generated/error-codes.gen.js",
			"dist/hashira-error.d.ts",
			"dist/hashira-error.js",
			"dist/hashira.d.ts",
			"dist/hashira.js",
			"dist/http-client.d.ts",
			"dist/http-client.js",
			"dist/resources/emails-resource.d.ts",
			"dist/resources/emails-resource.js",
			"package.json",
		]);
	});

	it("ships the package's own MIT licence, never the repository's proprietary one", async () => {
		const licence = await Bun.file(new URL("../../LICENSE", import.meta.url)).text();

		expect(licence).toContain("MIT License");
		expect(licence).not.toContain("PROPRIETARY AND CONFIDENTIAL");
	});

	it("declares no runtime dependencies", async () => {
		const manifest = (await Bun.file(new URL("../../package.json", import.meta.url)).json()) as Record<
			string,
			unknown
		>;

		expect(manifest.dependencies).toBeUndefined();
		expect(manifest.peerDependencies).toBeUndefined();
		expect(manifest.bundledDependencies).toBeUndefined();
	});
});
