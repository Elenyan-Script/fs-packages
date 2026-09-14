import type {Ref} from 'vue';

import {isAxiosError} from '@script-development/fs-http';
import {computed, readonly, ref} from 'vue';

import type {
    CreateSessionStoreConfig,
    LoginOutcome,
    RequestOptions,
    SessionEndEvent,
    SessionState,
    SessionStore,
} from './types';

import {createCsrfPrimer} from './csrf';
import {SIGNED_OUT_STATUSES} from './endpoints';

/** The one status that earns a second attempt, and only from `login()` (ADR-0050 § 3). */
const STALE_TOKEN_STATUS = 419;

/**
 * What a `me` attempt reported, whatever the store did with it. Read-only so the
 * shared `SUPERSEDED` value below needs no `Object.freeze` — a top-level call
 * would evaluate at module load and break this package's `sideEffects: false`.
 */
interface MeOutcome {
    readonly status: number | undefined;
    readonly body: unknown;
}

/** A read a newer one overtook. It reports nothing, because nothing of it was used. */
const SUPERSEDED: MeOutcome = {status: undefined, body: undefined};

/**
 * An axios rejection once `isAxiosError` has narrowed it: an answer, or the
 * recorded absence of one. Written structurally so no axios type is named here.
 */
type TransportFailure = {response?: {status: number; data: unknown}};

const statusOf = (error: unknown): number | undefined => (isAxiosError(error) ? error.response?.status : undefined);

const bodyOf = (error: unknown): unknown => (isAxiosError(error) ? error.response?.data : undefined);

