import type {ActualRoute, BeforeRouteMiddleware, LazyRouteComponent} from '@script-development/fs-router';

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {computed, ref} from 'vue';

import type {HttpStub} from './support/http-stub';

import {registerAuthGuard, registerUnauthorizedMiddleware} from '../src';
import {axiosRejection, createHttpStub} from './support/http-stub';

type TestRoutes = [
    {path: '/login'; name: 'login'; component: LazyRouteComponent},
    {path: '/employers/:id'; name: 'employers.show'; component: LazyRouteComponent},
];

const route = (name: 'login' | 'employers.show', path: string): ActualRoute<TestRoutes> =>
    ({name, path, component: () => Promise.resolve({})}) as ActualRoute<TestRoutes>;

const LOGIN = route('login', '/login');
const GUARDED = route('employers.show', '/employers/:id');

const createRouterStub = () => {
    const middleware: BeforeRouteMiddleware<TestRoutes>[] = [];

    return {
        middleware,
        registerBeforeRouteMiddleware: vi.fn((fn: BeforeRouteMiddleware<TestRoutes>) => {
            middleware.push(fn);

            return () => {
                middleware.splice(middleware.indexOf(fn), 1);
            };
        }),
    };
};

describe('registerAuthGuard', () => {
    const authenticated = ref(false);
    const store = {isAuthenticated: computed(() => authenticated.value)};

    const options = {
        loginRouteName: 'login' as const,
        isPublic: (to: ActualRoute<TestRoutes>) => to.name === 'login',
        resolveReturnTo: () => '/employers/7',
    };

    beforeEach(() => {
        authenticated.value = false;
    });

    it('lets a public route through without a session', () => {
        const router = createRouterStub();
        registerAuthGuard(router, store, options);

        expect(router.middleware[0]?.(LOGIN, GUARDED)).toBe(false);
    });

    it('lets a guarded route through for an authenticated session', () => {
        authenticated.value = true;
        const router = createRouterStub();
        registerAuthGuard(router, store, options);

        expect(router.middleware[0]?.(GUARDED, LOGIN)).toBe(false);
    });

    it('redirects to the login route carrying the return-to', () => {
        const router = createRouterStub();
        registerAuthGuard(router, store, options);

        expect(router.middleware[0]?.(GUARDED, LOGIN)).toEqual({name: 'login', query: {redirect: '/employers/7'}});
    });

    it("writes the return-to under the consumer's own query key", () => {
        const router = createRouterStub();
        registerAuthGuard(router, store, {...options, redirectQuery: 'next'});

        expect(router.middleware[0]?.(GUARDED, LOGIN)).toEqual({name: 'login', query: {next: '/employers/7'}});
    });

    it('omits the query entirely when the consumer resolves no return-to', () => {
        const router = createRouterStub();
        registerAuthGuard(router, store, {...options, resolveReturnTo: () => undefined});

        expect(router.middleware[0]?.(GUARDED, LOGIN)).toEqual({name: 'login'});
    });

    it('hands the pending hop to both consumer callbacks', () => {
        const router = createRouterStub();
        const isPublic = vi.fn(() => false);
        const resolveReturnTo = vi.fn(() => '/employers/7');
        registerAuthGuard(router, store, {...options, isPublic, resolveReturnTo});

        router.middleware[0]?.(GUARDED, LOGIN);

        expect(isPublic).toHaveBeenCalledExactlyOnceWith(GUARDED);
        expect(resolveReturnTo).toHaveBeenCalledExactlyOnceWith(GUARDED);
    });

    it('returns an unregister that takes the guard off the slot', () => {
        const router = createRouterStub();

        registerAuthGuard(router, store, options)();

        expect(router.middleware).toHaveLength(0);
    });
});

describe('registerUnauthorizedMiddleware', () => {
    let http: HttpStub;
    let handleSessionExpired: ReturnType<typeof vi.fn>;
    let ownsRefusalOf: ReturnType<typeof vi.fn>;

    const fire = (error: unknown): void => {
        for (const middleware of http.errorMiddleware) middleware(error as Parameters<typeof middleware>[0]);
    };

    /** A store that owns none of the refusals below unless a spec says otherwise. */
    const expiryHandler = () => ({handleSessionExpired, ownsRefusalOf});

    beforeEach(() => {
        http = createHttpStub();
        handleSessionExpired = vi.fn();
        ownsRefusalOf = vi.fn(() => false);
    });

    it.each([401, 419])('ends the session on a %i', (status) => {
        registerUnauthorizedMiddleware(http, expiryHandler());

        fire(axiosRejection(status));

        expect(handleSessionExpired).toHaveBeenCalledExactlyOnceWith(undefined);
    });

    it("carries the consumer's return-to", () => {
        registerUnauthorizedMiddleware(http, expiryHandler(), {returnTo: () => '/employers/7'});

        fire(axiosRejection(401));

        expect(handleSessionExpired).toHaveBeenCalledExactlyOnceWith('/employers/7');
    });

    it.each([403, 422, 429, 500])('leaves a %i to the consumer', (status) => {
        registerUnauthorizedMiddleware(http, expiryHandler());

        fire(axiosRejection(status));

        expect(handleSessionExpired).not.toHaveBeenCalled();
    });

    it('leaves a transport failure alone — nothing answered, so nothing ended the session', () => {
        registerUnauthorizedMiddleware(http, expiryHandler());

        fire(axiosRejection(undefined));

        expect(handleSessionExpired).not.toHaveBeenCalled();
    });

    it("leaves a refusal the store answers itself to the store's own caller", () => {
        ownsRefusalOf.mockReturnValue(true);
        registerUnauthorizedMiddleware(http, expiryHandler());

        fire(axiosRejection(419, {message: 'stale'}, 'auth/employer/login'));

        // The hook asks which request was refused, and takes the store's answer.
        expect(ownsRefusalOf).toHaveBeenCalledExactlyOnceWith('auth/employer/login');
        expect(handleSessionExpired).not.toHaveBeenCalled();
    });

    it('ends the session for a refusal the store does not claim', () => {
        registerUnauthorizedMiddleware(http, expiryHandler());

        fire(axiosRejection(401, undefined, 'auth/employer/me'));

        expect(ownsRefusalOf).toHaveBeenCalledExactlyOnceWith('auth/employer/me');
        expect(handleSessionExpired).toHaveBeenCalledOnce();
    });

    it('asks about a refusal that carries no request config at all, rather than falling over', () => {
        registerUnauthorizedMiddleware(http, expiryHandler());

        // An axios error's `config` is optional on the type, and the helper above
        // supplies one for every other spec here. Drop it explicitly, or nothing
        // in the suite ever reaches the hook's own optional read again.
        fire({isAxiosError: true, response: {status: 401, data: undefined}});

        expect(ownsRefusalOf).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(handleSessionExpired).toHaveBeenCalledOnce();
    });

    it('returns an unregister that takes the handler off the hook', () => {
        registerUnauthorizedMiddleware(http, expiryHandler())();

        fire(axiosRejection(401));

        expect(handleSessionExpired).not.toHaveBeenCalled();
        expect(http.errorMiddleware).toHaveLength(0);
    });
});
