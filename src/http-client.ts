import { apiVersionPath, defaultBaseUrl } from "./api-version.js";
import type { HashiraErrorFields } from "./hashira-error.js";
import { HashiraError } from "./hashira-error.js";

/**
 * The shape of `fetch` the client needs.
 *
 * It is injectable so tests can answer without a network, and so a runtime that needs its own agent
 * or instrumentation can supply one.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HashiraOptions = {
	/**
	 * The origin to talk to — scheme and host only, no path. The client appends the API version
	 * itself. Defaults to Hashira's production origin.
	 */
	baseUrl?: string;

	/** Replaces the global `fetch`. */
	fetch?: FetchLike;

	/** Aborts a request that has not answered in this many milliseconds. Off by default. */
	timeoutMs?: number;

	/** Extra headers on every request. The `Authorization` header cannot be overridden. */
	headers?: Record<string, string>;
};

/** A query value before it is serialized. `undefined` means "leave the parameter out". */
export type QueryValue = string | number | boolean | undefined;

export type HashiraRequest = {
	method: "GET" | "POST" | "PATCH" | "DELETE";
	path: string;
	query?: Record<string, QueryValue>;
	body?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFields(value: unknown): HashiraErrorFields | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const fields: HashiraErrorFields = {};

	for (const [name, messages] of Object.entries(value)) {
		if (Array.isArray(messages)) {
			fields[name] = messages.map(String);
		}
	}

	return fields;
}

/**
 * Turns every request into a `fetch` and every failure into a `HashiraError`.
 *
 * Nothing here knows what a resource is; the resource classes describe the API's shape and this
 * describes its transport.
 */
export class HttpClient {
	readonly #apiKey: string;
	readonly #baseUrl: string;
	readonly #fetch: FetchLike;
	readonly #timeoutMs: number | undefined;
	readonly #headers: Record<string, string>;

	constructor(apiKey: string, options: HashiraOptions = {}) {
		if (typeof apiKey !== "string" || apiKey.length === 0) {
			throw new TypeError("A Hashira API key is required.");
		}

		const resolvedFetch =
			options.fetch ??
			(typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined);

		if (resolvedFetch === undefined) {
			throw new TypeError(
				"No global fetch is available in this runtime. Pass one as `fetch` in the client options.",
			);
		}

		this.#apiKey = apiKey;
		// A trailing slash on the origin would otherwise join into `//v1`, which some proxies
		// answer with a redirect the request's Authorization header does not survive.
		this.#baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
		this.#fetch = resolvedFetch;
		this.#timeoutMs = options.timeoutMs;
		this.#headers = options.headers ?? {};
	}

	buildUrl(path: string, query?: Record<string, QueryValue>): string {
		const url = new URL(`${this.#baseUrl}${apiVersionPath}${path}`);

		for (const [name, value] of Object.entries(query ?? {})) {
			if (value !== undefined) {
				// `String(true)` is `"true"`, which is exactly what the API's boolean query parameters
				// parse: they arrive as strings and are read as such.
				url.searchParams.set(name, String(value));
			}
		}

		return url.toString();
	}

	/** Sends the request and returns the raw `Response`, for the endpoints that answer with bytes. */
	async send(request: HashiraRequest): Promise<Response> {
		// The caller's headers go on first so the SDK's own always win: an Authorization header
		// overwritten by accident would send the wrong key, or none.
		const headers: Record<string, string> = {
			...this.#headers,
			authorization: `Bearer ${this.#apiKey}`,
		};

		let body: string | undefined;

		if (request.body !== undefined) {
			headers["content-type"] = "application/json";
			body = JSON.stringify(request.body);
		}

		const init: RequestInit = { method: request.method, headers };

		if (body !== undefined) {
			init.body = body;
		}

		if (this.#timeoutMs !== undefined) {
			init.signal = AbortSignal.timeout(this.#timeoutMs);
		}

		const response = await this.#fetch(this.buildUrl(request.path, request.query), init);

		if (!response.ok) {
			throw await this.#toError(response);
		}

		return response;
	}

	/** Sends the request and reads the JSON body. */
	async request<TResponse>(request: HashiraRequest): Promise<TResponse> {
		const response = await this.send(request);

		return (await response.json()) as TResponse;
	}

	async #toError(response: Response): Promise<HashiraError> {
		const text = await response.text().catch(() => "");

		// A few routes rethrow a failure they do not map, and the framework answers those as a 500
		// whose body is not the documented envelope — sometimes not even JSON. Parsing has to be
		// allowed to fail here, or a server-side bug would surface as a SyntaxError from the SDK.
		let parsed: unknown;

		try {
			parsed = JSON.parse(text) as unknown;
		} catch {
			parsed = undefined;
		}

		if (isRecord(parsed) && typeof parsed.error === "string") {
			const fields = readFields(parsed.fields);

			return new HashiraError({
				status: response.status,
				code: parsed.error,
				...(fields === undefined ? {} : { fields }),
				body: text,
			});
		}

		return new HashiraError({ status: response.status, code: "UNKNOWN_ERROR", body: text });
	}
}
