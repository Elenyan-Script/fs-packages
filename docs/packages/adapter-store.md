# fs-adapter-store

Reactive state management with CRUD resource adapters.

```bash
npm install @script-development/fs-adapter-store
```

**Peer dependencies:** `vue ^3.5.33`, `@script-development/fs-http ^0.1.0 || ^0.2.0 || ^0.3.0`, `@script-development/fs-storage ^0.1.0`, `@script-development/fs-loading ^0.1.0`, `@script-development/fs-helpers ^0.1.0`

## What It Does

`fs-adapter-store` is the domain layer package. It provides reactive, per-domain state management with built-in CRUD operations. Think of it as a lightweight alternative to Pinia that's designed for REST API resources — it fetches data, stores it reactively, and gives you adapted objects with `update()`, `patch()`, `delete()`, and `create()` methods.

## The Big Picture

A typical application has domain resources — users, projects, invoices — that need to be:

1. **Fetched** from an API
2. **Stored** in reactive state
3. **Displayed** in components
4. **Edited** through forms
5. **Saved** back to the API

`fs-adapter-store` handles all of this with a single `createAdapterStoreModule()` call per resource.

## Basic Usage

### 1. Define Your Domain Type

```typescript
interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
}
```

### 2. Create the Store Module

```typescript
import {createAdapterStoreModule, resourceAdapter} from '@script-development/fs-adapter-store';
import {http, storage, loading} from '@/services';

const usersStore = createAdapterStoreModule<User>({
    domainName: 'users', // API endpoint: /users
    adapter: resourceAdapter, // CRUD adapter factory
    httpService: http, // for API calls
    storageService: storage, // for offline persistence
    loadingService: loading, // for waiting on data
});
```

### 3. Fetch and Display

```typescript
// Fetch all users from the API
await usersStore.retrieveAll();

// Reactive list of all users
const allUsers = usersStore.getAll; // ComputedRef<Adapted<User>[]>
```

```vue
<script setup lang="ts">
import {usersStore} from '@/stores';
</script>

<template>
    <ul>
        <li v-for="user in usersStore.getAll.value" :key="user.id">{{ user.name }} — {{ user.email }}</li>
    </ul>
</template>
```

### 4. Edit and Save

Each adapted resource has a `mutable` ref for editing and methods for saving:

```vue
<script setup lang="ts">
const user = usersStore.getById(42); // ComputedRef<Adapted<User> | undefined>
</script>

<template>
    <form v-if="user.value" @submit.prevent="user.value.update()">
        <input v-model="user.value.mutable.value.name" />
        <input v-model="user.value.mutable.value.email" />
        <button type="submit">Save</button>
        <button type="button" @click="user.value.reset()">Reset</button>
    </form>
</template>
```

### 5. Create New Resources

```typescript
const newUser = usersStore.generateNew();

newUser.mutable.value.name = 'Alice';
newUser.mutable.value.email = 'alice@example.com';

await newUser.create(); // POST /users → adds to store
```

## Adapted vs NewAdapted

The adapter pattern creates two distinct object types:

### Adapted (Existing Resources)

When a resource comes from the API (has an `id`), it's wrapped in an `Adapted` object:

```typescript
const user = usersStore.getById(1).value;

// Read original values (readonly, frozen)
user.id; // 1
user.name; // "Alice"
user.email; // "alice@example.com"

// Edit via mutable ref
user.mutable.value.name = 'Bob';

// Save changes
await user.update(); // PUT /users/1 — sends full object
await user.patch({name: 'Bob'}); // PATCH /users/1 — sends partial update

// Discard edits
user.reset(); // mutable reverts to original values

// Delete
await user.delete(); // DELETE /users/1 — removes from store
```

### NewAdapted (Unsaved Resources)

When you create a new resource via `generateNew()`, it's wrapped in a `NewAdapted` object:

```typescript
const newUser = usersStore.generateNew();

// Default values (readonly, frozen)
newUser.name; // "" (empty defaults)
newUser.email; // ""

// Edit via mutable ref
newUser.mutable.value.name = 'Alice';

// Save to API
await newUser.create(); // POST /users → returns full User with id

// Reset to defaults
newUser.reset();
```

::: tip Why two types?
An existing resource has `update()`, `patch()`, and `delete()`. A new resource has only `create()`. TypeScript enforces this — you can't accidentally call `delete()` on something that hasn't been saved yet.
:::

