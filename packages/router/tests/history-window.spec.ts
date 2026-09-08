// @vitest-environment happy-dom
import type {RouteRecordRaw} from 'vue-router';

import {flushPromises, mount} from '@vue/test-utils';
import {describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick} from 'vue';
import {START_LOCATION} from 'vue-router';

import {createRouterService} from '../src';

// ONE spec, deliberately alone in its own file, for the reason `history-navigation.spec.ts`
// records: `createWebHistory()` registers a `popstate` listener per service and nothing ever
// unregisters it, so a single `history.back()` drives every router service the file has built.
// A second service in this file would answer this spec's hop as well and the assertion would stop
// meaning what it says. Two one-spec files, not one two-spec file (WR-1172).

const TestPage = defineComponent({name: 'TestPage', render: () => h('div', 'page content')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
];

describe('history-driven navigation', () => {
    it('should open and close the in-flight window for a hop no dispatch is behind', async () => {
        // Arrange — the only navigation the service does not dispatch itself. `goToRoute` and
        // `install()` open the window at the call, before guards run, and close it when their
        // promise settles; a `popstate` hop has neither end, so `beforeEach`/`afterEach` are the
        // ONLY writers of the window for it. Every other spec has a dispatch outstanding at the
        // same time, which would hold the window open on its own and hide a hop that fails to.
        //
        // The window is observable only against the sentinel — with a real route showing,
        // RouterView paints the page whatever the window says — so each observation re-pins
        // `currentRouteRef` to vue-router's own START_LOCATION and reads what is painted.
        window.history.replaceState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let releaseMiddleware!: () => void;
        const parked = new Promise<void>((resolve) => {
            releaseMiddleware = resolve;
        });
        const service = createRouterService(createTestRoutes());
        const wrapper = mount(service.RouterView);
        await service.install();
        await service.goToRoute('about');
        await flushPromises();
        expect(wrapper.text()).toBe('page content');

        // Act — park the popstate hop inside its guard, with no dispatch of ours outstanding
        service.registerBeforeRouteMiddleware(async () => {
            await parked;

            return false;
        });
        service.goBack();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await flushPromises();

        // Assert — OPEN: the hop alone holds the window, so a sentinel-pinned view paints nothing
        service.currentRouteRef.value = START_LOCATION;
        await nextTick();
        expect(wrapper.text()).toBe('');

        // ...and CLOSED once the hop ends, so nothing is left permanently blank
        releaseMiddleware();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await flushPromises();
        expect(service.currentRouteRef.value.name).toBe('home');
        service.currentRouteRef.value = START_LOCATION;
        await nextTick();
        expect(wrapper.text()).toBe('404');
        expect(
            [consoleWarnSpy, consoleErrorSpy].flatMap((spy) =>
                spy.mock.calls.filter((call) => String(call[0]).startsWith('fs-router:')),
            ),
        ).toHaveLength(0);

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });
});
