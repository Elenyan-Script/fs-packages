import type {Ref} from 'vue';
import type {LocationQueryRaw, RouteComponent, RouteLocationNormalizedLoaded, RouteRecordRaw} from 'vue-router';

import {computed, defineComponent, h} from 'vue';
import {START_LOCATION} from 'vue-router';

import type {RouteName, RouterLinkComponent, RouterService, RouterViewComponent} from './types';

const buildRouteKey = (route: RouteLocationNormalizedLoaded, depth: number): string => {
    let key = route.matched[depth].path;
    for (const [paramName, paramValue] of Object.entries(route.params)) {
        const value = Array.isArray(paramValue) ? paramValue[0] : paramValue;
        if (value) key = key.replace(`:${paramName}`, value);
    }

    return key;
};

/**
 * `navigatingRef` reports whether a navigation is currently IN FLIGHT — true from the moment one is
 * dispatched until it finalizes or genuinely fails, and held true across a middleware redirect
 * chain. It is optional so the existing two-argument signature keeps working; a consumer who
 * hand-builds a view without it never blanks, and gets the not-found fallback for an un-navigated
 * route exactly as before `0.3.0`. `createRouterService` always supplies it.
 */
export const createRouterView = (
    currentRouteRef: Ref<RouteLocationNormalizedLoaded>,
    notFoundComponent?: RouteComponent,
    navigatingRef?: Ref<boolean>,
): RouterViewComponent =>
    defineComponent<{depth?: number}>(
        ({depth = 0}) => {
            const component = computed(() => {
                const matched = currentRouteRef.value.matched[depth];
                return matched?.components?.default ?? null;
            });

            return () => {
                // vue-router seeds `currentRoute` with START_LOCATION and only replaces it once the
                // first navigation resolves. Its `matched` is empty, but that means "not navigated
                // yet", not "no such route" — painting the not-found fallback there is a false 404
                // on every cold load. Identity against the exported sentinel, never a
                // `matched.length === 0` heuristic, which also describes a genuine miss.
                //
                // The sentinel alone cannot say WHY the route is still START_LOCATION: a
                // middleware that cancels the first navigation without redirecting leaves it
                // pinned there forever, and blanking on that would never paint anything. So the
                // blank is gated on a navigation being IN FLIGHT — which is also true throughout a
                // middleware redirect chain (fs-router redirects by aborting and re-dispatching),
                // closing the frame that would otherwise flash the fallback mid-chain. Nothing in
                // flight and still on the sentinel means nobody has navigated: paint the fallback.
                if (navigatingRef?.value && currentRouteRef.value === START_LOCATION) return null;

                if (!component.value) return notFoundComponent ? h(notFoundComponent) : h('p', ['404']);

                return h(component.value, {key: buildRouteKey(currentRouteRef.value, depth)});
            };
        },
        // https://vuejs.org/api/general.html#function-signature
        // manual runtime props declaration is currently still needed
        {props: ['depth']},
    );

export const createRouterLink = <Routes extends RouteRecordRaw[]>(
    getUrlForRouteName: RouterService<Routes>['getUrlForRouteName'],
    goToRoute: RouterService<Routes>['goToRoute'],
): RouterLinkComponent<Routes> =>
    defineComponent<{to: {name: RouteName<Routes>; query?: LocationQueryRaw; id?: number | string; parentId?: number}}>(
        (props, {slots, attrs}) =>
            () =>
                h(
                    'a',
                    {
                        // Merge consumer-set fallthrough attrs (class/style/data-*/aria-*) onto the
                        // anchor; spread first so the owned href/onClick stay authoritative.
                        ...attrs,
                        href: getUrlForRouteName(props.to.name, props.to.id, props.to.query, props.to.parentId),
                        onClick: (event: MouseEvent) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

                            event.preventDefault();
                            goToRoute(props.to.name, props.to.id, props.to.query, props.to.parentId);
                        },
                    },
                    slots.default?.(),
                ),
        // https://vuejs.org/api/general.html#function-signature
        // manual runtime props declaration is currently still needed
        {props: ['to'], inheritAttrs: false},
    );
