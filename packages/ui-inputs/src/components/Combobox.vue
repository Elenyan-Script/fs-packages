<template>
    <div ref="root" class="ui-combobox" @keydown="onKey">
        <input
            :id="id"
            ref="input"
            type="text"
            class="ui-control ui-combobox__input"
            :class="{'is-open': open, 'is-invalid': invalid}"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-required="required || undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
            :aria-controls="open ? listboxId : undefined"
            :aria-activedescendant="activeDescendant"
            :placeholder="placeholder"
            :disabled="disabled"
            :value="query"
            @input="onInput"
            @click="onClick"
        />

        <!-- WR-0521: the empty state must be ANNOUNCED, not just painted — a persistent,
             visually-hidden live region (mounted for the component's whole lifetime, so
             the emptyText lands as a content CHANGE, the reliable live-region path).
             Matters most here, where typing can drain the filtered list. -->
        <span class="ui-live-region" role="status" aria-live="polite">{{
            open && optionLabels.length === 0 ? emptyText : ''
        }}</span>

        <!-- KD-1136. The anchor is promoted to the TOP LAYER in place (Popover API) — it is
             never moved in the DOM, so no ancestor's overflow can clip it and no stacking
             context can bury it, while scoped `--ui-*` maps still reach it. floating-ui
             positions the ANCHOR, not the <ul>: the size() middleware sizes it to the
             trigger, so the menu's `min-width: 100%` measures the trigger. -->
        <div v-if="open" ref="floating" popover="manual" class="ui-menu-anchor" :style="floatingStyles">
            <OptionList
                variant="ui-combobox"
                :rows="rows"
                :keys="optionKeys"
                :pointer="pointer"
                :listbox-id="listboxId"
                :option-id="optionId"
                :is-selected="isSelected"
                :is-muted="isMuted"
                :options-label="optionsLabel"
                :empty-text="emptyText"
                :clear-label="clearLabel"
                :clear-id="clearId"
                :clear-active="clearHighlighted"
                :clear-selected="model === null"
                @hover="pointer = $event"
                @commit="commit"
                @clear-hover="highlightClear"
                @clear-commit="commitClear"
            >
                <!-- Re-scope OptionList's index into the typed per-option payload; the fallback
                     (the plain labelOf text) keeps slotless consumers byte-identical. -->
                <template #option="{index}">
                    <slot
                        name="option"
                        :option="filtered[index]"
                        :index="index"
                        :selected="isSelected(index)"
                        :active="pointer === index"
                    >
                        {{ optionLabels[index] }}
                    </slot>
                </template>
            </OptionList>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {computed, ref, useTemplateRef, watch} from 'vue';

import type {GroupRow} from '../internal/group-rows';
import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {ensureRefValueExists} from '../internal/reactivity';
import OptionList from './OptionList.vue';

const {
    options,
    label,
    id,
    placeholder = 'Select…',
    disabled = false,
    alphabeticalSort = true,
    required = false,
    invalid = false,
    describedby,
    emptyText = 'No options',
    optionsLabel = 'Options',
    mutedOptions,
    clearLabel,
    emptyDisplayValue,
} = defineProps<{
    options: T[];
    /** property name or getter for an option's display string. */
    label: LabelKey<T>;
    /** stable id — required so the input can pair with a label/error. */
    id: string;
    placeholder?: string;
    disabled?: boolean;
    alphabeticalSort?: boolean;
    /** conveys the required state to assistive tech via `aria-required`. */
    required?: boolean;
    invalid?: boolean;
    describedby?: string;
    emptyText?: string;
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel?: string;
    /** ids rendered visually muted (`.is-muted`) — still committable, still in the keyboard path. */
    mutedOptions?: T['id'][];
    /**
     * display string of a committing CLEAR ENTRY rendered above the (filtered) options —
     * commits `null` and closes. Lives outside the option index space and outside the
     * filter (it renders whatever the query says).
     */
    clearLabel?: string;
    /** what the input renders when the model is null — a NAMED empty state instead of `''`. */
    emptyDisplayValue?: string;
}>();

defineSlots<{
    /**
     * Per-option content (swatches, icons, rich labels). Highlight/selection chrome stays
     * on the option row, outside the slot. Fallback: the plain display string.
     */
    option?: (props: {option: T; index: number; selected: boolean; active: boolean}) => unknown;
}>();

const model = defineModel<T['id'] | null>({required: true});

