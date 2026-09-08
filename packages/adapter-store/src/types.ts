import type {Writable} from '@script-development/fs-helpers';
import type {HttpService} from '@script-development/fs-http';
import type {LoadingService} from '@script-development/fs-loading';
import type {StorageService} from '@script-development/fs-storage';
import type {ComputedRef, Ref} from 'vue';

/** Base constraint for all domain items — must have a numeric id. */
export type Item = {id: number};

/** Default type for new resources — strips the id field. Territories can override. */
export type DefaultNew<T extends Item> = Omit<T, 'id'>;

/**
 * Internal store module contract passed to adapters.
 * NOT part of the public API — adapters use this to mutate store state
 * after successful CRUD operations.
 */
export type AdapterStoreModule<T extends Item> = {setById: (item: T) => void; deleteById: (id: number) => void};

/** Base of a resource adapter: readonly resource + mutable ref + reset. */
type BaseResourceAdapter<T extends object> = Readonly<T> & {
    /** Reactive, mutable copy of the resource. */
    mutable: Ref<Writable<T>>;
    /** Reset the mutable state to the original resource. */
    reset: () => void;
};

/** Adapter for an existing resource. Provides update, patch, and delete. */
export type Adapted<T extends Item, N extends object = DefaultNew<T>> = BaseResourceAdapter<T> & {
    update(): Promise<T>;
    patch(partialItem: Partial<N>): Promise<T>;
    delete(): Promise<void>;
};

/** Adapter for a new resource (without id). Provides create. */
export type NewAdapted<T extends Item, N extends object = DefaultNew<T>> = BaseResourceAdapter<N> & {
    create(): Promise<T>;
};

/** Callable adapter type — overloaded for existing vs new resources. */
export type Adapter<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>> = {
    (storeModule: AdapterStoreModule<T>): N;
    (storeModule: AdapterStoreModule<T>, resourceGetter: () => T): E;
};

/**
 * Contract for binding server-initiated events (e.g. WebSocket broadcasts)
 * to an adapter-store. The store calls `subscribe` once at construction and
 * routes incoming events straight into its internal mutation path.
 *
 * This is a **closed** contract: the handlers are consumed inside the consumer's
 * `subscribe` body (wired to an event source) and are never returned, so they do
 * not reach the public store surface. The handlers the store passes are validating
 * wrappers, not the bare internal mutators — `onUpdate` rejects a payload that is
 * not an object with an integer `id`, and `onDelete` rejects a non-integer id, each
 * throwing `BroadcastPayloadError` so a malformed broadcast cannot corrupt store
 * state (`NaN` / `Infinity` / a non-integer float pass a `typeof === 'number'` check
 * yet break the keyspace, so the guard requires an integer). Because the channel
 * applies events without an HTTP round-trip, do not
 * re-export the handlers onto your own public surface — that would publish a
 * non-HTTP write path for arbitrary callers.
 *
 * `onPatch(id, changes)` merges `changes` shallowly into the row the store holds,
 * for channels with a frame-size ceiling where the producer sends only the fields
 * that changed. It rejects a non-integer `id`, a `changes` that is `null`, an
 * array, or a primitive, and a `changes` carrying an `id` key — an `id` inside the
 * merge would re-key the row. The check is on shape, not on the prototype: a class
 * instance passes and only its own enumerable fields merge. A patch for an id the store
 * does not hold is a no-op: no state reassignment and no storage write, because a
 * partial cannot become a full `T`. `onDelete` also does not throw on a missing id, but
 * it still reassigns state and calls `storageService.put`. Nested values replace the
 * stored value wholesale; there is no deep merge.
 */
export type AdapterStoreBroadcast<T extends Item> = {
    subscribe: (handlers: {
        onUpdate: (item: T) => void;
        onDelete: (id: number) => void;
        onPatch: (id: number, changes: Partial<Omit<T, 'id'>>) => void;
    }) => () => void;
};

