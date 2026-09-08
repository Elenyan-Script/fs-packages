// @vitest-environment happy-dom
import type {VueWrapper} from '@vue/test-utils';
import type {MockInstance} from 'vitest';
import type {RouteRecordRaw} from 'vue-router';
import type {RouteLocationNormalizedLoaded} from 'vue-router';

import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick, ref, shallowRef} from 'vue';
import {START_LOCATION} from 'vue-router';

import {createRouterLink, createRouterView, createRouterService} from '../src';

const TestPage = defineComponent({name: 'TestPage', render: () => h('div', {class: 'test-page'}, 'page content')});

const createTestRoutes = (): RouteRecordRaw[] => [
    {path: '/', name: 'home', component: TestPage},
    {path: '/about', name: 'about', component: TestPage},
    {
        path: '/items',
        component: defineComponent({render: () => h('div', 'layout')}),
        children: [
            {path: '', name: 'items.overview', component: TestPage},
            {path: ':id/edit', name: 'items.edit', component: TestPage},
            {path: ':id', name: 'items.show', component: TestPage},
        ],
    },
];

describe('createRouterView', () => {
    // A spec that fails before its own `mockRestore()` would otherwise leak a live console spy
    // into every following spec in this describe, turning one real red into a cascade of
    // misleading ones — and a false red costs the gate's authority.
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render 404 when no matched route at depth', () => {
        // Arrange
        const routeRef = ref({matched: [], path: '/unknown', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('404');
    });

    it('should render nothing while the route is still START_LOCATION and a navigation is in flight', () => {
        // Arrange — vue-router seeds `currentRoute` with START_LOCATION and only replaces it once
        // the first navigation resolves. `matched` is empty there, but that is "not navigated yet",
        // not "no such route" — painting the not-found fallback in that window is a false 404.
        // `shallowRef`, not `ref`: vue-router holds `currentRoute` as `shallowRef(START_LOCATION)`,
        // and a deep `ref` would hand the component a reactive *proxy* whose identity differs from
        // the sentinel — the fixture has to reproduce the real container, not just the real value.
        // The in-flight ref is what distinguishes this window from a service nobody navigated;
        // without it the sentinel alone cannot tell the two apart (see the un-navigated spec).
        const routeRef = shallowRef(START_LOCATION);
        const RouterView = createRouterView(routeRef, undefined, shallowRef(true));

        // Act
        const wrapper = mount(RouterView);

        // Assert — nothing painted at all, and specifically not the bare 404
        expect(wrapper.text()).toBe('');
        expect(wrapper.find('p').exists()).toBe(false);
    });

    it('should render matched component at depth 0', async () => {
        // Arrange
        const service = createRouterService(createTestRoutes());
        await service.goToRoute('about');
        await flushPromises();

        // Act
        const wrapper = mount(service.RouterView);

        // Assert
        expect(wrapper.text()).toBe('page content');
    });

    it('should use depth prop for nested routes', async () => {
        // Arrange
        const service = createRouterService(createTestRoutes());
        await service.goToRoute('items.overview');
        await flushPromises();

        // Act — depth 1 should render the child
        const wrapper = mount(service.RouterView, {props: {depth: 1}});

        // Assert
        expect(wrapper.text()).toBe('page content');
    });

    it('should build key with resolved params', async () => {
        // Arrange
        const service = createRouterService(createTestRoutes());
        await service.goToRoute('items.show', 42);
        await flushPromises();

        // Act
        const wrapper = mount(service.RouterView, {props: {depth: 1}});

        // Assert — component should render with a key that includes the resolved id
        expect(wrapper.exists()).toBe(true);
    });

    it('should fall back to route path when no matched route at depth', () => {
        // Arrange — route with empty matched array at requested depth
        const routeRef = ref({
            matched: [{path: '/items', components: {default: TestPage}}],
            path: '/items/deep',
            params: {},
        } as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act — request depth 2 which doesn't exist
        const wrapper = mount(RouterView, {props: {depth: 2}});

        // Assert — should show 404 since no match at depth 2
        expect(wrapper.text()).toBe('404');
    });

    it('should handle array param values in route key', async () => {
        // Arrange
        const routeRef = ref({
            matched: [{path: '/items/:id', components: {default: TestPage}}],
            path: '/items/42',
            params: {id: ['42', '43']},
        } as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('page content');
    });

    it('should skip empty param values in route key', () => {
        // Arrange
        const routeRef = ref({
            matched: [{path: '/items/:id', components: {default: TestPage}}],
            path: '/items/',
            params: {id: ''},
        } as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert — empty param should not replace :id in key
        expect(wrapper.exists()).toBe(true);
    });

    it('should fall back to route path when no matched entry at depth', () => {
        // Arrange — matched array is empty but component computed returns something
        // via a ref that changes between computed evaluation and key computation
        const routeRef = ref({matched: [], path: '/fallback', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act — this renders 404 because no component, which is fine
        // The key fallback is tested through the buildRouteKey internal
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('404');
    });

    it('should render a custom notFoundComponent in place of the bare 404 when unmatched', () => {
        // Arrange
        const NotFound = defineComponent({name: 'NotFound', render: () => h('div', {class: 'custom-404'}, 'Not here')});
        const routeRef = ref({matched: [], path: '/nope', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef, NotFound);

        // Act
        const wrapper = mount(RouterView);

        // Assert — the custom component renders, not the bare '404'
        expect(wrapper.text()).toBe('Not here');
        expect(wrapper.find('.custom-404').exists()).toBe(true);
    });

    it('should render the bare 404 fallback when no notFoundComponent is provided', () => {
        // Arrange
        const routeRef = ref({matched: [], path: '/nope', params: {}} as unknown as RouteLocationNormalizedLoaded);
        const RouterView = createRouterView(routeRef);

        // Act
        const wrapper = mount(RouterView);

        // Assert
        expect(wrapper.text()).toBe('404');
    });

    it('should render nothing while a service-built view waits for the first navigation, then the page', async () => {
        // Arrange — the in-flight window through the REAL service (the sentinel spec above builds
        // the view by hand and so never exercises the readiness flag at all).
        window.history.pushState({}, '', '/about');
        const service = createRouterService(createTestRoutes());

        // Act — mount synchronously, before the navigation dispatched by install() settles
        const navigation = service.install();
        const wrapper = mount(service.RouterView);

        // Assert — nothing painted yet, and specifically not the bare 404
        expect(wrapper.text()).toBe('');
        expect(wrapper.find('p').exists()).toBe(false);

        // ...and the page appears once it settles
        await navigation;
        await flushPromises();
        expect(wrapper.text()).toBe('page content');
        // Reset
        window.history.pushState({}, '', '/');
    });

    it('should render the not-found fallback once an aborted first navigation has settled', async () => {
        // Arrange — a before-route middleware returning plain `true` cancels the hop WITHOUT
        // redirecting, so the `beforeEach` wrapper returns `false`. vue-router treats that as an
        // aborted navigation (failure type 4): `finalizeNavigation` never runs, so `currentRoute`
        // stays pinned to START_LOCATION forever. Guarding on the sentinel alone would blank the
        // page permanently — the guard has to lift once the first navigation has SETTLED, however
        // it settled.
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert — still pinned to the sentinel, but readiness has settled, so the fallback paints
        expect(service.currentRouteRef.value).toBe(START_LOCATION);
        const wrapper = mount(service.RouterView);
        expect(wrapper.text()).toBe('404');
    });

    it('should render a custom notFoundComponent after an aborted first navigation', async () => {
        // Arrange
        const NotFound = defineComponent({name: 'NotFound', render: () => h('div', 'service-404')});
        const service = createRouterService(createTestRoutes(), {notFoundComponent: NotFound});
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert
        expect(mount(service.RouterView).text()).toBe('service-404');
    });

    it('should warn once when the first navigation is aborted without a redirect', async () => {
        // Arrange — crit's point: before this warning there was NO console signal anywhere on the
        // aborted-first-navigation path. Lives here rather than in router.spec.ts because an
        // aborted first navigation leaves vue-router's history listeners attached, and a stale
        // aborting router reverts later `goBack()` navigations in that file.
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('the first navigation did not complete'),
            expect.anything(),
        );
        consoleWarnSpy.mockRestore();
    });

    it('should end on the redirected route when a middleware redirects the first navigation', async () => {
        // Arrange — fs-router dispatches the redirect itself and aborts the pending hop, so the
        // REDIRECTED navigation is the one that finalizes: the sentinel is gone and the page
        // paints normally. (The aborted hop is a type-4 failure, which is why readiness cannot be
        // keyed on `router.isReady()` — see the no-false-warn spec below.)
        const service = createRouterService(createTestRoutes());
        // The initial location is whatever earlier specs left in happy-dom's history, so redirect
        // anything that is not already the target rather than keying on a specific start route.
        service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? false : {name: 'about'}));

        // Act
        await service.install();
        await flushPromises();

        // Assert
        expect(service.currentRouteRef.value).not.toBe(START_LOCATION);
        expect(service.currentRouteRef.value.name).toBe('about');
        expect(mount(service.RouterView).text()).toBe('page content');
    });

    it('should thread notFoundComponent from createRouterService options into RouterView', async () => {
        // Arrange — an unmatched depth renders the option-provided fallback
        const NotFound = defineComponent({name: 'NotFound', render: () => h('div', 'service-404')});
        const service = createRouterService(createTestRoutes(), {notFoundComponent: NotFound});
        // Navigate first: an un-navigated service still sits on START_LOCATION, and this spec is
        // about a GENUINE miss, not the pre-first-navigation window.
        await service.goToRoute('about');
        await flushPromises();

        // Act — depth 5 never matches, forcing the fallback path
        const wrapper = mount(service.RouterView, {props: {depth: 5}});

        // Assert
        expect(wrapper.text()).toBe('service-404');
    });

    // ---- WR-1119 round 3 — readiness is redirect-aware and service-owned --------------------

    it('should never paint the not-found fallback while a middleware redirects the first navigation', async () => {
        // Arrange — fs-router redirects by ABORTING: the `beforeEach` wrapper dispatches its own
        // navigation and returns `false`, which vue-router records as a type-4 abort on the first
        // hop. Nothing must paint the fallback in the gap between that abort and the redirected
        // navigation finalizing — the route is still START_LOCATION there, but a navigation IS in
        // flight, so the correct paint is nothing.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? false : {name: 'about'}));

        // Act — sample every frame between install() and the redirected route finalizing
        const navigation = service.install();
        const wrapper = mount(service.RouterView);
        const frames: string[] = [wrapper.html()];
        for (let tick = 0; tick < 6; tick += 1) {
            await nextTick();
            frames.push(wrapper.html());
            await flushPromises();
            frames.push(wrapper.html());
        }
        await navigation;
        await flushPromises();
        frames.push(wrapper.html());

        // Assert — no frame ever showed the 404, and the redirected page is what settles
        expect(frames.some((frame) => frame.includes('404'))).toBe(false);
        expect(wrapper.text()).toBe('page content');
        expect(service.currentRouteRef.value.name).toBe('about');
        // ...and the redirect is NOT reported as a failed navigation
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
    });

    it('should settle isReady() and warn exactly once when the first navigation is genuinely cancelled', async () => {
        // Arrange — plain `true` cancels without redirecting: a genuine abort, and the one case
        // that SHOULD reach the console.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => true);

        // Act
        await service.install();
        await flushPromises();

        // Assert — the fallback paints, one warn, and isReady() RESOLVES rather than hanging.
        // Raced against a short timer so a hang fails the spec instead of stalling the suite.
        expect(mount(service.RouterView).text()).toBe('404');
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        await expect(
            Promise.race([
                service.isReady().then(
                    () => 'resolved',
                    () => 'rejected',
                ),
                new Promise((resolve) => setTimeout(() => resolve('never settled'), 200)),
            ]),
        ).resolves.toBe('resolved');
        consoleWarnSpy.mockRestore();
    });

    it('should resolve isReady() without warning when the first navigation succeeds', async () => {
        // Arrange
        window.history.pushState({}, '', '/about');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());

        // Act
        await service.install();
        await flushPromises();

        // Assert
        await expect(
            Promise.race([
                service.isReady().then(() => 'resolved'),
                new Promise((resolve) => setTimeout(() => resolve('never settled'), 200)),
            ]),
        ).resolves.toBe('resolved');
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
        window.history.pushState({}, '', '/');
    });

    it('should render the fallback and leave isReady() pending when no navigation is ever dispatched', async () => {
        // Arrange — a service nobody navigates. Pending is the CORRECT state for isReady() here:
        // nothing has been asked of the router, so nothing has settled. What must NOT happen is a
        // permanently blank page — the pre-0.3.0 behaviour was the (visible) fallback, and a
        // consumer who never calls install() keeps it.
        const service = createRouterService(createTestRoutes());

        // Act
        const wrapper = mount(service.RouterView);
        await flushPromises();

        // Assert
        expect(service.currentRouteRef.value).toBe(START_LOCATION);
        expect(wrapper.text()).toBe('404');
        await expect(
            Promise.race([
                service.isReady().then(() => 'resolved'),
                new Promise((resolve) => setTimeout(() => resolve('still pending'), 200)),
            ]),
        ).resolves.toBe('still pending');
    });

    it('should keep painting the current page while a LATER navigation is in flight', async () => {
        // Arrange — the blank is for the pre-first-navigation window only. Once a real route is
        // showing, an in-flight navigation must not blank it: dropping the sentinel half of the
        // guard would flash an empty page on every subsequent hop, which is the same defect as the
        // false 404, relocated. A middleware parks the second navigation so the window is
        // observable rather than raced.
        window.history.pushState({}, '', '/');
        let releaseMiddleware!: () => void;
        const parked = new Promise<void>((resolve) => {
            releaseMiddleware = resolve;
        });
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();
        const wrapper = mount(service.RouterView);
        expect(wrapper.text()).toBe('page content');

        // Act — a second navigation, parked mid-guard
        service.registerBeforeRouteMiddleware(async () => {
            await parked;
            return false;
        });
        const navigation = service.goToRoute('about');
        await flushPromises();

        // Assert — still showing the current page, not a blank
        expect(wrapper.text()).toBe('page content');

        // Reset
        releaseMiddleware();
        await navigation;
        await flushPromises();
    });

    it('should warn only for the FIRST navigation, not for a later cancelled one', async () => {
        // Arrange — the warning names a cold-start failure: the app never got off the ground. A
        // navigation cancelled later is ordinary guard behaviour (a form guard, an unsaved-changes
        // prompt) and must stay silent, so readiness settles exactly once and never re-arms.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        // Act — a second navigation, cancelled outright
        service.registerBeforeRouteMiddleware(() => true);
        await service.goToRoute('about');
        await flushPromises();

        // Assert — still silent, and the first navigation's route is untouched
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(service.currentRouteRef.value.name).toBe('home');
        consoleWarnSpy.mockRestore();
    });

    it('should render nothing while a first navigation dispatched outside install() is in flight', async () => {
        // Arrange — the in-flight flag is set both by `install()` (synchronously, because guards
        // only run on a later microtask) and at the top of the `beforeEach` wrapper. This spec
        // pins the wrapper half: the navigation comes from `goToRoute`, and a middleware parks
        // inside the wrapper so the in-flight window can be observed deterministically.
        window.history.pushState({}, '', '/');
        let releaseMiddleware!: () => void;
        const parked = new Promise<void>((resolve) => {
            releaseMiddleware = resolve;
        });
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(async () => {
            await parked;
            return false;
        });

        // Act — parked inside beforeEach, route still START_LOCATION
        const navigation = service.goToRoute('about');
        await flushPromises();
        const wrapper = mount(service.RouterView);

        // Assert — nothing painted while in flight, and specifically not the bare 404
        expect(service.currentRouteRef.value).toBe(START_LOCATION);
        expect(wrapper.text()).toBe('');

        // ...and the page appears once the middleware lets it through
        releaseMiddleware();
        await navigation;
        await flushPromises();
        expect(wrapper.text()).toBe('page content');
    });

    // ---- WR-1119 round 4 — a superseded hop is not a failed one -----------------------------

    it('should stay silent and keep the window open when a second navigation overtakes the first', async () => {
        // Arrange — a navigation dispatched while the first is still in its guards cancels it:
        // vue-router records a type-8 `cancelled` failure on the overtaken hop and runs its
        // `afterEach` while `currentRoute` is STILL the sentinel. Treating that as the end of the
        // first navigation is wrong twice over — it warns about a cold start that is in fact
        // proceeding, and it drops the in-flight flag with nothing painted yet, which is the same
        // false-404 window the release exists to close. A cancel always has a successor hop that
        // runs its own `afterEach`, so the bookkeeping still drains.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        // parks the first hop inside the guard so the second genuinely overtakes it
        service.registerBeforeRouteMiddleware(async (to) => {
            if (to.name === 'home') await new Promise((resolve) => setTimeout(resolve, 30));
            return false;
        });

        // Act
        const first = service.install();
        const wrapper = mount(service.RouterView);
        const second = service.goToRoute('about');
        const frames: string[] = [wrapper.html()];
        for (let tick = 0; tick < 8; tick += 1) {
            await nextTick();
            frames.push(wrapper.html());
            await flushPromises();
            frames.push(wrapper.html());
        }
        await first.catch(() => undefined);
        await second.catch(() => undefined);
        await flushPromises();

        // Assert — the overtake is ordinary routing, not a failed cold start. The warn assertion
        // is the discriminator: it was RED before the fix. The frame sweep is recorded but does
        // NOT discriminate on its own — the mis-set window is narrower than one happy-dom render
        // flush, the same limitation stated for the redirect spec above.
        expect(consoleWarnSpy).not.toHaveBeenCalled();
        expect(frames.some((frame) => frame.includes('404'))).toBe(false);
        expect(service.currentRouteRef.value.name).toBe('about');
        expect(wrapper.text()).toBe('page content');
        await expect(
            Promise.race([
                service.isReady().then(() => 'resolved'),
                new Promise((resolve) => setTimeout(() => resolve('never settled'), 200)),
            ]),
        ).resolves.toBe('resolved');
        consoleWarnSpy.mockRestore();
    });

    it('should terminate a redirect loop that starts on the very first navigation', async () => {
        // Arrange — every other redirect-loop spec navigates once first, so the loop always runs
        // as the SECOND navigation with readiness already settled. This pins the cold-start shape:
        // two middleware redirecting into each other before anything has ever rendered. The
        // failure modes worth excluding are a permanently blank view and an `isReady()` that never
        // resolves — the depth cap must end the chain and hand back the ordinary fallback.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware((to) => {
            if (to.name === 'home') return {name: 'about'};
            if (to.name === 'about') return {name: 'home'};

            return false;
        });

        // Act
        const wrapper = mount(service.RouterView);
        await service.install().catch(() => undefined);
        await flushPromises();

        // Assert — the cap fires once, the loop is reported once, and the view is the visible
        // fallback rather than a blank page
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        expect(wrapper.text()).toBe('404');
        await expect(
            Promise.race([
                service.isReady().then(() => 'resolved'),
                new Promise((resolve) => setTimeout(() => resolve('never settled'), 300)),
            ]),
        ).resolves.toBe('resolved');
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    // ---- WR-1119 round 5 — the in-flight window ends on EVERY terminal path -----------------

    // vue-router emits its own warnings on an unmatched location (`[VUE_ROUTER_R0004]`, and
    // `[VUE_ROUTER_R0010]` while no `onError` handler is registered). They are not fs-router's and
    // they are not what these specs are about, so every console assertion below counts only the
    // wrapper's own signal. Asserting on the raw call count instead would pin vue-router's console
    // vocabulary, which is neither our contract nor stable across its minors.
    //
    // Variadic over spies because the WR-1119 r6 contract — exactly ONE fs-router line per genuine
    // failure — is only meaningful as a total across both channels: counting one channel alone
    // cannot tell "not reported at all" apart from "reported on the other one".
    const fsRouterCalls = (...spies: MockInstance[]): unknown[][] =>
        spies.flatMap((spy) => spy.mock.calls.filter((call) => String(call[0]).startsWith('fs-router:')));

    // The same subset as messages, for the specs whose contract is WHICH line survived rather than
    // how many — a count alone cannot tell "the right reporter deferred" from "the wrong one did".
    const fsRouterMessages = (...spies: MockInstance[]): string[] =>
        fsRouterCalls(...spies).map((call) => String(call[0]));

    const settlesWithin = async (service: {isReady: () => Promise<void>}, ms: number): Promise<string> =>
        Promise.race([
            service.isReady().then(
                () => 'resolved',
                () => 'rejected',
            ),
            new Promise<string>((resolve) => setTimeout(() => resolve('never settled'), ms)),
        ]);

    it('should not paint the fallback when the FIRST navigation is programmatic rather than install()', async () => {
        // Arrange — `install()` opens the in-flight window synchronously because guards only run on
        // a later microtask. `goToRoute` did not, so a consumer whose initial navigation is
        // programmatic (a landing bounce, a stored deep link) painted the 404 for a frame. The
        // `install()` leg below is the positive control: it makes the spec fail if the harness has
        // stopped being able to observe a first frame at all.
        window.history.pushState({}, '', '/');
        const programmatic = createRouterService(createTestRoutes());

        // Act — mount in the SAME turn as the dispatch, before any guard has run
        const navigation = programmatic.goToRoute('about');
        const wrapper = mount(programmatic.RouterView);
        const firstFrame = wrapper.text();

        window.history.pushState({}, '', '/about');
        const control = createRouterService(createTestRoutes());
        const controlNavigation = control.install();
        const controlFirstFrame = mount(control.RouterView).text();

        // Assert — neither entry point may flash the fallback, and the control proves the
        // measurement is real: an inert harness would report '' for both.
        expect(controlFirstFrame).toBe('');
        expect(firstFrame).toBe('');
        expect(wrapper.find('p').exists()).toBe(false);

        // ...and the page still arrives
        await navigation;
        await controlNavigation;
        await flushPromises();
        expect(wrapper.text()).toBe('page content');
        window.history.pushState({}, '', '/');
    });

    it('should render the fallback and settle readiness on a cold load of a genuinely unknown URL', async () => {
        // Arrange — the real navigation path, not a hand-built un-navigated service: the four
        // genuine-miss specs above all mount a service nobody navigated, which reaches the fallback
        // through the sentinel branch and never exercises this one. `normalizedRouteToSpecificRoute`
        // THROWS for an unmatched path and is called from fs-router's own `beforeEach`, so every
        // cold load on an unknown URL is routed by vue-router through `triggerError` — which skips
        // `afterEach` entirely. Before round 5 that left the window open forever: a permanently
        // blank page and an `isReady()` that never settled.
        window.history.replaceState({}, '', '/definitely-not-a-route');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());

        // Act
        const wrapper = mount(service.RouterView);
        await service.install().catch(() => undefined);
        await flushPromises();

        // Assert — `main`'s visible 404 is restored, the miss is reported exactly once, and
        // readiness settles rather than hanging (raced so a hang fails instead of stalling).
        // The one line is an ERROR: the throw is reported on the channel vue-router stopped using
        // the moment fs-router registered a handler, and the abort-channel warn must not also fire.
        expect(wrapper.text()).toBe('404');
        expect(fsRouterCalls(consoleErrorSpy)).toHaveLength(1);
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(1);
        await expect(settlesWithin(service, 200)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        window.history.replaceState({}, '', '/');
    });

    it('should report a FIRST-navigation throw exactly once, render the fallback, and settle readiness', async () => {
        // Arrange — the same terminal path reached from consumer code rather than from fs-router's
        // own unmatched-path throw. A guard that throws is routed through `onError`, never through
        // `afterEach`, so nothing closed the window.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => {
            throw new Error('middleware exploded');
        });

        // Act
        const wrapper = mount(service.RouterView);
        await service.install().catch(() => undefined);
        await flushPromises();

        // Assert — ONE fs-router line across both channels. Two is the naive fix: reporting the
        // throw unconditionally while still routing the same error into the first-settle warn path
        // emits an error AND a warn for one failure. This is the assertion that catches it.
        expect(wrapper.text()).toBe('404');
        expect(fsRouterCalls(consoleErrorSpy)).toHaveLength(1);
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(1);
        await expect(settlesWithin(service, 200)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should report a LATER goToRoute failure exactly once and still reject the caller', async () => {
        // Arrange — readiness has already settled, so a later throw is ordinary guard behaviour: it
        // must end the in-flight window (or every subsequent navigation starts inside a stale one)
        // and be reported, without re-arming the cold-start warning and without disturbing the
        // painted page. BOTH halves are asserted below: the console line is what r5 dropped, and
        // the rejection is what a future round must not "fix" the reporting by swallowing.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();
        const wrapper = mount(service.RouterView);
        expect(wrapper.text()).toBe('page content');
        await expect(settlesWithin(service, 200)).resolves.toBe('resolved');

        // Act
        service.registerBeforeRouteMiddleware(() => {
            throw new Error('middleware exploded');
        });
        let callerSaw = 'nothing';
        await service.goToRoute('about').catch((error: unknown) => {
            callerSaw = String(error);
        });
        await flushPromises();

        // Assert — reported exactly once on the error channel, the cold-start warn stays silent
        // (this is not a cold start), the caller still gets its rejection, the page it was on is
        // still painted, and readiness stays resolved.
        expect(fsRouterCalls(consoleErrorSpy)).toHaveLength(1);
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(1);
        expect(callerSaw).toBe('Error: middleware exploded');
        expect(wrapper.text()).toBe('page content');
        await expect(settlesWithin(service, 200)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should stay silent when a LATER navigation is cancelled rather than failed', async () => {
        // Arrange — the noise guard. A cancelled hop is not an error: a `true`-returning auth
        // middleware cancels on every guarded click, and reporting those would turn ordinary
        // routing into a console stream. The cancel/abort channel therefore stays
        // first-navigation-only; only a THROWN error survives the settle latch.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();
        const wrapper = mount(service.RouterView);

        // Act
        service.registerBeforeRouteMiddleware(() => true);
        await service.goToRoute('about');
        await service.goToRoute('about');
        await flushPromises();

        // Assert — two cancelled hops, no console output at all, page undisturbed
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(0);
        expect(wrapper.text()).toBe('page content');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should not blank a sentinel-pinned view when a LATER navigation throws', async () => {
        // Arrange — the hazard the round-5 fix creates for itself. A first navigation cancelled
        // without redirecting pins `currentRoute` to the sentinel forever while the fallback
        // paints. Now that `goToRoute` opens the in-flight window, a later navigation whose guard
        // throws would blank that view permanently unless the throw also closes the window — the
        // original defect relocated to the entry point added to fix it.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(() => true);
        await service.install();
        await flushPromises();
        const wrapper = mount(service.RouterView);
        expect(service.currentRouteRef.value).toBe(START_LOCATION);
        expect(wrapper.text()).toBe('404');

        // Act
        service.registerBeforeRouteMiddleware(() => {
            throw new Error('middleware exploded');
        });
        await service.goToRoute('about').catch(() => undefined);
        await flushPromises();

        // Assert — still the visible fallback, and the cold-start warning did not fire twice
        expect(wrapper.text()).toBe('404');
        expect(fsRouterCalls(consoleWarnSpy)).toHaveLength(1);

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should keep the window OPEN while a redirect dispatched from goToRoute is still in flight', async () => {
        // Arrange — the hop `goToRoute` aborted in order to dispatch a redirect resolves while its
        // successor is still running its guards. Closing the window there (the shape a `finally`
        // around the push would produce) drops the in-flight flag with `currentRoute` still on the
        // sentinel — the false-404 frame rounds 2-4 exist to close, reintroduced through the new
        // programmatic entry point. Parking the redirect TARGET makes that window observable
        // deterministically instead of racing a render flush.
        window.history.pushState({}, '', '/');
        let releaseTarget!: () => void;
        const parked = new Promise<void>((resolve) => {
            releaseTarget = resolve;
        });
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(async (to) => {
            if (to.name === 'about') {
                await parked;

                return false;
            }

            return {name: 'about' as const};
        });

        // Act — the aborted hop has resolved by here; the redirect target is parked mid-guard
        const navigation = service.goToRoute('home');
        const wrapper = mount(service.RouterView);
        await flushPromises();

        // Assert — still in flight, so nothing painted, and specifically not the fallback
        expect(service.currentRouteRef.value).toBe(START_LOCATION);
        expect(wrapper.text()).toBe('');

        // ...and the redirected page is what lands
        releaseTarget();
        await navigation;
        await flushPromises();
        expect(wrapper.text()).toBe('page content');
        expect(service.currentRouteRef.value.name).toBe('about');
    });

    // ---- WR-1119 round 7 — one line per genuine failure, however many reporters can see it ----

    // A middleware redirect dispatches its own navigation and attaches a `.catch` reporter to it,
    // so a redirect into a target whose guard throws is visible to TWO reporters: `router.onError`,
    // which covers everything vue-router routes through `triggerError`, and that `.catch`. Both
    // fired, describing one failure at two levels of context. The `.catch` now defers to whichever
    // reporter got there first.
    //
    // These specs are also the ORDERING probe. The deferral relies on `triggerError` calling its
    // error handlers SYNCHRONOUSLY and only then returning `Promise.reject(error)`, so `onError`
    // has always recorded the error by the time the `.catch` runs a microtask later. If that ever
    // stops being true the record is missing when the `.catch` looks, both lines come back, and
    // these go red — rather than the contract failing quietly.
    it('should report a redirect into a throwing target exactly once on a LATER navigation', async () => {
        // Arrange — readiness settled first, so this is ordinary routing and not a cold start
        window.history.pushState({}, '', '/items');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();
        const wrapper = mount(service.RouterView);

        // Act — `home` redirects to `about`, whose guard throws
        service.registerBeforeRouteMiddleware((to) => {
            if (to.name === 'about') throw new Error('middleware exploded');

            return to.name === 'home' ? {name: 'about' as const} : false;
        });
        await service.goToRoute('home').catch(() => undefined);
        await flushPromises();

        // Assert — ONE line, and specifically the one `onError` owns: it is the reporter that sees
        // every error vue-router routes, so it is the one the redirect reporter must yield to.
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual(['fs-router: navigation failed']);
        expect(wrapper.text()).toBe('layout');
        await expect(settlesWithin(service, 200)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        window.history.pushState({}, '', '/');
    });

    it('should report a redirect into a throwing target exactly once on a cold load', async () => {
        // Arrange — the same chain on the FIRST navigation, where the cold-start warn is also in a
        // position to fire. The count here is NOT a fixed property of the redirect: it depends on
        // which reporters the chain's shape puts in play, which is why every assertion in this
        // block is written as "one line per failure" and never as "two lines became one".
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware((to) => {
            if (to.name === 'about') throw new Error('middleware exploded');

            return to.name === 'home' ? {name: 'about' as const} : false;
        });

        // Act
        const wrapper = mount(service.RouterView);
        await service.install().catch(() => undefined);
        await flushPromises();

        // Assert — one line, the fallback paints rather than a blank page, and readiness settles
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual(['fs-router: navigation failed']);
        expect(wrapper.text()).toBe('404');
        await expect(settlesWithin(service, 300)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should report a redirect to an unknown route name exactly once, on the redirect channel', async () => {
        // Arrange — the reason the redirect reporter cannot simply be deleted, which is the obvious
        // way to turn the two-line case above into one. `router.push({name})` throws SYNCHRONOUSLY
        // for an unknown name: nothing reaches `triggerError`, so `onError` never sees it and the
        // redirect `.catch` is the ONLY reporter this path has. Deleting it reopens the silent
        // failure this release exists to close. This spec is what stops a later round doing it.
        window.history.pushState({}, '', '/items');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();

        // Act
        service.registerBeforeRouteMiddleware((to) =>
            to.name === 'home' ? {name: 'definitely-not-a-route-name' as never} : false,
        );
        await service.goToRoute('home').catch(() => undefined);
        await flushPromises();

        // Assert — one line, and it is the redirect reporter's own
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual([
            'fs-router: middleware redirect navigation failed',
        ]);

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        window.history.pushState({}, '', '/');
    });

    it('should report a cold-load redirect to an unknown route name exactly once', async () => {
        // Arrange — the same synchronous throw on the FIRST navigation, where a SECOND reporter can
        // see it after all: `goToRoute`'s catch hands the error to the settle latch, whose
        // cold-start warn carries it too. Two lines pre-fix, on two different channels, for one
        // failure — the same defect as the specs above reached by a path `onError` is not on. The
        // warn gets there first, so the warn is the line that survives.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware((to) =>
            to.name === 'home' ? {name: 'definitely-not-a-route-name' as never} : false,
        );

        // Act
        const wrapper = mount(service.RouterView);
        await service.install().catch(() => undefined);
        await flushPromises();

        // Assert
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual([
            'fs-router: the first navigation did not complete, rendering not-found',
        ]);
        expect(wrapper.text()).toBe('404');
        await expect(settlesWithin(service, 300)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should still report a non-object throw from a redirect target rather than swallow it', async () => {
        // Arrange — the deliberate exception, and the only place this release accepts two lines for
        // one failure. The ledger of already-reported failures is keyed by object IDENTITY (a
        // `WeakSet`), which cannot hold a primitive, so `throw 'boom'` is never recorded and every
        // reporter that sees it reports it. The alternative — a value-keyed ledger — would let two
        // navigations that happen to throw the same string suppress each other, which is a SILENT
        // drop, the defect class this whole release exists to close. Loud beats silent on the case
        // the ledger cannot track.
        window.history.pushState({}, '', '/items');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();

        // Act
        service.registerBeforeRouteMiddleware((to) => {
            if (to.name === 'about') throw 'boom';

            return to.name === 'home' ? {name: 'about' as const} : false;
        });
        await service.goToRoute('home').catch(() => undefined);
        await flushPromises();

        // Assert — REPORTED. The count is asserted exactly so that a future change which silences
        // the untrackable case fails here instead of passing a looser "at least one" check.
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual([
            'fs-router: navigation failed',
            'fs-router: middleware redirect navigation failed',
        ]);

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        window.history.pushState({}, '', '/');
    });

    // ---- WR-1119 round 8 — two hops at once ------------------------------------------------

    it('should stay silent when two concurrent hops abort into the same redirect target', async () => {
        // Arrange — two navigations to the SAME redirecting path, dispatched in one turn. Only the
        // OVERTAKER runs guards: vue-router cancels the hop it overtook before that hop's guards
        // run, so exactly one redirect mark is placed, by the hop that will later read it. The
        // cancelled hop's `afterEach` fires FIRST and, reading the mark before its own `failure`,
        // consumed a mark it never placed — leaving the hop that did place one to read itself as
        // an ordinary abort and warn about a cold start that is in fact succeeding.
        //
        // Measured hook order at the pre-fix commit, both hops on `/`:
        //   beforeEach /  ·  afterEach / failure=8 (mark consumed)  ·  beforeEach /about
        //   ·  afterEach / failure=4 (no mark left) -> WARN  ·  afterEach /about
        //
        // The WARN is the discriminator, not a frame. The wrongly-closed window is narrower than
        // one happy-dom render flush (the limitation round 4 recorded), so a frame sweep here
        // would pass whether or not the defect is present.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware((to) => (to.name === 'home' ? {name: 'about' as const} : false));
        const wrapper = mount(service.RouterView);

        // Act
        const first = service.goToRoute('home');
        const second = service.goToRoute('home');
        await first.catch(() => undefined);
        await second.catch(() => undefined);
        await flushPromises();

        // Assert — the redirect landed and nothing was reported
        expect(service.currentRouteRef.value.name).toBe('about');
        expect(wrapper.text()).toBe('page content');
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual([]);
        await expect(settlesWithin(service, 300)).resolves.toBe('resolved');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should report a post-settle push to an unknown route name exactly once and still reject', async () => {
        // Arrange — the cold-start shape of this failure is already covered (the settle latch's
        // warn carries it). AFTER the latch has closed there is no reporter left at all:
        // `router.push({name})` throws SYNCHRONOUSLY, so nothing reaches `triggerError` and
        // `onError` never sees it, and the settle latch returns early. The caller's rejection was
        // the only signal — invisible to `RouterLink`, which drops the promise.
        window.history.pushState({}, '', '/');
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const service = createRouterService(createTestRoutes());
        await service.install();
        await flushPromises();
        // Positive control — the spies see this service's lines, and the cold start emitted none
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual([]);

        // Act
        const rejection = service.goToRoute('definitely-not-a-route-name' as never);

        // Assert — BOTH halves: the caller still learns of it, and so does the console, once
        await expect(rejection).rejects.toThrow();
        await flushPromises();
        expect(fsRouterMessages(consoleWarnSpy, consoleErrorSpy)).toEqual(['fs-router: navigation failed']);
        expect(service.currentRouteRef.value.name).toBe('home');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should not settle readiness on a superseded error while its successor is still in flight', async () => {
        // Arrange — `afterEach` has carried supersession checks since round 4, but `onError` — the
        // terminal path a thrown guard takes, and the only one `afterEach` never sees — carried
        // none. A hop whose guard throws after a successor has overtaken it therefore ends the
        // FIRST navigation on the spot: readiness resolves while `currentRoute` is still the
        // sentinel, so a consumer that awaits `isReady()` before mounting mounts on nothing.
        //
        // Ordering, not a timeout, is the assertion: readiness must settle AFTER the successor
        // lands, and both events are recorded in one list so the failure names which came first.
        window.history.pushState({}, '', '/');
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        let releaseThrower!: () => void;
        let releaseSuccessor!: () => void;
        const throwerParked = new Promise<void>((resolve) => {
            releaseThrower = resolve;
        });
        const successorParked = new Promise<void>((resolve) => {
            releaseSuccessor = resolve;
        });
        const service = createRouterService(createTestRoutes());
        service.registerBeforeRouteMiddleware(async (to) => {
            if (to.name === 'home') {
                await throwerParked;
                throw new Error('middleware exploded');
            }
            if (to.name === 'about') await successorParked;

            return false;
        });
        const order: string[] = [];
        service.registerAfterRouteMiddleware((to) => {
            if (to.name === 'about') order.push('successor landed');
        });
        void service.isReady().then(() => order.push('readiness settled'));

        // Act — park the first hop in its guard, let a second overtake it, then make the first throw
        const first = service.install();
        await flushPromises();
        const second = service.goToRoute('about');
        await flushPromises();
        releaseThrower();
        await first.catch(() => undefined);
        await flushPromises();
        releaseSuccessor();
        await second.catch(() => undefined);
        await flushPromises();

        // Assert
        expect(order).toEqual(['successor landed', 'readiness settled']);
        expect(service.currentRouteRef.value.name).toBe('about');

        consoleErrorSpy.mockRestore();
    });

    // The invariant, written once over every terminal outcome the suite knows about, so a terminal
    // path added later is covered by construction rather than by remembering to add a case. THREE
    // observable consequences are asserted: nothing is left permanently blank, readiness has
    // settled, and the outcome produced exactly `expectedLines` fs-router console lines. Where the
    // outcome leaves the route on the sentinel the blank check discriminates the in-flight flag
    // directly (a still-open window paints ''); where a real route finalized, RouterView paints it
    // regardless and readiness carries the discrimination.
    //
    // `expectedLines` is the WR-1119 r6 axis and it is a TOTAL across both console channels: 1 for
    // a genuine failure whenever it happens, 1 for a cancelled FIRST navigation (the cold-start
    // warn), 0 for everything else. A post-settle CANCEL is deliberately not a row here — it has
    // its own named spec above, which carries the reason the cancel channel must stay quiet. So is
    // the non-object throw, the one outcome that deliberately emits TWO — a row cannot carry why.
    //
    // The history-driven (`goBack`) case cannot be a row here either, and the reason is a trap
    // worth naming: `createWebHistory()` registers a `popstate` listener per service and nothing
    // unregisters it, so ONE `history.back()` drives every service this file ever built. Measured:
    // an earlier spec's service answered the hop with `fs-router: middleware redirect chain
    // exceeded 10 hops`, which made a pre-fix run of that case pass on another service's output.
    // It lives in `history-navigation.spec.ts`, alone in a file, where the listener set is its own.
    // `changeRouteQuery` is deliberately absent — it swallows its navigation promise the same way
    // and is tracked separately as WR-1120.
    const terminalOutcomes: {
        name: string;
        expectedLines: number;
        drive: () => Promise<{service: ReturnType<typeof createRouterService>; wrapper: VueWrapper}>;
    }[] = [
        {
            name: 'a navigation that succeeds',
            expectedLines: 0,
            drive: async () => {
                window.history.pushState({}, '', '/about');
                const service = createRouterService(createTestRoutes());
                const wrapper = mount(service.RouterView);
                await service.install();
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a middleware that cancels with plain `true`',
            expectedLines: 1,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                service.registerBeforeRouteMiddleware(() => true);
                const wrapper = mount(service.RouterView);
                await service.install();
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a middleware redirect chain',
            expectedLines: 0,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                service.registerBeforeRouteMiddleware((to) => (to.name === 'about' ? false : {name: 'about' as const}));
                const wrapper = mount(service.RouterView);
                await service.install();
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a hop a later navigation overtook',
            expectedLines: 0,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                service.registerBeforeRouteMiddleware(async (to) => {
                    if (to.name === 'home') await new Promise((resolve) => setTimeout(resolve, 30));

                    return false;
                });
                const wrapper = mount(service.RouterView);
                const first = service.install();
                const second = service.goToRoute('about');
                await first.catch(() => undefined);
                await second.catch(() => undefined);
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a guard that throws',
            expectedLines: 1,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                service.registerBeforeRouteMiddleware(() => {
                    throw new Error('middleware exploded');
                });
                const wrapper = mount(service.RouterView);
                await service.install().catch(() => undefined);
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a push to an unknown route name, which throws synchronously',
            expectedLines: 1,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                const wrapper = mount(service.RouterView);
                await service.goToRoute('definitely-not-a-route-name' as never).catch(() => undefined);
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a middleware redirect into a target whose guard throws',
            expectedLines: 1,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                service.registerBeforeRouteMiddleware((to) => {
                    if (to.name === 'about') throw new Error('middleware exploded');

                    return to.name === 'home' ? {name: 'about' as const} : false;
                });
                const wrapper = mount(service.RouterView);
                await service.install().catch(() => undefined);
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a middleware redirect to an unknown route name, which throws synchronously',
            expectedLines: 1,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                service.registerBeforeRouteMiddleware((to) =>
                    to.name === 'home' ? {name: 'definitely-not-a-route-name' as never} : false,
                );
                const wrapper = mount(service.RouterView);
                await service.install().catch(() => undefined);
                await flushPromises();

                return {service, wrapper};
            },
        },
        {
            name: 'a guard that throws on a navigation AFTER the first has settled',
            expectedLines: 1,
            drive: async () => {
                window.history.pushState({}, '', '/');
                const service = createRouterService(createTestRoutes());
                const wrapper = mount(service.RouterView);
                await service.install();
                await flushPromises();
                service.registerBeforeRouteMiddleware(() => {
                    throw new Error('middleware exploded');
                });
                await service.goToRoute('about').catch(() => undefined);
                await flushPromises();

                return {service, wrapper};
            },
        },
    ];

    it.each(terminalOutcomes)('should end the in-flight window after $name', async ({drive, expectedLines}) => {
        // Arrange
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const {service, wrapper} = await drive();

        // Assert
        expect(wrapper.text()).not.toBe('');
        if (service.currentRouteRef.value === START_LOCATION) expect(wrapper.text()).toBe('404');
        await expect(settlesWithin(service, 300)).resolves.toBe('resolved');
        expect(fsRouterCalls(consoleWarnSpy, consoleErrorSpy)).toHaveLength(expectedLines);

        // WR-1119 r8 — the leak probe, and the reason it has to pin the view back to the sentinel:
        // the in-flight window is only OBSERVABLE there. With a real route showing, RouterView
        // paints the page whatever the window says, so an outcome that ends on a real route hides
        // a window left open forever — which is round 1's permanently blank page, reintroduced the
        // moment any terminal path increments the in-flight count without a matching decrement.
        // Re-pinning the ref is the router's own sentinel state, not a fabricated one.
        service.currentRouteRef.value = START_LOCATION;
        await nextTick();
        expect(wrapper.text()).toBe('404');

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        window.history.pushState({}, '', '/');
    });
});

describe('createRouterLink', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render an anchor element with correct href and slot content', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}, slots: {default: () => 'Click me'}});

        // Assert
        const anchor = wrapper.find('a');
        expect(anchor.exists()).toBe(true);
        expect(anchor.attributes('href')).toBe('/about');
        expect(anchor.text()).toBe('Click me');
    });

    it('should render without slot content', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Assert
        expect(wrapper.find('a').exists()).toBe(true);
    });

    it('should call goToRoute and prevent default on normal click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about', id: 5, query: {tab: '1'}, parentId: 2}}});

        // Act
        const event = new MouseEvent('click', {bubbles: true});
        const preventSpy = vi.spyOn(event, 'preventDefault');
        wrapper.find('a').element.dispatchEvent(event);
        await flushPromises();

        // Assert
        expect(preventSpy).toHaveBeenCalled();
        expect(goTo).toHaveBeenCalledWith('about', 5, {tab: '1'}, 2);
    });

    it('should not call goToRoute on ctrl+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {ctrlKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should not call goToRoute on meta+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {metaKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should not call goToRoute on shift+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {shiftKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should not call goToRoute on alt+click', async () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}});

        // Act
        await wrapper.find('a').trigger('click', {altKey: true});

        // Assert
        expect(goTo).not.toHaveBeenCalled();
    });

    it('should forward class, style, data-*, and aria-* attributes to the anchor', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/about');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        const wrapper = mount(RouterLink, {
            props: {to: {name: 'about'}},
            attrs: {class: 'nav-link active', style: 'color: red;', 'data-testid': 'home-link', 'aria-current': 'page'},
        });

        // Assert — consumer attributes land on the anchor
        const anchor = wrapper.find('a');
        expect(anchor.classes()).toContain('nav-link');
        expect(anchor.classes()).toContain('active');
        expect(anchor.attributes('style')).toContain('color: red');
        expect(anchor.attributes('data-testid')).toBe('home-link');
        expect(anchor.attributes('aria-current')).toBe('page');
        // ...and the owned href stays present
        expect(anchor.attributes('href')).toBe('/about');
    });

    it('should keep the owned href authoritative over a fallthrough href attribute', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/canonical');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act — a consumer-supplied href must not override the computed one
        const wrapper = mount(RouterLink, {props: {to: {name: 'about'}}, attrs: {href: '/consumer-supplied'}});

        // Assert — attrs spread first, so the owned href wins
        expect(wrapper.find('a').attributes('href')).toBe('/canonical');
    });

    it('should pass name, id, query, and parentId to getUrlForRouteName', () => {
        // Arrange
        const getUrl = vi.fn().mockReturnValue('/parent/5/child/10');
        const goTo = vi.fn();
        const RouterLink = createRouterLink(getUrl, goTo);

        // Act
        mount(RouterLink, {props: {to: {name: 'nested', id: 10, query: {tab: 'info'}, parentId: 5}}});

        // Assert
        expect(getUrl).toHaveBeenCalledWith('nested', 10, {tab: 'info'}, 5);
    });
});
