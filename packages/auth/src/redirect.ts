/**
 * Any ASCII control character or whitespace. A browser strips tab, LF and CR
 * before parsing a URL, so `/<TAB>/evil.com` normalises to `//evil.com` at a
 * `href`-shaped sink — a same-origin path on paper and a cross-origin jump in
 * fact. This package cannot know its consumer's sink, so the vector is refused
 * rather than assumed harmless (ADR-0050 § 2).
 */
const UNSAFE_CHARACTER = /[\s\p{Cc}]/u;

/**
 * The one return-to validator for the fleet.
 *
 * Accepts or refuses; it never strips, trims or normalises. A candidate that
 * needed rewriting to be safe was not safe, and a rewritten one is a different
 * destination than the person asked for.
 */
export const resolveSafeRedirect = (candidate: unknown): string | undefined => {
    if (typeof candidate !== 'string') return undefined;
    if (!candidate.startsWith('/')) return undefined;
    if (candidate.startsWith('//')) return undefined;
    if (candidate.includes('\\')) return undefined;
    if (UNSAFE_CHARACTER.test(candidate)) return undefined;

    return candidate;
};
