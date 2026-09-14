import type {HttpService, ResponseErrorMiddlewareFunc} from '@script-development/fs-http';

import {vi} from 'vitest';

/**
 * A hand-built object satisfying fs-http's `HttpService`.
 *
 * Hand-built rather than `vi.mock`ed: the specs are about what this package
 * sends and what it does with the answer, and a module mock would also replace
 * `isAxiosError`, which the store uses to tell an answered refusal from a
 * transport fault. Only the three verbs the store reaches for are stubbed with
 * behaviour; the rest are present so the type is genuinely satisfied.
 */
export interface HttpStub extends HttpService {
    errorMiddleware: ResponseErrorMiddlewareFunc[];
}

const unused = () => {
    throw new Error('fs-auth specs: this transport verb is not part of the package contract');
};

export const createHttpStub = (): HttpStub => {
    const errorMiddleware: ResponseErrorMiddlewareFunc[] = [];

    return {
        errorMiddleware,
        getRequest: vi.fn(),
        postRequest: vi.fn(),
        putRequest: unused,
        patchRequest: unused,
        deleteRequest: unused,
        downloadRequest: unused,
        previewRequest: unused,
        registerRequestMiddleware: unused,
        registerResponseMiddleware: unused,
        registerResponseErrorMiddleware: vi.fn((fn: ResponseErrorMiddlewareFunc) => {
            errorMiddleware.push(fn);

            return () => {
                const index = errorMiddleware.indexOf(fn);

                if (index > -1) errorMiddleware.splice(index, 1);
            };
        }),
    };
};

/** An axios-shaped success, in the one shape the store reads. */
export const respondWith = (data: unknown, status = 200) => ({data, status});

/**
 * An axios-shaped rejection. `isAxiosError` reads the `isAxiosError` flag axios
 * itself stamps, so a literal carrying it is indistinguishable to the store from
 * a real one — which is the point: the specs exercise the store's narrowing,
 * not axios's.
 */
export const axiosRejection = (status: number | undefined, data: unknown = undefined) => ({
    isAxiosError: true,
    response: status === undefined ? undefined : {status, data},
});
