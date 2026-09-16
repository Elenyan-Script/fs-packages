# fs-auth

Sanctum SPA-cookie session store, safe-redirect guard and auth registrars for `fs-http` + `fs-router`.

```bash
npm install @script-development/fs-auth
```

**Peer dependencies:** `vue ^3.5.42`, `vue-router ^5.3.1`, `@script-development/fs-http ^0.6.0`, `@script-development/fs-router ^0.3.0`

## What It Does

`fs-auth` owns the **session**: whether there is one, how it is established, how it ends, and how the app finds out. It composes `fs-http` (transport plus the response-error hook) and `fs-router` (the middleware slot plus the typed redirect-return) and re-implements neither.

It is deliberately small at the edges. It renders no copy, navigates nowhere, reads no browser global and owns no clock — it returns outcomes and fires events, and the consumer writes the sentences and chooses the exit.

Canonical reasoning: ADR-0050, at [adrs.script.nl](https://adrs.script.nl). The costs it accepts are recorded in `DECISIONS.md` inside the package.

## Basic Usage

```typescript
import {createSessionStore, sanctumEndpoints} from '@script-development/fs-auth';

export const session = createSessionStore<Employer, Credentials>({
    guard: 'employer',
    http: httpService,
    endpoints: sanctumEndpoints('auth/employer'),
    parseUser: (body) => (isEmployer(body) ? body : undefined),
    timeoutMs: 10_000,
});

await session.loadSession();

session.state.value; // 'loading' | 'authenticated' | 'signed_out' | 'outage'
session.isAuthenticated.value; // boolean
session.user.value; // Employer | undefined — readonly
```

## The State Machine

Four states, and the store is their only writer.

| State           | Meaning                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| `loading`       | Nothing has answered yet. The initial state.                                               |
| `authenticated` | `me` answered and `parseUser` recognised the body.                                         |
| `signed_out`    | `me` answered 401 or 419, or a logout succeeded, or the session expired mid-flight.        |
| `outage`        | Anything else — another status, a transport failure, or a body `parseUser` could not read. |

A body `parseUser` refuses is an **outage, never signed out**. Rendering a broken API as "please sign in" invites a password that would have worked a minute earlier.

`state` and `user` are always written together. Every move into `signed_out` clears `user`; `outage` **retains** it, because an outage is not a sign-out and a shell may keep naming the person behind a notice. `isAuthenticated` is false in both, and `setUser` throws in both.

## `createSessionStore(config)`

| Option        | Type                                    | Notes                                                                                                       |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `guard`       | `string`                                | The literal the API keys on. Exposed as `store.guard`; the store reads it nowhere else.                     |
| `http`        | `HttpService`                           | An `fs-http` service. The package never creates one.                                                        |
| `endpoints`   | `{me, login, logout}`                   | Use `sanctumEndpoints(prefix)` or hand-write it.                                                            |
| `parseUser`   | `(body: unknown) => TUser \| undefined` | Your own type guard. `undefined` means outage.                                                              |
| `isChallenge` | `(body: unknown) => boolean`            | Optional. Whether a successful login response defers rather than establishing a session. Defaults to never. |
| `timeoutMs`   | `number`                                | Passed on **every** request the store makes (architectural principle 8).                                    |
| `csrf`        | `{primeUrl: string}`                    | Optional — cross-origin consumers only. See [CSRF priming](#csrf-priming).                                  |

### `loadSession()`

`GET endpoints.me`, then writes the machine. Concurrent calls are ordered by a read epoch: a superseded response writes nothing and never reaches `parseUser`, so two navigations in a row cannot leave the older answer standing under the newer URL.

**Ending a session stales every read issued before it.** A `me` still in flight when `logout()` succeeds or the session expires commits nothing when it lands — it cannot hand back guarded access on the strength of an answer that predates the sign-out. Reads issued _after_ the end are untouched, so signing back in works normally.

A **401 or 419 on a session that was live** is an expiry: the user is cleared and `onSessionEnd` fires once with `{reason: 'expired'}`. Whether that event carries a `returnTo` depends on who got there first — with [`registerUnauthorizedMiddleware`](#registerunauthorizedmiddleware) installed the hook runs before the caller's `catch` and passes the `returnTo` you configured; reached from `loadSession()` alone there is none, because `loadSession` does not know where the person is. Live means `authenticated`, and also `outage` — an outage keeps the user, so a shell is still naming somebody and the 401 says that person is gone. From `loading` or `signed_out` the same status writes `signed_out` and fires nothing: arriving at a login screen is not an event.

### `login(credentials)`

Returns an outcome; it never throws on a status.

```typescript
const outcome = await session.login({email, password});

if (outcome.kind === 'authenticated') return goToDashboard();
if (outcome.kind === 'challenge') return startTwoFactor(outcome.body);

showRefusal(outcome.status, outcome.body); // your copy, your call
```

- `{kind: 'authenticated'}` — the login succeeded **and** `me` confirmed it. Identity has one source; see `DECISIONS.md` D5 for the extra request this costs.
- `{kind: 'challenge', body}` — the login answered without establishing a session (a 2FA step, say). **No state change**, and no `sessionEnd` event. You interpret `body`.
- `{kind: 'refused', status, body}` — everything else, including a `me` that did not authenticate afterwards.

If another read overtakes the confirming `me` — a focus revalidation, a second navigation's own `loadSession()` — `login()` waits for _that_ read to settle and answers from what it wrote. It never reports a refusal for a login the server accepted. `refused` with no `status` is therefore the machine's answer and not a discarded one: read `state.value` alongside the outcome, where `outage` means the API did not answer and anything else means the server refused.

A rejection that is not an HTTP answer — a thrown `parseUser`, a programming error — **propagates out of every operation on the store**, `login()`, `loadSession()` and `logout()` alike. That is a defect, not an outcome, and dressing it as `refused` would show a wrong-password screen for a fault nobody would ever read.

### `logout()`

```typescript
const outcome = await session.logout();

if (outcome.kind === 'failed') showRetryable(); // the session is still live
```

The machine moves to `signed_out` on success, and nothing probes the server behind a failure. What the rule protects is a cookie the server still **honours** — that must never be reported as gone.

So a **401 or 419 from the logout endpoint** is not a failure: it is the server saying it does not honour the cookie. `logout()` answers `{kind: 'signed_out'}`, the session ends once with `{reason: 'expired'}` and no `returnTo` (the server ended it; the button only found out), and nothing probes afterwards. Every other failure — transport, 5xx, 403, 422, 429 — stays `failed` with the session standing. A refused **CSRF prime** is always `failed`: the cookie route is not the logout endpoint, and the logout endpoint was never asked (`DECISIONS.md` D1, amended). A success still moves the machine when there was nothing live to end — a stale button press asks the server and reports what it said — but it fires **no** `onSessionEnd`, because one session ends once (`DECISIONS.md` D16).

`logout()` answers `failed` for every failure the transport **reports** — a status, or an axios rejection saying nothing answered — so the only question the person can act on, press it again, always has an answer. A rejection that is not the transport's is a defect and **propagates**, exactly as it does out of `login()`: it moves the machine no more than a `failed` outcome would, and `failed` with no status is indistinguishable from a network drop (`DECISIONS.md` D13, amended).

### `handleSessionExpired(returnTo?)`

Ends the session and fires `onSessionEnd` with `{reason: 'expired', returnTo}`. **Single-flight**: the first caller flips the state synchronously, so N concurrent 401s produce exactly one event. With nothing live to end it does nothing at all — it leaves even the read epoch alone, so a 401 for somebody else's request cannot stale a `loadSession()` in flight. Called for you by [`registerUnauthorizedMiddleware`](#registerunauthorizedmiddleware).

### `setUser(next)`

The one writer of `user`. It **throws a `TypeError`** while the session is not `authenticated` — a profile update landing after expiry is a defect you need to see, not a write to swallow.

### `onSessionEnd(listener)`

```typescript
const unregister = session.onSessionEnd(({reason, returnTo}) => {
    // The package fires; you navigate. It owns no sink.
    globalThis.location.href =
        reason === 'expired' && returnTo ? `/login?redirect=${encodeURIComponent(returnTo)}` : '/login';
});
```

Returns an unregister function, and **every registration is its own subscription**: registering one function twice fires it twice per event and gives you two unregisters, each independent. Fired once per session end, for `logout` and `expired`, and never for a `challenge`. A listener that throws does not stop the others, and its fault is not reported anywhere — catch inside your own listener if you want it surfaced.

## `resolveSafeRedirect(candidate)`

```typescript
resolveSafeRedirect(route.query.redirect) ?? '/dashboard';
```

Returns the candidate verbatim or `undefined`. It **strips and normalises nothing** — a candidate that needed rewriting to be safe was not safe.

Refused: anything that is not a string, the empty string, anything not starting with `/`, anything starting with `//`, anything containing a backslash, and anything containing an ASCII control character or whitespace. That last rule is the one hand-rolled guards miss: a browser strips tab, LF and CR _before_ parsing a URL, so `/<TAB>/evil.com` becomes `//evil.com` at an `href`-shaped sink.

Percent-encoded slashes (`/%2f%2fevil.com`) are **accepted** — they are a path on the same origin at every sink, and the rule is pinned in the package's vector table.

## Registrars

### `registerAuthGuard`

```typescript
const unregister = registerAuthGuard(routerService, session, {
    loginRouteName: 'login',
    isPublic: (to) => to.meta?.public === true,
    resolveReturnTo: () => globalThis.location.pathname + globalThis.location.search,
    redirectQuery: 'redirect', // default
});
```

Puts the session check on `fs-router`'s middleware slot and returns the unregister function. A guarded route without a session becomes a typed redirect to `loginRouteName`, so a route name that does not exist fails at compile time rather than at the first guarded click.

Both callbacks are **injected, never inferred**. `isPublic` is yours because two territories already disagree about which `meta` key means what. `resolveReturnTo` is yours because fs-router's middleware receives the matched route _record_ — `path` is the pattern (`/employers/:id`), not the URL anybody visited — and this package reads no browser global to find the real one. Return `undefined` and the query is omitted.

### `registerUnauthorizedMiddleware`

```typescript
const unregister = registerUnauthorizedMiddleware(httpService, session, {returnTo: () => globalThis.location.pathname});
```

Puts the 401/419 handler on `fs-http`'s response-error hook. A transport failure is left alone — nothing answered, so nothing said the session was over — and 403, 422, 429 and the rest stay yours to discriminate.

The `authenticated` check is **not** here; it lives in `handleSessionExpired`, so the single-flight guard has one home. fs-http `0.6.0` wraps registered middleware in `guarded()` by default, so this body needs no second wrap.

It also skips a refusal of the store's **own** credential exchange — its login, its logout, the CSRF prime in front of either. fs-http runs every response-error middleware before rejecting to the caller, so without that skip a stale-token 419 on a login would end the session in the middle of the retry that recovers from it, and a refused logout would report an expiry and a failure at once. A refused `me` is the opposite case and stays here: nobody is waiting on its outcome (`DECISIONS.md` D19).

## Status Handling

`SIGNED_OUT_STATUSES` — `401` and `419` — is exported and is the fleet's only declaration of the set. A consumer re-declaring it has forked the stance.

**419 gets no behaviour of its own**, with one exception: a store configured with `csrf` re-primes once on a 419 from `login()` and retries. A second failure is rendered as a refusal, never interpreted, and there is never a third attempt.

## CSRF Priming

`csrf` is **optional and most consumers do not need it**. Laravel 13's `PreventRequestForgery` passes on `Sec-Fetch-Site: same-origin` before the token compare, so a same-origin SPA cannot draw a 419 from a current browser. The residual is genuinely cross-origin consumers and the pre-16.4 Safari tail.

```typescript
csrf: {primeUrl: `${globalThis.location.origin}/sanctum/csrf-cookie`},
```

The URL is absolute because Sanctum's cookie route lives at the app root, not under the API base. The prime is memoised **per store** — two stores on one page prime two guards and never share a slot — and a failed prime is forgotten so the next call retries.

**Configuring `csrf` changes what every request carries.** `createHttpService` defaults `withXSRFToken` to `false`, so a store that primed a cookie and then sent the service's defaults would forward nothing and draw the 419 the prime existed to prevent. A `csrf`-configured store therefore sends `{timeout, withCredentials: true, withXSRFToken: true}` on **every** request it makes, the prime included — the credentials flag because the prime itself must be allowed to store the cookie across the origin boundary.

A store with **no** `csrf` block overrides nothing and uses the injected service's own configuration. It has claimed nothing about the origin boundary, so the package decides nothing for it.

`createCsrfPrimer(http, primeUrl, options)` is exported for a consumer that needs the same memo outside a store. `options` is the per-request config passed through verbatim; a caller priming across an origin boundary owes it `withCredentials`.

## What Stays Yours

Permissions and role models. 2FA enrolment and management. OAuth. Impersonation. Inactivity timers. Toast and sentence copy — and therefore i18n, which never enters this package at all.
