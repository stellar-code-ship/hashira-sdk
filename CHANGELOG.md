# Changelog

All notable changes to `@stellar-code/hashira` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**The major version is the Hashira API version**: `1.x` speaks `/v1`, and a future `/v2` would be
`2.0.0`.

## [Unreleased]

## [1.0.0]

Hashira's published API is one endpoint now, so this client is one method. Everything else it used
to call still exists and still takes the same keys — it moved to `/internal/v1`, which is documented
behind a dashboard session rather than published, and is therefore not something this package can
promise. Sending is what is sold, and sending is what is here.

The host and the prefix changed in the same release, because the API stopped sharing a hostname with
the dashboard and the reference site.

### Changed

- **The default base URL is `https://api.hashira.stellarcode.space`**, and the version prefix is
  `/v1` rather than `/api/v1`. A caller that passed `baseUrl` explicitly must update it; the origin
  is the API now, so naming it twice was redundant.

### Removed

- **`emails.list()`, `emails.get()`, `emails.getContent()`, `emails.deleteMany()`,
  `emails.downloadAttachment()` and `emails.createAttachmentLink()`.** The endpoints behind them are
  alive and unchanged at `/internal/v1/emails`; call that prefix directly with the same key if you
  need them.
- **`ListEmailsInput`, `ListEmailsResponse`, `GetEmailResponse`, `GetEmailContentResponse`,
  `DeleteEmailsResponse`, `CreateEmailAttachmentLinkResponse`, `Email` and `EmailReference`.** They
  described operations that are no longer published.
- **The error codes those operations answered with.** `HashiraErrorCode` now lists only what
  `POST /v1/emails` can answer: `FROM_DOMAIN_NOT_REGISTERED`, `INVALID_API_KEY`, `INVALID_JSON_BODY`,
  `MISSING_API_KEY`, `PAYLOAD_TOO_LARGE` and `VALIDATION_ERROR`. The union still widens with
  `(string & {})`, so switching on a newer code keeps compiling.

## [0.3.0]

Deleting a message now destroys it. The seven-day trash this client could put a message into, and
take it back out of, is gone from the API — that window belongs to whoever holds the mailboxes
indexing a message, because one message at Hashira can be indexed by several of them at once and how
long it should survive is a question the API cannot answer.

### Removed

- **`emails.delete(id, input?)`, `emails.restore(id)` and `emails.restoreMany(ids)`.** The endpoints
  behind them (`DELETE /emails/{emailId}`, `POST /emails/{emailId}/restore` and `PATCH /emails`) no
  longer exist. Delete a single message with `emails.deleteMany([id])`.
- **`DeleteEmailInput` and its `force` flag.** There is no second state for a message to be in, so
  there is nothing to force.
- **`deleted` on `emails.list()`.** There is no trash to list.
- **`deletedAt` and `purgeAt` on `Email`.**
- **The `DeleteEmailResponse`, `RestoreEmailResponse`, `RestoreEmailsResponse`, `EmailDeletion` and
  `BulkEmailFailure` types.** The first four described operations that are gone; the last described a
  shape that now appears once and is inlined where it is used.
- **The `EMAIL_NOT_DELETED` and `EMAIL_NOT_SCHEDULED_FOR_DELETION` error codes.** Nothing answers
  with them any more.

### Changed

- **`emails.deleteMany(ids)` destroys.** It takes no options, and each entry in `results` carries
  only an `id`: with no trash there is no state to report and no date to report it for. It still
  answers per item, and repeating a call is harmless — what is already gone comes back as
  `EMAIL_NOT_FOUND`.

### Added

- **`EmailReference`,** the `{ id }` shape both `send()` and each entry of a delete's `results`
  answer with.

## [0.2.1]

Nothing in the client changed. This release exists to exercise the publishing path itself, which now
stages a tarball for approval rather than sending it straight to the registry — a change to how a
release reaches anyone at all, and one that can only be proven by releasing.

### Changed

- **Publishing is gated on a person.** `release.yml` runs `npm stage publish`, which uploads to a
  queue nobody can install from until a maintainer approves it with 2FA, so a green release run now
  means "your turn" rather than "done". Every other guard around a release covers what goes into the
  tarball; this is the first one covering the act of publishing it.

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
