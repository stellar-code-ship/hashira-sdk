# Generated API types

## Responsibility

This folder holds the request and response types emitted from Hashira's committed OpenAPI document.
It is the SDK's half of the contract, and it is generated so that it cannot drift from the API by
hand.

## Rules

- **Never edit these files.** Run `bun run generate-api-types` and commit the result, the same way
  `apps/web/src/routeTree.gen.ts` is regenerated rather than edited.
- `bun run check-api-types` fails when the committed output no longer matches the document. CI runs
  it, and the package's `test` task depends on it.
- Every file is named `*.gen.ts`, so the suffix says "generated" at each import site rather than
  only in this directory.
- The generator names a shape that repeats across operations instead of inlining it twice, and it
  refuses to run when it meets a repeated shape it has no name for. Name it in `sharedShapeNames` in
  `scripts/generate-api-types.ts` rather than working around the failure.
- Widening the SDK to a new resource means adding its tag to `shippedTags` in that same script.
- The file header deliberately names no path. `apps/web` is one of the markers
  `scripts/verify-package-contents.ts` refuses to publish, and these files are compiled into `dist`
  with their comments intact.

## Do not place here

- Hand-written types, helpers, or anything with a runtime value. These files are types only, so the
  folder costs a consumer nothing at runtime.
