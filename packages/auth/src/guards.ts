import type {HttpService, UnregisterMiddleware as UnregisterHttpMiddleware} from '@script-development/fs-http';
import type {
    ActualRoute,
    MiddlewareRedirect,
    RouteName,
    RouterService,
    UnregisterMiddleware as UnregisterRouteMiddleware,
} from '@script-development/fs-router';
import type {RouteRecordRaw} from 'vue-router';

import type {AuthenticationState, SessionExpiryHandler} from './types';

import {SIGNED_OUT_STATUSES} from './endpoints';

export interface AuthGuardOptions<Routes extends RouteRecordRaw[]> {
    loginRouteName: RouteName<Routes>;
    /**
     * Whether a route may be entered without a session. INJECTED, never inferred
     * from `meta`: the package would otherwise pick a `meta` key every consumer
     * has to adopt, and two of them already disagree about its polarity.
     */
    isPublic: (to: ActualRoute<Routes>) => boolean;
    /**
     * The path to come back to after signing in, read from the pending hop.
     *
     * REQUIRED, and the package cannot supply it: fs-router's before-route
     * middleware receives the matched route RECORD, whose `path` is the pattern
     * (`/employers/:id`) and not the URL anybody visited, and the package owns no
     * browser global to read the real one from. Returning `undefined` omits the
     * query and is the correct answer for a consumer that does not want one.
     */
    resolveReturnTo: (to: ActualRoute<Routes>) => string | undefined;
    /** Query key the return-to is written under. Defaults to `redirect`. */
    redirectQuery?: string;
}

/**
 * Puts the session check on fs-router's middleware slot.
 *
 * It decides and redirects; it renders nothing and it chooses no sentence. The
 * redirect is fs-router's typed return, so a `loginRouteName` that is not a real
 * route fails at compile time rather than at the first guarded click.
 */
export const registerAuthGuard = <Routes extends RouteRecordRaw[]>(
    router: Pick<RouterService<Routes>, 'registerBeforeRouteMiddleware'>,
    store: AuthenticationState,
    options: AuthGuardOptions<Routes>,
): UnregisterRouteMiddleware => {
    const redirectQuery = options.redirectQuery ?? 'redirect';

    return router.registerBeforeRouteMiddleware((to) => {
        if (options.isPublic(to) || store.isAuthenticated.value) return false;

        const returnTo = options.resolveReturnTo(to);
        const redirect: MiddlewareRedirect<Routes> = {name: options.loginRouteName};

        if (returnTo !== undefined) redirect.query = {[redirectQuery]: returnTo};

        return redirect;
    });
};

export interface UnauthorizedMiddlewareOptions {
    /** Where the person was when the session ended, for the consumer's own exit to carry. */
    returnTo?: () => string | undefined;
}

/**
 * Puts the 401/419 handler on fs-http's response-error hook.
 *
 * The `authenticated` check is NOT here — it lives in `handleSessionExpired`, so
 * the single-flight guard has one home and N concurrent refusals cost one event.
 * fs-http 0.6.0 wraps a registered middleware in `guarded()` by default, so this
 * body needs no second wrap.
 */
export const registerUnauthorizedMiddleware = (
    http: Pick<HttpService, 'registerResponseErrorMiddleware'>,
    store: SessionExpiryHandler,
    options: UnauthorizedMiddlewareOptions = {},
): UnregisterHttpMiddleware =>
    http.registerResponseErrorMiddleware((error) => {
        // A transport failure is not this package's to read: nothing answered, so
        // nothing said the session was over.
        if (!error.response) return;

        if (!SIGNED_OUT_STATUSES.has(error.response.status)) return;

        store.handleSessionExpired(options.returnTo?.());
    });
