import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {SessionStore} from '../src';
import type {HttpStub} from './support/http-stub';

import {createSessionStore, sanctumEndpoints} from '../src';
import {axiosRejection, createHttpStub, respondWith} from './support/http-stub';

interface Employer {
    id: number;
}

interface Credentials {
    email: string;
    password: string;
}

const TIMEOUT_MS = 4321;
const ENDPOINTS = sanctumEndpoints('auth/employer');
const PRIME_URL = 'https://app.example.test/sanctum/csrf-cookie';

const isEmployer = (body: unknown): Employer | undefined =>
    typeof body === 'object' && body !== null && typeof (body as Employer).id === 'number'
        ? (body as Employer)
        : undefined;

let http: HttpStub;

const build = (overrides: Partial<Parameters<typeof createSessionStore<Employer, Credentials>>[0]> = {}) =>
    createSessionStore<Employer, Credentials>({
        guard: 'employer',
        http,
        endpoints: ENDPOINTS,
        parseUser: isEmployer,
        timeoutMs: TIMEOUT_MS,
        ...overrides,
    });

/** Every request this package makes carries the configured timeout (principle 8). */
const expectEveryRequestTimed = (): void => {
    const calls = [...vi.mocked(http.getRequest).mock.calls, ...vi.mocked(http.postRequest).mock.calls];

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) expect(call.at(-1)).toEqual({timeout: TIMEOUT_MS});
};

const signIn = async (store: SessionStore<Employer, Credentials>): Promise<void> => {
    vi.mocked(http.getRequest).mockResolvedValueOnce(respondWith({id: 7}));

    await store.loadSession();

    expect(store.state.value).toBe('authenticated');
};

beforeEach(() => {
    http = createHttpStub();
});

