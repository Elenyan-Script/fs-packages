export class EntryNotFoundError extends Error {
    constructor(domainName: string, id: number) {
        super(`${domainName} with id ${id} not found`);
        this.name = 'EntryNotFoundError';
    }
}

export class MissingResponseDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingResponseDataError';
    }
}

const BROADCAST_EXPECTATIONS = {
    onUpdate: 'an object with an integer `id`',
    onDelete: 'an integer id',
    onPatch: 'an integer id and a non-null, non-array object of changes without an `id` key',
} as const;

export class BroadcastPayloadError extends Error {
    constructor(domainName: string, handler: keyof typeof BROADCAST_EXPECTATIONS, received: unknown) {
        super(
            `${domainName} broadcast ${handler} received an invalid payload — expected ${BROADCAST_EXPECTATIONS[handler]}, got ${typeof received}. The store rejects it rather than corrupting state.`,
        );
        this.name = 'BroadcastPayloadError';
    }
}

export class ExtendKeyCollisionError extends Error {
    constructor(key: string) {
        super(
            `extend() returned the key "${key}", which collides with a built-in store method. extend keys must be new names.`,
        );
        this.name = 'ExtendKeyCollisionError';
    }
}

export class ExtendPayloadError extends Error {
    constructor(domainName: string, endpoint: string, received: unknown) {
        super(
            `${domainName} extend retrieveInto(${endpoint}) received an invalid item — expected an object with an integer \`id\`, got ${typeof received}. The store rejects it rather than corrupting state.`,
        );
        this.name = 'ExtendPayloadError';
    }
}
