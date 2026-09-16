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

/** What a store with no `csrf` block sends: the timeout and nothing else. */
const PLAIN_OPTIONS = {timeout: TIMEOUT_MS};

/**
 * What a `csrf`-configured store sends. `withXSRFToken` is the load-bearing one:
 * fs-http's own default is `false`, so without it the primed cookie is never
 * forwarded and the prime accomplishes nothing.
 */
const CSRF_OPTIONS = {timeout: TIMEOUT_MS, withCredentials: true, withXSRFToken: true};

/** Every request this package makes carries the same options object — no exceptions, no drift. */
const expectEveryRequestUses = (options: object): void => {
    const calls = [...vi.mocked(http.getRequest).mock.calls, ...vi.mocked(http.postRequest).mock.calls];

    expect(calls.length).toBeGreaterThan(0);

    for (const call of calls) expect(call.at(-1)).toEqual(options);
};

const signIn = async (store: SessionStore<Employer, Credentials>): Promise<void> => {
    vi.mocked(http.getRequest).mockResolvedValueOnce(respondWith({id: 7}));

    await store.loadSession();

    expect(store.state.value).toBe('authenticated');
};

/**
 * A request the spec answers by hand. `issued` settles the moment the store
 * makes the call, which is what keeps the interleavings below deterministic — a
 * spec that instead guessed how many microtasks deep the call sits would pass
 * or fail for reasons that have nothing to do with the store.
 */
/**
 * A macrotask boundary. Every microtask queued up to this point has run by the
 * time it returns, so a spec can state what the store has NOT done yet without
 * counting `await`s — which is the difference between pinning the behaviour and
 * pinning the scheduler.
 */
const flushMicrotasks = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });

