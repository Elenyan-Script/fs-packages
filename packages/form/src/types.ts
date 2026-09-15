import type {Ref} from 'vue';

/** Field-error bag: the first backend validation message per field key. */
export type ValidationErrors<T extends string = string> = Partial<Record<T, string>>;

/** Reactive validation-error state returned by `useValidationErrors`. */
export type UseValidationErrors<T extends string = string> = {
    /** Current field errors. Populated from a 422 response, cleared on demand. */
    errors: Ref<ValidationErrors<T>>;
    /** Clear all field errors. */
    clearErrors: () => void;
};

/** Options for `useValidationErrors`. */
export type UseValidationErrorsOptions = {
    /**
     * Maps each raw backend field key to the key stored in the error bag.
     * Defaults to identity — keys are used verbatim (e.g. `first_name`). Pass a
     * snake→camel converter (such as a per-key wrapper over `fs-helpers`'
     * `deepCamelKeys`) when your app addresses fields in camelCase.
     * @default (key) => key
     */
    keyMapper?: (key: string) => string;
};

/** Form-submit helper returned by `useFormSubmit`. */
export type UseFormSubmit = {
    /**
     * Run a submit action with double-submit prevention. A 422 (validation)
     * rejection is swallowed — the field errors have already been surfaced by
     * `useValidationErrors`' response middleware, so the form is preserved. Any
     * other rejection is re-thrown to the caller / error boundary.
     */
    handleSubmit: (action: () => Promise<void>) => Promise<void>;
    /** `true` while a submit action is in flight — the form's loading state. */
    submitting: Ref<boolean>;
};

/** Options for `useForm`: the validation options plus `useForm`-only behaviour. */
export type UseFormOptions = UseValidationErrorsOptions & {
    /**
     * On a 422, scroll the first invalid field into view. Off unless you ask for it: an
     * `HttpService` is shared, so a 422 fills every mounted form's bag and this cannot tell
     * whose refusal it was — turning it on without a `scrollRoot` lets one form's refusal
     * scroll the page to another form's field. Requires the presentation layer to mark the
     * errored control (the default target is `[aria-invalid="true"]`, which
     * `@script-development/ui-inputs` renders from `:invalid`).
     * @default false
     */
    scrollToError?: boolean;
    /**
     * Scopes the `scrollToError` query to one form's subtree — pass it when forms
     * share a page (a dialog over a page form on the same `HttpService` **must** pass
     * it). Omitted: document-wide. Provided but `null`: no scroll (never falls back to
     * document).
     */
    scrollRoot?: Ref<HTMLElement | null>;
    /**
     * CSS selector for the invalid-field mark, used by `scrollToError`. Defaults to
     * `'[aria-invalid="true"]'` (what `@script-development/ui-inputs` renders). Pass your
     * own when your inputs mark errors differently (e.g. a class) — the package derives
     * no ids and marks nothing itself.
     * @default '[aria-invalid="true"]'
     */
    scrollTarget?: string;
};

/**
 * Everything `useForm` returns: the field-error bag and `clearErrors` from
 * `useValidationErrors`, plus `handleSubmit` and the `submitting` loading flag
 * from `useFormSubmit` — wired together so a page composes one call, not two.
 */
export type UseForm<T extends string = string> = UseValidationErrors<T> & UseFormSubmit;
