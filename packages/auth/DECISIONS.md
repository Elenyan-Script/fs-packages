# fs-auth — decisions

Why this package is shaped the way it is. Every entry names a cost it accepts or
a limitation it lives with, so the argument sits here rather than in a comment
nobody dates. Canonical reasoning: **ADR-0050** (`adrs.script.nl`).

## D1 — A failed logout leaves the session standing

_2026-09-14, Commander ruling. ADR-0050 § Resolved Questions, "Failed logout"._

`logout()` moves the machine to `signed_out` on **success only**. On any failure
the state and the user are unchanged, no `sessionEnd` listener fires, and
nothing probes the server afterwards. A cookie the server still honours must
never be reported as gone — the alternative sends somebody to the entrance while
their session is live. ublgenie's `finally` (tear down regardless) was rejected
for exactly this reason.

## D2 — The session-end event carries the return-to

_2026-09-14, Commander ruling. ADR-0050 § Resolved Questions, "Return-to on session expiry"._

`handleSessionExpired(returnTo?)` passes `returnTo` through to the event. The
consumer's exit writes it under whatever query name the consumer uses; the
package picks none. kendo's expiry path gains what its login path already had.

## D3 — `user` is readonly outward, with one explicit writer

_2026-09-14, Commander ruling. ADR-0050 § Resolved Questions, "Is `user` writable from outside the store?"._

`setUser(next)` is the only writer, and it **throws a `TypeError`** when the
session is not `authenticated`. A profile update landing after expiry is a
defect the consumer has to see (ADR-0048), not a write to swallow. kendo's six
external `user.value` writes become `setUser` calls on adoption.

## D4 — The package fires; the consumer navigates

_2026-09-14, Commander ruling. ADR-0050 § Resolved Questions, "Who navigates on session end?"._

This package registers no navigation and owns no sink. lokalekeuze's
full-document load and kendo's router push are both consumer choices, and a
package cannot know which one it is inside.

## D5 — `login()` always confirms against `me`, and pays one extra request for it

A successful login POST is not treated as proof of a session: `login()` calls
`loadSession()` and answers `authenticated` only if the machine says so. The
cost is one extra round trip on the login path. It buys a single source of
identity — `parseUser` runs in exactly one place, so no consumer can end up with
two readings of who is signed in.

The open case: a consumer whose login body carries the user and whose `me` does
not. Nothing in the fleet is shaped that way today. If one appears, the answer is
argued here first; it is **not** a `loginYieldsUser` switch bolted on quietly.

## D6 — `/%2f%2fevil.com` is accepted

`resolveSafeRedirect` accepts percent-encoded slashes verbatim. They are a path
on the same origin at every sink a consumer can have — the server resolves them
and no URL parser ever sees a host. It is pinned in the vector table so that
turning it into a refusal requires bringing a case rather than a hunch.

The same rule refuses what actually is a vector: ASCII control characters and
whitespace. A browser strips tab, LF and CR _before_ parsing a URL, so
`/<TAB>/evil.com` becomes `//evil.com` at an `href`-shaped sink. The validator
never strips or normalises — a candidate that needed rewriting to be safe was
not safe, and a rewritten one is a different destination than was asked for.

## D7 — The package renders no copy

No sentences, no toasts, no i18n. `login()` and `logout()` return outcomes and
`onSessionEnd` fires events; every consumer writes its own words. This is why
2FA lives behind the `challenge` arm rather than inside the package: the package
admits the login deferred and refuses to guess what it deferred to.

## D8 — A listener's own throw is swallowed

`onSessionEnd` wraps each listener call, so one throwing listener does not cost
the others their notice that the session ended. Nothing is rethrown and nothing
is reported.

This is a deliberate tension with ADR-0048. The package has no reporting
channel — no logger, no tracker, and no `console` it is entitled to write to as
a library — so the choice is between losing one listener's fault and losing
every later listener's notification. A consumer that wants the fault surfaced
catches inside its own listener, where it has a channel.

## D9 — `registerAuthGuard` requires an injected `resolveReturnTo`

fs-router's before-route middleware receives the **matched route record**, whose
`path` is the pattern (`/employers/:id`) and not the URL anybody visited; the
signature is `(to, from)` and carries no location. kendo's own guard gets a third
`toLocation: {fullPath}` argument because kendo's router service supplies one —
fs-router `0.3.0` does not.

So the package cannot compute the return-to, and it will not read a browser
global to get it (D4, and the arch spec forbids it). `resolveReturnTo` is
therefore a **required** option, injected exactly as `isPublic` is. It is
deliberately not defaulted to `to.path`: that silently produces
`/employers/:id`, which is a return-to that looks right and goes nowhere.

The alternative is a change in fs-router — widening `BeforeRouteMiddleware` to
receive the normalised location. That is a sibling decision, not this package's
to take.

## D10 — `user` carries a type assertion on the way out

Vue's `readonly()` maps its argument through `DeepReadonly`, which does not
reduce for an unresolved generic, so `readonly(user)` types as
`Ref<DeepReadonly<TUser> | undefined>` and a consumer's own `TUser` is lost.
The assertion restores it.

The **runtime** guarantee is untouched: the exposed value is still Vue's readonly
proxy and still refuses a write, and the declared `Readonly<Ref<…>>` still
refuses one at compile time. Both are spec'd — a `@ts-expect-error` for the type
and an assertion on the unchanged value for the proxy.

## D11 — Five surviving mutants, all equivalent

The mutation gate is 90 and the package scores 97.09. The five survivors are
mutants with no observable behaviour change, named here so a later reader does
not re-derive them:

- `issued += 1` → `issued -= 1`. The read epoch needs distinct successive values
  and a last-writer comparison; counting down satisfies both.
- `() => false` → `() => undefined` on the `isChallenge` default. Both falsy at
  the only place the value is read.
- Two `return {status: undefined, body: undefined}` → `return {}`, on the two
  superseded-read arms. The caller reads both properties back as `undefined`
  either way.
- `status !== undefined && SIGNED_OUT_STATUSES.has(status)` → `true && …`. The
  guard exists for the type checker; `Set.has(undefined)` is already `false`.
