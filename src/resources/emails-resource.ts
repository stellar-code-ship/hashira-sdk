import type {
	CreateEmailAttachmentLinkResponse,
	DeleteEmailResponse,
	DeleteEmailsResponse,
	GetEmailContentResponse,
	GetEmailResponse,
	ListEmailsQuery,
	ListEmailsResponse,
	RestoreEmailResponse,
	RestoreEmailsResponse,
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

/**
 * What `list()` accepts.
 *
 * `deleted` is a real boolean here. On the wire it is a string, because it is a query parameter;
 * translating that is the SDK's job, not the caller's.
 */
export type ListEmailsInput = Omit<ListEmailsQuery, "deleted"> & {
	/** List the messages in the trash instead of the live ones. */
	deleted?: boolean;
};

export type DeleteEmailInput = {
	/**
	 * Destroy the message now instead of waiting out its window. Accepted only on a message already
	 * in the trash, so nothing is ever destroyed by a single call.
	 */
	force?: boolean;
};

function toIsoString(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : value;
}

/**
 * Transactional email: `hashira.emails`.
 *
 * A message is composed and sent in one call and is immutable from then on. Sending is accepted
 * asynchronously — a resolved `send()` means the message was queued, not delivered; the outcome
 * arrives as an `EMAIL_SENT` or `EMAIL_FAILED` webhook, or by reading the message back with
 * `get()`.
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

	/** Reads one message's metadata. A message in the trash is still readable by id. */
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
	 * Moves a message to the trash, where it stays restorable until `purgeAt`.
	 *
	 * Pass `force` to destroy it now instead — accepted only on a message already in the trash.
	 */
	delete(emailId: string, input: DeleteEmailInput = {}): Promise<DeleteEmailResponse> {
		return this.#client.request({
			method: "DELETE",
			path: `/emails/${encodeURIComponent(emailId)}`,
			query: { ...input },
		});
	}

	/** Takes a message back out of the trash. */
	restore(emailId: string): Promise<RestoreEmailResponse> {
		return this.#client.request({ method: "POST", path: `/emails/${encodeURIComponent(emailId)}/restore` });
	}

	/**
	 * Deletes up to 200 messages in one call.
	 *
	 * Unlike every other operation this answers per item rather than all-or-nothing: what it could
	 * act on comes back in `results`, and what it could not in `errors`, under a single success. One
	 * unknown id never refuses the rest.
	 */
	deleteMany(emailIds: string[], input: DeleteEmailInput = {}): Promise<DeleteEmailsResponse> {
		return this.#client.request({
			method: "DELETE",
			path: "/emails",
			query: { ...input },
			body: { emailIds },
		});
	}

	/** Restores up to 200 messages in one call, answering per item the same way `deleteMany` does. */
	restoreMany(emailIds: string[]): Promise<RestoreEmailsResponse> {
		return this.#client.request({ method: "PATCH", path: "/emails", body: { emailIds } });
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
