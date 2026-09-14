# Resources

## Responsibility

This folder holds one class per API resource — the surface a caller reaches as `hashira.<resource>`.
A resource class describes the API's shape; `src/http-client.ts` describes its transport, and the
two must not trade places.

## Allowed structure

- One `<resource>-resource.ts` per tag in the OpenAPI document, exporting one class as its primary
  artifact, plus the input types that class accepts.
- Methods named for the act, not the verb-and-path: `send`, `list`, `get`, `delete`, `restore`.
- Input types that improve on the wire shape where the wire shape is an artifact of transport —
  `Date` beside the ISO string, a real `boolean` where a query parameter is a string. Derive them
  from the generated type with `Omit` so a field added upstream is never silently dropped.

## Rules

- Every method declares an explicit return type. `isolatedDeclarations` is on, and the published
  `.d.ts` must not depend on inference.
- Take the generated response types as they are. A method that reshapes a response hides the API
  from the caller and drifts the moment the API changes.
- Interpolate path segments through `encodeURIComponent`.
- Never reach for `globalThis.fetch` here; the client owns transport, including the injected `fetch`.
- An endpoint that answers with bytes returns the raw `Response`. Buffering an attachment on the
  caller's behalf is not this layer's decision.

## Do not place here

- Transport concerns: headers, retries, timeouts, URL building, error mapping. Those are
  `src/http-client.ts`.
- Generated types. Those are `src/generated`.
