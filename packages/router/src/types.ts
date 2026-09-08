import type {ComputedRef, DefineSetupFnComponent, Ref} from 'vue';
import type {
    LocationQuery,
    LocationQueryRaw,
    NavigationFailure,
    NavigationHookAfter,
    RouteComponent,
    RouteLocationNormalized,
    RouteLocationNormalizedLoaded,
    RouteLocationRaw,
    RouteRecordName,
    RouteRecordRaw,
} from 'vue-router';

/**
 * Removes `undefined` entries from a tuple type at compile time.
 * Used by CRUD route factories to filter out optional route components.
 */
export type FilterUndefined<T extends unknown[]> = T extends []
    ? []
    : T extends [infer H, ...infer R]
      ? H extends undefined
          ? FilterUndefined<R>
          : [H, ...FilterUndefined<R>]
      : T;

export type LazyRouteComponent = () => Promise<RouteComponent>;

export type OptionalComponent = LazyRouteComponent | undefined;

type TopLevelRoute<Routes extends RouteRecordRaw[]> = Extract<Routes[number], {name: string}>;
type ChildRoute<Routes extends RouteRecordRaw[]> = Extract<
    Routes[number],
    {children: RouteRecordRaw[]}
>['children'][number];

export type ActualRoute<Routes extends RouteRecordRaw[]> = TopLevelRoute<Routes> | ChildRoute<Routes>;

export type RouteName<Routes extends RouteRecordRaw[]> = ActualRoute<Routes>['name'];

type ExtractNameFromRoutes<T, P extends string> = T extends `${infer R}${P}` ? R : never;

export type CreateRouteName<T extends RouteRecordName | undefined> = ExtractNameFromRoutes<T, '.create'>;
export type OverviewRouteName<T extends RouteRecordName | undefined> = ExtractNameFromRoutes<T, '.overview'>;
export type EditRouteName<T extends RouteRecordName | undefined> = ExtractNameFromRoutes<T, '.edit'>;
export type ShowRouteName<T extends RouteRecordName | undefined> = ExtractNameFromRoutes<T, '.show'>;

/**
 * A typed redirect returned from a before-route middleware. Returning one from a
 * middleware cancels the pending hop and navigates to the target in a single step —
 * `goToRoute` (push) by default, `replaceRoute` when `replace: true`.
 */
export type MiddlewareRedirect<Routes extends RouteRecordRaw[]> = {
    name: RouteName<Routes>;
    id?: number | string;
    query?: LocationQueryRaw;
    parentId?: number;
    /** Replace the current history entry instead of pushing a new one. Defaults to `false`. */
    replace?: boolean;
};

/**
 * The return of a before-route middleware: a boolean (truthy = cancel the hop,
 * falsy = continue) or a typed {@link MiddlewareRedirect} (cancel-and-navigate).
 * The first middleware returning truthy — boolean or object — short-circuits the chain.
 */
export type BeforeRouteMiddlewareResult<Routes extends RouteRecordRaw[]> = boolean | MiddlewareRedirect<Routes>;

export type BeforeRouteMiddleware<Routes extends RouteRecordRaw[]> = (
    to: ActualRoute<Routes>,
    from: ActualRoute<Routes>,
) => BeforeRouteMiddlewareResult<Routes> | Promise<BeforeRouteMiddlewareResult<Routes>>;

/**
 * Compile-time compat proof for the 0.2.0 middleware redirect-return widening.
 * `BeforeRouteMiddleware`'s return union grew from `boolean | Promise<boolean>` to
 * also admit a typed {@link MiddlewareRedirect}; widening a function's RETURN is
 * assignability-safe, so every existing `(to, from) => boolean` middleware still
 * satisfies the type. `tsc` fails here if that guarantee ever regresses.
 */
type AssertTrue<T extends true> = T;
export type LegacyBooleanMiddlewareStillSatisfies = AssertTrue<
    ((to: ActualRoute<RouteRecordRaw[]>, from: ActualRoute<RouteRecordRaw[]>) => boolean) extends BeforeRouteMiddleware<
        RouteRecordRaw[]
    >
        ? true
        : false
>;

export type UnregisterMiddleware = () => void;

export type RouterViewComponent = DefineSetupFnComponent<{depth?: number}>;
export type RouterLinkComponent<Routes extends RouteRecordRaw[]> = DefineSetupFnComponent<{
    to: {name: RouteName<Routes>; query?: LocationQueryRaw; id?: number | string; parentId?: number};
}>;

export interface RouterServiceOptions {
    base?: string;
    afterRouteCallbacks?: NavigationHookAfter[];
    /** Component rendered by `RouterView` in place of the bare `404` fallback when no route matches. */
    notFoundComponent?: RouteComponent;
}

