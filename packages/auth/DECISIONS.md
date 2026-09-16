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

## D11 — Five surviving mutants

_Fifth survivor added in fix round 3, 2026-09-16; score re-measured at 97.71._

The mutation gate is 90 and the package scores 97.71. Four survivors have no
observable behaviour change; the fifth (added last) has one nobody can provoke
on purpose. Named here so a later reader does not re-derive them:

- `issued += 1` → `issued -= 1`. The read epoch needs distinct successive values
  and a last-writer comparison; counting down satisfies both.
- `() => false` → `() => undefined` on the `isChallenge` default. Both falsy at
  the only place the value is read.
- `const SUPERSEDED = {status: undefined, body: undefined}` → `{}`. Every caller
  reads both properties back as `undefined` either way.
- `status !== undefined && SIGNED_OUT_STATUSES.has(status)` → `true && …`. The
  guard exists for the type checker; `Set.has(undefined)` is already `false`.
- `while (outcome === SUPERSEDED && latestRead !== awaited)` → `while (true && …)`
  in `readUntilSettled` (D17). **Not equivalent, and not deterministically
  killable.** It would make `login()` wait for a newer read even when its own
  confirm answered — a state that needs a read to be issued in the gap between
  `runLoadSession`'s epoch check and `login()`'s next microtask, which no spec
  can arrange without pinning the scheduler rather than the behaviour. The
  condition is still load-bearing: without it a busy app's `login()` chases each
  later read in turn. The _other_ half of the same line is killed three times
  over — `&&` → `||`, `latestRead !== awaited` → `true`, and an emptied loop body
  all TIME OUT, because dropping the break wedges the event loop outright.

## D12 — A primed store forwards what it primed

_Fix round 1, 2026-09-14._

`createHttpService` defaults `withXSRFToken` to **`false`**. A store configured
with `csrf` therefore primed a cookie and then sent every request without the
header derived from it: the prime accomplished nothing, and a cross-origin login
drew exactly the 419 the prime existed to prevent — on every attempt, retry
included.

So a `csrf`-configured store sends `{timeout, withCredentials: true,
withXSRFToken: true}` on **every** request it makes, the prime included. The
credentials flag rides along because the prime itself must be allowed to store
the cookie across the origin boundary.

A store with **no** `csrf` block overrides nothing. It has claimed nothing about
the origin boundary, so the injected service's own configuration is what it uses
— the package does not reach in and decide for a consumer that never asked.

Consequence for `createCsrfPrimer`: its third argument is the request options
object rather than a bare `timeoutMs`. A caller priming across an origin
boundary owes it `withCredentials`.

## D13 — A defect propagates; an answer becomes an outcome

_Fix round 1, 2026-09-14. Closes a gap between this package's own docs and its code._

The rule: **only an HTTP answer, or an axios rejection recording the absence of
one, becomes a session state or an outcome.** Anything else reaching the store is
broken, and a defect that dressed itself as `outage` or as `refused` is
indistinguishable from a real one forever — the shell shows "please try again"
for a fault nobody will ever read (ADR-0048).

Two places were laundering one:

- `parseUser` ran inside the transport `try`, so a throwing consumer type guard
  was caught, classified `outage`, and reported by `login()` as `refused`. It now
  runs **outside** that `try` and its throw propagates. A superseded read never
  calls it at all, so a discarded answer cannot fire a late defect.
- A non-axios rejection from the transport became `outage` on `loadSession()` and
  `refused` on `login()`. Both now rethrow it. fs-http rejects a non-axios error
  untouched, so nothing legitimate arrives that way.

**`logout()` is the deliberate exception.** Ruling 1 (D1) says _any_ failure
leaves the session standing and answers `failed`, and that is kept literally: a
throw out of `logout()` would strand a shell mid-sign-out with the session still
live and nothing to render. The person's question — press it again? — is answered
either way. A defect there is therefore still swallowed into the `failed`
outcome. This is the one place the rule above does not reach, and it is a
ruling's word, not an oversight.

## D14 — `signed_out` clears the user; `outage` keeps it

_Fix round 1, 2026-09-14._

`state` and `user` are written **together**. Writing the machine to `signed_out`
without clearing `user` leaves the previous identity readable behind a dead
session, and a shell keeps rendering a name for somebody who is gone. Every
sign-out path now runs through one of two functions, and both write both.

And every exit **out of `authenticated` into `signed_out`** goes through
`endSession` exactly once, so the consumer hears about it. That was already true
of `handleSessionExpired`; it is now also true of a revalidating `me` that
answers 401 or 419 — by ADR-0050's own rule those two statuses are one class with
one action, and the session ending because a background read discovered it is the
same event as one ending because a request was refused mid-flight. The event
carries no `returnTo` on that path: `loadSession` does not know where the person
is.

