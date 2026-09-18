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

/**
 * Invoked when an `onSessionEnd` listener fails — thrown or rejected. Receives
 * the failure and the event the listener was given. **Must not re-throw**: doing
 * so re-opens the exact failure the swallow closes, and would cost every later
 * listener its notice (DECISIONS D8). Parity with fs-http's
 * `GuardedMiddlewareErrorHandler` (ADR-0037).
 */
export type SessionEndListenerErrorHandler = (error: unknown, event: SessionEndEvent) => void;

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
    /**
     * Where a failing `onSessionEnd` listener is reported. Defaults to a loud
     * `console.error`, in the shape fs-http's `guarded()` already uses.
     */
    onListenerError?: SessionEndListenerErrorHandler;
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
    /**
     * Whether a refused request was this store's own credential exchange — its
     * login, its logout, or the CSRF prime in front of one. Their refusals are
     * already returned to the caller as an outcome, so the expiry hook must not
     * ALSO read them as the session ending underneath somebody (DECISIONS D19).
     *
     * The store answers it because the store owns the endpoint strings. A list
     * handed to the registrar instead would be a copy to keep in step with no
     * mechanism keeping it there.
     */
    ownsRefusalOf(url: string | undefined): boolean;
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
    /**
     * A listener may be `async`: a returned promise's rejection reaches
     * `onListenerError` exactly as a synchronous throw does. It is never awaited
     * — ending a session is synchronous (D16).
     *
     * @returns an unregister function.
     */
    onSessionEnd(listener: (event: SessionEndEvent) => void | Promise<void>): () => void;
}
