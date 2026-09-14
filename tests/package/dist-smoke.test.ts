import { describe, expect, it } from "bun:test";

/**
 * Imports the built artifact exactly as a consumer would.
 *
 * A broken `exports` map or a relative import missing its `.js` extension type-checks perfectly and
 * fails only on someone else's `npm install`. This is the cheapest place to find that out.
 */
describe("the built package", () => {
	it("exports the client from its entry point", async () => {
		const entry = (await import("../../dist/hashira.js")) as Record<string, unknown>;

		expect(typeof entry.Hashira).toBe("function");
		expect(typeof entry.HashiraError).toBe("function");
	});

	it("constructs a client with resources attached", async () => {
		const { Hashira } = (await import("../../dist/hashira.js")) as {
			Hashira: new (apiKey: string) => { emails: { send: unknown } };
		};

		const hashira = new Hashira("key_test");

		expect(typeof hashira.emails.send).toBe("function");
	});

	it("has no side effects worth worrying about on import", async () => {
		// `sideEffects: false` in the manifest is a claim consumers' bundlers act on. Importing the
		// entry twice must not throw or mutate anything observable.
		await import("../../dist/hashira.js");
		await import("../../dist/hashira.js");

		expect(true).toBe(true);
	});
});