From any state **other** than `authenticated`, a 401 still writes `signed_out`
and clears the user but fires **nothing**. Arriving at a login screen with no
session is not an event; there was nothing to end.

`outage` is the opposite case and **retains `user`**. The ADR is explicit that an
outage is never a sign-out, so the identity is still presumed good and a shell
can keep naming it behind a notice. Clearing it would render a broken API as a
sign-out by another route — the exact substitution the `outage` state exists to
prevent. `isAuthenticated` is false throughout, and `setUser` throws, so nothing
can mistake a retained name for a live session.

## D15 — Ending a session stales every read issued before it

_Fix round 2, 2026-09-14._

A session that has ended must not be revived by an answer that predates its
ending. Before this, `clearSession` wrote the machine and left the read epoch
alone, so a `loadSession()` already in flight still held a live ticket:

1. `loadSession()` takes ticket 1 and awaits `me`.
2. `logout()` succeeds — state `signed_out`, user cleared, listeners told.
3. The ticket-1 `me` answers 200 with a good body. Its ticket is still current,
   `parseUser` succeeds, and the store writes `authenticated` with the user back.

The consumer regains guarded access on a session the server has closed, on the
strength of an answer that was already stale when it arrived — and nothing
anywhere is in an error state, which is ADR-0048's failure mode exactly. The
expiry path had the same hole, and there it is worse: `handleSessionExpired`
runs synchronously inside fs-http's error loop, so a concurrent `me` is the
likeliest thing in the world to be in flight at that moment.

`clearSession` now advances the epoch **before** it writes, so every read issued
earlier is stale when it lands. Both ending paths route through it, which is why
the rule attaches there rather than to `endSession`: the bare-clear path (a 401
arriving when no session was live) needs it just as much.

Reads issued **after** the end are untouched and still commit — signing back in
is legitimate, and both `loadSession()` and `login()`'s confirming read take
their ticket at the moment they run. Spec'd in both directions, because a rule
that staled those too would be a worse bug than the one it fixed.

Seed: lokalekeuze ruled this shape as **LK-0291 rule 2** — _"the slot is
invalidated BEFORE the write"_ (`apps/employer/domains/auth/stores/session.ts`,
`logout()`). Same hazard, same ordering, arrived at independently there first.

## D16 — One session, one event

_Fix round 3, 2026-09-16._

`logout()` fired a session-end event after every successful POST, whatever the
machine was doing. `endSession` cleared and notified unconditionally, and the
only guard anywhere read `state.value === 'authenticated'` inside
`handleSessionExpired`. So one session could produce two events:

1. `logout()`'s POST is in flight.
2. A 401 on another request runs `handleSessionExpired` synchronously inside
   fs-http's error loop — `{reason: 'expired'}` fires, state is `signed_out`.
3. The logout POST resolves and `{reason: 'logout'}` fires on top of it.

Two logouts pressed together do the same thing, and a consumer whose listener
navigates or shows a notice does it twice. The ADR says once, the README says
once, and nothing checked.

**The invariant: a session-end event is emitted only for a transition out of a
session that was live.** It is enforced in `endSession` and nowhere else,
because `endSession` is the only place a listener is ever called — the second
logout, the logout behind an expiry and the 401 arriving at a login screen are
all the same question, asked once. The machine is read **before** the clear,
which is what keeps it single-flight: the first caller through writes
`signed_out` with no await in between, so N callers in one tick produce one
event.

**`outage` holds a session.** It retains the user (D14), so a shell is still
naming somebody; ending it is a transition a consumer has to hear about. This
is the half a guard written as "authenticated only" gets wrong, and it is
spec'd from both directions — a logout out of `outage` fires, a logout out of
`signed_out` does not. It also means `handleSessionExpired` now acts from
`outage`, where before it returned: a 401 is the server saying the identity
that state still names is gone.

**The clear stays unconditional.** A successful logout moves the machine
whatever it was doing — the server has spoken, and leaving it `loading` would
state a session nobody has. Only the _notification_ is gated. Reverting to
"return before clearing" reds eight specs, several of them older than this
round: the bare-clear path a 401 takes when nothing is live depends on it.

`handleSessionExpired` keeps an early return, reading the same predicate. That
is not a second copy of the guard but a different question — it is a registrar
callback about _some_ request, so a 401 arriving while nothing is live must
leave the machine entirely alone. Clearing there would take a read ticket
(D15) and stale a `loadSession()` in flight, signing somebody out of an initial
load on the strength of a refusal that was never about their session.

