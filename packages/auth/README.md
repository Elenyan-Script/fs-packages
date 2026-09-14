# @script-development/fs-auth

Sanctum SPA-cookie session store, safe-redirect guard and auth registrars for
[`fs-http`](https://packages.script.nl/packages/http) and
[`fs-router`](https://packages.script.nl/packages/router).

It owns the **session**: whether there is one, how it is established, how it
ends, and how the app finds out. It composes fs-http (transport, the
response-error hook) and fs-router (the middleware slot, the typed
redirect-return) and re-implements neither.

Full API reference: <https://packages.script.nl/packages/auth>.

## Install

```bash
npm install @script-development/fs-auth
```

Peers: `vue`, `vue-router`, `@script-development/fs-http` `^0.6.0`,
`@script-development/fs-router` `^0.3.0`.

## Usage

```ts
import {createSessionStore, sanctumEndpoints} from '@script-development/fs-auth';

export const session = createSessionStore<Employer>({
    guard: 'employer', // the literal the API keys on
    http: httpService, // an fs-http service; the package never creates one
    endpoints: sanctumEndpoints('auth/employer'), // {me, login, logout} — a preset, overridable per key
    parseUser: (body) => (isEmployer(body) ? body : undefined), // your own type guard; `undefined` is an OUTAGE
    timeoutMs: REQUEST_TIMEOUT_MS, // per-call and explicit
});
```

## The four rulings this package encodes

- **A failed logout leaves the session standing.** The machine moves to
  `signed_out` on success only; every failure comes back as a `failed` outcome
  carrying the status and body, and nothing probes the server behind it.
- **Session end carries the return-to.** `handleSessionExpired(returnTo?)` puts
  it on the event; your exit writes it under your own query name.
- **`user` is readonly outward.** `setUser(next)` is the one writer, and it
  throws while the session is not authenticated.
- **The package fires; you navigate.** `onSessionEnd` gives you the event. This
  package registers no navigation and owns no sink.

## What it deliberately does not do

- **It renders no copy.** No sentences, no toasts, no i18n — `login()` and
  `logout()` return outcomes and you write the words.
- **It navigates nowhere** and it reads no browser global. A package cannot know
  its consumer's sink, so it does not pretend to own one.
- **No 2FA, OAuth, impersonation, permissions or inactivity timers.** A login
  that defers comes back as `{kind: 'challenge', body}` and you interpret it.
- **It creates no HTTP service and no router.** Both are injected.

Decisions and their costs: `DECISIONS.md` in this package.