describe('createSessionStore', () => {
    it('starts loading, with no user and the guard it was given', () => {
        const store = build();

        expect(store.state.value).toBe('loading');
        expect(store.user.value).toBeUndefined();
        expect(store.isAuthenticated.value).toBe(false);
        expect(store.guard).toBe('employer');
    });

    describe('loadSession', () => {
        it('authenticates on a body the consumer recognises', async () => {
            const store = build();
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            await store.loadSession();

            expect(vi.mocked(http.getRequest)).toHaveBeenCalledWith('auth/employer/me', {timeout: TIMEOUT_MS});
            expect(store.state.value).toBe('authenticated');
            expect(store.user.value).toEqual({id: 7});
            expect(store.isAuthenticated.value).toBe(true);
        });

        it('reads an unparseable body as an outage, never as signed out', async () => {
            const store = build();
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({unexpected: true}));

            await store.loadSession();

            expect(store.state.value).toBe('outage');
            expect(store.user.value).toBeUndefined();
        });

        it.each([401, 419])('reads a %i as signed out', async (status) => {
            const store = build();
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(status));

            await store.loadSession();

            expect(store.state.value).toBe('signed_out');
        });

        it('takes the 401 path for a 419 without priming, even with csrf configured', async () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(419));

            await store.loadSession();

            expect(store.state.value).toBe('signed_out');
            expect(vi.mocked(http.getRequest)).toHaveBeenCalledTimes(1);
            expect(vi.mocked(http.getRequest)).not.toHaveBeenCalledWith(PRIME_URL, expect.anything());
        });

        it.each([403, 422, 500])('reads a %i as an outage', async (status) => {
            const store = build();
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(status));

            await store.loadSession();

            expect(store.state.value).toBe('outage');
        });

        it('reads a transport failure as an outage', async () => {
            const store = build();
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(undefined));

            await store.loadSession();

            expect(store.state.value).toBe('outage');
        });

        it('reads a non-axios rejection as an outage', async () => {
            const store = build();
            vi.mocked(http.getRequest).mockRejectedValue(new Error('boom'));

            await store.loadSession();

            expect(store.state.value).toBe('outage');
        });

        it('discards a superseded response rather than letting the older answer land last', async () => {
            const store = build();
            let releaseFirst = (): void => undefined;
            vi.mocked(http.getRequest)
                .mockReturnValueOnce(
                    new Promise((resolve) => {
                        releaseFirst = () => resolve(respondWith({id: 1}));
                    }),
                )
                .mockResolvedValueOnce(respondWith({id: 2}));

            const first = store.loadSession();
            const second = store.loadSession();

            await second;
            releaseFirst();
            await first;

            expect(store.user.value).toEqual({id: 2});
            expect(store.state.value).toBe('authenticated');
        });

        it('discards a superseded rejection rather than flipping the machine under a newer read', async () => {
            const store = build();
            let rejectFirst = (): void => undefined;
            vi.mocked(http.getRequest)
                .mockReturnValueOnce(
                    new Promise((_resolve, reject) => {
                        rejectFirst = () => reject(axiosRejection(401));
                    }),
                )
                .mockResolvedValueOnce(respondWith({id: 2}));

            const first = store.loadSession();
            const second = store.loadSession();

            await second;
            rejectFirst();
            await first;

            expect(store.state.value).toBe('authenticated');
            expect(store.user.value).toEqual({id: 2});
        });
    });

    describe('login', () => {
        const credentials: Credentials = {email: 'a@b.test', password: 'secret'};

        it('posts the credentials and confirms the session against me', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'authenticated'});
            expect(vi.mocked(http.postRequest)).toHaveBeenCalledWith('auth/employer/login', credentials, {
                timeout: TIMEOUT_MS,
            });
            expectEveryRequestTimed();
        });

        it('refuses with the me status when the login succeeded but me did not authenticate', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(503, {message: 'down'}));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'refused', status: 503, body: {message: 'down'}});
            expect(store.state.value).toBe('outage');
        });

        it('refuses with the me RESPONSE when me answered a body the consumer could not read', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({unexpected: true}, 200));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'refused', status: 200, body: {unexpected: true}});
            expect(store.state.value).toBe('outage');
        });

        it('refuses on a rejected login without probing me', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(422, {errors: {email: ['taken']}}));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'refused', status: 422, body: {errors: {email: ['taken']}}});
            expect(vi.mocked(http.getRequest)).not.toHaveBeenCalled();
            expect(store.state.value).toBe('loading');
        });

        it('refuses a non-axios rejection with no status and no body', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockRejectedValue(new Error('boom'));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'refused', status: undefined, body: undefined});
        });

        it('returns the challenge body without touching the machine', async () => {
            const store = build({isChallenge: (body) => (body as {twoFactor?: boolean}).twoFactor === true});
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({twoFactor: true}));
            const ended = vi.fn();
            store.onSessionEnd(ended);

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'challenge', body: {twoFactor: true}});
            expect(store.state.value).toBe('loading');
            expect(vi.mocked(http.getRequest)).not.toHaveBeenCalled();
            expect(ended).not.toHaveBeenCalled();
        });

        it('treats every login body as establishing a session when no isChallenge is given', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({twoFactor: true}));
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'authenticated'});
        });

        describe('with csrf configured', () => {
            it('primes before posting', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockResolvedValueOnce(respondWith(''));
                vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
                vi.mocked(http.getRequest).mockResolvedValueOnce(respondWith({id: 7}));

                await store.login(credentials);

                expect(vi.mocked(http.getRequest).mock.calls[0]).toEqual([PRIME_URL, {timeout: TIMEOUT_MS}]);
                expectEveryRequestTimed();
            });

            it('re-primes and retries exactly once on a stale token', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
                vi.mocked(http.postRequest)
                    .mockRejectedValueOnce(axiosRejection(419))
                    .mockResolvedValueOnce(respondWith({}));
                vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

                const outcome = await store.login(credentials);

                expect(outcome).toEqual({kind: 'authenticated'});
                expect(vi.mocked(http.postRequest)).toHaveBeenCalledTimes(2);
                // Two primes: the first is memoised, `reset()` forces the second.
                expect(vi.mocked(http.getRequest).mock.calls.filter(([url]) => url === PRIME_URL)).toHaveLength(2);
            });

            it('never makes a third attempt when the retry is refused again', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
                vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(419, {message: 'stale'}));

                const outcome = await store.login(credentials);

                expect(outcome).toEqual({kind: 'refused', status: 419, body: {message: 'stale'}});
                expect(vi.mocked(http.postRequest)).toHaveBeenCalledTimes(2);
            });

            it('refuses a retry that fails for a different reason, without retrying again', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
                vi.mocked(http.postRequest)
                    .mockRejectedValueOnce(axiosRejection(419))
                    .mockRejectedValueOnce(axiosRejection(401));

                const outcome = await store.login(credentials);

                expect(outcome).toEqual({kind: 'refused', status: 401, body: undefined});
                expect(vi.mocked(http.postRequest)).toHaveBeenCalledTimes(2);
            });

            it('retries for a stale token and for nothing else', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
                vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(422, {errors: {email: ['taken']}}));

                const outcome = await store.login(credentials);

                expect(outcome).toEqual({kind: 'refused', status: 422, body: {errors: {email: ['taken']}}});
                expect(vi.mocked(http.postRequest)).toHaveBeenCalledOnce();
            });

            it('refuses a failed prime rather than posting behind it', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(500));

                const outcome = await store.login(credentials);

                expect(outcome).toEqual({kind: 'refused', status: 500, body: undefined});
                expect(vi.mocked(http.postRequest)).not.toHaveBeenCalled();
            });
        });

        it('does not retry a stale token when no csrf is configured', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(419));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'refused', status: 419, body: undefined});
            expect(vi.mocked(http.postRequest)).toHaveBeenCalledTimes(1);
        });
    });

    describe('logout', () => {
        it('ends the session on success and fires the listeners once', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);
            vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

            const outcome = await store.logout();

            expect(outcome).toEqual({kind: 'signed_out'});
            expect(vi.mocked(http.postRequest)).toHaveBeenCalledWith('auth/employer/logout', {}, {timeout: TIMEOUT_MS});
            expect(store.state.value).toBe('signed_out');
            expect(store.user.value).toBeUndefined();
            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'logout'});
        });

        it('primes first when csrf is configured', async () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});
            await signIn(store);
            vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
            vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

            await store.logout();

            expect(vi.mocked(http.getRequest)).toHaveBeenCalledWith(PRIME_URL, {timeout: TIMEOUT_MS});
        });

        it('leaves the session standing when the request fails, and reports the failure', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);
            vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(500, {message: 'nope'}));

            const outcome = await store.logout();

            expect(outcome).toEqual({kind: 'failed', status: 500, body: {message: 'nope'}});
            expect(store.state.value).toBe('authenticated');
            expect(store.user.value).toEqual({id: 7});
            expect(ended).not.toHaveBeenCalled();
        });

        it('never probes the server behind a failure', async () => {
            const store = build();
            await signIn(store);
            vi.mocked(http.getRequest).mockClear();
            vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(500));

            await store.logout();

            expect(vi.mocked(http.getRequest)).not.toHaveBeenCalled();
        });

        it('reports a failed prime as a failed logout', async () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});
            await signIn(store);
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(500));

            const outcome = await store.logout();

            expect(outcome).toEqual({kind: 'failed', status: 500, body: undefined});
            expect(vi.mocked(http.postRequest)).not.toHaveBeenCalled();
            expect(store.state.value).toBe('authenticated');
        });
    });

    describe('handleSessionExpired', () => {
        it('ends the session and carries the return-to', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);

            store.handleSessionExpired('/a/b?c=1');

            expect(store.state.value).toBe('signed_out');
            expect(store.user.value).toBeUndefined();
            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: '/a/b?c=1'});
        });

        it('carries no return-to when none was resolved', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);

            store.handleSessionExpired();

            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: undefined});
        });

        it('absorbs concurrent refusals into one event', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);

            store.handleSessionExpired('/first');
            store.handleSessionExpired('/second');
            store.handleSessionExpired('/third');

            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: '/first'});
        });

        it('does nothing while the session was never authenticated', () => {
            const store = build();
            const ended = vi.fn();
            store.onSessionEnd(ended);

            store.handleSessionExpired();

            expect(store.state.value).toBe('loading');
            expect(ended).not.toHaveBeenCalled();
        });
    });

    describe('setUser', () => {
        it('writes the user while the session is authenticated', async () => {
            const store = build();
            await signIn(store);

            store.setUser({id: 9});

            expect(store.user.value).toEqual({id: 9});
        });

        it.each(['loading', 'signed_out'])('throws while the session is %s', async (expected) => {
            const store = build();

            if (expected === 'signed_out') {
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));
                await store.loadSession();
            }

            expect(store.state.value).toBe(expected);
            expect(() => store.setUser({id: 9})).toThrow(
                new TypeError(`fs-auth: setUser called while the session is '${expected}', not authenticated`),
            );
            expect(store.user.value).toBeUndefined();
        });
    });

    describe('user and state are readonly outward', () => {
        it('refuses a write at compile time', async () => {
            const store = build();
            await signIn(store);

            // @ts-expect-error the ref is `Readonly` — this is the seam a consumer must not have.
            store.user.value = {id: 99};
            // @ts-expect-error same, for the machine itself.
            store.state.value = 'outage';

            expect(store.user.value).toEqual({id: 7});
            expect(store.state.value).toBe('authenticated');
        });
    });

    describe('onSessionEnd', () => {
        it('stops firing a listener that unregistered', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            const unregister = store.onSessionEnd(ended);

            unregister();
            store.handleSessionExpired();

            expect(ended).not.toHaveBeenCalled();
        });

        it('fires every listener even when one of them throws', async () => {
            const store = build();
            await signIn(store);
            const first = vi.fn(() => {
                throw new Error("a listener fault is the listener's own");
            });
            const second = vi.fn();
            store.onSessionEnd(first);
            store.onSessionEnd(second);

            expect(() => store.handleSessionExpired()).not.toThrow();
            expect(first).toHaveBeenCalledOnce();
            expect(second).toHaveBeenCalledOnce();
        });

        it('registers a listener once however many times it is added', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);
            store.onSessionEnd(ended);

            store.handleSessionExpired();

            expect(ended).toHaveBeenCalledOnce();
        });
    });

    it("gives two stores their own prime, so one cannot spend the other's", async () => {
        vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
        vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
        const employer = build({csrf: {primeUrl: PRIME_URL}});
        const employee = build({csrf: {primeUrl: PRIME_URL}});

        await employer.login({email: 'a@b.test', password: 'x'});
        await employee.login({email: 'c@d.test', password: 'y'});

        expect(vi.mocked(http.getRequest).mock.calls.filter(([url]) => url === PRIME_URL)).toHaveLength(2);
    });
});
