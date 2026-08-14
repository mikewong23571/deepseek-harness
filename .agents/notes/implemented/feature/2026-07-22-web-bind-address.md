# Agent Note: Explicit web bind address

Status: implemented

English | [中文](2026-07-22-web-bind-address.zh.md)

## Problem

`dsh web` binds every network interface even when its browser runs on the same machine. Local use therefore exposes an unauthenticated development server without an explicit operator choice, while remote-container and LAN-browser use still needs a supported way to accept non-loopback connections.

The HTTP carrier also hides the bind address inside `startWebServer()`, so alternate shells cannot state their own network policy at the package boundary.

## Decision

`dsh web` binds `127.0.0.1` by default. The CLI accepts a specific hostname or IP address and rejects `0.0.0.0`, so remote deployments name the interface they intend to expose instead of opening every interface. A specific bind becomes the canonical printed URL and an automatically trusted `/api` authority.

`WebServer.Config.host` is a required non-empty string. The HTTP carrier passes that value to `node:http` without supplying a fallback, leaving each shell responsible for its bind policy.

## Alternatives considered

**Keep `0.0.0.0` as the default.** Rejected because ordinary same-machine use does not need network-wide reachability and should not acquire it implicitly.

**Use a boolean exposure flag.** Rejected because `--host 0.0.0.0` names the resulting socket behavior directly and matches the underlying server option without introducing a second term.

**Default inside `startWebServer()`.** Rejected because the carrier has multiple possible shells and no basis for choosing their deployment policy. Requiring `host` makes the choice visible at every assembly call.

## Consequences

Local `dsh web` starts remain reachable at `http://127.0.0.1:3080`; a browser on another machine uses `dsh web --host <specific-address>`. Binding does not add authentication, TLS, or authorization, so the named interface must already be a trusted network. Server and Web-runtime tests pin loopback defaults, specific-address forwarding, automatic Host trust, and canonical URL reporting.
