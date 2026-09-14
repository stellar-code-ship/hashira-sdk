import type { HashiraErrorCode } from "./generated/error-codes.gen.js";

/**
 * Validation messages keyed by top-level field name.
 *
 * The API flattens them, so a nested failure such as `items[0].priceId` collapses under `items`,
 * and a rule spanning two fields reports under whichever one the rule names.
 */
export type HashiraErrorFields = Record<string, string[]>;

export type HashiraErrorOptions = {
	status: number;
	code: HashiraErrorCode;
	fields?: HashiraErrorFields;
	body?: string;
};

/**
 * Every failed request throws one of these.
 *
 * `code` is the stable identifier to branch on — never display copy, so map it to your own wording.
 * It is typed as the union of codes the API documented when this version was published, widened so
 * that a code added later still type-checks rather than breaking a client that already handles it.
 *
 * `body` carries the raw response text for the case the API's own shape does not cover: a handful
 * of routes rethrow an unmapped failure, which the framework answers as a 500 whose body is not the
 * documented JSON envelope at all. When that happens `code` is `UNKNOWN_ERROR` and `body` is the
 * only evidence of what went wrong.
 */
export class HashiraError extends Error {
	/** The HTTP status the API answered with. */
	readonly status: number;

	/** The API's stable error code. */
	readonly code: HashiraErrorCode;

	/** Present only on `VALIDATION_ERROR`. */
	readonly fields: HashiraErrorFields | undefined;

	/** The raw response body, kept for failures the documented envelope does not describe. */
	readonly body: string | undefined;

	constructor(options: HashiraErrorOptions) {
		super(`Hashira API responded ${options.status}: ${options.code}`);

		this.name = "HashiraError";
		this.status = options.status;
		this.code = options.code;
		this.fields = options.fields;
		this.body = options.body;
	}
}
