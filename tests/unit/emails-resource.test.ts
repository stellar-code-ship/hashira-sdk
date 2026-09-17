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

		expect(calls[0]?.url).toBe("https://example.test/v1/emails");
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

	it("reads one message back by id", async () => {
		const { emails, calls } = emailsResource({ id: "email-1", status: "SENT" });

		const email = await emails.get("email-1");

		expect(calls[0]?.url).toBe("https://example.test/v1/emails/email-1");
		expect(calls[0]?.init?.method).toBe("GET");
		expect(email.id).toBe("email-1");
	});

	it("escapes an id rather than letting it change the path", async () => {
		const { emails, calls } = emailsResource({ id: "x" });

		await emails.get("../../admin");

		expect(calls[0]?.url).toBe("https://example.test/v1/emails/..%2F..%2Fadmin");
	});
});
