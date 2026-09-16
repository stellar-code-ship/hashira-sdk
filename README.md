# @stellar-code/hashira

TypeScript client for the [Hashira](https://hashira.stellarcode.space) API. Zero dependencies, ESM,
built on `fetch` — it runs on Node 20+, Bun, Deno, Cloudflare Workers and the browser.

```bash
npm install @stellar-code/hashira
```

## Usage

```ts
import { Hashira } from "@stellar-code/hashira";

const hashira = new Hashira(process.env.HASHIRA_API_KEY);

const { id } = await hashira.emails.send({
	from: "billing@yourdomain.com",
	to: "customer@example.com",
	subject: "Your invoice",
	html: "<p>Thanks for your business.</p>",
});
```

The API key decides everything about scope: which project the call belongs to, and whether it reads
and writes live or test data. Nothing in a request says which mode it is in, so switching between
them means switching keys.

### Options

```ts
const hashira = new Hashira(apiKey, {
	baseUrl: "http://localhost:3000", // origin only — the version segment is not yours to supply
	timeoutMs: 10_000,
	fetch: myInstrumentedFetch,
	headers: { "x-request-source": "billing-worker" },
});
```

## Emails

Sending is accepted asynchronously: a resolved `send()` means the message was queued, not delivered.
The outcome arrives as an `EMAIL_SENT` or `EMAIL_FAILED` webhook, or by reading the message back.

| Call | What it does |
| --- | --- |
| `emails.send(input)` | Sends a message. Address fields take a string or an array. |
| `emails.list(query?)` | Lists messages, newest first. |
| `emails.get(id)` | One message's metadata. |
| `emails.getContent(id)` | Its body and its attachments' metadata. |
| `emails.deleteMany(ids)` | Destroys up to 200 at once, answered per item. |
| `emails.downloadAttachment(id, attachmentId)` | The raw `Response`, so you choose how to read it. |
| `emails.createAttachmentLink(id, attachmentId)` | A signed link that needs no API key. |

Deleting destroys, immediately and for good, with the stored body and every attachment. There is no
trash, no restore and no single-message form — delete one by sending a set of one. Any window
between deciding and destroying is yours to keep: how long a message should survive is a question
about the mailboxes holding it, which the API cannot see.

### Paging

Paging is keyset on the id, so a page is stable while new messages arrive. Pass the previous page's
`nextCursor` back as `cursor`; a null `nextCursor` is the last page.

```ts
let cursor: string | undefined;

do {
	const page = await hashira.emails.list({ limit: 100, cursor });
	// ...
	cursor = page.nextCursor ?? undefined;
} while (cursor !== undefined);
```

## Errors

Every failed request throws a `HashiraError`.

```ts
import { Hashira, HashiraError } from "@stellar-code/hashira";

try {
	await hashira.emails.get(id);
} catch (error) {
	if (error instanceof HashiraError && error.code === "EMAIL_NOT_FOUND") {
		return null;
	}

	throw error;
}
```

`code` is a stable identifier, not display copy — map it to your own wording. `status` is the HTTP
status, and `fields` carries per-field messages on a `VALIDATION_ERROR`, keyed by top-level field
name.

## Versioning

This package is in `0.x`: it covers the Emails resource today, and the surface may still change
while the rest of the API is added. Pin the minor if that matters to you.

Every release is published from
[stellar-code-ship/hashira-sdk](https://github.com/stellar-code-ship/hashira-sdk) with npm
provenance, so you can verify that a tarball was built from that source at a given commit.

From `1.0.0` on, **the major version is the API version**. `1.x` will speak `/api/v1` and nothing
else; a future `/api/v2` would ship as `2.0.0`.

## License

MIT
