import {createHttpService} from '@script-development/fs-http';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createSessionStore, registerUnauthorizedMiddleware, sanctumEndpoints} from '../src';

/**
 * The store and the 401/419 registrar over a REAL `createHttpService`.
 *
 * Every other spec in this package stubs the transport, and that is what let a
 * defect live between the two: fs-http runs every response-error middleware
 * BEFORE it rejects to the caller's `catch`, so the hook reads a refusal the
 * store was about to turn into an outcome — and no spec that drives either half
 * alone can see it. The ordering is the thing under test here, which is why the
 * axios interceptor chain is the real one and only the adapter is replaced.
 */
const BASE_URL = 'https://api.example.test';
const ENDPOINTS = sanctumEndpoints('auth/employer');
const PRIME_URL = 'https://app.example.test/sanctum/csrf-cookie';
const TIMEOUT_MS = 4321;
const RETURN_TO = '/employers/7';

interface Employer {
    id: number;
}

const isEmployer = (body: unknown): Employer | undefined =>
    typeof body === 'object' && body !== null && typeof (body as Employer).id === 'number'
        ? (body as Employer)
        : undefined;

let mock: MockAdapter;

beforeEach(() => {
    // Before `createHttpService`: `axios.create` copies the adapter off the
    // defaults this replaces, so a service built first would still go to the wire.
    mock = new MockAdapter(axios);
});

afterEach(() => {
    mock.restore();
});

const build = (csrf?: {primeUrl: string}) => {
    const http = createHttpService(BASE_URL);
    const store = createSessionStore<Employer, {email: string}>({
        guard: 'employer',
        http,
        endpoints: ENDPOINTS,
        parseUser: isEmployer,
        timeoutMs: TIMEOUT_MS,
        csrf,
    });
    const ended = vi.fn();

    store.onSessionEnd(ended);
    registerUnauthorizedMiddleware(http, store, {returnTo: () => RETURN_TO});

    return {ended, http, store};
};

describe('the store and the unauthorized hook over one real http service', () => {
    it("does not end the session when a stale token refuses the store's own login", async () => {
        const {ended, store} = build({primeUrl: PRIME_URL});
        mock.onGet(PRIME_URL).reply(204);
        mock.onGet(/\/me$/u).reply(200, {id: 7});
        await store.loadSession();
        expect(store.state.value).toBe('authenticated');

        let attempts = 0;
        mock.onPost(/\/login$/u).reply(() => {
            attempts += 1;

            return attempts === 1 ? [419, {message: 'stale'}] : [200, {}];
        });

        const outcome = await store.login({email: 'a@b.test'});

        // The 419 is what the retry exists for. Ending the session on it signs
        // somebody out in the middle of the recovery that was about to succeed.
        expect(outcome).toEqual({kind: 'authenticated'});
        expect(attempts).toBe(2);
        expect(ended).not.toHaveBeenCalled();
        expect(store.state.value).toBe('authenticated');
    });

    it('leaves a refused csrf prime to the login outcome it already answers', async () => {
        const {ended, store} = build({primeUrl: PRIME_URL});
        mock.onGet(/\/me$/u).reply(200, {id: 7});
        mock.onGet(PRIME_URL).reply(401, {message: 'nope'});
        await store.loadSession();
        expect(store.state.value).toBe('authenticated');

        const outcome = await store.login({email: 'a@b.test'});

        expect(outcome).toEqual({kind: 'refused', status: 401, body: {message: 'nope'}});
        expect(ended).not.toHaveBeenCalled();
        expect(store.state.value).toBe('authenticated');
    });

    it('answers a refused logout as a confirmed sign-out, with ONE event and no return-to', async () => {
        const {ended, store} = build();
        mock.onGet(/\/me$/u).reply(200, {id: 7});
        await store.loadSession();
        mock.onPost(/\/logout$/u).reply(401, {message: 'no session'});

        const outcome = await store.logout();

        // One event, and it is the STORE's: the hook's would carry the return-to,
        // and `logout()` does not know where the person is (D14's reasoning).
        expect(outcome).toEqual({kind: 'signed_out'});
        expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired'});
        expect(store.state.value).toBe('signed_out');
        expect(store.user.value).toBeUndefined();
    });

    it.each([
        [`${BASE_URL}/sanctum/csrf-cookie`, true],
        ['https://app.example.test/sanctum/csrf-cookie', false],
    ])('primes %s with withCredentials %s on a smartCredentials service', async (primeUrl, credentialed) => {
        const sent: (boolean | undefined)[] = [];
        mock.onGet(/csrf-cookie$/u).reply((config) => {
            sent.push(config.withCredentials);

            return [204, {}];
        });
        mock.onGet(/\/me$/u).reply(200, {id: 7});
        mock.onPost(/\/login$/u).reply(200, {});
        const http = createHttpService(BASE_URL, {smartCredentials: true});
        const store = createSessionStore<Employer, {email: string}>({
            guard: 'employer',
            http,
            endpoints: ENDPOINTS,
            parseUser: isEmployer,
            timeoutMs: TIMEOUT_MS,
            csrf: {primeUrl},
        });

        await store.login({email: 'a@b.test'});

        // `smartCredentials` assigns `withCredentials` from a HOST comparison in a
        // request middleware, which runs after the per-request options the store
        // sends (D12). A prime named on any other host therefore arrives
        // uncredentialed, the `Set-Cookie` is dropped, and every login draws the
        // 419 the prime existed to prevent (DECISIONS D21). This binds fs-http's
        // BUILT dist, not its src, so teeth-proving it means mutate-and-rebuild.
        expect(sent).toEqual([credentialed]);
    });

    it('ends the session from the STORE on a refused me, so it carries no return-to', async () => {
        // REVERSED in fix round 7 with DECISIONS D19. This used to assert the
        // hook's event, `returnTo` included — the hook runs before fs-http
        // rejects, which is exactly why it cannot be the judge (see below).
        const {ended, store} = build();
        mock.onGet(/\/me$/u).replyOnce(200, {id: 7});
        await store.loadSession();
        mock.onGet(/\/me$/u).reply(401);

        await store.loadSession();

        expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired'});
        expect(store.state.value).toBe('signed_out');
    });

    it('discards a STALE me refusal by epoch, leaving the newer session standing', async () => {
        const {ended, store} = build();
        let answerStale = (): void => undefined;
        let reads = 0;
        mock.onGet(/\/me$/u).reply(() => {
            reads += 1;

            if (reads > 1) return [200, {id: 9}];

            return new Promise((resolve) => {
                answerStale = () => resolve([401, {}]);
            });
        });

        const stale = store.loadSession();
        await store.loadSession();
        expect(store.state.value).toBe('authenticated');

        answerStale();
        await stale;

        // The hook runs BEFORE fs-http rejects to `runLoadSession`, so it reaches
        // the machine before the epoch check that would discard this answer. Only
        // the store can judge a refusal of a request the store issued.
        expect(store.state.value).toBe('authenticated');
        expect(store.user.value).toEqual({id: 9});
        expect(ended).not.toHaveBeenCalled();
    });

    it("still ends the session for a 401 on a request that is not the store's", async () => {
        const {ended, http, store} = build();
        mock.onGet(/\/me$/u).reply(200, {id: 7});
        await store.loadSession();
        mock.onGet(/\/employers$/u).reply(401);

        await expect(http.getRequest('employers', {timeout: TIMEOUT_MS})).rejects.toBeDefined();

        expect(ended).toHaveBeenCalledExactlyOnceWith({reason: 'expired', returnTo: RETURN_TO});
        expect(store.state.value).toBe('signed_out');
    });
});
