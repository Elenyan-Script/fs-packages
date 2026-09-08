// @vitest-environment happy-dom
import type {HttpService} from '@script-development/fs-http';
import type {LoadingService} from '@script-development/fs-loading';
import type {StorageService} from '@script-development/fs-storage';
import type {AxiosResponse} from 'axios';
import type {Ref} from 'vue';

import {describe, expect, it, vi} from 'vitest';
import {computed, ref} from 'vue';

import type {
    Adapted,
    Adapter,
    AdapterStoreBroadcast,
    AdapterStoreConfig,
    AdapterStoreModule,
    ExtendCapabilities,
    Item,
    NewAdapted,
} from '../src/types';

import {createAdapterStoreModule} from '../src/adapter-store';
import {BroadcastPayloadError, EntryNotFoundError, ExtendKeyCollisionError, ExtendPayloadError} from '../src/errors';

type TestNew = Omit<TestItem, 'id'>;
type TestStorageService = Pick<StorageService, 'get' | 'put'>;
type TestLoadingService = Pick<LoadingService, 'ensureLoadingFinished'>;

interface TestItem extends Item {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string;
    meta?: Record<string, number>;
}

type TestAdapted = Adapted<TestItem> & {testMethod: () => string};
type TestNewAdapted = NewAdapted<TestItem> & {testMethod: () => string};

/**
 * Mock adapter function for tests.
 *
 * Exception to test encapsulation rule: This adapter is defined globally because
 * inlining it in each test (~25 lines) severely impacts readability. The adapter
 * is stateless and does not affect test isolation.
 */
function createTestAdapter(storeModule: AdapterStoreModule<TestItem>): TestNewAdapted;
function createTestAdapter(storeModule: AdapterStoreModule<TestItem>, resourceGetter: () => TestItem): TestAdapted;
function createTestAdapter(
    storeModule: AdapterStoreModule<TestItem>,
    resourceGetter?: () => TestItem,
): TestAdapted | TestNewAdapted {
    if (resourceGetter) {
        const adapted = {} as TestAdapted;
        const source = resourceGetter();

        for (const key of Object.keys(source)) {
            Object.defineProperty(adapted, key, {
                get: () => resourceGetter()[key as keyof TestItem],
                enumerable: true,
                configurable: false,
            });
        }

        Object.defineProperty(adapted, 'mutable', {
            value: ref({...resourceGetter()}) as Ref<TestNew>,
            enumerable: true,
            configurable: false,
            writable: false,
        });
        Object.defineProperty(adapted, 'reset', {
            value: vi.fn(),
            enumerable: true,
            configurable: false,
            writable: false,
        });
        Object.defineProperty(adapted, 'update', {
            value: vi.fn(),
            enumerable: true,
            configurable: false,
            writable: false,
        });
        Object.defineProperty(adapted, 'patch', {
            value: vi.fn(),
            enumerable: true,
            configurable: false,
            writable: false,
        });
        Object.defineProperty(adapted, 'delete', {
            value: vi.fn(),
            enumerable: true,
            configurable: false,
            writable: false,
        });
        Object.defineProperty(adapted, 'testMethod', {
            value: () => `adapted-${resourceGetter().id}`,
            enumerable: true,
            configurable: false,
            writable: false,
        });

        return adapted;
    }
    return {
        name: '',
        mutable: ref({name: ''}) as Ref<TestNew>,
        reset: vi.fn(),
        create: vi.fn(),
        testMethod: () => 'new-adapted',
    } as unknown as TestNewAdapted;
}

/**
 * Creates a capturing adapter that stores the storeModule for later access.
 *
 * Exception to test encapsulation rule: This factory is defined globally for the same
 * readability reasons as createTestAdapter. Each call creates a fresh capture context,
 * maintaining test isolation.
 */
