import type { GetEmailResponse, SendEmailBody, SendEmailResponse } from "../generated/emails.gen.js";
import type { HttpClient } from "../http-client.js";

/**
 * What `send()` accepts.
 *
 * Identical to the wire body except that `scheduledAt` also takes a `Date`, which is what a caller
 * actually has in hand. Every address field already accepts a single string or an array, because
 * the API itself does.
 */
export type SendEmailInput = Omit<SendEmailBody, "scheduledAt"> & {
	/** When to hand the message to the provider. Omit to send immediately. */
	scheduledAt?: Date | string;
};

function toIsoString(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : value;
}

/**
 * Transactional email: `hashira.emails`.
 *
 * A message is composed and sent in one call and is immutable from then on. Sending is accepted
 * asynchronously — a resolved `send()` means the message was queued, not delivered; the outcome
 * arrives as an `EMAIL_SENT` or `EMAIL_FAILED` webhook.
 *
 * Sending and reading one message back are the whole of it, and the whole of this client. Listing,
 * deleting and fetching attachments are not removed from the API — it still serves every one of
 * them — but they moved off the published surface to `/internal/v1` and out of what this package
 * promises. A consumer that needs them calls that prefix directly with the same key.
 */
export class EmailsResource {
	readonly #client: HttpClient;

	constructor(client: HttpClient) {
		this.#client = client;
	}

	/** Sends a message. Resolves with its id once the message is queued. */
	send(input: SendEmailInput): Promise<SendEmailResponse> {
		const { scheduledAt, ...rest } = input;
		const body: SendEmailBody =
			scheduledAt === undefined ? rest : { ...rest, scheduledAt: toIsoString(scheduledAt) };

		return this.#client.request({ method: "POST", path: "/emails", body });
	}

	/**
	 * Reads one message's current state.
	 *
	 * This is the other half of `send()` rather than a second feature: sending is accepted
	 * asynchronously, the `EMAIL_SENT` or `EMAIL_FAILED` webhook that follows carries the message's
	 * id and nothing else, and this is how that id becomes an answer. Metadata only — the stored
	 * message is never read, so calling it once per webhook is cheap.
	 */
	get(emailId: string): Promise<GetEmailResponse> {
		return this.#client.request({ method: "GET", path: `/emails/${encodeURIComponent(emailId)}` });
	}
}
