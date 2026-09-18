# @stellar-code/hashira

TypeScript client for the [Hashira](https://api.hashira.stellarcode.space) API. Zero dependencies,
ESM, built on `fetch` — it runs on Node 20+, Bun, Deno, Cloudflare Workers and the browser.

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

The API key decides everything about scope: which project the message is sent from, and whether it
is live or test data. Nothing in a request says which mode it is in, so switching between them means
switching keys.

Sending and reading one message back are the whole of this client, because they are the whole of the
published API. A message may only be sent from a domain registered to your project; anything else
answers `FROM_DOMAIN_NOT_REGISTERED`.

### Options

```ts
const hashira = new Hashira(apiKey, {
	baseUrl: "http://localhost:3001", // origin only — the version segment is not yours to supply
	timeoutMs: 10_000,
	fetch: myInstrumentedFetch,
	headers: { "x-request-source": "billing-worker" },
});
```

## Emails

| Call | What it does |
| --- | --- |
| `emails.send(input)` | Sends a message. Address fields take a string or an array. |
| `emails.get(id)` | One message's current state. Metadata only. |

Sending is accepted asynchronously: a resolved `send()` means the message was queued, not delivered.
The outcome arrives as an `EMAIL_SENT` or `EMAIL_FAILED` webhook, which carries the message's id and
nothing else — `get()` is how that id becomes an answer.

```ts
const email = await hashira.emails.get(id);

if (email.status === "FAILED") {
	// ...
}
```

`get()` never reads the stored message, so calling it once per webhook is cheap. The body and the
attachments are not part of the published API.

Attachments ride inline as base64 in `attachments`, so the size ceiling applies to the whole request
rather than to any one part. `scheduledAt` takes a `Date` or an ISO-8601 string; omit it to send
immediately. To reply to an existing message, set `inReplyTo` and `references` yourself — both
headers are passed through verbatim, so you can thread onto mail Hashira never handled.

## Errors

Every failed request throws a `HashiraError`.

```ts
import { Hashira, HashiraError } from "@stellar-code/hashira";

try {
	await hashira.emails.send(message);
} catch (error) {
	if (error instanceof HashiraError && error.code === "FROM_DOMAIN_NOT_REGISTERED") {
		return;
	}

	throw error;
}
```

`code` is a stable identifier, not display copy — map it to your own wording. `status` is the HTTP
status, and `fields` carries per-field messages on a `VALIDATION_ERROR`, keyed by top-level field
name.

## Versioning

**The major version is the API version.** `1.x` speaks `/v1` and nothing else; a future `/v2` would
ship as `2.0.0`. The version segment is therefore not a client option, and `baseUrl` takes an origin
rather than a full path.

Every release is published from
[stellar-code-ship/hashira-sdk](https://github.com/stellar-code-ship/hashira-sdk) with npm
provenance, so you can verify that a tarball was built from that source at a given commit.

## License

MIT