function createCapturingAdapter(): {
    adapter: Adapter<TestItem, TestAdapted, TestNewAdapted>;
    getCapturedStoreModule: () => AdapterStoreModule<TestItem> | null;
} {
    let capturedStoreModule: AdapterStoreModule<TestItem> | null = null;

    function adapter(storeModule: AdapterStoreModule<TestItem>): TestNewAdapted;
    function adapter(storeModule: AdapterStoreModule<TestItem>, resourceGetter: () => TestItem): TestAdapted;
    function adapter(
        storeModule: AdapterStoreModule<TestItem>,
        resourceGetter?: () => TestItem,
    ): TestAdapted | TestNewAdapted {
        capturedStoreModule = storeModule;
        if (resourceGetter) {
            const adapted = {} as TestAdapted;
            const source = resourceGetter();

            for (const key of Object.keys(source)) {
                Object.defineProperty(adapted, key, {
                    get: () => resourceGetter()[key as keyof TestItem],
                    enumerable: true,
                    configurable: false,
                });
            }

            Object.defineProperty(adapted, 'mutable', {
                value: ref({...resourceGetter()}) as Ref<TestNew>,
                enumerable: true,
                configurable: false,
                writable: false,
            });
            Object.defineProperty(adapted, 'reset', {
                value: vi.fn(),
                enumerable: true,
                configurable: false,
                writable: false,
            });
            Object.defineProperty(adapted, 'update', {
                value: vi.fn(),
                enumerable: true,
                configurable: false,
                writable: false,
            });
            Object.defineProperty(adapted, 'patch', {
                value: vi.fn(),
                enumerable: true,
                configurable: false,
                writable: false,
            });
            Object.defineProperty(adapted, 'delete', {
                value: vi.fn(),
                enumerable: true,
                configurable: false,
                writable: false,
            });
            Object.defineProperty(adapted, 'testMethod', {
                value: () => `adapted-${resourceGetter().id}`,
                enumerable: true,
                configurable: false,
                writable: false,
            });

            return adapted;
        }
        return {
            name: '',
            mutable: ref({name: ''}) as Ref<TestNew>,
            reset: vi.fn(),
            create: vi.fn(),
            testMethod: () => 'new-adapted',
        } as unknown as TestNewAdapted;
    }

    return {
        adapter: adapter as Adapter<TestItem, TestAdapted, TestNewAdapted>,
        getCapturedStoreModule: () => capturedStoreModule,
    };
}

