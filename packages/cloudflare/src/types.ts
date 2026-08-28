/**
 * Where the client IP is read from.
 *
 * `'header'` — a client-IP header written by the platform edge proxy from the TCP peer
 * (fly-proxy's `Fly-Client-IP`). `'socket'` — the TCP peer itself, correct only when Node
 * holds the public listener.
 */
export type CloudflareGateSource = 'header' | 'socket';

export type CloudflareGateOptions = {
    /** Paths that bypass the gate entirely, matched exactly against `req.path`. No default — health-probe paths differ per app. */
    exemptPaths?: readonly string[];
    /** Client-IP header read in `'header'` mode. Must be proxy-written; a client-suppliable header is a bypass. */
    header?: string;
    /** Default `'header'`. */
    source?: CloudflareGateSource;
};

/** Structural subset of an Express 4/5 `Request` — duck-typed so the package needs no Express dependency. */
export type CloudflareGateRequest = {
    path: string;
    get: (name: string) => string | undefined;
    socket?: {remoteAddress?: string};
};

/** `403` rather than `number`: a narrower parameter keeps this assignable from both Express 4 and Express 5 `Response`. */
export type CloudflareGateResponse = {sendStatus: (code: 403) => void};

export type CloudflareGateMiddleware = (
    req: CloudflareGateRequest,
    res: CloudflareGateResponse,
    next: () => void,
) => void;

export type CloudflareGate = {middleware: CloudflareGateMiddleware; isCloudflareAddress: (value: string) => boolean};
