import {describe, expect, it} from 'vitest';

// @vitest-environment happy-dom
import {
    BroadcastPayloadError,
    EntryNotFoundError,
    ExtendKeyCollisionError,
    ExtendPayloadError,
    MissingResponseDataError,
} from '../src/errors';

describe('EntryNotFoundError', () => {
    it('should create error with correct message', () => {
        // Act
        const error = new EntryNotFoundError('users', 42);

        // Assert
        expect(error.message).toBe('users with id 42 not found');
        expect(error.name).toBe('EntryNotFoundError');
    });

    it('should be an instance of Error', () => {
        // Act
        const error = new EntryNotFoundError('items', 1);

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(EntryNotFoundError);
    });
});

describe('MissingResponseDataError', () => {
    it('should create error with correct message', () => {
        // Act
        const error = new MissingResponseDataError('No data returned');

        // Assert
        expect(error.message).toBe('No data returned');
        expect(error.name).toBe('MissingResponseDataError');
    });

    it('should be an instance of Error', () => {
        // Act
        const error = new MissingResponseDataError('test');

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(MissingResponseDataError);
    });
});

describe('BroadcastPayloadError', () => {
    it('should describe an invalid onUpdate payload, naming the expected shape and received type', () => {
        // Act
        const error = new BroadcastPayloadError('users', 'onUpdate', null);

        // Assert
        expect(error.message).toBe(
            'users broadcast onUpdate received an invalid payload — expected an object with an integer `id`, got object. The store rejects it rather than corrupting state.',
        );
        expect(error.name).toBe('BroadcastPayloadError');
    });

    it('should describe an invalid onDelete payload, naming the expected shape and received type', () => {
        // Act
        const error = new BroadcastPayloadError('users', 'onDelete', 'KD-7');

        // Assert
        expect(error.message).toBe(
            'users broadcast onDelete received an invalid payload — expected an integer id, got string. The store rejects it rather than corrupting state.',
        );
        expect(error.name).toBe('BroadcastPayloadError');
    });

    it('should describe an invalid onPatch payload, naming the expected shape and received type', () => {
        // Act
        const error = new BroadcastPayloadError('users', 'onPatch', 'KD-7');

        // Assert
        expect(error.message).toBe(
            'users broadcast onPatch received an invalid payload — expected an integer id and a non-null, non-array object of changes without an `id` key, got string. The store rejects it rather than corrupting state.',
        );
        expect(error.name).toBe('BroadcastPayloadError');
    });

    it('should be an instance of Error', () => {
        // Act
        const error = new BroadcastPayloadError('items', 'onUpdate', undefined);

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(BroadcastPayloadError);
    });
});

describe('ExtendKeyCollisionError', () => {
    it('should create error with correct message containing the colliding key', () => {
        // Act
        const error = new ExtendKeyCollisionError('retrieveAll');

        // Assert
        expect(error.message).toContain('retrieveAll');
        expect(error.name).toBe('ExtendKeyCollisionError');
    });

    it('should be an instance of Error', () => {
        // Act
        const error = new ExtendKeyCollisionError('getById');

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ExtendKeyCollisionError);
    });
});

describe('ExtendPayloadError', () => {
    it('should describe an invalid retrieveInto response, naming the endpoint and received type', () => {
        // Act
        const error = new ExtendPayloadError('users', 'users/KD-7', null);

        // Assert
        expect(error.message).toBe(
            'users extend retrieveInto(users/KD-7) received an invalid item — expected an object with an integer `id`, got object. The store rejects it rather than corrupting state.',
        );
        expect(error.name).toBe('ExtendPayloadError');
    });

    it('should report the received type for a non-object response', () => {
        // Act
        const error = new ExtendPayloadError('users', 'users/KD-7', 'KD-7');

        // Assert
        expect(error.message).toBe(
            'users extend retrieveInto(users/KD-7) received an invalid item — expected an object with an integer `id`, got string. The store rejects it rather than corrupting state.',
        );
        expect(error.name).toBe('ExtendPayloadError');
    });

    it('should be an instance of Error', () => {
        // Act
        const error = new ExtendPayloadError('items', 'items/1', undefined);

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ExtendPayloadError);
    });
});