**What a stale button press does:** the POST is still sent. Ruling 1 says the
machine moves on success and says nothing about skipping the request, and the
caller still gets `{kind: 'signed_out'}` — the server did sign it out. What it
does not get is an event for a session that had already ended.

## D17 — A superseded login confirm waits for the machine

_Fix round 3, 2026-09-16._

`login()` awaited its confirming `me` and then decided from `state.value`
alone. `runLoadSession` returns the `SUPERSEDED` sentinel when a newer read took
a ticket while it was in flight — an answer nothing was done with — and
`login()` read that as if it were an answer. Two consequences, one harmful:

- **A false refusal.** A consumer-initiated `loadSession()` (focus
  revalidation, a concurrent navigation's own read) overlaps the confirm. The
  confirm comes back superseded and unparsed, the newer read has not landed,
  `state` is still `loading`, and `login()` answers
  `{kind: 'refused', status: undefined, body: undefined}` for a login the
  server accepted. The person is shown a failure and their session is live.
- **A stale success.** Login A's confirm is superseded by login B's; A reads
  B's `authenticated` and reports success.

**The invariant: `login()` answers from a machine state that a read issued at
or after its own POST has settled** — never from a `loading` left by a read
still in flight, and never from an answer that was discarded.

The store now tracks the newest read as the promise that settles it. A confirm
that comes back superseded waits for that one instead, and repeats while it is
overtaken too. The false refusal disappears, because by the time `login()`
reads the machine the read that overtook its confirm has written it.

**Promise identity, not a second epoch.** `issued` stays the only ordering
authority; the tracked promise answers a different question — is there a newer
_read_ still to settle. It has to be a different question, because
`clearSession` also takes a ticket and issues **no read** (D15). A confirm
superseded by a sign-out therefore has nothing left to wait for, and a wait
keyed on the epoch alone would wait forever. Removing that one condition wedges
the process rather than failing a test, which is why it has a spec of its own.

**The alternative that was rejected:** having `login()` issue a _fresh_ read on
a supersede. It costs an extra request, and two overlapping logins would
supersede each other's re-reads in turn — an unbounded exchange to answer a
question neither caller can act on.

**The residual is accepted and not solved.** Two logins from one browser both
answer `authenticated`, and `user` holds the later one. Whose credentials won
is a server fact; the package cannot name it, and D5 already says `login()`
answers what the machine says. The alternative is a fourth `LoginOutcome` arm
that every consumer must switch on, for a case the package would have to
describe wrongly. Two concurrent logins are a consumer's double-submit, and
single-flighting `login()` is a different invariant from this one — if it is
wanted, it is argued here first.

**How a consumer tells an outage refusal from a credential refusal.**
`{kind: 'refused', status: undefined}` is what both a transport failure and a
discarded answer used to look like. The discriminator is the machine, which is
readable alongside the outcome and — this is the part that is new — has settled
by the time `login()` answers: `state.value === 'outage'` is "the API did not
answer", anything else is a refusal the server issued. `user` follows D14 and
is retained across an outage.

## D18 — Two findings deferred, by name

_Fix round 3, 2026-09-16. Recorded so nobody re-derives them from the code._

Both were raised on PR #255, both are mechanically real, and both are deferred
rather than fixed. Refute-and-defer, with a row each.

**(a) `registerUnauthorizedMiddleware` is unscoped — WR-1441.** A 401 on a
service shared by two stores runs every registered handler, so one guard's
refusal expires the other guard's session. No fleet consumer has that shape:
kendo builds two `createHttpService` instances, isms and lokalekeuze register
one guard per SPA bundle. This package's own two-store spec — _"gives two
stores their own prime, so one cannot spend the other's"_ — shares a stub
`http` object as a **convenience of the fixture, and states no contract**; it
is about the primer, not about the middleware. The fix is an additive option
(scope the handler to a URL predicate or the store's guard) in 0.2.0, where it
can be designed rather than bolted on.

**(b) An older logout response can clear a newer login — WR-1442.** A logout
POST still in flight when a login completes clears the session the login just
established. Concurrent login and logout from one browser is a double-press,
the client cannot order effects the server applied in its own order, and the
failing direction is fail-safe: the consumer is signed out locally while the
cookie is live, and the next `me` restores the session. Ordering mutations
would need a mutation epoch beside the read epoch, which is in tension with
ruling 1 (the machine moves on logout SUCCESS only) and is a design item, not a
fix round.

WR-1442 also carries the three-round trigger: **a fourth concurrency finding on
`session-store.ts` is a spike, not another fix round.** Three rounds have now
each found a real interleaving defect in this one file, which is the shape the
war room's three-round rule exists to catch — the next one is a question about
the design, not a patch.