const heldRequest = () => {
    let answer: (response: {data: unknown; status: number}) => void = () => undefined;
    let fail: (error: unknown) => void = () => undefined;
    let markIssued: () => void = () => undefined;

    const issued = new Promise<void>((resolve) => {
        markIssued = resolve;
    });

    return {
        issued,
        implementation: () =>
            new Promise<{data: unknown; status: number}>((resolve, reject) => {
                answer = resolve;
                fail = reject;
                markIssued();
            }),
        answerWith: (body: unknown, status = 200) => answer(respondWith(body, status)),
        rejectWith: (error: unknown) => fail(error),
    };
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

            expect(vi.mocked(http.getRequest)).toHaveBeenCalledWith('auth/employer/me', PLAIN_OPTIONS);
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

        it('retains the user on an outage — an outage is not a sign-out', async () => {
            const store = build();
            await signIn(store);
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(500));

            await store.loadSession();

            expect(store.state.value).toBe('outage');
            expect(store.user.value).toEqual({id: 7});
        });

        it('propagates a non-axios rejection instead of classifying a defect as an outage', async () => {
            const store = build();
            const defect = new Error('a fault in something that is not the transport');
            vi.mocked(http.getRequest).mockRejectedValue(defect);

            await expect(store.loadSession()).rejects.toBe(defect);
            expect(store.state.value).toBe('loading');
        });

        it('propagates a throwing parseUser and writes no state', async () => {
            const defect = new TypeError('the consumer guard itself is broken');
            const store = build({
                parseUser: () => {
                    throw defect;
                },
            });
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            await expect(store.loadSession()).rejects.toBe(defect);
            expect(store.state.value).toBe('loading');
            expect(store.user.value).toBeUndefined();
        });

        it('never runs parseUser for a superseded response, so its defect cannot fire late', async () => {
            const parseUser = vi.fn(isEmployer);
            const store = build({parseUser});
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

            expect(parseUser).toHaveBeenCalledExactlyOnceWith({id: 2});
        });

        describe('a 401 on a LIVE session is an expiry', () => {
            it('clears the user and fires exactly one session-end event', async () => {
                const store = build();
                await signIn(store);
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));

                await store.loadSession();

                expect(store.state.value).toBe('signed_out');
                expect(store.user.value).toBeUndefined();
                expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: undefined});
            });

            it('absorbs a handleSessionExpired arriving behind it', async () => {
                const store = build();
                await signIn(store);
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));

                await store.loadSession();
                store.handleSessionExpired('/employers/7');

                expect(ended).toHaveBeenCalledOnce();
            });

            it('fires nothing when there was no session to end', async () => {
                const store = build();
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));

                await store.loadSession();

                expect(store.state.value).toBe('signed_out');
                expect(store.user.value).toBeUndefined();
                expect(ended).not.toHaveBeenCalled();
            });
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
            expect(vi.mocked(http.postRequest)).toHaveBeenCalledWith('auth/employer/login', credentials, PLAIN_OPTIONS);
            expectEveryRequestUses(PLAIN_OPTIONS);
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

        it('refuses a transport failure, which is an answer that never arrived', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(undefined));

            const outcome = await store.login(credentials);

            expect(outcome).toEqual({kind: 'refused', status: undefined, body: undefined});
        });

        it('propagates a non-axios rejection rather than showing a defect as a refusal', async () => {
            const store = build();
            const defect = new Error('a fault in something that is not the transport');
            vi.mocked(http.postRequest).mockRejectedValue(defect);

            await expect(store.login(credentials)).rejects.toBe(defect);
        });

        it('propagates a non-axios rejection from the stale-token retry too', async () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});
            const defect = new Error('a fault in something that is not the transport');
            vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
            vi.mocked(http.postRequest).mockRejectedValueOnce(axiosRejection(419)).mockRejectedValueOnce(defect);

            await expect(store.login(credentials)).rejects.toBe(defect);
        });

        it('propagates a throwing parseUser reached through the login path', async () => {
            const defect = new TypeError('the consumer guard itself is broken');
            const store = build({
                parseUser: () => {
                    throw defect;
                },
            });
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            await expect(store.login(credentials)).rejects.toBe(defect);
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

                expect(vi.mocked(http.getRequest).mock.calls[0]).toEqual([PRIME_URL, CSRF_OPTIONS]);
                expectEveryRequestUses(CSRF_OPTIONS);
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

            it('refuses a transport failure without asking it for a status it has not got', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
                vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(undefined));

                const outcome = await store.login(credentials);

                expect(outcome).toEqual({kind: 'refused', status: undefined, body: undefined});
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

        describe('when another read overtakes its confirming me', () => {
            it('waits for that read rather than refusing a login the server accepted', async () => {
                const store = build();
                vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
                const confirm = heldRequest();
                const revalidation = heldRequest();
                vi.mocked(http.getRequest)
                    .mockImplementationOnce(confirm.implementation)
                    .mockImplementationOnce(revalidation.implementation);

                const pending = store.login(credentials);
                const answered = vi.fn();
                void pending.then(answered);
                await confirm.issued;
                const consumerRead = store.loadSession();

                confirm.answerWith({id: 7});
                await flushMicrotasks();

                // The confirm reported nothing and the read that overtook it has
                // not landed, so there is no machine to answer from yet.
                expect(answered).not.toHaveBeenCalled();

                revalidation.answerWith({id: 9});

                await expect(pending).resolves.toEqual({kind: 'authenticated'});
                await consumerRead;
                expect(store.user.value).toEqual({id: 9});
            });

            it("refuses with the newer read's status, never with the discarded answer's", async () => {
                const store = build();
                vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
                const confirm = heldRequest();
                const revalidation = heldRequest();
                vi.mocked(http.getRequest)
                    .mockImplementationOnce(confirm.implementation)
                    .mockImplementationOnce(revalidation.implementation);

                const pending = store.login(credentials);
                const answered = vi.fn();
                void pending.then(answered);
                await confirm.issued;
                const consumerRead = store.loadSession();

                confirm.answerWith({id: 7});
                await flushMicrotasks();

                expect(answered).not.toHaveBeenCalled();

                revalidation.rejectWith(axiosRejection(401, {message: 'gone'}));

                await expect(pending).resolves.toEqual({kind: 'refused', status: 401, body: {message: 'gone'}});
                await consumerRead;
                expect(store.state.value).toBe('signed_out');
            });

            it('answers from the machine an outage left, which is how the two refusals are told apart', async () => {
                const store = build();
                vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
                const confirm = heldRequest();
                const revalidation = heldRequest();
                vi.mocked(http.getRequest)
                    .mockImplementationOnce(confirm.implementation)
                    .mockImplementationOnce(revalidation.implementation);

                const pending = store
                    .login(credentials)
                    .then((outcome) => ({outcome, stateWhenAnswered: store.state.value}));

                await confirm.issued;
                const consumerRead = store.loadSession();

                confirm.answerWith({id: 7});
                await flushMicrotasks();

                revalidation.rejectWith(axiosRejection(undefined));

                // `refused` with no status is what a transport failure and a
                // discarded answer both look like. The machine is the
                // discriminator, and it has settled by the time login answers.
                await expect(pending).resolves.toEqual({
                    outcome: {kind: 'refused', status: undefined, body: undefined},
                    stateWhenAnswered: 'outage',
                });
                await consumerRead;
                expect(store.user.value).toBeUndefined();
            });

            it('answers both of two overlapping logins with the identity that won', async () => {
                const store = build();
                vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
                const first = heldRequest();
                const second = heldRequest();
                vi.mocked(http.getRequest)
                    .mockImplementationOnce(first.implementation)
                    .mockImplementationOnce(second.implementation);

                const a = store.login(credentials);
                const answeredA = vi.fn();
                void a.then(answeredA);
                await first.issued;
                const b = store.login({email: 'c@d.test', password: 'other'});
                await second.issued;

                first.answerWith({id: 7});
                await flushMicrotasks();

                expect(answeredA).not.toHaveBeenCalled();

                second.answerWith({id: 9});

                // The accepted residual (DECISIONS D17). Whose credentials won is a
                // server fact this package cannot name, so both callers are told
                // what the machine says and exactly ONE identity is readable.
                await expect(a).resolves.toEqual({kind: 'authenticated'});
                await expect(b).resolves.toEqual({kind: 'authenticated'});
                expect(store.user.value).toEqual({id: 9});
            });

            it('refuses when a sign-out overtook it, rather than waiting for a read that will never come', async () => {
                const store = build();
                await signIn(store);
                const confirm = heldRequest();
                vi.mocked(http.getRequest).mockImplementationOnce(confirm.implementation);
                vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));

                const pending = store.login(credentials);
                await confirm.issued;

                // `clearSession` takes a read ticket and issues no read, so this
                // confirm is superseded by something that will never answer.
                await store.logout();
                confirm.answerWith({id: 7});

                await expect(pending).resolves.toEqual({kind: 'refused', status: undefined, body: undefined});
                expect(store.state.value).toBe('signed_out');
            });
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
            expect(vi.mocked(http.postRequest)).toHaveBeenCalledWith('auth/employer/logout', {}, PLAIN_OPTIONS);
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

            expect(vi.mocked(http.getRequest)).toHaveBeenCalledWith(PRIME_URL, CSRF_OPTIONS);
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

        it('answers `failed` with no status when nothing answered at all', async () => {
            const store = build();
            await signIn(store);
            vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(undefined));

            const outcome = await store.logout();

            expect(outcome).toEqual({kind: 'failed', status: undefined, body: undefined});
            expect(store.state.value).toBe('authenticated');
        });

        it("still answers `failed` for a rejection that is not the transport's", async () => {
            // Ruling 1 says ANY failure leaves the session standing and answers
            // `failed`. Logout does not sort defects out of that, unlike login:
            // the person pressed a thing and needs to know whether to press again,
            // and a throw here would strand the shell mid-sign-out (DECISIONS D13).
            const store = build();
            await signIn(store);
            vi.mocked(http.postRequest).mockRejectedValue(new Error('a fault that is not the transport'));

            const outcome = await store.logout();

            expect(outcome).toEqual({kind: 'failed', status: undefined, body: undefined});
            expect(store.state.value).toBe('authenticated');
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

        describe('a refusal from the logout endpoint is the server confirming there is no session', () => {
            it.each([401, 419])(
                'answers signed_out and ends the session once with an expiry on a %i',
                async (status) => {
                    const store = build();
                    await signIn(store);
                    const ended = vi.fn();
                    store.onSessionEnd(ended);
                    vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(status, {message: 'no session'}));

                    const outcome = await store.logout();

                    // D1 amended: the ruling protects a cookie the server still
                    // HONOURS. A 401 is the server saying it does not, so the person
                    // is signed out — and the server ended it, not the button.
                    expect(outcome).toEqual({kind: 'signed_out'});
                    expect(store.state.value).toBe('signed_out');
                    expect(store.user.value).toBeUndefined();
                    expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired'});
                },
            );

            it('fires nothing when there was no session left to confirm', async () => {
                const store = build();
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));
                await store.loadSession();
                expect(store.state.value).toBe('signed_out');
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(401));

                const outcome = await store.logout();

                expect(outcome).toEqual({kind: 'signed_out'});
                expect(ended).not.toHaveBeenCalled();
            });

            it('never probes the server behind it', async () => {
                const store = build();
                await signIn(store);
                vi.mocked(http.getRequest).mockClear();
                vi.mocked(http.postRequest).mockRejectedValue(axiosRejection(401));

                await store.logout();

                expect(vi.mocked(http.getRequest)).not.toHaveBeenCalled();
            });

            it('does not read a refused PRIME as the server confirming anything', async () => {
                const store = build({csrf: {primeUrl: PRIME_URL}});
                await signIn(store);
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));

                const outcome = await store.logout();

                // The cookie route refusing says nothing about the session, and
                // the logout endpoint was never asked. Ruling 1 in full force.
                expect(outcome).toEqual({kind: 'failed', status: 401, body: undefined});
                expect(vi.mocked(http.postRequest)).not.toHaveBeenCalled();
                expect(store.state.value).toBe('authenticated');
                expect(ended).not.toHaveBeenCalled();
            });
        });

        describe('one session, one event', () => {
            it('adds nothing to an expiry that ended the session while the logout was in flight', async () => {
                const store = build();
                await signIn(store);
                const ended = vi.fn();
                store.onSessionEnd(ended);
                const post = heldRequest();
                vi.mocked(http.postRequest).mockImplementationOnce(post.implementation);

                const pending = store.logout();
                await post.issued;
                store.handleSessionExpired('/employers/7');
                post.answerWith('');

                // The server did sign it out, so the OUTCOME still says so. What
                // the expiry already spent is the event, not the request.
                await expect(pending).resolves.toEqual({kind: 'signed_out'});
                expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: '/employers/7'});
            });

            it('fires once for two logouts that both succeed', async () => {
                const store = build();
                await signIn(store);
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

                const outcomes = await Promise.all([store.logout(), store.logout()]);

                expect(outcomes).toEqual([{kind: 'signed_out'}, {kind: 'signed_out'}]);
                expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'logout'});
            });

            it('ends a session the API stopped answering for — an outage still holds one', async () => {
                const store = build();
                await signIn(store);
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(500));
                await store.loadSession();
                expect(store.state.value).toBe('outage');
                expect(store.user.value).toEqual({id: 7});
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

                const outcome = await store.logout();

                expect(outcome).toEqual({kind: 'signed_out'});
                expect(store.state.value).toBe('signed_out');
                expect(store.user.value).toBeUndefined();
                expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'logout'});
            });

            it('moves the machine on a success that ended nothing — the server has spoken', async () => {
                const store = build();
                expect(store.state.value).toBe('loading');
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

                const outcome = await store.logout();

                expect(outcome).toEqual({kind: 'signed_out'});
                expect(store.state.value).toBe('signed_out');
                expect(ended).not.toHaveBeenCalled();
            });

            it('still posts, but fires nothing, when no session was left to end', async () => {
                const store = build();
                vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(401));
                await store.loadSession();
                expect(store.state.value).toBe('signed_out');
                const ended = vi.fn();
                store.onSessionEnd(ended);
                vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

                const outcome = await store.logout();

                // Ruling 1 says nothing about skipping the request: a stale button
                // press still asks the server, and still answers what it said.
                expect(outcome).toEqual({kind: 'signed_out'});
                expect(vi.mocked(http.postRequest)).toHaveBeenCalledWith('auth/employer/logout', {}, PLAIN_OPTIONS);
                expect(ended).not.toHaveBeenCalled();
            });
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

        it('ends a session in outage — the identity it still names is gone', async () => {
            const store = build();
            await signIn(store);
            vi.mocked(http.getRequest).mockRejectedValue(axiosRejection(500));
            await store.loadSession();
            expect(store.state.value).toBe('outage');
            const ended = vi.fn();
            store.onSessionEnd(ended);

            store.handleSessionExpired('/employers/7');

            expect(store.state.value).toBe('signed_out');
            expect(store.user.value).toBeUndefined();
            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: '/employers/7'});
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

    describe('a session that has ended cannot be revived by a read that predates it', () => {
        /**
         * Hands back a store with a `me` in flight and a hook to answer it. The
         * answer is a GOOD one — an authenticating body — because the hazard is
         * precisely that a valid answer from before the sign-out reinstates
         * guarded access after it.
         */
        const startPendingLoad = (store: SessionStore<Employer, Credentials>) => {
            let answerPendingMe = (): void => undefined;
            vi.mocked(http.getRequest).mockReturnValueOnce(
                new Promise((resolve) => {
                    answerPendingMe = () => resolve(respondWith({id: 7}));
                }),
            );

            return {pending: store.loadSession(), answerPendingMe};
        };

        it('discards a me still in flight when logout succeeds', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);
            const {pending, answerPendingMe} = startPendingLoad(store);
            vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

            await store.logout();
            answerPendingMe();
            await pending;

            expect(store.state.value).toBe('signed_out');
            expect(store.user.value).toBeUndefined();
            expect(store.isAuthenticated.value).toBe(false);
            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'logout'});
        });

        it('discards a me still in flight when the session expires', async () => {
            const store = build();
            await signIn(store);
            const ended = vi.fn();
            store.onSessionEnd(ended);
            const {pending, answerPendingMe} = startPendingLoad(store);

            store.handleSessionExpired('/employers/7');
            answerPendingMe();
            await pending;

            expect(store.state.value).toBe('signed_out');
            expect(store.user.value).toBeUndefined();
            expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: '/employers/7'});
        });

        it('still commits a read issued AFTER the session ended', async () => {
            const store = build();
            await signIn(store);
            vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

            await store.logout();
            expect(store.state.value).toBe('signed_out');

            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 9}));
            await store.loadSession();

            // Signing back in is legitimate; the rule stales reads issued BEFORE
            // the end, never the ones issued after it.
            expect(store.state.value).toBe('authenticated');
            expect(store.user.value).toEqual({id: 9});
        });

        it('still lets login re-establish a session it just ended', async () => {
            const store = build();
            await signIn(store);
            vi.mocked(http.postRequest).mockResolvedValue(respondWith(''));

            await store.logout();

            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 9}));
            const outcome = await store.login({email: 'a@b.test', password: 'x'});

            expect(outcome).toEqual({kind: 'authenticated'});
            expect(store.user.value).toEqual({id: 9});
        });
    });

    describe('ownsRefusalOf', () => {
        it('claims the three requests whose refusals it answers itself', () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});

            expect(store.ownsRefusalOf('auth/employer/login')).toBe(true);
            expect(store.ownsRefusalOf('auth/employer/logout')).toBe(true);
            expect(store.ownsRefusalOf(PRIME_URL)).toBe(true);
        });

        it('claims neither me, nor another request, nor the absence of one', () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});

            // `me` is the one refusal that IS the session ending underneath the
            // consumer, so it stays the hook's.
            expect(store.ownsRefusalOf('auth/employer/me')).toBe(false);
            expect(store.ownsRefusalOf('employers/7')).toBe(false);
            expect(store.ownsRefusalOf(undefined)).toBe(false);
        });

        it('claims no prime on a store that configured no csrf', () => {
            const store = build();

            expect(store.ownsRefusalOf(PRIME_URL)).toBe(false);
            expect(store.ownsRefusalOf('auth/employer/login')).toBe(true);
        });
    });

    describe('request options', () => {
        const credentials: Credentials = {email: 'a@b.test', password: 'x'};

        it('forwards credentials and the XSRF token on EVERY request a primed store makes', async () => {
            const store = build({csrf: {primeUrl: PRIME_URL}});
            vi.mocked(http.getRequest).mockResolvedValueOnce(respondWith(''));
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            await store.login(credentials);
            await store.logout();
            await store.loadSession();

            // The prime, the login POST, the confirming me, the logout POST and the
            // final me — all of them, not most of them.
            expect(vi.mocked(http.getRequest).mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(vi.mocked(http.postRequest).mock.calls.length).toBeGreaterThanOrEqual(2);
            expectEveryRequestUses(CSRF_OPTIONS);
        });

        it('overrides nothing on a store that configured no csrf', async () => {
            const store = build();
            vi.mocked(http.postRequest).mockResolvedValue(respondWith({}));
            vi.mocked(http.getRequest).mockResolvedValue(respondWith({id: 7}));

            await store.login(credentials);
            await store.logout();

            expectEveryRequestUses(PLAIN_OPTIONS);
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