export const createSessionStore = <TUser, TCredentials = Record<string, unknown>>(
    config: CreateSessionStoreConfig<TUser>,
): SessionStore<TUser, TCredentials> => {
    const {endpoints, guard, http, parseUser, timeoutMs} = config;
    const isChallenge = config.isChallenge ?? (() => false);

    /*
     * A store that primes a CSRF cookie must forward what it primed, whatever the
     * injected service was configured with: `createHttpService` defaults
     * `withXSRFToken` to FALSE, so a primed store on a default service sends the
     * cookie nowhere and every login draws the 419 the prime existed to avoid. The
     * credentials flag rides along because the prime itself has to be allowed to
     * STORE the cookie cross-origin. A store with no `csrf` block leaves the
     * service's own configuration alone — it has claimed nothing about the origin
     * boundary, so it overrides nothing (DECISIONS D12).
     */
    const requestOptions: RequestOptions =
        config.csrf === undefined
            ? {timeout: timeoutMs}
            : {timeout: timeoutMs, withCredentials: true, withXSRFToken: true};

    const primer = config.csrf === undefined ? undefined : createCsrfPrimer(http, config.csrf.primeUrl, requestOptions);

    const state = ref<SessionState>('loading');
    const user = ref<TUser | undefined>() as Ref<TUser | undefined>;
    const listeners = new Set<(event: SessionEndEvent) => void>();

    /*
     * The read epoch. A `me` answer writes the machine only if no later read was
     * issued while it was in flight — otherwise two navigations in a row leave
     * the OLDER answer last, and the store states a previous request's facts with
     * nothing anywhere in an error state (ADR-0048's failure mode, arriving as a
     * confident wrong answer rather than as silence).
     */
    let issued = 0;

    /*
     * `state` and `user` are written together, always. Writing one without the
     * other leaves the previous identity readable behind a signed-out machine —
     * the shell keeps rendering a name for a session that is gone.
     */
    const clearSession = (): void => {
        state.value = 'signed_out';
        user.value = undefined;
    };

    /** The transition out of a LIVE session: clears it, then tells the consumer once. */
    const endSession = (event: SessionEndEvent): void => {
        clearSession();

        for (const listener of listeners) {
            try {
                listener(event);
            } catch {
                /*
                 * A listener's own fault is the listener's to report. Swallowing it
                 * is in tension with ADR-0048 and is the lesser harm: this package
                 * has no reporting channel, and one throwing listener must not cost
                 * the others their notice that the session ended (DECISIONS D8).
                 */
            }
        }
    };

    const runLoadSession = async (): Promise<MeOutcome> => {
        issued += 1;

        const ticket = issued;

        let response: {data: unknown; status: number};

        try {
            response = await http.getRequest(endpoints.me, requestOptions);
        } catch (error) {
            /*
             * Only an HTTP answer, or an axios rejection reporting the ABSENCE of
             * one, becomes a session state. Anything else reaching here is a defect
             * — fs-http rejects a non-axios error untouched — and a defect that
             * classified itself as `outage` would be indistinguishable from a real
             * one forever (ADR-0048). It propagates instead (DECISIONS D13).
             */
            if (!isAxiosError(error)) throw error;

            if (issued !== ticket) return SUPERSEDED;

            const status = error.response?.status;

            if (status !== undefined && SIGNED_OUT_STATUSES.has(status)) {
                /*
                 * A revalidating `me` that answers 401 or 419 on a LIVE session is an
                 * expiry, and 401 and 419 are one class with one action (ADR-0050 § 3).
                 * Every exit from `authenticated` therefore runs through `endSession`,
                 * so the consumer hears about this one exactly as it hears about a
                 * refusal caught mid-request. From any other state nothing ended — the
                 * arrival at a login screen is not an event.
                 */
                if (state.value === 'authenticated') endSession({reason: 'expired'});
                else clearSession();
            } else {
                /*
                 * `user` is deliberately RETAINED on an outage. The ADR is explicit that
                 * an outage is never a sign-out, so the identity is still presumed
                 * good and a shell can keep naming it behind a notice; clearing it
                 * would render a broken API as a sign-out by another route.
                 */
                state.value = 'outage';
            }

            return {status, body: error.response?.data};
        }

        if (issued !== ticket) return SUPERSEDED;

        // Outside the transport `try` on purpose: a throwing `parseUser` is the
        // consumer's defect and must reach the consumer, not become an `outage`.
        const parsed = parseUser(response.data);

        if (parsed === undefined) {
            state.value = 'outage';
        } else {
            user.value = parsed;
            state.value = 'authenticated';
        }

        return {status: response.status, body: response.data};
    };

    const attemptLogin = async (credentials: TCredentials): Promise<{data: unknown}> => {
        if (primer !== undefined) await primer.prime();

        return http.postRequest(endpoints.login, credentials, requestOptions);
    };

    const refusalOf = (error: TransportFailure): LoginOutcome => ({
        kind: 'refused',
        status: error.response?.status,
        body: error.response?.data,
    });

    return {
        guard,
        state: readonly(state),
        /*
         * `readonly()` maps a generic through `DeepReadonly`, which does not reduce
         * for an unresolved `TUser` — so the assertion is what keeps the consumer's
         * own type readable on the way out. The RUNTIME guarantee is unaffected: the
         * value is still Vue's readonly proxy and still refuses a write, and the
         * declared `Readonly<Ref<…>>` still refuses one at compile time (D10).
         */
        user: readonly(user) as Readonly<Ref<TUser | undefined>>,
        isAuthenticated: computed(() => state.value === 'authenticated'),

        setUser(next) {
            if (state.value !== 'authenticated') {
                throw new TypeError(`fs-auth: setUser called while the session is '${state.value}', not authenticated`);
            }

            user.value = next;
        },

        async loadSession() {
            await runLoadSession();
        },

        async login(credentials) {
            let response: {data: unknown};

            try {
                response = await attemptLogin(credentials);
            } catch (error) {
                if (!isAxiosError(error)) throw error;

                /*
                 * One retry, and only for a stale token on a primed store. A token
                 * still refused against a fresh cookie is not a stale cookie, so a
                 * third post cannot fix it; and the retry may answer something else
                 * entirely, which is an answer to read rather than one to repeat.
                 */
                if (primer === undefined || error.response?.status !== STALE_TOKEN_STATUS) return refusalOf(error);

                primer.reset();

                try {
                    response = await attemptLogin(credentials);
                } catch (retryError) {
                    if (!isAxiosError(retryError)) throw retryError;

                    return refusalOf(retryError);
                }
            }

            if (isChallenge(response.data)) return {kind: 'challenge', body: response.data};

            const me = await runLoadSession();

            if (state.value === 'authenticated') return {kind: 'authenticated'};

            return {kind: 'refused', status: me.status, body: me.body};
        },

        async logout() {
            try {
                if (primer !== undefined) await primer.prime();

                await http.postRequest(endpoints.logout, {}, requestOptions);
            } catch (error) {
                /*
                 * Ruling 1. The machine moves on SUCCESS ONLY and nothing probes the
                 * server afterwards: a cookie the server still honours must never be
                 * reported as gone, and the question the caller can act on is whether
                 * to press again — which the outcome answers.
                 */
                return {kind: 'failed', status: statusOf(error), body: bodyOf(error)};
            }

            endSession({reason: 'logout'});

            return {kind: 'signed_out'};
        },

        handleSessionExpired(returnTo) {
            /*
             * The single-flight guard, and the reason it is a synchronous read of the
             * machine rather than a flag: the first caller flips `state` before any
             * await, so N concurrent 401s landing in one tick produce exactly one
             * event (ADR-0050 § 2).
             */
            if (state.value !== 'authenticated') return;

            endSession({reason: 'expired', returnTo});
        },

        onSessionEnd(listener) {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
    };
};
