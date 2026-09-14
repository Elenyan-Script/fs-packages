import type {HttpService} from '@script-development/fs-http';

import type {RequestOptions} from './types';

export interface CsrfPrimer {
    prime(): Promise<void>;
    reset(): void;
}

/**
 * Fetches the XSRF cookie once and remembers that it did.
 *
 * The memo is per PRIMER, never per module: two stores on one page prime two
 * guards and must not share a slot. A rejected prime is forgotten so the next
 * caller retries; a settled one survives until a caller that has just seen a
 * stale-token refusal calls `reset()`.
 *
 * `primeUrl` is absolute at every real consumer — Sanctum's cookie route lives
 * at the app root, not under the API base — but the package treats it as an
 * opaque string and builds none of it.
 *
 * `options` is passed through verbatim, and a caller priming across an origin
 * boundary owes it `withCredentials` — without it the response's `Set-Cookie` is
 * dropped and the prime silently accomplishes nothing (DECISIONS D12).
 */
export const createCsrfPrimer = (
    http: Pick<HttpService, 'getRequest'>,
    primeUrl: string,
    options: RequestOptions,
): CsrfPrimer => {
    let pending: Promise<void> | undefined;

    return {
        prime() {
            pending ??= http.getRequest(primeUrl, options).then(
                () => undefined,
                (error: unknown) => {
                    pending = undefined;

                    throw error;
                },
            );

            return pending;
        },
        reset() {
            pending = undefined;
        },
    };
};