export interface RouterService<Routes extends RouteRecordRaw[]> {
    /**
     * Navigates to the current browser location, returning the navigation promise so a
     * consumer may `await routerService.install()` before mounting — until it settles,
     * `currentRouteRef` still holds vue-router's `START_LOCATION` and `RouterView` paints
     * nothing. It is vue-router's own promise and therefore REJECTS when a guard throws,
     * which includes an unmatched URL; `isReady()` is the non-rejecting alternative.
     */
    install: () => Promise<NavigationFailure | void | undefined>;
    /**
     * Resolves once the first navigation that is not an fs-router redirect has ended — whether it
     * succeeded, was cancelled, or failed. Ended, not `afterEach`-ed: vue-router has three terminal
     * paths and a thrown guard takes `onError` instead, which is why an unmatched URL settles here
     * rather than hanging. Settling is once-per-service; REPORTING is not — a navigation that
     * throws is `console.error`-ed every time, long after this promise has resolved. Never rejects,
     * and never delegates to `router.isReady()`: an fs-router redirect is dispatched by ABORTING
     * the pending hop, which vue-router reports as a failure and which leaves its own readiness
     * permanently unsettled. Stays pending while no navigation has ever been dispatched.
     */
    isReady: () => Promise<void>;
    normalizedRouteToSpecificRoute: (route: Pick<RouteLocationNormalized, 'name' | 'path'>) => ActualRoute<Routes>;
    goToRoute: (
        name: RouteName<Routes>,
        id?: number | string,
        query?: LocationQueryRaw,
        parentId?: number,
    ) => Promise<void>;
    replaceRoute: (
        name: RouteName<Routes>,
        id?: number | string,
        query?: LocationQueryRaw,
        parentId?: number,
    ) => Promise<void>;
    goToCreatePage: (name: CreateRouteName<RouteName<Routes>>) => Promise<void>;
    goToOverviewPage: (name: OverviewRouteName<RouteName<Routes>>) => Promise<void>;
    goToEditPage: (name: EditRouteName<RouteName<Routes>>, id: number | string) => Promise<void>;
    goToShowPage: (
        name: ShowRouteName<RouteName<Routes>>,
        id: number | string,
        query?: LocationQueryRaw,
    ) => Promise<void>;
    getUrlForRouteName: (
        name: RouteName<Routes>,
        id?: number | string,
        query?: LocationQueryRaw,
        parentId?: number,
    ) => string;
    goBack: () => void;
    registerBeforeRouteMiddleware: (middleware: BeforeRouteMiddleware<Routes>) => UnregisterMiddleware;
    registerAfterRouteMiddleware: (middleware: NavigationHookAfter) => UnregisterMiddleware;
    currentRouteRef: Ref<RouteLocationNormalizedLoaded>;
    currentRouteQuery: ComputedRef<LocationQuery>;
    currentRouteId: ComputedRef<number>;
    currentRouteSlug: ComputedRef<string>;
    currentParentId: ComputedRef<number>;
    changeRouteQuery: (query: LocationQuery) => void;
    onPage: (pageName: RouteName<Routes>) => boolean;
    onCreatePage: (baseRouteName: CreateRouteName<RouteName<Routes>>) => boolean;
    onEditPage: (baseRouteName: EditRouteName<RouteName<Routes>>) => boolean;
    onOverviewPage: (baseRouteName: OverviewRouteName<RouteName<Routes>>) => boolean;
    onShowPage: (baseRouteName: ShowRouteName<RouteName<Routes>>) => boolean;
    routeExists: (to: RouteLocationRaw) => boolean;

    RouterView: RouterViewComponent;
    RouterLink: RouterLinkComponent<Routes>;
}

export interface CrudRoute<
    P extends string,
    N extends string,
    C extends LazyRouteComponent,
    Meta extends Record<string, unknown> = Record<string, unknown>,
> {
    path: P;
    name: N;
    component: C;
    meta: Meta;
}

export interface ParentCrudRoute<
    T extends string,
    Meta extends Record<string, unknown>,
    OverviewComponent extends OptionalComponent,
    CreateComponent extends OptionalComponent,
    EditComponent extends OptionalComponent,
    ShowComponent extends OptionalComponent,
> {
    path: string;
    component: RouteComponent | LazyRouteComponent;
    children: FilterUndefined<
        [
            OverviewComponent extends undefined
                ? undefined
                : CrudRoute<'', `${T}.overview`, NonNullable<OverviewComponent>, Meta>,
            CreateComponent extends undefined
                ? undefined
                : CrudRoute<'create', `${T}.create`, NonNullable<CreateComponent>, Meta>,
            EditComponent extends undefined
                ? undefined
                : CrudRoute<':id/edit', `${T}.edit`, NonNullable<EditComponent>, Meta>,
            ShowComponent extends undefined
                ? undefined
                : CrudRoute<':id', `${T}.show`, NonNullable<ShowComponent>, Meta>,
        ]
    >;
}

export interface NestedParentCrudRoute<
    T extends string,
    Meta extends Record<string, unknown>,
    OverviewComponent extends OptionalComponent,
    CreateComponent extends OptionalComponent,
    EditComponent extends OptionalComponent,
    ShowComponent extends OptionalComponent,
> {
    path: string;
    component: RouteComponent | LazyRouteComponent;
    children: FilterUndefined<
        [
            OverviewComponent extends undefined
                ? undefined
                : CrudRoute<'', `${T}.overview`, NonNullable<OverviewComponent>, Meta>,
            CreateComponent extends undefined
                ? undefined
                : CrudRoute<'create', `${T}.create`, NonNullable<CreateComponent>, Meta>,
            EditComponent extends undefined
                ? undefined
                : CrudRoute<':id/edit', `${T}.edit`, NonNullable<EditComponent>, Meta>,
            ShowComponent extends undefined
                ? undefined
                : CrudRoute<':id', `${T}.show`, NonNullable<ShowComponent>, Meta>,
        ]
    >;
}