## Waiting for Data

`getOrFailById` waits for loading to complete before looking up the resource. This is useful when navigating to a detail page where data might still be loading:

```typescript
try {
    const user = await usersStore.getOrFailById(42);
    // user is guaranteed to exist
} catch (error) {
    if (error instanceof EntryNotFoundError) {
        // user 42 doesn't exist in the store
        redirectTo404();
    }
}
```

## Offline Persistence

The store automatically persists state to the provided storage service. When the page reloads, stored data is available immediately while `retrieveAll()` fetches fresh data from the API. This provides a fast initial render without loading spinners.

## Syncing External Updates

Some resources are updated outside of the store's own CRUD calls — by another user over a WebSocket, by a background job, by an in-process event emitter. The `broadcast` config slot is the single, narrow bridge for feeding those updates into the store without going through HTTP.

```typescript
import type {AdapterStoreBroadcast} from '@script-development/fs-adapter-store';

const broadcast: AdapterStoreBroadcast<User> = {
    subscribe: ({onUpdate, onDelete, onPatch}) => {
        const onPatched = ({id, changes}: {id: number; changes: Partial<Omit<User, 'id'>>}) => onPatch(id, changes);
        eventSource.on('user.updated', onUpdate);
        eventSource.on('user.deleted', onDelete);
        eventSource.on('user.patched', onPatched);
        return () => {
            eventSource.off('user.updated', onUpdate);
            eventSource.off('user.deleted', onDelete);
            eventSource.off('user.patched', onPatched);
        };
    },
};

const usersStore = createAdapterStoreModule<User>({
    domainName: 'users',
    adapter: resourceAdapter,
    httpService: http,
    storageService: storage,
    loadingService: loading,
    broadcast,
});
```

The store calls `subscribe` exactly once at construction and wires the handlers straight into its internal mutation path. `onUpdate(item)` replaces or inserts; `onDelete(id)` removes; `onPatch(id, changes)` merges `changes` shallowly into the item the store already holds. All three update reactive state, refresh adapted views, and persist to storage — identical to what `update()` / `delete()` / `patch()` do after a successful HTTP call.

`onPatch` exists for channels with a frame-size ceiling (Reverb/Pusher cap a frame at 10 KB), where the producer sends only the fields that changed instead of the full row. The merge is shallow: a nested value replaces the stored value wholesale. A patch for an id the store does not hold is a no-op — no state write and no storage write — because the store cannot fabricate a full item from a partial. `onDelete` also does not throw on a missing id, but it still reassigns state and persists.

