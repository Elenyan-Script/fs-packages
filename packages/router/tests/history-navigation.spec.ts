// @vitest-environment happy-dom
import type {MockInstance} from 'vitest';
import type {RouteRecordRaw} from 'vue-router';

import {flushPromises, mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';
import {defineComponent, h} from 'vue';

import {createRouterService} from '../src';

// ONE spec, deliberately alone in its own file. `createWebHistory()` registers a `popstate`
// listener per service and nothing ever unregisters it, so a single `history.back()` drives every
// router service the file has built — including the leftovers of earlier specs, whose console
// output lands in this spec's spies. Measured while writing this: run inside `components.spec.ts`,
// the pre-fix case PASSED on another service's `fs-router: middleware redirect chain exceeded 10
// hops`. Vitest isolates per file, so a file with one service in it is the only place a
// history-driven assertion means what it says. Add a second history spec here and the trap returns.

const TestPage = defineComponent({name: 'TestPage', render: () => h('div', 'page content')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
];

const fsRouterCalls = (...spies: MockInstance[]): unknown[][] =>
    spies.flatMap((spy) => spy.mock.calls.filter((call) => String(call[0]).startsWith('fs-router:')));

describe('history-driven navigation', () => {
    it('should report a failure no caller can observe any other way', async () => {
        // Arrange — the case with no observation channel at all. `goToRoute`/`replaceRoute` rethrow
        // through `dispatchNavigation`, so their callers still learn of a failure from the returned
        // promise even while the console says nothing. `goBack()` returns `void`, and browser
        // back/forward is not called from consumer code at all, so a `popstate` navigation whose
        // guard throws is observable ONLY through the console — the channel registering
        // `router.onError` took over from vue-router and, before WR-1119 r6, then dropped for every
        // navigation after the first (ADR-0048).
        window.history.replaceState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        const wrapper = mount(service.RouterView);
        await service.install();
        await service.goToRoute('about');
        await flushPromises();
        expect(wrapper.text()).toBe('page content');
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(0);

        // Act — a real history hop: happy-dom dispatches `popstate` synchronously from
        // `history.back()`, and vue-router's own listener drives the guard chain from there
        service.registerBeforeRouteMiddleware(() => {
            throw new Error('middleware exploded');
        });
        service.goBack();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await flushPromises();

        // Assert — exactly one fs-router line, on the error channel, carrying the thrown error;
        // the page it was on is undisturbed and readiness stays resolved
        expect(fsRouterCalls(consoleErrorSpy)).toHaveLength(1);
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(1);
        expect(String(consoleErrorSpy.mock.calls[0]?.[1])).toBe('Error: middleware exploded');
        expect(wrapper.text()).toBe('page content');
        await expect(service.isReady()).resolves.toBeUndefined();

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });
});