/**
 * The capability surface handed to the `extend` hook. The only way data enters the
 * store through `extend` is an HTTP response: `retrieveInto` GETs an endpoint and
 * upserts the validated response item(s) via the internal mutators. The raw
 * `setById`/`deleteById` are deliberately absent, so re-exporting a non-HTTP write
 * path is structurally impossible rather than guarded against. `extend` still closes
 * over the consumer's whole module scope, so custom endpoints, derived methods, and
 * cross-store coordination all stay expressible — only "write state with no server
 * response behind it" is removed, which is exactly the abuse.
 */
export type ExtendCapabilities = {
    /**
     * GET `endpoint` and upsert the response into the store — a single item or an
     * array of items. Each must be an object with an integer `id`, or
     * `ExtendPayloadError` is thrown (a malformed backend response cannot corrupt the
     * keyspace). `options` is forwarded to the underlying `getRequest`. This is the
     * sole ingest path for `extend`.
     */
    retrieveInto: (endpoint: string, options?: Parameters<HttpService['getRequest']>[1]) => Promise<void>;
};

/**
 * Constraint for the `extend` return type `X`: allows any NEW store-level method,
 * but maps any key that collides with a built-in `StoreModuleForAdapter` method to
 * `never`, so a colliding key fails to satisfy the constraint (compile error).
 * Unlike `Partial<Record<keyof Store, never>>`, this admits arbitrary new keys —
 * it only bans the base ones.
 */
export type ExtendShape<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>, X> = {
    [K in keyof X]: K extends keyof StoreModuleForAdapter<T, E, N> ? never : X[K];
};

/** Configuration for createAdapterStoreModule. */
export type AdapterStoreConfig<
    T extends Item,
    E extends Adapted<T, object>,
    N extends NewAdapted<T, object>,
    X extends ExtendShape<T, E, N, X> = {},
> = {
    domainName: string;
    adapter: Adapter<T, E, N>;
    httpService: Pick<HttpService, 'getRequest'>;
    storageService: Pick<StorageService, 'get' | 'put'>;
    loadingService: Pick<LoadingService, 'ensureLoadingFinished'>;
    broadcast?: AdapterStoreBroadcast<T>;
    /**
     * Optional capability-injection hook. Runs once at store construction and
     * receives an {@link ExtendCapabilities} surface — **not** the raw mutator tier.
     * Returns an object of consumer-defined store-level methods that are merged onto
     * the public store surface — a sanctioned home for consumer-specific fetches (e.g.
     * fetch-one-by-string-route-binding-key) without app-specific concepts entering the
     * package.
     *
     * Trust model. The only ingest path `extend` is given is `retrieveInto`, which
     * performs an HTTP GET and upserts the (validated) response. The raw
     * `setById`/`deleteById` are deliberately **not** handed in — so a non-HTTP write
     * path (`extend: (cap) => ({save: cap.setById})`, or a `(item) => cap.setById(item)`
     * wrapper around it) is **structurally unexpressible**, not merely guarded against.
     * Unlike `broadcast` — a *closed* contract whose non-HTTP write path is irreducible
     * (it is the feature) and so can only be validated — `extend`'s leak can be designed
     * out, and is. Every extend-driven write stays on the HTTP path, where consumer
     * territories put authz/audit.
     *
     * Returned keys must be NEW names. A key that collides with a built-in store
     * method (`getAll`, `getById`, `getOrFailById`, `generateNew`, `retrieveById`,
     * `retrieveAll`) **throws `ExtendKeyCollisionError` at construction** — on every
     * call form. It is *additionally* a compile error when the extend return type
     * `X` is supplied or inferred (e.g. as the 4th type argument), which is the form
     * you use to make the extended methods callable.
     *
     * Forward-compat: this guard keys on the *current* built-in set. Adding a built-in
     * in a future release collides with any extend method already shipping that name —
     * so a new built-in is a breaking change for extend-consumers.
     */
    extend?: (cap: ExtendCapabilities) => X;
};

/** Public API of a store module. */
export type StoreModuleForAdapter<T extends Item, E extends Adapted<T, object>, N extends NewAdapted<T, object>> = {
    getAll: ComputedRef<E[]>;
    getById: (id: number) => ComputedRef<E | undefined>;
    getOrFailById: (id: number) => Promise<E>;
    generateNew: () => N;
    retrieveById: (id: number) => Promise<void>;
    retrieveAll: () => Promise<void>;
};