::: tip Why isn't there a public `setById` / `applyUpdate` method?
By design. Exposing a raw mutation method would let any caller bypass HTTP, which is almost always a bug (you'd end up with stale server state). The `broadcast` contract forces the bridge to be declared explicitly at store construction, scoped to one event source per store.
:::

The handlers the store passes to your `subscribe` are **validating wrappers**, not the raw internal mutators. Because broadcast payloads come from an external channel and are applied without an HTTP round-trip, they are checked before they touch state: `onUpdate` requires an object with an own integer `id` (an inherited `id` is rejected — object spread and the storage round-trip both drop it, so the row would lose its key), `onDelete` requires an integer id (`NaN` / `Infinity` / non-integer floats are rejected — they pass a `typeof === 'number'` check but corrupt the keyspace), and `onPatch` requires an integer id plus a non-null, non-array object of changes without an `id` key — `null`, an array, a primitive, or an object carrying an `id` key is rejected, because an `id` inside the merge would re-key the row. That check is on shape, not on the prototype: a class instance passes and only its own enumerable fields merge. A payload that fails throws [`BroadcastPayloadError`](#error-handling) rather than corrupting the store. The raw mutators never leave the factory — and since this is a closed contract, don't re-export the handlers onto your own public surface, which would publish a non-HTTP write path for arbitrary callers.

### Lifecycle

The `subscribe` call happens once, when the store is created. The store discards the unsubscribe return and never calls it — it does not tear down the subscription itself. In practice stores live for the app's lifetime, so teardown isn't needed — but if your event source has its own lifecycle (e.g., a channel you join and leave), manage that _outside_ the store. The store only cares about incoming events, not which channel they came from.

A common pattern is a small in-process emitter as a middleman: your transport layer (WebSocket, SSE, channel service, whatever) joins and leaves connections as views mount/unmount, and forwards incoming payloads onto an emitter that the store subscribes to. The store stays agnostic of transport and lifecycle.

### The Contract

```typescript
type AdapterStoreBroadcast<T> = {
    subscribe: (handlers: {
        onUpdate: (item: T) => void;
        onDelete: (id: number) => void;
        onPatch: (id: number, changes: Partial<Omit<T, 'id'>>) => void;
    }) => () => void; // unsubscribe
};
```

That's it. Any event source that can emit "updated" and "deleted" events for your resource type can implement this; wire `onPatch` too when the channel emits partial updates.

## Extending the Store

Some stores need a domain-specific fetch that the built-in surface doesn't cover — for example, retrieving one resource by a string route-binding key rather than its numeric `id`. The `extend` config slot is a capability-injection hook for exactly this: it lets a consumer add its own store-level methods without app-specific concepts leaking into the package, and without ever exposing a raw mutator.

`extend` runs **once at store construction** and receives an `ExtendCapabilities<T>` surface whose only ingest path is **`retrieveInto(endpoint, options?)`** — it performs an HTTP `GET` and upserts the (validated) response into the store. It returns an object of consumer-defined methods, which are merged onto the public store surface.

```typescript
const usersStore = createAdapterStoreModule<
    User,
    Adapted<User>,
    NewAdapted<User>,
    {retrieveBySlug: (slug: string) => Promise<void>}
>({
    domainName: 'users',
    adapter: resourceAdapter,
    httpService: http,
    storageService: storage,
    loadingService: loading,
    extend: ({retrieveInto}) => ({retrieveBySlug: (slug: string): Promise<void> => retrieveInto(`users/${slug}`)}),
});

// The custom method is on the public surface, fully typed — no cast needed
await usersStore.retrieveBySlug('alice');
const alice = usersStore.getById(alice.id);
```

**Why `retrieveInto`, not raw `setById`.** `extend`'s return value _is_ the public store surface. Were it handed the bare `setById`, a consumer could re-export a non-HTTP write path — `extend: (cap) => ({save: cap.setById})`, or a `(item) => cap.setById(item)` wrapper that no runtime guard can tell apart from a legitimate fetch-then-set. Routing the only ingest through `retrieveInto` makes that **structurally unexpressible**, not merely guarded: the sole way data enters the store via `extend` is an HTTP response. This matters for consumer territories under ISO 27001 / NEN 7510, where the HTTP path is where authz and audit live. `extend` still closes over the consumer's whole module scope, so custom endpoints, derived methods, and cross-store coordination all stay expressible — only "write state with no server response behind it" is removed.

This is the asymmetry with `broadcast`: `broadcast`'s non-HTTP write path is irreducible (it _is_ the feature — applying server-pushed events without a round-trip), so it can only be **validated**; `extend`'s isn't, so it is **designed out**.

**Validation.** `retrieveInto` validates every item the response yields (a single item or an array): each must be an object with an integer `id` (`NaN` / `Infinity` / non-integer floats are rejected — they pass a `typeof === 'number'` check but corrupt the keyspace). A malformed item throws [`ExtendPayloadError`](#error-handling) rather than corrupting state — so a buggy backend response can't silently poison the store.

**Returned keys must be new names.** A key that collides with a built-in store method (`getAll`, `getById`, `getOrFailById`, `generateNew`, `retrieveById`, `retrieveAll`) **throws `ExtendKeyCollisionError` at construction** — always, on every call form. It is _additionally_ a compile error when you pass the extend shape as the fourth type argument (as in the example above) — which is the form you use to make the extended methods callable. Passing the type argument therefore gives you both the editor-time guarantee and a callable method; the runtime guard is the backstop that holds even on a bare `<T, E, N>` call where the extend shape is left to default.

The guard keys on the _current_ built-in set, so it carries a forward-compat consequence: adding a built-in method in a future release will collide with any `extend` method already shipping that name — i.e. a new built-in is a breaking change for extend-consumers. Worth keeping in mind when naming extend methods (and when evolving the built-in surface).

## Custom New Types

By default, `generateNew()` creates an object with all fields except `id`. You can customize this with a third type parameter:

```typescript
interface CreateUserData {
    name: string;
    email: string;
    // no role — assigned server-side
}

const usersStore = createAdapterStoreModule<User, Adapted<User, CreateUserData>, CreateUserData>({
    domainName: 'users',
    adapter: resourceAdapter,
    httpService: http,
    storageService: storage,
    loadingService: loading,
});

const newUser = usersStore.generateNew();
// newUser.mutable has only name and email — no role field
```

## Error Handling

The package exports five error classes:

```typescript
import {
    BroadcastPayloadError,
    EntryNotFoundError,
    ExtendKeyCollisionError,
    ExtendPayloadError,
    MissingResponseDataError,
} from '@script-development/fs-adapter-store';
```

- **`EntryNotFoundError`** — thrown by `getOrFailById` when the resource doesn't exist in the store
- **`MissingResponseDataError`** — thrown when a CRUD response doesn't contain a `data` field
- **`BroadcastPayloadError`** — thrown by a `broadcast` handler when the incoming payload is malformed (`onUpdate` not given an object with an integer `id`, `onDelete` given a non-integer id, or `onPatch` given a non-integer id or a `changes` value that is `null`, an array, a primitive, or carries an `id` key)
- **`ExtendKeyCollisionError`** — thrown at store construction when an `extend` method's key collides with a built-in store method
- **`ExtendPayloadError`** — thrown by `extend`'s `retrieveInto` when a fetched item is not an object with an integer `id` (a malformed backend response cannot corrupt the keyspace)

## API Reference

### `createAdapterStoreModule(config)`

| Parameter               | Type                                            | Description                                                                                                                                                |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.domainName`     | `string`                                        | Resource endpoint name (e.g., `"users"`)                                                                                                                   |
| `config.adapter`        | `Adapter`                                       | CRUD adapter factory (use `resourceAdapter`)                                                                                                               |
| `config.httpService`    | `Pick<HttpService, "getRequest">`               | HTTP service for fetching                                                                                                                                  |
| `config.storageService` | `Pick<StorageService, "get" \| "put">`          | Storage for persistence                                                                                                                                    |
| `config.loadingService` | `Pick<LoadingService, "ensureLoadingFinished">` | Loading service for sync                                                                                                                                   |
| `config.broadcast?`     | `AdapterStoreBroadcast<T>`                      | Optional external-event bridge for server-initiated updates                                                                                                |
| `config.extend?`        | `(cap: ExtendCapabilities<T>) => X`             | Optional capability-injection hook; `cap.retrieveInto(endpoint, options?)` is the sole ingest path. Merges consumer-defined methods onto the store surface |

### Store Module Methods

| Method              | Returns                             | Description                                |
| ------------------- | ----------------------------------- | ------------------------------------------ |
| `getAll`            | `ComputedRef<Adapted[]>`            | Reactive list of all adapted resources     |
| `getById(id)`       | `ComputedRef<Adapted \| undefined>` | Reactive lookup by ID                      |
| `getOrFailById(id)` | `Promise<Adapted>`                  | Wait for loading, throw if not found       |
| `generateNew()`     | `NewAdapted`                        | Create a new unsaved resource              |
| `retrieveById(id)`  | `Promise<void>`                     | Fetch a single resource from the API by id |
| `retrieveAll()`     | `Promise<void>`                     | Fetch all from API and update state        |

### Adapted Properties

| Property                | Type                      | Description                |
| ----------------------- | ------------------------- | -------------------------- |
| _(all resource fields)_ | `readonly`                | Original values from API   |
| `mutable`               | `Ref<Writable<T>>`        | Editable copy              |
| `reset()`               | `() => void`              | Revert mutable to original |
| `update()`              | `() => Promise<T>`        | PUT full resource          |
| `patch(partial)`        | `(partial) => Promise<T>` | PATCH partial update       |
| `delete()`              | `() => Promise<void>`     | DELETE resource            |

### NewAdapted Properties

| Property           | Type               | Description                |
| ------------------ | ------------------ | -------------------------- |
| _(all new fields)_ | `readonly`         | Default values             |
| `mutable`          | `Ref<Writable<N>>` | Editable copy              |
| `reset()`          | `() => void`       | Revert mutable to defaults |
| `create()`         | `() => Promise<T>` | POST to create resource    |
