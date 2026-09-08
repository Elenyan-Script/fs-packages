import type {ComputedRef, Ref} from 'vue';

import {computed, ref} from 'vue';

import type {
    Adapted,
    AdapterStoreConfig,
    AdapterStoreModule,
    ExtendCapabilities,
    ExtendShape,
    Item,
    NewAdapted,
    StoreModuleForAdapter,
} from './types';

import {BroadcastPayloadError, EntryNotFoundError, ExtendKeyCollisionError, ExtendPayloadError} from './errors';

export const createAdapterStoreModule = <
    T extends Item,
    E extends Adapted<T, object> = Adapted<T>,
    N extends NewAdapted<T, object> = NewAdapted<T>,
    X extends ExtendShape<T, E, N, X> = {},
>(
    config: AdapterStoreConfig<T, E, N, X>,
): StoreModuleForAdapter<T, E, N> & X => {
    const {domainName, adapter, httpService, storageService, loadingService, broadcast, extend} = config;

    const storedItems = storageService.get<{[id: number]: T}>(domainName, {});
    const frozenStoredItems = Object.fromEntries(
        Object.entries(storedItems).map(([id, item]) => [id, Object.freeze(item)]),
    ) as {[id: number]: Readonly<T>};

    const state: Ref<{[id: number]: Readonly<T>}> = ref(frozenStoredItems);

    const adaptedCache = new Map<number, E>();
    const getByIdComputedCache = new Map<number, ComputedRef<E | undefined>>();

    const getAdapted = (item: Readonly<T>): E => {
        const cached = adaptedCache.get(item.id);
        if (cached) {
            return cached;
        }
        const adapted = adapter(storeModule, () => state.value[item.id] as T);
        adaptedCache.set(item.id, adapted);
        return adapted;
    };

    // A value is storable only if it is an object with an own integer `id`. The id must be
    // an integer, not merely `typeof === 'number'` — `NaN` / `Infinity` / a non-integer
    // float pass a typeof check yet corrupt the keyspace (`state.value[NaN]` stringifies
    // to `"NaN"`, and `deleteById` could never match it since `Number("NaN") !== NaN`).
    // It must be an own property: an inherited `id` is dropped by object spread and by the
    // storage `JSON.stringify` round-trip, so the row would lose its key on the next merge
    // or reload. Shared by every validating ingest boundary (`broadcast`'s handlers and
    // `extend`'s `retrieveInto`), so the raw mutators below never leave the factory.
    const isStorableItem = (item: unknown): item is T =>
        typeof item === 'object' &&
        item !== null &&
        Object.hasOwn(item, 'id') &&
        Number.isInteger((item as {id: unknown}).id);

    // A patch may only carry a non-null, non-array object of changes without an `id`: an
    // `id` inside `changes` would re-key the row it is merged into, and an array spreads to
    // numeric keys. The check is on shape, not on the prototype — a class instance passes
    // and only its own enumerable fields merge.
    const isPatchChanges = (changes: unknown): changes is Partial<Omit<T, 'id'>> =>
        typeof changes === 'object' && changes !== null && !Array.isArray(changes) && !('id' in changes);

    const setById = (item: T): void => {
        state.value = {...state.value, [item.id]: Object.freeze(item)};
        storageService.put(domainName, state.value);
        adaptedCache.delete(item.id);
    };

    const deleteById = (id: number): void => {
        state.value = Object.fromEntries(Object.entries(state.value).filter(([key]) => Number(key) !== id)) as {
            [id: number]: Readonly<T>;
        };
        storageService.put(domainName, state.value);
        adaptedCache.delete(id);
        getByIdComputedCache.delete(id);
    };

    const storeModule: AdapterStoreModule<T> = {setById, deleteById};

    // Broadcast payloads arrive from an external channel (e.g. a WebSocket) and are
    // applied to the store without an HTTP round-trip — that non-HTTP path is the
    // feature. The trade-off is that unvalidated data would land straight in frozen
    // state, so a malformed payload would silently corrupt the store. The handlers
    // passed to the consumer's `subscribe` are therefore validating wrappers, not the
    // bare internal mutators: they reject a bad payload up front, and the raw
    // `setById`/`deleteById` never leave the factory.
    broadcast?.subscribe({
        onUpdate: (item) => {
            if (!isStorableItem(item)) {
                throw new BroadcastPayloadError(domainName, 'onUpdate', item);
            }
            setById(item);
        },
        onDelete: (id) => {
            if (!Number.isInteger(id)) {
                throw new BroadcastPayloadError(domainName, 'onDelete', id);
            }
            deleteById(id);
        },
        onPatch: (id, changes) => {
            if (!Number.isInteger(id)) {
                throw new BroadcastPayloadError(domainName, 'onPatch', id);
            }
            if (!isPatchChanges(changes)) {
                throw new BroadcastPayloadError(domainName, 'onPatch', changes);
            }
            const current = state.value[id];
            if (!current) return;
            // `id` is re-stamped last so the row's key is the validated id by construction,
            // never something the spread happened to carry.
            setById({...current, ...changes, id});
        },
    });

    const getById = (id: number): ComputedRef<E | undefined> => {
        const cached = getByIdComputedCache.get(id);
        if (cached) {
            return cached;
        }
        const computedRef = computed(() => (state.value[id] ? getAdapted(state.value[id]) : undefined));
        getByIdComputedCache.set(id, computedRef);
        return computedRef;
    };

    const base: StoreModuleForAdapter<T, E, N> = {
        getAll: computed(() => Object.values(state.value).map((item) => getAdapted(item))),
        getById,
        getOrFailById: async (id: number) => {
            await loadingService.ensureLoadingFinished();
            const item = getById(id).value;
            if (!item) throw new EntryNotFoundError(domainName, id);
            return item;
        },
        generateNew: () => adapter(storeModule),
        retrieveById: async (id: number) => {
            const {data} = await httpService.getRequest<T>(`${domainName}/${id}`);
            setById(data);
        },
        retrieveAll: async () => {
            const {data} = await httpService.getRequest<T[]>(domainName);
            state.value = data.reduce<{[id: number]: Readonly<T>}>((acc, item) => {
                acc[item.id] = Object.freeze(item);
                return acc;
            }, {});
            storageService.put(domainName, state.value);
            adaptedCache.clear();
            getByIdComputedCache.clear();
        },
    };

    // `extend` runs at construction and its return value becomes part of the public
    // store surface. It is handed a response-backed ingest primitive — never the raw
    // mutators — so a non-HTTP write path (`extend: (cap) => ({save: cap.setById})`, or
    // a wrapper around it) is structurally unexpressible, not merely guarded. The only
    // way data enters the store through `extend` is an HTTP response, validated before
    // it touches state. `setById`/`deleteById` never leave the factory through this door.
    const retrieveInto = async (
        endpoint: string,
        options?: Parameters<typeof httpService.getRequest>[1],
    ): Promise<void> => {
        const {data} = await httpService.getRequest<T | T[]>(endpoint, options);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
            if (!isStorableItem(item)) {
                throw new ExtendPayloadError(domainName, endpoint, item);
            }
            setById(item);
        }
    };

    const extendCapabilities: ExtendCapabilities = {retrieveInto};
    const extended = extend ? extend(extendCapabilities) : ({} as X);
    const baseKeys = new Set(Object.keys(base));
    for (const key of Object.keys(extended)) {
        if (baseKeys.has(key)) {
            throw new ExtendKeyCollisionError(key);
        }
    }
    return {...base, ...extended};
};
