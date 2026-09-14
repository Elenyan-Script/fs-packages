import type {Ref} from 'vue';

import {isAxiosError} from '@script-development/fs-http';
import {computed, readonly, ref} from 'vue';

import type {CreateSessionStoreConfig, LoginOutcome, SessionEndEvent, SessionState, SessionStore} from './types';

import {createCsrfPrimer} from './csrf';
import {SIGNED_OUT_STATUSES} from './endpoints';

/** The one status that earns a second attempt, and only from `login()` (ADR-0050 § 3). */
const STALE_TOKEN_STATUS = 419;

/** What a `me` attempt reported, whatever the store did with it. */
interface MeOutcome {
    status: number | undefined;
    body: unknown;
}

const statusOf = (error: unknown): number | undefined => (isAxiosError(error) ? error.response?.status : undefined);

const bodyOf = (error: unknown): unknown => (isAxiosError(error) ? error.response?.data : undefined);

export const createSessionStore = <TUser, TCredentials = Record<string, unknown>>(
    config: CreateSessionStoreConfig<TUser>,
): SessionStore<TUser, TCredentials> => {
    const {endpoints, guard, http, parseUser, timeoutMs} = config;
    const isChallenge = config.isChallenge ?? (() => false);
    const primer = config.csrf === undefined ? undefined : createCsrfPrimer(http, config.csrf.primeUrl, timeoutMs);
    const requestOptions = {timeout: timeoutMs};

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

    const endSession = (event: SessionEndEvent): void => {
        state.value = 'signed_out';
        user.value = undefined;

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

        try {
            const response = await http.getRequest(endpoints.me, requestOptions);

            if (issued !== ticket) return {status: undefined, body: undefined};

            const parsed = parseUser(response.data);

            if (parsed === undefined) {
                state.value = 'outage';
            } else {
                user.value = parsed;
                state.value = 'authenticated';
            }

            return {status: response.status, body: response.data};
        } catch (error) {
            if (issued !== ticket) return {status: undefined, body: undefined};

            const status = statusOf(error);

            state.value = status !== undefined && SIGNED_OUT_STATUSES.has(status) ? 'signed_out' : 'outage';

            return {status, body: bodyOf(error)};
        }
    };

    const attemptLogin = async (credentials: TCredentials): Promise<{data: unknown}> => {
        if (primer !== undefined) await primer.prime();

        return http.postRequest(endpoints.login, credentials, requestOptions);
    };

    const refused = (error: unknown): LoginOutcome => ({kind: 'refused', status: statusOf(error), body: bodyOf(error)});

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
                /*
                 * One retry, and only for a stale token on a primed store. A token
                 * still refused against a fresh cookie is not a stale cookie, so a
                 * third post cannot fix it; and the retry may answer something else
                 * entirely, which is an answer to read rather than one to repeat.
                 */
                if (primer === undefined || statusOf(error) !== STALE_TOKEN_STATUS) return refused(error);

                primer.reset();

                try {
                    response = await attemptLogin(credentials);
                } catch (retryError) {
                    return refused(retryError);
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
