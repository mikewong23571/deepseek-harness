# Agent Note: Browser RPC UUIDs on insecure origins

Status: implemented

English | [中文](2026-08-13-insecure-origin-rpc-uuid.zh.md)

## Problem

The Web client used `crypto.randomUUID()` before every unary RPC. Browsers expose that operation only in a secure context, so a plain-HTTP deployment bound to a private overlay-network address failed before sending `host.describe`, `llm.providers`, or `settings.describe`. The model-provider page surfaced the failure as `crypto.randomUUID is not a function`, while connection setup could only retry the same local exception.

## Decision

`AbstractApiClient.mintRpcId()` constructs RFC 4122 version 4 identifiers from `crypto.getRandomValues()`. It sets the version and variant bits explicitly and keeps rpcId minting inside the carrier layer. Browsers expose `getRandomValues()` on non-secure origins, while Node and secure browser origins provide the same API.

## Alternatives considered

**Require HTTPS for every remote Web deployment.** Rejected because transport security remains a deployment concern and the carrier does not need a secure-context-only primitive to generate correlation ids.

**Fall back only when `randomUUID` is absent.** Rejected because two implementations would need equivalent coverage without improving the identifier contract; `getRandomValues()` satisfies every supported environment directly.

**Import the client connection package's UUID helper.** Rejected because the API carrier cannot depend backward on a browser composition consumer. A future shared utility can consolidate the identical algorithm if a third owner needs it.

## Consequences

Unary RPCs work over private plain-HTTP origins without weakening randomness or changing the wire format. A deterministic carrier test removes `randomUUID`, supplies `getRandomValues()`, and pins the RFC version and variant bits. This change does not add TLS or authentication; non-loopback deployments still rely on their configured network and browser Host trust policy.
