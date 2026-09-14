/**
 * Which Hashira API this build of the SDK speaks, and where it speaks to by default.
 *
 * The version is a constant rather than a client option on purpose: this package's major version
 * *is* the API version, so `1.x` only ever talks to `/api/v1`. Someone who needs a later API
 * installs the SDK's next major, and there is no way to aim this one at an API it was not typed
 * against. That is also why `baseUrl` takes an origin and never a full path — the version segment
 * is not the caller's to supply.
 */
export const apiVersionPath = "/api/v1";

export const defaultBaseUrl = "https://hashira.stellarcode.space";