describe('createAdapterStoreModule', () => {
    describe('getAll', () => {
        it('should return computed with empty array when no items', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };

            // Act
            const store = createAdapterStoreModule(config);

            // Assert
            expect(store.getAll.value).toEqual([]);
        });

        it('should return computed with all adapted items', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                {id: 2, name: 'Item 2', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveAll();

            // Assert
            expect(store.getAll.value).toHaveLength(2);
            expect(store.getAll.value[0]?.testMethod()).toBe('adapted-1');
            expect(store.getAll.value[1]?.testMethod()).toBe('adapted-2');
        });

        it('should update when items are added to state', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const store = createAdapterStoreModule(config);
            expect(store.getAll.value).toHaveLength(0);
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);

            // Act
            await store.retrieveAll();

            // Assert
            expect(store.getAll.value).toHaveLength(1);
        });
    });

    describe('getById', () => {
        it('should return computed with undefined for non-existent id', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };

            // Act
            const store = createAdapterStoreModule(config);

            // Assert
            expect(store.getById(999).value).toBeUndefined();
        });

        it('should return computed with adapted item for existing id', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Act
            const result = store.getById(1);

            // Assert
            expect(result.value).toBeDefined();
            expect(result.value?.testMethod()).toBe('adapted-1');
        });

        it('should update when item is modified', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const store = createAdapterStoreModule(config);
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: [{id: 1, name: 'Original', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'}],
            } as AxiosResponse<TestItem[]>);
            await store.retrieveAll();
            const computed = store.getById(1);
            expect(computed.value?.name).toBe('Original');
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: [{id: 1, name: 'Updated', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'}],
            } as AxiosResponse<TestItem[]>);

            // Act
            await store.retrieveAll();

            // Assert
            expect(computed.value?.name).toBe('Updated');
        });
    });

    describe('getOrFailById', () => {
        it('should wait for loading to finish before checking', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const store = createAdapterStoreModule(config);

            // Act
            try {
                await store.getOrFailById(1);
            } catch {
                // Expected to throw
            }

            // Assert
            expect(loadingService.ensureLoadingFinished).toHaveBeenCalled();
        });

        it('should return adapted item when found', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Act
            const result = await store.getOrFailById(1);

            // Assert
            expect(result.testMethod()).toBe('adapted-1');
        });

        it('should return reactive adapted item that reflects store updates', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Original', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            const result = await store.getOrFailById(1);
            expect(result.name).toBe('Original');

            // Act — simulate a store update (e.g. from a patch/update response)
            const storeModule = getCapturedStoreModule() as unknown as AdapterStoreModule<TestItem>;
            storeModule.setById({
                id: 1,
                name: 'Updated',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
            });

            // Assert — the same adapted object should reflect the updated data via getters
            expect(result.name).toBe('Updated');
        });

        it('should throw EntryNotFoundError when item not found', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const store = createAdapterStoreModule(config);

            // Act & Assert
            await expect(store.getOrFailById(999)).rejects.toThrow(EntryNotFoundError);
            await expect(store.getOrFailById(999)).rejects.toThrow('test-items with id 999 not found');
        });
    });

    describe('generateNew', () => {
        it('should return new adapted resource from adapter', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const store = createAdapterStoreModule(config);

            // Act
            const result = store.generateNew();

            // Assert
            expect(result.testMethod()).toBe('new-adapted');
        });
    });

    describe('retrieveById', () => {
        it('should call httpService.getRequest with domainName and id', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {
                    id: 7,
                    name: 'Item 7',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                } satisfies TestItem,
            } as AxiosResponse<TestItem>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveById(7);

            // Assert
            expect(httpService.getRequest).toHaveBeenCalledWith('test-items/7');
        });

        it('should insert the returned item into the store', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {
                    id: 7,
                    name: 'Item 7',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                } satisfies TestItem,
            } as AxiosResponse<TestItem>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveById(7);

            // Assert
            expect(store.getById(7).value?.testMethod()).toBe('adapted-7');
        });

        it("should refresh an existing item's adapted view after re-retrieval", async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            vi.mocked(httpService.getRequest).mockResolvedValueOnce({
                data: {
                    id: 1,
                    name: 'Original',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                } satisfies TestItem,
            } as AxiosResponse<TestItem>);
            const store = createAdapterStoreModule(config);
            await store.retrieveById(1);
            expect(store.getById(1).value?.name).toBe('Original');
            vi.mocked(httpService.getRequest).mockResolvedValueOnce({
                data: {
                    id: 1,
                    name: 'Updated',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-02T00:00:00Z',
                } satisfies TestItem,
            } as AxiosResponse<TestItem>);

            // Act
            await store.retrieveById(1);

            // Assert
            expect(store.getById(1).value?.name).toBe('Updated');
        });

        it('should persist to storage service', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {
                    id: 3,
                    name: 'Item 3',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                } satisfies TestItem,
            } as AxiosResponse<TestItem>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveById(3);

            // Assert
            expect(storageService.put).toHaveBeenCalledWith(
                'test-items',
                expect.objectContaining({3: expect.any(Object) as unknown}),
            );
        });

        it('should propagate http errors and leave state untouched', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            vi.mocked(httpService.getRequest).mockRejectedValue(new Error('network down'));
            const store = createAdapterStoreModule(config);

            // Act & Assert
            await expect(store.retrieveById(1)).rejects.toThrow('network down');
            expect(store.getById(1).value).toBeUndefined();
            expect(storageService.put).not.toHaveBeenCalled();
        });
    });

    describe('retrieveAll', () => {
        it('should call httpService.getRequest with domainName', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            vi.mocked(httpService.getRequest).mockResolvedValue({data: [] as TestItem[]} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveAll();

            // Assert
            expect(httpService.getRequest).toHaveBeenCalledWith('test-items');
        });

        it('should store items in state as-is from response', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                {id: 2, name: 'Item 2', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveAll();

            // Assert
            expect(store.getAll.value).toHaveLength(2);
        });

        it('should persist to storage service', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveAll();

            // Assert
            expect(storageService.put).toHaveBeenCalledWith('test-items', expect.any(Object));
        });
    });

    describe('broadcast integration', () => {
        type BroadcastHandlers = Parameters<AdapterStoreBroadcast<TestItem>['subscribe']>[0];

        const captureBroadcast = (): {
            broadcast: AdapterStoreBroadcast<TestItem>;
            subscribe: ReturnType<typeof vi.fn>;
            unsubscribe: ReturnType<typeof vi.fn>;
            getHandlers: () => BroadcastHandlers;
        } => {
            let handlers: BroadcastHandlers | null = null;
            const unsubscribe = vi.fn();
            const subscribe = vi.fn((h: typeof handlers) => {
                handlers = h;
                return unsubscribe;
            });
            return {
                broadcast: {subscribe} as AdapterStoreBroadcast<TestItem>,
                subscribe,
                unsubscribe,
                getHandlers: () => {
                    if (!handlers) throw new Error('subscribe was not called');
                    return handlers;
                },
            };
        };

        it('should call subscribe exactly once at construction with onUpdate, onDelete and onPatch', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, subscribe} = captureBroadcast();

            // Act
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Assert
            expect(subscribe).toHaveBeenCalledTimes(1);
            expect(subscribe).toHaveBeenCalledWith({
                onUpdate: expect.any(Function) as unknown,
                onDelete: expect.any(Function) as unknown,
                onPatch: expect.any(Function) as unknown,
            });
        });

        it('should apply onUpdate events to the store without calling http', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act
            getHandlers().onUpdate({
                id: 9,
                name: 'Pushed Item',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });

            // Assert
            expect(store.getById(9).value?.name).toBe('Pushed Item');
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });

        it('should replace existing items and refresh adapted views via onUpdate', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });
            expect(store.getById(1).value?.name).toBe('Original');

            // Act
            getHandlers().onUpdate({
                id: 1,
                name: 'Updated',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
            });

            // Assert
            expect(store.getById(1).value?.name).toBe('Updated');
        });

        it('should persist onUpdate events to storage', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act
            getHandlers().onUpdate({
                id: 4,
                name: 'Item 4',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });

            // Assert
            expect(storageService.put).toHaveBeenCalledWith(
                'test-items',
                expect.objectContaining({4: expect.any(Object) as unknown}),
            );
        });

        it('should apply onDelete events to the store without calling http', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 5,
                name: 'Doomed',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });
            expect(store.getById(5).value).toBeDefined();

            // Act
            getHandlers().onDelete(5);

            // Assert
            expect(store.getById(5).value).toBeUndefined();
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });

        it('should be a no-op when onDelete is fired for an unknown id', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act & Assert
            expect(() => getHandlers().onDelete(404)).not.toThrow();
            expect(store.getAll.value).toHaveLength(0);
        });

        it('should persist onDelete events to storage', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 6,
                name: 'Item 6',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });
            vi.mocked(storageService.put).mockClear();

            // Act
            getHandlers().onDelete(6);

            // Assert
            expect(storageService.put).toHaveBeenCalledWith(
                'test-items',
                expect.not.objectContaining({6: expect.anything()}),
            );
        });

        it('should not attempt to subscribe when broadcast is omitted', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};

            // Act & Assert
            expect(() =>
                createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                    domainName: 'test-items',
                    adapter: createTestAdapter,
                    httpService,
                    storageService,
                    loadingService,
                }),
            ).not.toThrow();
        });

        it.each([
            ['a non-object payload', 'not-an-object'],
            ['an undefined payload', undefined],
            ['a null payload', null],
            ['an object with a non-numeric id', {id: 'KD-7', name: 'Bad'}],
            ['an object with a NaN id', {id: NaN, name: 'Bad'}],
            ['an object with a non-integer id', {id: 1.5, name: 'Bad'}],
            ['an object with an inherited id', Object.create({id: 1, name: 'Bad'}) as unknown],
        ])('should reject onUpdate given %s without corrupting state', (_label, payload) => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act & Assert
            expect(() => getHandlers().onUpdate(payload as unknown as TestItem)).toThrow(BroadcastPayloadError);
            expect(() => getHandlers().onUpdate(payload as unknown as TestItem)).toThrow('onUpdate');
            expect(storageService.put).not.toHaveBeenCalled();
            expect(store.getAll.value).toEqual([]);
        });

        it('should accept a well-formed onUpdate payload through the validating wrapper', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act
            getHandlers().onUpdate({
                id: 9,
                name: 'Valid',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });

            // Assert
            expect(store.getById(9).value).toBeDefined();
            expect(storageService.put).toHaveBeenCalled();
        });

        it.each([
            ['a non-numeric id', 'KD-7'],
            ['a NaN id', NaN],
            ['a non-integer id', 1.5],
        ])('should reject onDelete given %s without corrupting state', (_label, id) => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act & Assert
            expect(() => getHandlers().onDelete(id as unknown as number)).toThrow(BroadcastPayloadError);
            expect(() => getHandlers().onDelete(id as unknown as number)).toThrow('onDelete');
            expect(storageService.put).not.toHaveBeenCalled();
        });

        it('should accept a numeric id through the onDelete validating wrapper', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {
                put: vi.fn(),
                get: vi
                    .fn()
                    .mockReturnValue({
                        5: {
                            id: 5,
                            name: 'Existing',
                            createdAt: '2024-01-01T00:00:00Z',
                            updatedAt: '2024-01-01T00:00:00Z',
                        },
                    }),
            };
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act
            getHandlers().onDelete(5);

            // Assert
            expect(store.getById(5).value).toBeUndefined();
            expect(storageService.put).toHaveBeenCalled();
        });

        it('should merge onPatch changes into an existing item without calling http', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });

            // Act
            getHandlers().onPatch(1, {name: 'Patched'});

            // Assert
            expect(store.getById(1).value?.name).toBe('Patched');
            expect(store.getById(1).value?.createdAt).toBe('2024-01-01T00:00:00Z');
            expect(httpService.getRequest).not.toHaveBeenCalled();
        });

        it('should refresh the adapted view after onPatch while keeping the same computed ref', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });
            const computedRef = store.getById(1);
            const before = computedRef.value;

            // Act
            getHandlers().onPatch(1, {name: 'Patched'});

            // Assert
            const after = store.getById(1).value;
            expect(after).not.toBe(before);
            expect(store.getById(1)).toBe(computedRef);
        });

        it('should persist the merged item to storage after onPatch', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });
            vi.mocked(storageService.put).mockClear();

            // Act
            getHandlers().onPatch(1, {name: 'Patched'});

            // Assert
            expect(storageService.put).toHaveBeenCalledWith(
                'test-items',
                expect.objectContaining({1: expect.objectContaining({name: 'Patched'}) as unknown}),
            );
        });

        it('should replace a nested value wholesale on onPatch instead of deep-merging it', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
                meta: {a: 1, b: 2},
            });

            // Act
            getHandlers().onPatch(1, {meta: {a: 9}});

            // Assert
            expect(store.getById(1).value?.meta).toEqual({a: 9});
            expect(store.getById(1).value?.name).toBe('Original');
        });

        it('should key the patched row by the validated id even when the stored row only inherits its id', () => {
            // Arrange — storage is not validated on load, so a row whose `id` lives on the
            // prototype can be seeded that way; object spread would drop it.
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const inherited = Object.create({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }) as TestItem;
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({1: inherited})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act
            getHandlers().onPatch(1, {name: 'Patched'});

            // Assert
            expect(store.getById(1).value?.name).toBe('Patched');
            expect(store.getById(1).value?.id).toBe(1);
            expect(Object.keys(vi.mocked(storageService.put).mock.calls[0]?.[1] as object)).toEqual(['1']);
        });

        it('should be a no-op when onPatch is fired for an unknown id', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act & Assert
            expect(() => getHandlers().onPatch(404, {name: 'Ghost'})).not.toThrow();
            expect(store.getAll.value).toEqual([]);
            expect(storageService.put).not.toHaveBeenCalled();
        });

        it.each([
            ['a non-numeric id', 'KD-7'],
            ['a NaN id', NaN],
            ['a non-integer id', 1.5],
            ['an undefined id', undefined],
        ])('should reject onPatch given %s without corrupting state', (_label, id) => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });

            // Act & Assert
            expect(() => getHandlers().onPatch(id as unknown as number, {name: 'Bad'})).toThrow(BroadcastPayloadError);
            expect(() => getHandlers().onPatch(id as unknown as number, {name: 'Bad'})).toThrow('onPatch');
            expect(storageService.put).not.toHaveBeenCalled();
        });

        it.each([
            ['a string', 'name=x'],
            ['null', null],
            ['undefined', undefined],
            ['an array', ['x']],
            ['an object carrying an id key', {id: 2, name: 'x'}],
        ])('should reject onPatch given %s as changes without corrupting state', (_label, changes) => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });
            vi.mocked(storageService.put).mockClear();

            // Act & Assert
            expect(() => getHandlers().onPatch(1, changes as unknown as Partial<TestNew>)).toThrow(
                BroadcastPayloadError,
            );
            expect(() => getHandlers().onPatch(1, changes as unknown as Partial<TestNew>)).toThrow('onPatch');
            expect(store.getById(1).value?.name).toBe('Original');
            expect(storageService.put).not.toHaveBeenCalled();
        });

        it('should accept an empty changes object through the onPatch validating wrapper', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {broadcast, getHandlers} = captureBroadcast();
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                broadcast,
            });
            getHandlers().onUpdate({
                id: 1,
                name: 'Original',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            });

            // Act & Assert
            expect(() => getHandlers().onPatch(1, {})).not.toThrow();
            expect(store.getById(1).value?.name).toBe('Original');
        });
    });

    describe('localStorage persistence', () => {
        it('should initialize state from storage', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storedItems = {
                1: {id: 1, name: 'Stored Item', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            };
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue(storedItems)};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };

            // Act
            const store = createAdapterStoreModule(config);

            // Assert
            expect(storageService.get).toHaveBeenCalledWith('test-items', {});
            expect(store.getById(1).value).toBeDefined();
        });

        it('should persist state changes to storage on retrieveAll', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);

            // Act
            await store.retrieveAll();

            // Assert
            expect(storageService.put).toHaveBeenCalledWith(
                'test-items',
                expect.objectContaining({1: expect.any(Object) as unknown}),
            );
        });
    });

    describe('memoization', () => {
        it('should return the same adapted object reference when state has not changed', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Act
            const firstAccess = store.getAll.value[0];
            const secondAccess = store.getAll.value[0];

            // Assert
            expect(firstAccess).toBe(secondAccess);
        });

        it('should return a new adapted object after setById, with properties reflecting the update', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            const beforeUpdate = store.getById(1).value;

            // Act
            const storeModule = getCapturedStoreModule() as unknown as AdapterStoreModule<TestItem>;
            storeModule.setById({
                id: 1,
                name: 'Updated',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
            });
            const afterUpdate = store.getById(1).value;

            // Assert — new adapted object reference (cache invalidated by setById)
            expect(beforeUpdate).not.toBe(afterUpdate);
            // Display properties reflect the updated store data
            expect(afterUpdate?.name).toBe('Updated');
        });

        it('should propagate setById changes through computed chain', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Original', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // A downstream computed that wraps getById — mirrors how Vue components consume stores
            const derivedName = computed(() => store.getById(1).value?.name);
            expect(derivedName.value).toBe('Original');

            // Act — simulate a store update (e.g. from an update response)
            const storeModule = getCapturedStoreModule() as unknown as AdapterStoreModule<TestItem>;
            storeModule.setById({
                id: 1,
                name: 'Updated',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
            });

            // Assert — the downstream computed must re-evaluate
            expect(derivedName.value).toBe('Updated');
        });

        it('should clear adapted cache on deleteById', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Access to populate cache and capture storeModule
            expect(store.getById(1).value).toBeDefined();

            // Act
            const storeModule = getCapturedStoreModule() as unknown as AdapterStoreModule<TestItem>;
            storeModule.deleteById(1);

            // Assert
            expect(store.getById(1).value).toBeUndefined();
        });

        it('should clear all caches on retrieveAll', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            const beforeRetrieve = store.getAll.value[0];

            // Act
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            await store.retrieveAll();
            const afterRetrieve = store.getAll.value[0];

            // Assert — new frozen references, so adapted objects must be new
            expect(beforeRetrieve).not.toBe(afterRetrieve);
        });

        it('should return the same computed ref for the same id across multiple getById calls', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Act
            const firstRef = store.getById(1);
            const secondRef = store.getById(1);

            // Assert
            expect(firstRef).toBe(secondRef);
        });

        it('should return different computed refs for different ids', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                {id: 2, name: 'Item 2', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Act
            const ref1 = store.getById(1);
            const ref2 = store.getById(2);

            // Assert
            expect(ref1).not.toBe(ref2);
        });

        it('should create a new computed ref for same id after retrieveAll clears cache', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            const refBefore = store.getById(1);

            // Act
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            await store.retrieveAll();
            const refAfter = store.getById(1);

            // Assert
            expect(refBefore).not.toBe(refAfter);
        });

        it('should create a new computed ref for same id after deleteById clears cache', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            const refBefore = store.getById(1);
            expect(refBefore.value).toBeDefined();

            // Act
            const storeModule = getCapturedStoreModule() as unknown as AdapterStoreModule<TestItem>;
            storeModule.deleteById(1);
            const refAfter = store.getById(1);

            // Assert
            expect(refBefore).not.toBe(refAfter);
        });

        it('should reuse cached adapted entries for untouched ids when state changes for a different id', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                {id: 2, name: 'Item 2', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            const itemOneBefore = store.getById(1).value;
            const itemTwoBefore = store.getById(2).value;
            expect(itemOneBefore).toBeDefined();
            expect(itemTwoBefore).toBeDefined();

            // Act — setById for id 2 only. Clears adaptedCache for 2; id 1 remains cached.
            const storeModule = getCapturedStoreModule() as unknown as AdapterStoreModule<TestItem>;
            storeModule.setById({
                id: 2,
                name: 'Item 2 Updated',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
            });

            // Assert — id 1 returns the same cached adapted reference; id 2 is freshly adapted.
            expect(store.getById(1).value).toBe(itemOneBefore);
            expect(store.getById(2).value).not.toBe(itemTwoBefore);
        });

        it('should return cached adapted object via getById when state has not changed', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();

            // Act
            const firstValue = store.getById(1).value;
            const secondValue = store.getById(1).value;

            // Assert
            expect(firstValue).toBe(secondValue);
        });
    });

    describe('storeModule methods', () => {
        it('should update state and persist when setById is called via adapter', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const store = createAdapterStoreModule(config);
            store.generateNew();
            const newItem: TestItem = {
                id: 1,
                name: 'New Item',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            };

            // Act
            const capturedStoreModule = getCapturedStoreModule();
            expect(capturedStoreModule).not.toBeNull();
            const storeModule = capturedStoreModule as unknown as AdapterStoreModule<TestItem>;
            storeModule.setById(newItem);

            // Assert
            expect(store.getById(1).value).toBeDefined();
            expect(storageService.put).toHaveBeenCalledWith('test-items', expect.any(Object));
        });

        it('should remove from state and persist when deleteById is called via adapter', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const {adapter, getCapturedStoreModule} = createCapturingAdapter();
            const config: AdapterStoreConfig<TestItem, TestAdapted, TestNewAdapted> = {
                domainName: 'test-items',
                adapter,
                httpService,
                storageService,
                loadingService,
            };
            const items: TestItem[] = [
                {id: 1, name: 'Item 1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            ];
            vi.mocked(httpService.getRequest).mockResolvedValue({data: items} as AxiosResponse<TestItem[]>);
            const store = createAdapterStoreModule(config);
            await store.retrieveAll();
            expect(store.getById(1).value).toBeDefined();
            vi.mocked(storageService.put).mockClear();

            // Act
            const capturedStoreModule = getCapturedStoreModule();
            expect(capturedStoreModule).not.toBeNull();
            const storeModule = capturedStoreModule as unknown as AdapterStoreModule<TestItem>;
            storeModule.deleteById(1);

            // Assert
            expect(store.getById(1).value).toBeUndefined();
            expect(storageService.put).toHaveBeenCalledWith('test-items', expect.any(Object));
        });
    });

    describe('extend (capability injection)', () => {
        it('should hand the extend hook a retrieveInto-only capability once at construction, with the raw mutators unreachable', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            let capturedCapabilities: ExtendCapabilities | null = null;
            const extend = vi.fn((cap: ExtendCapabilities) => {
                capturedCapabilities = cap;
                return {};
            });

            // Act
            createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted, object>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                extend,
            });

            // Assert — retrieveInto is the sole ingest path; the raw mutators are
            // structurally absent, so a non-HTTP write path cannot be re-exported.
            expect(extend).toHaveBeenCalledTimes(1);
            const cap = capturedCapabilities as unknown as Record<string, unknown>;
            expect(typeof cap.retrieveInto).toBe('function');
            expect('setById' in cap).toBe(false);
            expect('deleteById' in cap).toBe(false);
        });

        it('should expose the extend-returned methods on the public store, typed', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};

            // Act
            const store = createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted, {pingCount: () => number}>({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                extend: () => ({pingCount: () => 1}),
            });

            // Assert — calling without any cast IS the type-safety assertion
            expect(store.pingCount()).toBe(1);
        });

        it('should let a custom extend method drive the store via retrieveInto', async () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {
                    id: 7,
                    name: 'By Slug',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z',
                } satisfies TestItem,
            } as AxiosResponse<TestItem>);
            const store = createAdapterStoreModule<
                TestItem,
                TestAdapted,
                TestNewAdapted,
                {retrieveBySlug: (slug: string) => Promise<void>}
            >({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                extend: ({retrieveInto}) => ({
                    retrieveBySlug: (slug: string): Promise<void> => retrieveInto(`test-items/${slug}`),
                }),
            });

            // Act
            await store.retrieveBySlug('KD-7');

            // Assert
            expect(httpService.getRequest).toHaveBeenCalledWith('test-items/KD-7', undefined);
            expect(store.getById(7).value).toBeDefined();
        });

        const makeStoreWithRetrieveInto = () => {
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            const store = createAdapterStoreModule<
                TestItem,
                TestAdapted,
                TestNewAdapted,
                {pull: (endpoint: string, options?: Parameters<HttpService['getRequest']>[1]) => Promise<void>}
            >({
                domainName: 'test-items',
                adapter: createTestAdapter,
                httpService,
                storageService,
                loadingService,
                extend: ({retrieveInto}) => ({pull: (endpoint, options) => retrieveInto(endpoint, options)}),
            });
            return {store, httpService};
        };

        it.each([
            ['a non-object', 'not-an-object'],
            ['null', null],
            ['undefined', undefined],
            ['an object without an id', {name: 'x'}],
            ['a non-numeric id', {id: 'KD-7'}],
            ['a NaN id', {id: Number.NaN}],
            ['a non-integer id', {id: 1.5}],
        ])('rejects a retrieveInto response that is %s, without corrupting state', async (_label, payload) => {
            // Arrange
            const {store, httpService} = makeStoreWithRetrieveInto();
            vi.mocked(httpService.getRequest).mockResolvedValue({data: payload} as AxiosResponse<TestItem>);

            // Act & Assert
            await expect(store.pull('test-items/x')).rejects.toThrow(ExtendPayloadError);
            await expect(store.pull('test-items/x')).rejects.toThrow('retrieveInto');
            expect(store.getAll.value).toEqual([]);
        });

        it('rejects a retrieveInto array response if any item is malformed, without corrupting state', async () => {
            // Arrange
            const {store, httpService} = makeStoreWithRetrieveInto();
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: [
                    {id: 1, name: 'Good', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                    {id: Number.NaN, name: 'Bad', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                ],
            } as AxiosResponse<TestItem[]>);

            // Act & Assert
            await expect(store.pull('test-items?filter=x')).rejects.toThrow(ExtendPayloadError);
        });

        it('upserts a single well-formed item from a retrieveInto response into state', async () => {
            // Arrange
            const {store, httpService} = makeStoreWithRetrieveInto();
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {id: 3, name: 'Valid', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            } as AxiosResponse<TestItem>);

            // Act
            await store.pull('test-items/3');

            // Assert
            expect(store.getById(3).value?.name).toBe('Valid');
        });

        it('upserts every item when retrieveInto receives an array response', async () => {
            // Arrange
            const {store, httpService} = makeStoreWithRetrieveInto();
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: [
                    {id: 1, name: 'A', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                    {id: 2, name: 'B', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
                ],
            } as AxiosResponse<TestItem[]>);

            // Act
            await store.pull('test-items?filter=x');

            // Assert
            expect(store.getById(1).value?.name).toBe('A');
            expect(store.getById(2).value?.name).toBe('B');
        });

        it('forwards retrieveInto options to the underlying getRequest', async () => {
            // Arrange
            const {store, httpService} = makeStoreWithRetrieveInto();
            vi.mocked(httpService.getRequest).mockResolvedValue({
                data: {id: 5, name: 'X', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'},
            } as AxiosResponse<TestItem>);

            // Act
            await store.pull('test-items/5', {params: {include: 'meta'}});

            // Assert
            expect(httpService.getRequest).toHaveBeenCalledWith('test-items/5', {params: {include: 'meta'}});
        });

        it('rejects an extend method that collides with a built-in store key (compile error)', () => {
            // Arrange
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};

            // Act & Assert — the @ts-expect-error IS the compile-time assertion: a colliding extend key
            // must not compile when the colliding shape is given as the explicit `X` type arg. The runtime
            // guard also throws at construction, so the call is wrapped to keep this test green.
            expect(() =>
                createAdapterStoreModule<
                    TestItem,
                    TestAdapted,
                    TestNewAdapted,
                    // @ts-expect-error — `retrieveAll` collides with a built-in store method; extend keys must be new names
                    {retrieveAll: () => Promise<void>}
                >({
                    domainName: 'test-items',
                    adapter: createTestAdapter,
                    httpService,
                    storageService,
                    loadingService,
                    extend: () => ({retrieveAll: async (): Promise<void> => {}}),
                }),
            ).toThrow(ExtendKeyCollisionError);
        });

        it('throws ExtendKeyCollisionError when an extend key collides with a built-in (runtime guard, inferred path)', () => {
            const httpService: Pick<HttpService, 'getRequest'> = {getRequest: vi.fn()};
            const storageService: TestStorageService = {put: vi.fn(), get: vi.fn().mockReturnValue({})};
            const loadingService: TestLoadingService = {ensureLoadingFinished: vi.fn().mockResolvedValue(undefined)};
            expect(() =>
                createAdapterStoreModule<TestItem, TestAdapted, TestNewAdapted>({
                    domainName: 'test-items',
                    adapter: createTestAdapter,
                    httpService,
                    storageService,
                    loadingService,
                    extend: () => ({retrieveAll: async (): Promise<void> => {}}),
                }),
            ).toThrow(ExtendKeyCollisionError);
        });
    });
});
