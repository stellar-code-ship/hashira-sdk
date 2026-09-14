# Changelog

All notable changes to `@stellar-code/hashira` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The package is in `0.x` while its surface settles — today it covers Emails alone, and the breaking
changes worth making are the ones found by using it. From `1.0.0` on, **the major version is the
Hashira API version**: `1.x` speaks `/api/v1`, and a future `/api/v2` would be `2.0.0`.

## [Unreleased]

## [0.2.0]

The client moved to its own public repository,
[stellar-code-ship/hashira-sdk](https://github.com/stellar-code-ship/hashira-sdk). Nothing in the
client's behaviour changed.

It previously lived inside Hashira's private monorepo, where keeping the application's source out of
the published tarball depended on guards that lived in the repository they were guarding. A public
repository containing only the client makes that structural instead.

### Added

- **npm provenance.** Every release is now attested, so anyone can verify a tarball was built from
  this repository at a given commit. This was impossible before: npm only accepts provenance from a
  public source repository.

### Changed

- Types are generated from Hashira's published OpenAPI document, fetched from
  `https://hashira.stellarcode.space/openapi.json`, rather than read from a file in the private
  repository.

## [0.1.1]

Nothing in the client changed. This release exists to exercise the publishing path itself, which
now authenticates through npm trusted publishing rather than a long-lived token — a credential
change that can only be proven by publishing.

### Changed

- The published `package.json` gained an `assert-release-context` script entry, used by the release
  workflow. It has no effect on consumers.

## [0.1.0]

### Added

- `Hashira` client with bearer-key authentication against `/api/v1`.
- `hashira.emails`: `send`, `list`, `get`, `getContent`, `delete`, `restore`, `deleteMany`,
  `restoreMany`, `downloadAttachment` and `createAttachmentLink`.
- `HashiraError`, carrying the API's stable `error` code, the HTTP status, and the per-field
  messages a validation failure reports.
