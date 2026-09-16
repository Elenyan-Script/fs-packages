import type {SessionEndpoints} from './types';

/**
 * The Sanctum SPA shape, as a preset. A consumer with one path out of line
 * spreads it and overrides that key rather than hand-writing three literals.
 */
export const sanctumEndpoints = (prefix: string): SessionEndpoints => ({
    me: `${prefix}/me`,
    login: `${prefix}/login`,
    logout: `${prefix}/logout`,
});

/**
 * The two statuses that mean the session is over for this tab, with ONE action
 * between them (ADR-0050 § 3). This is the fleet's only declaration of the set;
 * a consumer re-declaring it has forked the stance.
 */
export const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([401, 419]);

/**
 * Whether an answered status is one of the two. One reader idiom for the set, so
 * the `undefined` narrowing is written once rather than beside every use — it is
 * there for the type checker, since `Set.has(undefined)` is already `false`.
 */
export const isSignedOutStatus = (status: number | undefined): boolean =>
    status !== undefined && SIGNED_OUT_STATUSES.has(status);
