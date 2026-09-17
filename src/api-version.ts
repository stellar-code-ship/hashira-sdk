/**
 * Which Hashira API this build of the SDK speaks, and where it speaks to by default.
 *
 * The version is a constant rather than a client option on purpose: this package's major version
 * *is* the API version, so `1.x` only ever talks to `/v1`. Someone who needs a later API installs
 * the SDK's next major, and there is no way to aim this one at an API it was not typed against.
 * That is also why `baseUrl` takes an origin and never a full path — the version segment is not the
 * caller's to supply.
 *
 * Both values changed in 1.0. The API moved to a host of its own when the dashboard, the reference
 * site and the API stopped sharing one, and the prefix lost its `/api` segment with it: the origin
 * is the API now, so saying so twice was redundant.
 */
export const apiVersionPath = "/v1";

export const defaultBaseUrl = "https://api.hashira.stellarcode.space";
