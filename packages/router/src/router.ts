import type {LocationQueryRaw, NavigationHookAfter, RouteLocationRaw, RouteRecordRaw} from 'vue-router';

import {computed, shallowRef} from 'vue';
import {createRouter, createWebHistory, isNavigationFailure, NavigationFailureType} from 'vue-router';

import type {BeforeRouteMiddleware, MiddlewareRedirect, RouteName, RouterService, RouterServiceOptions} from './types';

import {createRouterLink, createRouterView} from './components';
import {CREATE_PAGE_NAME, EDIT_PAGE_NAME, OVERVIEW_PAGE_NAME, SHOW_PAGE_NAME} from './routes';

export const createRouterService = <Routes extends RouteRecordRaw[]>(
    routes: Routes,
    options?: RouterServiceOptions,
): RouterService<Routes> => {
    const router = createRouter({history: createWebHistory(options?.base), routes});

    const flattenedRoutes = routes
        .flatMap((route) => ('children' in route ? route.children : route))
        .filter((route): route is RouteRecordRaw => Boolean(route));

    const getRoutePath = (name: string): string => router.getRoutes().find((route) => route.name === name)?.path ?? '';

    const resolveParentId = (overrideParentId?: number): string | number | undefined => {
        if (overrideParentId) return overrideParentId;

        // CRUD routes use single :parentId — repeatable params (:parentId+) are not supported
        return currentRouteRef.value.params.parentId as string | undefined;
    };

    const resolveRouteParams = (
        name: string,
        id?: number | string,
        overrideParentId?: number,
    ): Record<string, string | number> => {
        const params: Record<string, string | number> = {};
        const targetPath = getRoutePath(name);
        const parentId = resolveParentId(overrideParentId);

        if (parentId) params.parentId = parentId;
        if (id) {
            params.id = id;
            if (!params.parentId || !targetPath.includes(':id')) params.parentId = id;
        }

        return Object.fromEntries(Object.entries(params).filter(([key]) => targetPath.includes(`:${key}`)));
    };

    const buildRouteLocation = (
        name: RouteName<Routes>,
        id?: number | string,
        query?: LocationQueryRaw,
        parentId?: number,
    ): RouteLocationRaw => {
        const route: RouteLocationRaw = {name};
        const params = resolveRouteParams(name as string, id, parentId);

        if (Object.keys(params).length > 0) route.params = params;
        if (query) route.query = query;

        return route;
    };

    // Guards only run on a later microtask, so a consumer that mounts in the same turn as a
    // programmatic navigation would otherwise observe the sentinel route with nothing marked in
    // flight — and paint the fallback. `install()` opens the window for exactly that reason;
    // `goToRoute`/`replaceRoute` are the same entry point reached from consumer code.
    //
    // Closing in a `finally` is safe BECAUSE the window is a count (WR-1119 r8). The hop this
    // wrapper aborts in order to dispatch a redirect resolves while its successor is still running
    // its guards — but the successor's own dispatch was counted in, synchronously, before the
    // predecessor could be aborted, so the count never reaches zero across a chain. Under the
    // boolean this was not true and the close had to be withheld here.
    const dispatchNavigation = async (navigate: () => Promise<unknown>, reportUnreported = true): Promise<void> => {
        beginDispatch();

        try {
            await navigate();
        } catch (error) {
            // `router.push`/`replace` throw SYNCHRONOUSLY for an unknown route name, and reject
            // when a guard throws. The synchronous throw reaches neither `afterEach` nor
            // `triggerError`, so on a cold start this is the only path that can settle readiness.
            settleReadiness(error);

            // ...and, after the latch has closed, the only path that can REPORT it either: a
            // post-settle `goToRoute('nope')` reached no reporter at all and was visible solely as
            // the caller's rejection — invisible to `RouterLink`, which drops the promise. Last
            // resort by construction: it defers to whoever recorded first. A redirect dispatch
            // opts OUT (`reportUnreported: false`) because it has its own designated reporter,
            // which names the redirect rather than the navigation.
            if (reportUnreported && !alreadyReported(error)) {
                recordReported(error);
                console.error('fs-router: navigation failed', error);
            }

            throw error;
        } finally {
            endDispatch();
        }
    };

    const goToRoute: RouterService<Routes>['goToRoute'] = (name, id, query, parentId) =>
        dispatchNavigation(() => router.push(buildRouteLocation(name, id, query, parentId)));

    const replaceRoute: RouterService<Routes>['replaceRoute'] = (name, id, query, parentId) =>
        dispatchNavigation(() => router.replace(buildRouteLocation(name, id, query, parentId)));

    // The redirect a middleware returns, dispatched as its own navigation. It is `goToRoute` /
    // `replaceRoute` in everything but the last-resort reporter, which it declines: the `.catch`
    // attached at the call site is this path's designated reporter and names the redirect.
    const dispatchRedirect = (redirect: MiddlewareRedirect<Routes>): Promise<void> =>
        dispatchNavigation(() => {
            const location = buildRouteLocation(redirect.name, redirect.id, redirect.query, redirect.parentId);

            return redirect.replace ? router.replace(location) : router.push(location);
        }, false);

    const normalizedRouteToSpecificRoute: RouterService<Routes>['normalizedRouteToSpecificRoute'] = (route) => {
        const specificRoute = flattenedRoutes.find(({path, name}) => name === route.name || path === route.path);

        if (!specificRoute) throw new Error(`${route.path} is an unknown route`);

        return specificRoute;
    };

    const getUrlForRouteName: RouterService<Routes>['getUrlForRouteName'] = (name, id, query, parentId) =>
        router.resolve({name, params: resolveRouteParams(name as string, id, parentId), query}).fullPath;

    // Readiness is a fact this service knows, not one it asks vue-router for. fs-router redirects
    // by ABORTING — the wrapper below dispatches its own navigation and returns `false`, which
    // vue-router records as a type-4 abort and reports through `markAsReady(error)`. Keying
    // readiness on `router.isReady()` therefore mislabels every redirecting first hop as a failure
    // (a false warn on every cold load of an auth-guarded app) and leaves `ready === false` with an
    // emptied handler list, so a later `isReady()` never settles.
    //
    // `navigating` is true while a navigation is in flight; `RouterView` paints nothing only while
    // it is true AND the route is still the sentinel. A redirect chain keeps it true throughout, so
    // no frame exists in which the route is START_LOCATION with nothing in flight — that is what
    // would flash the not-found fallback between the abort and the redirected hop finalizing.
    // A service nobody navigates leaves it false, so an un-navigated view keeps the fallback.
    //
    // It is DERIVED from two counts, not set directly (WR-1119 r8). Two navigations can be
    // outstanding at once — a redirect chain always has two, and nothing stops a consumer
    // dispatching two hops in one turn — and a boolean cannot say "one of the two ended", so
    // whichever ended first closed the window for both. The counts answer different questions and
    // must stay separate:
    //
    //   `openHops`       — navigations vue-router entered `beforeEach` for and has not yet ended.
    //                      This is the one that answers "is a SUCCESSOR still running?", which
    //                      `onError` needs and can get no other way: it is handed neither a `to`
    //                      nor a `failure`, so it has none of the evidence `afterEach` reasons on.
    //   `openDispatches` — navigations THIS service asked for whose promise has not settled. It
    //                      exists only to cover the microtask gap before guards run. It must stay
    //                      OUT of the successor test: a lone hop's own dispatch is still open when
    //                      its terminal fires, and counting it would leave readiness never settling.
    const navigating = shallowRef(false);
    let openHops = 0;
    let openDispatches = 0;

    const syncNavigating = (): void => {
        navigating.value = openHops > 0 || openDispatches > 0;
    };

    const beginDispatch = (): void => {
        openDispatches += 1;
        syncNavigating();
    };

    const endDispatch = (): void => {
        openDispatches -= 1;
        syncNavigating();
    };

    const beginHop = (): void => {
        openHops += 1;
        syncNavigating();
    };

    // Floored at zero, because ONE vue-router outcome ends a navigation that never entered
    // `beforeEach`: a push to the location already showing short-circuits to NavigationDuplicated
    // and goes straight to `afterEach`. Flooring makes that a no-op instead of a negative count
    // that would report the window closed while a real hop is still running.
    const endHop = (): void => {
        openHops = Math.max(0, openHops - 1);
        syncNavigating();
    };

    // Set once, by the first navigation that is not a redirect-abort of this wrapper's own making.
    let settled = false;
    let markSettled!: () => void;
    // Resolves — never rejects — on both success and genuine failure. A rejecting readiness promise
    // on a cancelled first hop is what hung consumers before.
    const readyPromise = new Promise<void>((resolve) => {
        markSettled = resolve;
    });

    // One fs-router console line per genuine failure, however many reporters are in a position to
    // see it. THREE are: `onError` below, the cold-start warn inside the settle latch, and the
    // `.catch` on the navigation a middleware redirect dispatches. A redirect into a target whose
    // guard throws is seen by two of them at once, and which two depends on the chain's shape — so
    // the rule is positional, not a count: a reporter records the failure it reports, and the
    // redirect reporter stays silent for a failure someone already reported. `triggerError` calls
    // its error handlers SYNCHRONOUSLY and only then returns `Promise.reject(error)`, so `onError`
    // has always recorded by the time that `.catch` runs.
    //
    // Keyed by object identity, so two failures can never be confused for one. A primitive throw
    // cannot be recorded at all and is therefore always reported — loud on the case the ledger
    // cannot track, because a silent path is the failure class this release exists to close.
    const reportedFailures = new WeakSet<object>();

    // `WeakSet.add` THROWS for a primitive, so an untrackable throw is simply never recorded.
    const recordReported = (failure: unknown): void => {
        if (failure instanceof Object) reportedFailures.add(failure);
    };

    // `WeakSet.has`, unlike `add`, answers false for a primitive instead of throwing — so the
    // untrackable case needs no guard here: never recorded, therefore always reported.
    const alreadyReported = (failure: unknown): boolean => reportedFailures.has(failure as object);

    // The one place readiness settles. vue-router has THREE terminal paths and `afterEach` is only
    // one of them: a guard that throws is routed through `triggerError`, which skips `afterEach`
    // entirely, and `router.push({name})` throws synchronously for an unknown name. Settling from
    // a single path is what left a thrown guard with an `isReady()` that never settled.
    //
    // It does NOT touch the in-flight window. Those were one function until r8, and fusing them is
    // what let a hop that ended early close a window another hop still needed: the window is a
    // count every terminal decrements, settling is a once-per-service latch each terminal decides
    // separately whether to trip. Idempotent, so every terminal path may call it.
    const settleReadiness = (failure?: unknown): void => {
        if (settled) return;

        settled = true;
        // The CANCEL/ABORT channel, and only it. A cancelled navigation is not an error — an auth
        // middleware cancels on every guarded click — so it is worth a signal exactly once, on the
        // cold start it left sitting on the fallback, and never again. A redirect never reaches
        // here at all. A thrown error that reaches `triggerError` does NOT arrive with a `failure`:
        // `router.onError` below reports those, outside this latch, because reporting is
        // per-failure. The one throw that DOES arrive here is the synchronous unknown-name push,
        // which `triggerError` never sees — recorded, so the redirect reporter defers to this line
        // instead of adding a second one for the same failure.
        if (failure) {
            recordReported(failure);
            console.warn('fs-router: the first navigation did not complete, rendering not-found', failure);
        }

        markSettled();
    };

    // `to.fullPath` of every hop this wrapper aborted in order to dispatch a redirect. Keyed rather
    // than latched: vue-router runs the redirected hop's `beforeEach` BEFORE the aborted hop's
    // `afterEach` (observed: before:home, before:about, after:home:fail4, after:about:ok), so a
    // latch cleared on the next `beforeEach` entry would already be gone when `afterEach` reads it.
    //
    // Every aborted hop always produces exactly one `afterEach`, so the set always drains. What
    // membership CANNOT say is WHICH hop an entry belongs to, and with two hops outstanding on the
    // same path that matters — see the read order in `afterEach` below (WR-1119 r8).
    const redirectAbortedPaths = new Set<string>();

    // Bounds the middleware redirect-return chain. Each returned `MiddlewareRedirect` cancels the
    // pending hop and dispatches a fresh navigation, which re-enters `beforeEach` and re-runs the
    // whole chain — so two middleware that redirect into each other's guarded routes (a
    // misconfigured login↔dashboard guard) would recurse without bound. `redirectDepth` counts
    // consecutive redirects and is reset to 0 the moment a chain terminates — a navigation is
    // allowed to proceed, or a middleware cancels without redirecting — so the cap only ever trips
    // on a genuine loop, never on unrelated back-to-back navigations. Mirrors vue-router's own
    // internal max-redirect ceiling.
    const MAX_REDIRECT_DEPTH = 10;
    let redirectDepth = 0;

    const beforeRouteMiddleware: BeforeRouteMiddleware<Routes>[] = [];
    router.beforeEach(async (to, from) => {
        beginHop();

        const toNormalized = normalizedRouteToSpecificRoute(to);
        const fromNormalized = from.name ? normalizedRouteToSpecificRoute(from) : toNormalized;

        let cancelled = false;
        for (const middleware of beforeRouteMiddleware) {
            const result = await middleware(toNormalized, fromNormalized);
            if (result === false) continue;

            // A truthy object return cancels the pending hop and navigates to the target in one
            // step — replace when `replace: true`, push otherwise. A boolean `true` just cancels.
            if (result !== true) {
                if (redirectDepth >= MAX_REDIRECT_DEPTH) {
                    redirectDepth = 0;
                    console.error(
                        `fs-router: middleware redirect chain exceeded ${MAX_REDIRECT_DEPTH} hops — aborting to break a redirect loop`,
                    );

                    return false;
                }

                redirectDepth += 1;
                // Fire-and-forget: the dispatch resolves once the redirect navigation settles.
                // `router.push`/`replace` resolve (not reject) for NavigationDuplicated/Aborted, but
                // they DO reject when a guard or lazy component further down the redirected chain
                // throws — attach a reporter so that surfaces instead of an unhandled rejection.
                // It defers to whoever reported first, because a downstream throw also reaches
                // `onError`; it still reports on its own for the one failure `onError` CANNOT see,
                // an unknown route name, where `router.push({name})` throws synchronously and
                // nothing is ever routed through `triggerError`.
                void dispatchRedirect(result).catch((error: unknown) => {
                    if (alreadyReported(error)) return;

                    console.error('fs-router: middleware redirect navigation failed', error);
                });

                // The chain continues in the dispatched navigation — do NOT reset the depth here,
                // and do NOT let this hop's abort end the in-flight window or reach the console:
                // the redirect is a success in progress, not a failed navigation.
                redirectAbortedPaths.add(to.fullPath);

                return false;
            }

            // Plain `true` cancels the hop without redirecting; the chain terminates.
            cancelled = true;
            break;
        }

        // The chain terminated without dispatching a redirect (a `true` cancel or a clean proceed),
        // so reset the depth for the next, unrelated navigation.
        redirectDepth = 0;

        return cancelled ? false : undefined;
    });

    const afterRouteMiddleware: NavigationHookAfter[] = [...(options?.afterRouteCallbacks ?? [])];
    router.afterEach((to, from, failure) => {
        // The hop is over either way, so the count comes down unconditionally — the successor's
        // own entry is what holds the window open, not a withheld decrement.
        endHop();

        // READINESS is the part two hops must not settle, because in both a SUCCESSOR is already
        // in flight and will run its own `afterEach`: one this wrapper aborted in order to
        // dispatch a redirect, and one a later navigation overtook — vue-router marks the latter
        // `cancelled` (type 8), which can only happen because another navigation started. Settling
        // on either would warn about a cold start that is in fact proceeding.

        // ORDER IS LOAD-BEARING (WR-1119 r8). A hop a later navigation overtook is cancelled by
        // vue-router BEFORE its guards run, so it never reached the abort this wrapper's redirect
        // uses and never marked anything. Reading the mark first let it consume the OTHER hop's:
        // two `goToRoute` calls in one turn against a redirecting middleware produced one mark
        // (only the overtaker runs guards), the cancelled hop drained it, and the hop that placed
        // it then read itself as an ordinary abort and warned about a cold start that was
        // succeeding. Ask the question a cancelled hop can answer from its own `failure` first,
        // and only consume a mark for a hop that could actually have placed one.
        const supersededByLaterNavigation = isNavigationFailure(failure, NavigationFailureType.cancelled);
        const supersededByOwnRedirect = !supersededByLaterNavigation && redirectAbortedPaths.delete(to.fullPath);
        if (!supersededByOwnRedirect && !supersededByLaterNavigation) settleReadiness(failure);

        for (const middleware of afterRouteMiddleware) middleware(to, from, failure);
    });

    // The terminal path `afterEach` never sees. A thrown guard — a consumer middleware, or this
    // wrapper's own `normalizedRouteToSpecificRoute` on any unmatched path, which is every cold
    // load of an unknown URL — reaches `triggerError` and nothing else. It is a genuine failure of
    // the navigation, so it ends the hop exactly as an abort does: the not-found fallback paints
    // instead of a blank page, and readiness settles instead of hanging — unless a successor is
    // still running, which is the check below.
    //
    // It is also REPORTED here, unconditionally, and deliberately OUTSIDE `settleReadiness`'s
    // once-per-service latch. `triggerError` emits its own `console.error(error)` only while no
    // error listener is registered, so the mere existence of this line makes fs-router the reporter
    // for every navigation — and settling is a once-per-service fact while reporting a failure is
    // not (WR-1119 r6, ADR-0048). `settleReadiness()` is called WITHOUT the error so the
    // cancel-channel warn above cannot also fire: one failure, one line, first hop or later.
    // The error is recorded before it is reported so the redirect reporter below can defer to this
    // one; the reporting itself stays unconditional.
    router.onError((error) => {
        recordReported(error);
        console.error('fs-router: navigation failed', error);
        endHop();

        // The supersession check `afterEach` has carried since round 4, in the only form this path
        // can express it. `onError` is handed neither a `to` nor a `failure`, so it cannot ask
        // WHICH hop ended — only whether any other is still running. Without it, a hop whose guard
        // throws after a successor overtook it settled readiness on the spot, and a consumer that
        // awaits `isReady()` before mounting mounted on the sentinel.
        if (openHops === 0) settleReadiness();
    });

    const currentRouteRef = router.currentRoute;

    const onPage: RouterService<Routes>['onPage'] = (pageName) => {
        const currentName = currentRouteRef.value.name;
        if (!currentName) return false;

        return currentName.toString() === pageName;
    };

    const fullPath =
        (options?.base ? location.pathname.replace(options.base, '') : location.pathname) +
        location.search +
        location.hash;

    return {
        install: () => {
            // Synchronously, before the push: guards only run on a later microtask, so a consumer
            // that mounts immediately after calling `install()` would otherwise see a window with
            // the sentinel route and nothing marked in flight — and paint the fallback.
            beginDispatch();

            return router.push(fullPath).finally(endDispatch);
        },
        isReady: () => readyPromise,
        normalizedRouteToSpecificRoute,

        goToRoute,
        replaceRoute,
        goToCreatePage: (name) => goToRoute(`${name}${CREATE_PAGE_NAME}`),
        goToOverviewPage: (name) => goToRoute(`${name}${OVERVIEW_PAGE_NAME}`),
        goToEditPage: (name, id) => goToRoute(`${name}${EDIT_PAGE_NAME}`, id),
        goToShowPage: (name, id, query) => goToRoute(`${name}${SHOW_PAGE_NAME}`, id, query),

        getUrlForRouteName,
        goBack: () => router.back(),

        registerBeforeRouteMiddleware: (middleware) => {
            beforeRouteMiddleware.push(middleware);

            return () => {
                const index = beforeRouteMiddleware.indexOf(middleware);
                if (index > -1) beforeRouteMiddleware.splice(index, 1);
            };
        },
        registerAfterRouteMiddleware: (middleware) => {
            afterRouteMiddleware.push(middleware);

            return () => {
                const index = afterRouteMiddleware.indexOf(middleware);
                if (index > -1) afterRouteMiddleware.splice(index, 1);
            };
        },

        currentRouteRef,
        currentRouteQuery: computed(() => currentRouteRef.value.query),
        currentRouteId: computed(() => {
            const currentRouteId = currentRouteRef.value.params.id;
            if (!currentRouteId) throw new Error('This route has no route id');

            return Number.parseInt(currentRouteId.toString(), 10);
        }),
        currentRouteSlug: computed(() => {
            // CRUD routes use single :id — repeatable params (:id+) are not supported
            const slug = currentRouteRef.value.params.id as string | undefined;
            if (!slug) throw new Error('This route has no route id');

            return slug;
        }),
        currentParentId: computed(() => {
            const currentParentId = currentRouteRef.value.params.parentId;
            if (!currentParentId) throw new Error('This route has no parent id');

            return Number.parseInt(currentParentId.toString(), 10);
        }),
        changeRouteQuery: (query) => void router.push({query}),

        onPage,
        onCreatePage: (baseRouteName) => onPage(baseRouteName + CREATE_PAGE_NAME),
        onEditPage: (baseRouteName) => onPage(baseRouteName + EDIT_PAGE_NAME),
        onOverviewPage: (baseRouteName) => onPage(baseRouteName + OVERVIEW_PAGE_NAME),
        onShowPage: (baseRouteName) => onPage(baseRouteName + SHOW_PAGE_NAME),
        routeExists: (to) => {
            try {
                return !!router.resolve(to).name;
            } catch {
                return false;
            }
        },

        RouterView: createRouterView(currentRouteRef, options?.notFoundComponent, navigating),
        RouterLink: createRouterLink(getUrlForRouteName, goToRoute),
    };
};
