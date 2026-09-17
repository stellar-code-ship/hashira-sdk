import type { HashiraOptions } from "./http-client.js";
import { HttpClient } from "./http-client.js";
import { EmailsResource } from "./resources/emails-resource.js";

/**
 * The Hashira API client.
 *
 * ```ts
 * import { Hashira } from "@stellar-code/hashira";
 *
 * const hashira = new Hashira(process.env.HASHIRA_API_KEY);
 * const { id } = await hashira.emails.send({
 *   from: "billing@example.com",
 *   to: "customer@example.com",
 *   subject: "Your invoice",
 *   html: "<p>Attached.</p>",
 * });
 * ```
 *
 * The key decides everything about scope: which project the call belongs to, and whether it reads
 * and writes live or test data. Nothing in a request says which mode it is in, so switching between
 * them means switching keys.
 *
 * This is the entry point rather than a re-export file: the class is the package's one primary
 * artifact, and the `exports` map in `package.json` is what a barrel file would otherwise be.
 */
export class Hashira {
	/** Transactional email. */
	readonly emails: EmailsResource;

	constructor(apiKey: string, options: HashiraOptions = {}) {
		const client = new HttpClient(apiKey, options);

		this.emails = new EmailsResource(client);
	}
}

export type { SendEmailResponse } from "./generated/emails.gen.js";
export type { HashiraErrorCode } from "./generated/error-codes.gen.js";
export type { HashiraErrorFields, HashiraErrorOptions } from "./hashira-error.js";
export { HashiraError } from "./hashira-error.js";
export type { FetchLike, HashiraOptions } from "./http-client.js";
export type { SendEmailInput } from "./resources/emails-resource.js";
