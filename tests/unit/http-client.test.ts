import { describe, expect, it } from "bun:test";

import { HashiraError } from "../../src/hashira-error.js";
import type { FetchLike } from "../../src/http-client.js";
import { HttpClient } from "../../src/http-client.js";

type RecordedCall = { url: string; init: RequestInit | undefined };

function stubFetch(response: Response): { fetch: FetchLike; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];

	return {
		calls,
		fetch: (url, init) => {
			calls.push({ url, init });

			return Promise.resolve(response.clone());
		},
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("HttpClient", () => {
	it("sends the key as a bearer token", async () => {
		const { fetch, calls } = stubFetch(jsonResponse({ ok: true }));

		await new HttpClient("key_abc", { fetch }).request({ method: "GET", path: "/emails" });

		expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer key_abc");
	});

	it("puts the API version into the URL so the caller never supplies it", async () => {
		const { fetch, calls } = stubFetch(jsonResponse({}));

		await new HttpClient("key", { fetch, baseUrl: "https://example.test" }).request({
			method: "GET",
			path: "/emails",
		});

		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails");
	});

	it("does not double the slash when the base URL has a trailing one", async () => {
		const { fetch, calls } = stubFetch(jsonResponse({}));

		await new HttpClient("key", { fetch, baseUrl: "https://example.test/" }).request({
			method: "GET",
			path: "/emails",
		});

		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails");
	});

	it("serializes a boolean query parameter as a string, which is what the API parses", async () => {
		const { fetch, calls } = stubFetch(jsonResponse({}));

		await new HttpClient("key", { fetch, baseUrl: "https://example.test" }).request({
			method: "GET",
			path: "/emails",
			query: { deleted: true, limit: 20, cursor: undefined },
		});

		const url = new URL(calls[0]?.url ?? "");

		expect(url.searchParams.get("deleted")).toBe("true");
		expect(url.searchParams.get("limit")).toBe("20");
		// An undefined value means "leave the parameter out", not "send an empty one".
		expect(url.searchParams.has("cursor")).toBe(false);
	});

	it("refuses to let a caller-supplied header replace the Authorization header", async () => {
		const { fetch, calls } = stubFetch(jsonResponse({}));

		await new HttpClient("real_key", {
			fetch,
			headers: { authorization: "Bearer someone_elses_key" },
		}).request({ method: "GET", path: "/emails" });

		expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer real_key");
	});

	it("throws a HashiraError carrying the API's stable code", async () => {
		const { fetch } = stubFetch(jsonResponse({ error: "EMAIL_NOT_FOUND" }, 404));
		const client = new HttpClient("key", { fetch });

		const error = (await client
			.request({ method: "GET", path: "/emails/x" })
			.catch((thrown: unknown) => thrown)) as HashiraError;

		expect(error).toBeInstanceOf(HashiraError);
		expect(error.status).toBe(404);
		expect(error.code).toBe("EMAIL_NOT_FOUND");
		expect(error.fields).toBeUndefined();
	});

	it("carries the per-field messages of a validation failure", async () => {
		const { fetch } = stubFetch(
			jsonResponse({ error: "VALIDATION_ERROR", fields: { subject: ["Required"] } }, 400),
		);

		const error = (await new HttpClient("key", { fetch })
			.request({ method: "POST", path: "/emails", body: {} })
			.catch((thrown: unknown) => thrown)) as HashiraError;

		expect(error.code).toBe("VALIDATION_ERROR");
		expect(error.fields).toEqual({ subject: ["Required"] });
	});

	it("still throws a HashiraError when the failure body is not JSON at all", async () => {
		// Several API routes rethrow a failure they do not map, and the framework answers those with
		// an HTML error page. Parsing must be allowed to fail, or a server bug would surface from the
		// SDK as a SyntaxError with nothing useful in it.
		const { fetch } = stubFetch(new Response("<html>Internal Server Error</html>", { status: 500 }));

		const error = (await new HttpClient("key", { fetch })
			.request({ method: "GET", path: "/emails" })
			.catch((thrown: unknown) => thrown)) as HashiraError;

		expect(error).toBeInstanceOf(HashiraError);
		expect(error.status).toBe(500);
		expect(error.code).toBe("UNKNOWN_ERROR");
		expect(error.body).toContain("Internal Server Error");
	});

	it("rejects an empty API key rather than sending an anonymous request", () => {
		expect(() => new HttpClient("")).toThrow(TypeError);
	});
});
