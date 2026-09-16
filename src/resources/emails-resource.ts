import type {
	CreateEmailAttachmentLinkResponse,
	DeleteEmailsResponse,
	GetEmailContentResponse,
	GetEmailResponse,
	ListEmailsQuery,
	ListEmailsResponse,
	SendEmailBody,
	SendEmailResponse,
} from "../generated/emails.gen.js";
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

/** What `list()` accepts. */
export type ListEmailsInput = ListEmailsQuery;

function toIsoString(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : value;
}

/**
 * Transactional email: `hashira.emails`.
 *
 * A message is composed and sent in one call and is immutable from then on. Sending is accepted
 * asynchronously — a resolved `send()` means the message was queued, not delivered; the outcome
 * arrives as an `EMAIL_SENT` or `EMAIL_FAILED` webhook, or by reading the message back with
 * `get()`. Deleting is the other end of that: `deleteMany()` destroys, and nothing here puts a
 * message back.
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
	 * Lists messages, newest first.
	 *
	 * Paging is keyset on the id: pass the previous page's `nextCursor` back as `cursor`. A null
	 * `nextCursor` is the last page.
	 */
	list(query: ListEmailsInput = {}): Promise<ListEmailsResponse> {
		return this.#client.request({ method: "GET", path: "/emails", query: { ...query } });
	}

	/** Reads one message's metadata. */
	get(emailId: string): Promise<GetEmailResponse> {
		return this.#client.request({ method: "GET", path: `/emails/${encodeURIComponent(emailId)}` });
	}

	/**
	 * Reads one message's body and the metadata of its attachments.
	 *
	 * The body is not stored in the database — it is read back out of the stored raw message — so
	 * this is a heavier call than `get()`. Each attachment arrives with a signed `downloadUrl` that
	 * needs no API key and stops working within the hour.
	 */
	getContent(emailId: string): Promise<GetEmailContentResponse> {
		return this.#client.request({ method: "GET", path: `/emails/${encodeURIComponent(emailId)}/content` });
	}

	/**
	 * Destroys up to 200 messages, with their stored bodies and every attachment.
	 *
	 * The only deletion this API has, and there is no undoing it: no trash, no restore, and no
	 * single-message form — a set is how it answers, and a caller wanting to delete one sends a set
	 * of one. Any window between deciding and destroying is yours to keep, because how long a message
	 * should survive is a question about the mailboxes holding it, which the API cannot see.
	 *
	 * Unlike every other operation this answers per item rather than all-or-nothing: what it
	 * destroyed comes back in `results`, and what it could not act on in `errors`, under a single
	 * success. One unknown id never refuses the rest, and repeating a call is harmless — what is
	 * already gone comes back as `EMAIL_NOT_FOUND`.
	 */
	deleteMany(emailIds: string[]): Promise<DeleteEmailsResponse> {
		return this.#client.request({
			method: "DELETE",
			path: "/emails",
			body: { emailIds },
		});
	}

	/**
	 * Downloads one attachment's bytes.
	 *
	 * Answers with the raw `Response` so the caller decides how to read it — `arrayBuffer()`,
	 * `blob()`, or streaming `body` straight through. An attachment can be large, and buffering one
	 * on the caller's behalf is not the SDK's call to make.
	 */
	downloadAttachment(emailId: string, attachmentId: string): Promise<Response> {
		return this.#client.send({
			method: "GET",
			path: `/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
		});
	}

	/**
	 * Mints a signed link to one attachment.
	 *
	 * The signature is the authorization, so the link can be handed to a browser directly instead of
	 * fetching the bytes with your key and serving them on again. Treat it as the bearer capability
	 * it is: one attachment, good for about an hour.
	 */
	createAttachmentLink(emailId: string, attachmentId: string): Promise<CreateEmailAttachmentLinkResponse> {
		return this.#client.request({
			method: "POST",
			path: `/emails/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}/link`,
		});
	}
}
