import { describe, expect, it } from "bun:test";

import type { FetchLike } from "../../src/http-client.js";
import { HttpClient } from "../../src/http-client.js";
import { EmailsResource } from "../../src/resources/emails-resource.js";

type RecordedCall = { url: string; init: RequestInit | undefined };

function emailsResource(body: unknown = {}): { emails: EmailsResource; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];

	const fetch: FetchLike = (url, init) => {
		calls.push({ url, init });

		return Promise.resolve(
			new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
		);
	};

	return {
		calls,
		emails: new EmailsResource(new HttpClient("key", { fetch, baseUrl: "https://example.test" })),
	};
}

function bodyOf(call: RecordedCall | undefined): Record<string, unknown> {
	return JSON.parse(String(call?.init?.body ?? "{}")) as Record<string, unknown>;
}

describe("EmailsResource", () => {
	it("posts a message to the collection", async () => {
		const { emails, calls } = emailsResource({ id: "01930000-0000-7000-8000-000000000000" });

		const sent = await emails.send({
			from: "billing@example.com",
			to: "customer@example.com",
			subject: "Invoice",
			html: "<p>Hi</p>",
		});

		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(sent.id).toBe("01930000-0000-7000-8000-000000000000");
	});

	it("accepts one recipient or several, because the API accepts both", async () => {
		const { emails, calls } = emailsResource({ id: "x" });
		const base = { from: "a@example.com", subject: "s", html: "<p>h</p>" };

		await emails.send({ ...base, to: "one@example.com" });
		await emails.send({ ...base, to: ["one@example.com", "two@example.com"] });

		expect(bodyOf(calls[0]).to).toBe("one@example.com");
		expect(bodyOf(calls[1]).to).toEqual(["one@example.com", "two@example.com"]);
	});

	it("converts a Date for scheduledAt into the ISO string the API reads", async () => {
		const { emails, calls } = emailsResource({ id: "x" });

		await emails.send({
			from: "a@example.com",
			to: "b@example.com",
			subject: "s",
			html: "<p>h</p>",
			scheduledAt: new Date("2026-03-01T12:00:00.000Z"),
		});

		expect(bodyOf(calls[0]).scheduledAt).toBe("2026-03-01T12:00:00.000Z");
	});

	it("leaves scheduledAt out entirely when it was not given", async () => {
		const { emails, calls } = emailsResource({ id: "x" });

		await emails.send({ from: "a@example.com", to: "b@example.com", subject: "s", html: "<p>h</p>" });

		expect("scheduledAt" in bodyOf(calls[0])).toBe(false);
	});

	it("asks for the trash with a string, since the flag travels in the query", async () => {
		const { emails, calls } = emailsResource({ data: [], nextCursor: null });

		await emails.list({ deleted: true, limit: 50 });

		const url = new URL(calls[0]?.url ?? "");

		expect(url.searchParams.get("deleted")).toBe("true");
		expect(url.searchParams.get("limit")).toBe("50");
	});

	it("reads and restores one message by id", async () => {
		const { emails, calls } = emailsResource({ id: "abc" });

		await emails.get("abc");
		await emails.getContent("abc");
		await emails.restore("abc");

		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails/abc");
		expect(calls[1]?.url).toBe("https://example.test/api/v1/emails/abc/content");
		expect(calls[2]?.url).toBe("https://example.test/api/v1/emails/abc/restore");
		expect(calls[2]?.init?.method).toBe("POST");
	});

	it("sends force in the query on a single delete", async () => {
		const { emails, calls } = emailsResource({ id: "abc", deleted: true, purgeAt: null });

		await emails.delete("abc", { force: true });

		expect(new URL(calls[0]?.url ?? "").searchParams.get("force")).toBe("true");
		expect(calls[0]?.init?.method).toBe("DELETE");
	});

	it("names the messages in the body of a bulk delete and keeps force in the query", async () => {
		// The collection has no id in its path, and a query string is not somewhere two hundred ids
		// can go — so this is the one DELETE in the API that carries a body.
		const { emails, calls } = emailsResource({ results: [], errors: [] });

		await emails.deleteMany(["a", "b"], { force: true });

		expect(calls[0]?.init?.method).toBe("DELETE");
		expect(bodyOf(calls[0])).toEqual({ emailIds: ["a", "b"] });
		expect(new URL(calls[0]?.url ?? "").searchParams.get("force")).toBe("true");
	});

	it("restores a set with PATCH on the collection", async () => {
		const { emails, calls } = emailsResource({ results: [], errors: [] });

		await emails.restoreMany(["a", "b"]);

		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails");
		expect(calls[0]?.init?.method).toBe("PATCH");
		expect(bodyOf(calls[0])).toEqual({ emailIds: ["a", "b"] });
	});

	it("hands back the raw response for an attachment instead of buffering it", async () => {
		const calls: RecordedCall[] = [];

		const fetch: FetchLike = (url, init) => {
			calls.push({ url, init });

			return Promise.resolve(
				new Response("PDF-BYTES", { status: 200, headers: { "content-type": "application/pdf" } }),
			);
		};

		const emails = new EmailsResource(new HttpClient("key", { fetch, baseUrl: "https://example.test" }));
		const response = await emails.downloadAttachment("email-1", "attachment-1");

		expect(response).toBeInstanceOf(Response);
		expect(response.headers.get("content-type")).toBe("application/pdf");
		expect(await response.text()).toBe("PDF-BYTES");
		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails/email-1/attachments/attachment-1");
	});

	it("escapes an id rather than letting it change the path", async () => {
		const { emails, calls } = emailsResource({ id: "x" });

		await emails.get("../../admin");

		expect(calls[0]?.url).toBe("https://example.test/api/v1/emails/..%2F..%2Fadmin");
	});
});
