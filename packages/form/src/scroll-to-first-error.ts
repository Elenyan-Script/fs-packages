import type {Ref} from 'vue';

import {watch} from 'vue';

import type {ValidationErrors} from './types';

/** The mark `@script-development/ui-inputs` renders from `:invalid`. */
const DEFAULT_TARGET = '[aria-invalid="true"]';

/**
 * On every `errors` change, scroll the first invalid field into view (the mark the
 * presentation layer sets); a no-op when the error bag is empty or nothing is marked.
 *
 * - `root` scopes the query to one form's subtree — omitted: document-wide; `null`: no
 *   scroll, never falling back to document.
 * - `target` is the selector for the mark (default `[aria-invalid="true"]`); pass your
 *   own when your inputs mark errors with a class instead.
 * - `behavior` is `'auto'` under `prefers-reduced-motion: reduce` — a JS `scrollIntoView`
 *   behavior is not subject to the CSS media query, so it is honoured here explicitly.
 *
 * `flush: 'post'` fires after the mark paints. Call inside `setup()` (as `useForm`
 * does) so the watcher stops on unmount.
 */
export const useScrollToFirstError = (
    errors: Ref<ValidationErrors>,
    root?: Ref<HTMLElement | null>,
    target: string = DEFAULT_TARGET,
): void => {
    watch(
        errors,
        () => {
            if (!Object.keys(errors.value).length) return;

            const scope = root === undefined ? document : root.value;
            const field = scope?.querySelector(target);
            if (!field) return;

            const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
            field.scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'});
        },
        {flush: 'post'},
    );
};
