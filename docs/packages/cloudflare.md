# fs-cloudflare

Express-compatible middleware gating inbound traffic to Cloudflare's egress ranges.

```bash
npm install @script-development/fs-cloudflare
```

## What It Does

An app behind Cloudflare is only protected while traffic actually goes through Cloudflare. A bot that resolves the origin — the Fly anycast IP, the `*.fly.dev` hostname — reaches it directly and skips every WAF rule, rate limit and bot score. The gate 403s any request whose client IP is not a published Cloudflare egress address, which closes that direct-hit path.

The ranges are vendored, so the gate does no network I/O at runtime and the package has no dependencies at all.

## Threat Model

The check is "is this address a published Cloudflare egress address" — not "did this request come through _my_ Cloudflare zone". Those ranges are shared by every Cloudflare customer.

- **Closed:** direct hits on the origin — anycast IP, `*.fly.dev`, an origin IP recovered from DNS history or a certificate log.
- **Still open:** an attacker who knows the origin can point their own Cloudflare zone or Worker at it and arrive from a valid egress address, passing the gate while your zone's WAF, rate limits and bot rules never see the request.

Where that relay matters, authenticate the origin rather than range-matching it — Cloudflare Authenticated Origin Pulls (mTLS), or a shared secret injected by the zone's Transform Rule and verified at the origin. This gate composes with either; it does not replace them.

## Basic Usage

```typescript
import {createCloudflareGate} from '@script-development/fs-cloudflare';

const gate = createCloudflareGate({exemptPaths: ['/health']});

// Mount FIRST in the chain: a rejected request should cost nothing.
if (process.env.CLOUDFLARE_ONLY === 'true') app.use(gate.middleware);
```

The package has no enable flag and reads no environment — mounting _is_ the switch, so the kill switch stays where the platform config already lives.

## Options

| Option        | Default           | Meaning                                                        |
| ------------- | ----------------- | -------------------------------------------------------------- |
| `exemptPaths` | `[]`              | Paths that bypass the gate, matched exactly against `req.path` |
| `header`      | `'fly-client-ip'` | Client-IP header read in `'header'` mode                       |
| `source`      | `'header'`        | Where the client IP comes from: `'header'` or `'socket'`       |

`exemptPaths` has no default on purpose: probe paths differ per app (`/healthcheck`, `/health`, …). Exempt yours — a platform health probe reaches the machine directly and never passes Cloudflare, so gating it 403s every probe and stalls deploys.

## Choosing a Source

| Topology                                        | `source`                        | Compared against           |
| ----------------------------------------------- | ------------------------------- | -------------------------- |
| Fly (fly-proxy in front)                        | `'header'`                      | `Fly-Client-IP`            |
| Other edge proxy that writes a client-IP header | `'header'` + `header: '<name>'` | that header                |
| Node terminating TCP directly, no proxy         | `'socket'`                      | `req.socket.remoteAddress` |

In `'header'` mode the configured header must be one the platform edge proxy writes from the TCP peer and overwrites per request. Pointing the option at a client-suppliable header is not a configuration choice, it is a bypass. There is deliberately no fallback chain across several headers: each candidate is only trustworthy on its own platform, and `CF-Connecting-IP` holds the _end user's_ address rather than Cloudflare's egress address.

A missing header passes — the request never crossed the edge proxy (Fly 6PN / internal traffic, local dev). On another platform that means a proxy failing to set the header leaves the gate open; verify the proxy config or use `'socket'` mode.

`'socket'` mode compares the TCP peer, ignores `header`, and fails closed when there is no peer address. It is only correct while Node holds the public listener — behind a load balancer the peer is that balancer and the gate 403s everything.

An unparseable address fails closed in both modes.

## API

`createCloudflareGate(options?)` returns:

- `middleware(req, res, next)` — Express 4/5 compatible handler; calls `next()` or `res.sendStatus(403)`.
- `isCloudflareAddress(value)` — the range check on its own, for health endpoints or diagnostics.

Request and response are duck-typed (`req.path`, `req.get()`, `req.socket`, `res.sendStatus()`), so the package needs no Express dependency and no peer range to widen when Express majors.

## Refreshing the Ranges

```bash
node scripts/update-cf-ranges.mjs   # from the repo root
```

Rewrites `packages/cloudflare/src/ranges.ts` from Cloudflare's published endpoints, leaving it byte-identical when nothing changed. The scheduled `cf-ranges-drift` workflow runs it weekly and fails on drift; the fix is to commit the regenerated file and release a new version, which consumers pick up with a dependency bump.
