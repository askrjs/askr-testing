# Changelog

## Unreleased

## 0.5.0 - 2026-10-10

### Breaking

- Reduce the root API from 18 to 11 declaration names. Remove `createTestRequest`, `BodyRequestOptions`,
  `GetHeadOptions`, `RequestHandler`, `RequestTarget`, `FormValue` and `QueryValue`.
  See [each replacement](docs/0.5.0-api.md); no deprecated shim is retained.
- Custom cookie-store write failures now reject injection with the original error. Stores that ignore
  invalid cookies should resolve normally; built-in cookie-policy rejections are still ignored.

### Fixed

- Reject invalid redirect limits before running a target.
- Discard late responses after abort and keep cleanup failures from replacing the original outcome.
- Observe abort during custom cookie reads and writes; stop subsequent writes after cancellation.
- Set Node's required duplex mode for streaming request bodies passed through options.

### Validation

- Qualify the packed artifact through a normal install, strict TypeScript 6 and 7, complete public-name
  enumeration, seven negative removed-name assertions, and private-path rejection.
- Expand deterministic overlap, cookie ordering, abort/cleanup and stream-body coverage. Keep existing
  coverage thresholds and refresh compatible development dependencies.

Prepare the contracted API and sibling dependency ranges for the coordinated 0.5.0 package set.

### Development

- First-party development workflows use Vite+; specialized compiler, runtime,
  browser, and package checks remain part of validation.
