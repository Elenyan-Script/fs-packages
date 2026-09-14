import type {HttpService} from '@script-development/fs-http';
import type {ComputedRef, Ref} from 'vue';

/**
 * The four states a session can be in. `outage` is deliberately distinct from
 * `signed_out`: an API answering something unreadable is not the same fact as
 * an API saying the session is over, and rendering the first as the second
 * invites a password that would have worked a minute earlier (ADR-0050 § 3).
 */
/**
 * The per-request options object an fs-http verb accepts, taken from fs-http's
 * own signature rather than named from axios — the monorepo routes sibling types
 * through fs-http's re-exports, and a direct axios import breaks rolldown's
 * `d.cts` emission on a dual bundle.
 */
export type RequestOptions = NonNullable<Parameters<HttpService['getRequest']>[1]>;

export type SessionState = 'loading' | 'authenticated' | 'signed_out' | 'outage';

export interface SessionEndpoints {
    me: string;
    login: string;
    logout: string;
}

export type LoginOutcome =
    | {kind: 'authenticated'}
    /** The login answered without establishing a session (a 2FA step, say). The CONSUMER interprets `body`. */
    | {kind: 'challenge'; body: unknown}
    | {kind: 'refused'; status: number | undefined; body: unknown};

export type LogoutOutcome = {kind: 'signed_out'} | {kind: 'failed'; status: number | undefined; body: unknown};

export interface SessionEndEvent {
    reason: 'logout' | 'expired';
    returnTo?: string;
}

export interface CreateSessionStoreConfig<TUser> {
    /** The literal the API keys this session on. Exposed as `store.guard`; the store itself reads it nowhere. */
    guard: string;
    /** An fs-http service. The package never creates one. */
    http: HttpService;
    endpoints: SessionEndpoints;
    /** The consumer's own type guard over the `me` body. `undefined` means OUTAGE, never signed out. */
    parseUser: (body: unknown) => TUser | undefined;
    /** Whether a successful login response defers rather than establishing a session. Defaults to never. */
    isChallenge?: (body: unknown) => boolean;
    /** Architectural principle 8 — passed on every request the store makes. */
    timeoutMs: number;
    /** Cross-origin consumers only; a same-origin SPA cannot draw a 419 from a current browser. */
    csrf?: {primeUrl: string};
}

/**
 * The minimum a caller needs to decide whether to let a navigation through.
 * Structural on purpose: the registrars name no store generic, so a consumer's
 * `SessionStore<Employer, Credentials>` satisfies them without a cast.
 */
export interface AuthenticationState {
    readonly isAuthenticated: ComputedRef<boolean>;
}

/** The other half of the same split — what the 401/419 registrar needs and nothing more. */
export interface SessionExpiryHandler {
    handleSessionExpired(returnTo?: string): void;
}

export interface SessionStore<TUser, TCredentials> extends AuthenticationState, SessionExpiryHandler {
    readonly guard: string;
    readonly state: Readonly<Ref<SessionState>>;
    readonly user: Readonly<Ref<TUser | undefined>>;
    readonly isAuthenticated: ComputedRef<boolean>;
    /** The one writer of `user` (ADR-0050 ruling 3). Throws while the session is not authenticated. */
    setUser(next: TUser): void;
    loadSession(): Promise<void>;
    login(credentials: TCredentials): Promise<LoginOutcome>;
    logout(): Promise<LogoutOutcome>;
    handleSessionExpired(returnTo?: string): void;
    /** @returns an unregister function. */
    onSessionEnd(listener: (event: SessionEndEvent) => void): () => void;
}