/** Resolve an option's display string from the `label` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof label === 'function'
        ? label(option)
        : String((option as Record<PropertyKey, unknown>)[label as PropertyKey]);

const selected = computed(() => options.find((option) => option.id === model.value));
// The committed-null rendering: `emptyDisplayValue` names the empty state ("No sprint
// (backlog)") as a value; without it the input reverts to blank as before.
const selectedLabel = computed(() => (selected.value ? labelOf(selected.value) : (emptyDisplayValue ?? '')));

// The input's text is LOCAL state so the user can filter freely — it is not a mirror
// of the committed label the way SingleSelect's trigger text is. It starts on the
// committed label, follows the user's typing while open, and is snapped back to the
// committed label on commit / dismiss so a half-typed non-match never lingers.
const query = ref(selectedLabel.value);

// The visible list = filter by the trimmed, case-folded query (empty query ⇒ all),
// then the same optional alphabetical pass SingleSelect applies. Both aria-activedescendant
// and Enter index into THIS filtered list, not the raw `options`.
//
// WR-0576 (browse-to-change): a query EQUAL to the committed rendering (`selectedLabel` —
// the committed option's label, or `emptyDisplayValue` on a committed null) does NOT
// filter. The query rests on that rendering, so without this rule opening a FILLED
// combobox narrowed the list to ~the already-chosen option and the open→see-list→pick-
// another flow forced a manual clear first. The convention is pure EQUALITY, not a
// typed-once latch (MUI Autocomplete parity): the committed label as a query carries no
// intent to narrow, even when retyped verbatim mid-session.
const filtered = computed(() => {
    const engaged = query.value !== selectedLabel.value;
    const needle = engaged ? query.value.trim().toLowerCase() : '';
    const matched = needle ? options.filter((option) => labelOf(option).toLowerCase().includes(needle)) : options;
    return alphabeticalSort ? [...matched].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : matched;
});

// The index-based view OptionList renders — parallel arrays derived from `filtered`, which
// stays the single list every index (pointer, commit, aria) is keyed against.
const optionLabels = computed(() => filtered.value.map(labelOf));
const optionKeys = computed(() => filtered.value.map((option) => String(option.id)));
// A flat control renders one headerless run — an all-option row sequence OptionList lays out
// flat (no group wrappers), the same component the grouped controls feed a header/option mix.
const rows = computed<GroupRow[]>(() => filtered.value.map((_, index) => ({type: 'option', index})));
/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => filtered.value[index].id === model.value;
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean =>
    mutedOptions !== undefined && mutedOptions.includes(filtered.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
// The input is both the floating-ui reference and the target of the imperative focus
// handle isms's command-palette focus trap (WR-0448) consumes.
const input = useTemplateRef<HTMLInputElement>('input');
// The teleported `.ui-menu-anchor` (null while closed) — floating-ui's floating element, and
// the box click-outside treats as inside. The <ul> inside it is positioned by nothing.
const floating = useTemplateRef<HTMLElement>('floating');

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through this
// one guard. Read through a local rather than indexing blind: the clamp watcher normally keeps
// `pointer` in range, but a keypress landing between a filter change and the watcher flush
// would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = filtered.value[index];
    if (!highlighted) return false;
    choose(highlighted);
    return true;
};

// The clear entry commits the family's other legal value — null — and closes; the input
// snaps to the committed-null rendering (`emptyDisplayValue`, or blank) through the same
// `selectedLabel` read every other close path uses. Always a real commit, so always `true`.
const commitClear = (): boolean => {
    model.value = null;
    query.value = selectedLabel.value;
    close();
    return true;
};

const {
    open,
    pointer,
    listboxId,
    optionId,
    activeDescendant,
    floatingStyles,
    onKey,
    close,
    clearHighlighted,
    clearId,
    highlightClear,
    resetHighlight,
} = useListbox({
    root,
    reference: input,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => filtered.value.length,
    // Only ArrowDown opens a closed list — a printable key must fall through to the input so
    // it can filter, so it is deliberately not an open key (never preventDefault-ed here).
    openKeys: (key) => key === 'ArrowDown',
    onCommit: commit,
    onDismiss: () => dismiss(),
    onOutside: () => dismiss(),
    clearEntry: () => clearLabel !== undefined,
    onClearCommit: commitClear,
});

// The input text is local, but it must still track the committed label when it changes
// from OUTSIDE while the control is idle. Watch `selectedLabel` (not `model`): the label
// depends on BOTH the model AND `options`, so this also re-syncs when a pre-set model's
// option arrives asynchronously (the edit-form pattern — model set before an async
// options load, where `selected` is briefly undefined and the label would otherwise stay
// blank). While the menu is open the user is actively typing, so an external change must
// not yank the text out from under them.
watch(selectedLabel, (label) => {
    if (!open.value) query.value = label;
});

// WR-0576 (select-all-on-open): when the popup opens with the committed rendering in the
// input, select the text so the first keystroke REPLACES it and starts a fresh filter —
// composing with the equality rule above (open ⇒ full list; type ⇒ diverge ⇒ filter).
// Guarded on equality, NOT on mere non-emptiness: when TYPING is what opened the popup
// (`onInput`), the query has already diverged and selecting would eat the user's edit.
// A `pre`-flush watcher runs after the opening event handler (so it wins over the click's
// own caret placement) and before render; the input is mounted whenever `open` can flip.
watch(open, (isOpen) => {
    if (isOpen && query.value !== '' && query.value === selectedLabel.value) {
        ensureRefValueExists(input).select();
    }
});

// Snap the input back to the committed label so a half-typed non-match never survives a
// close-without-commit (Escape, Tab, or a click outside the control).
const dismiss = (): void => {
    query.value = selectedLabel.value;
    close();
};
const choose = (option: T): void => {
    model.value = option.id;
    query.value = labelOf(option);
    close();
};

// Typing filters and opens; the raw value is bound through `query`, and every keystroke
// resets the highlight (nothing is pre-selected — Enter with no highlight is a no-op).
// `resetHighlight` (not a bare pointer write) so a hovered clear entry drops too.
const onInput = (event: Event) => {
    query.value = (event.target as HTMLInputElement).value;
    open.value = true;
    resetHighlight();
};
// Clicking the (enabled) input opens the list. A disabled input never dispatches click.
const onClick = () => {
    open.value = true;
};

// The one sanctioned defineExpose: a PUBLIC imperative handle (isms WR-0448 focus trap).
// The input is non-null by lifetime; the loud accessor names the assumption if it ever breaks.
defineExpose({focus: () => ensureRefValueExists(input).focus()});
</script>
