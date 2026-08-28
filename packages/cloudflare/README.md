# @script-development/fs-cloudflare

Express-compatible middleware gating inbound traffic to Cloudflare's egress ranges.

An app behind Cloudflare is only protected while traffic actually goes through Cloudflare. A bot that
resolves the origin — the Fly anycast IP, the `*.fly.dev` hostname — reaches it directly and skips
every WAF rule, rate limit and bot score. This gate 403s any request whose client IP is not a
published Cloudflare egress address, which closes the direct-hit path.

## Threat model

The check is "is this address a published Cloudflare egress address" — not "did this request come
through _my_ Cloudflare zone". Those egress ranges are shared by every Cloudflare customer.

- **Closed:** direct hits on the origin — the Fly anycast IP, `*.fly.dev`, a raw origin IP found in
  DNS history or a certificate log. That is the traffic this package exists to drop, and it is the
  bulk of untargeted scanning.
- **Still open:** an attacker who knows your origin can point their own Cloudflare zone or Worker at
  it and arrive from a valid Cloudflare egress address. The gate passes them; your zone's WAF, rate
  limits and bot rules never saw the request.

If that relay matters for your app, authenticate the origin instead of range-matching it —
Cloudflare Authenticated Origin Pulls (mTLS), or a shared secret injected by your zone's Transform
Rule and verified at the origin. This gate composes with either; it does not replace them.

## Installation

```bash
npm install @script-development/fs-cloudflare
```

## Usage

```typescript
import {createCloudflareGate} from '@script-development/fs-cloudflare';

const gate = createCloudflareGate({exemptPaths: ['/health']});

// Mount FIRST in the chain: a rejected request should cost nothing.
if (process.env.CLOUDFLARE_ONLY === 'true') app.use(gate.middleware);
```

### Mount first in the chain

Register the gate before body parsing, sessions, SSR — anything that does work. The point of a 403 at
the edge of your app is that a blocked request never reaches the expensive parts.

### The toggle lives in your app, not in the package

The package is middleware only; it has no enable flag and reads no environment. Mounting is the
switch, as in the snippet above. That keeps the kill switch (unset the env var, redeploy) in the
consumer's hands where the platform config already lives.

## API

### `createCloudflareGate(options?)`

Returns `{middleware, isCloudflareAddress}`.

| Option        | Default           | Meaning                                                        |
| ------------- | ----------------- | -------------------------------------------------------------- |
| `exemptPaths` | `[]`              | Paths that bypass the gate, matched exactly against `req.path` |
| `header`      | `'fly-client-ip'` | Client-IP header read in `'header'` mode                       |
| `source`      | `'header'`        | Where the client IP comes from: `'header'` or `'socket'`       |

- `middleware(req, res, next)` — Express 4/5 compatible handler; calls `next()` or `res.sendStatus(403)`.
- `isCloudflareAddress(value)` — the range check on its own, for health endpoints or diagnostics.

The request and response are duck-typed (`req.path`, `req.get()`, `req.socket`, `res.sendStatus()`),
so the package has no Express dependency and no peer range to widen when Express majors.

### `exemptPaths` and health probes

There is no default, deliberately: probe paths differ per app (`/healthcheck`, `/health`, …) and
guessing wrong is a silent failure. Exempt yours — a platform health probe reaches the machine
directly and never passes Cloudflare, so gating it 403s every probe and stalls deploys.

### `source` — pick the one your topology makes true

| Topology                                        | `source`                        | Compared against           |
| ----------------------------------------------- | ------------------------------- | -------------------------- |
| Fly (fly-proxy in front)                        | `'header'`                      | `Fly-Client-IP`            |
| Other edge proxy that writes a client-IP header | `'header'` + `header: '<name>'` | that header                |
| Node terminating TCP directly, no proxy         | `'socket'`                      | `req.socket.remoteAddress` |

**`header` mode — the header must be written by the proxy.** The configured header has to be one the
platform edge proxy sets from the TCP peer and overwrites on every request (fly-proxy does this for
`Fly-Client-IP` on edge traffic). Pointing the option at a header a client can supply is not a
configuration choice, it is a bypass: the caller then declares their own IP.

There is no fallback chain across several headers, on purpose. Each candidate is only trustworthy on
its own platform, and `CF-Connecting-IP` carries the _end user's_ address rather than Cloudflare's
egress address — it can never satisfy this check.

**`header` mode — a missing header passes.** The request never crossed the edge proxy: Fly 6PN /
internal traffic, local dev. On Fly that is exactly right. On another platform it means a proxy that
fails to set the header leaves the gate open — verify the proxy config, or use `'socket'` mode.
Accepted caveat: over 6PN/WireGuard the header is caller-chosen, so the gate is not a defence against
an attacker who is already inside the private network.

**`socket` mode** compares the TCP peer, ignores `header`, and fails closed when there is no peer
address. It is only correct while Node holds the public listener: behind any load balancer or proxy
the peer is that proxy, and the gate 403s everything.

An unparseable address fails closed in both modes.

## Refreshing the ranges

Cloudflare's ranges are vendored (`src/ranges.ts`) so the gate does no network I/O at runtime.

```bash
node scripts/update-cf-ranges.mjs   # from the repo root
```

The script rewrites the module from https://www.cloudflare.com/ips-v4 and `/ips-v6`, and leaves it
byte-identical when nothing changed. The scheduled `cf-ranges-drift` workflow runs it weekly and
fails on drift; the fix is to commit the regenerated file and release a new version — consumers then
pick the ranges up with a dependency bump.
