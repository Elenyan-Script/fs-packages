<template>
    <div ref="root" class="ui-groupcombobox" @keydown="onKey">
        <input
            :id="id"
            ref="input"
            type="text"
            class="ui-control ui-groupcombobox__input"
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
            open && filteredOptions.length === 0 ? emptyText : ''
        }}</span>

        <!-- KD-1136. The anchor is promoted to the TOP LAYER in place (Popover API) — it is
             never moved in the DOM, so no ancestor's overflow can clip it and no stacking
             context can bury it, while scoped `--ui-*` maps still reach it. floating-ui
             positions the ANCHOR, not the <ul>: the size() middleware sizes it to the
             trigger, so the menu's `min-width: 100%` measures the trigger. -->
        <div v-if="open" ref="floating" popover="manual" class="ui-menu-anchor" :style="floatingStyles">
            <OptionList
                variant="ui-groupcombobox"
                :rows="filteredRows"
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
                        :option="filteredOptions[index]"
                        :index="index"
                        :selected="isSelected(index)"
                        :active="pointer === index"
                    >
                        {{ labelOf(filteredOptions[index]) }}
                    </slot>
                </template>
            </OptionList>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {computed, ref, useTemplateRef, watch} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {buildGroupRows} from '../internal/group-rows';
import {ensureRefValueExists} from '../internal/reactivity';
import OptionList from './OptionList.vue';

const {
    groups,
    label,
    id,
    placeholder = 'Select…',
    disabled = false,
    required = false,
    invalid = false,
    describedby,
    emptyText = 'No options',
    optionsLabel = 'Options',
    mutedOptions,
    clearLabel,
} = defineProps<{
    /** caller-ordered groups, each with options and a display header. */
    groups: {options: T[]; text: string; header?: boolean}[];
    /** property name or getter for an option's display string. */
    label: LabelKey<T>;
    /** stable id — required so the input can pair with a label/error. */
    id: string;
    placeholder?: string;
    disabled?: boolean;
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
     * commits `null` and closes. Lives outside the option index space and outside the filter.
     */
    clearLabel?: string;
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

// All options across all groups in declaration order — the base flat list.
const allOptions = computed(() => groups.flatMap((g) => g.options));
const selected = computed(() => allOptions.value.find((option) => option.id === model.value));
const selectedLabel = computed(() => (selected.value ? labelOf(selected.value) : ''));

// The input's text is LOCAL state so the user can filter freely — it is not a mirror of the
// committed label. It starts on the committed label, follows the user's typing while open, and
// is snapped back to the committed label on commit / dismiss so a half-typed non-match never
// lingers.
const query = ref(selectedLabel.value);

// WR-0576 (browse-to-change): a query EQUAL to the committed rendering does NOT filter. The
// query rests on that rendering, so without this rule opening a FILLED combobox narrowed the
// list to the already-chosen option and forced a manual clear to browse elsewhere.
const filteredData = computed(() => {
    const engaged = query.value !== selectedLabel.value;
    const needle = engaged ? query.value.trim().toLowerCase() : '';
    return groups
        .map((group) => ({
            ...group,
            options: needle
                ? group.options.filter((option) => labelOf(option).toLowerCase().includes(needle))
                : group.options,
        }))
        .filter((group) => group.options.length > 0);
});

// The flat list every index (pointer, commit, isSelected) is keyed against — derived from
// filteredData so indices align with filteredRows.
const filteredOptions = computed(() => filteredData.value.flatMap((g) => g.options));
// Stable `v-for` keys for OptionList, indexed by the flat (filtered) option index `rows` navigates.
const optionKeys = computed(() => filteredOptions.value.map((option) => String(option.id)));

// The mixed header/boundary/option row sequence over the filtered groups — same single-site
// `buildGroupRows` encoding GroupSelect uses (filteredData has already dropped empty groups,
// so its empty-group guard is a no-op here).
const filteredRows = computed(() => buildGroupRows(filteredData.value));

/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => filteredOptions.value[index].id === model.value;
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean =>
    mutedOptions !== undefined && mutedOptions.includes(filteredOptions.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
// The input is both the floating-ui reference and the target of the imperative focus handle.
const input = useTemplateRef<HTMLInputElement>('input');
// The teleported `.ui-menu-anchor` (null while closed) — floating-ui's floating element.
const floating = useTemplateRef<HTMLElement>('floating');

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through
// this one guard. Read through a local rather than indexing blind: the clamp watcher normally
// keeps `pointer` in range, but a keypress landing between a filter change and the watcher
// flush would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = filteredOptions.value[index];
    // v8 ignore next
    if (!highlighted) return false;
    model.value = highlighted.id;
    query.value = labelOf(highlighted);
    close();
    return true;
};

// The clear entry commits null — the input snaps to '' through the same `selectedLabel` read
// every other close path uses. Always a real commit, so always `true`.
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
    listLength: () => filteredOptions.value.length,
    // Only ArrowDown opens a closed list — a printable key must fall through to the input so
    // it can filter, so it is deliberately not an open key (never preventDefault-ed here).
    openKeys: (key) => key === 'ArrowDown',
    onCommit: commit,
    onDismiss: () => dismiss(),
    onOutside: () => dismiss(),
    clearEntry: () => clearLabel !== undefined,
    onClearCommit: commitClear,
});

// The input text is local, but it must still track the committed label when it changes from
// OUTSIDE while the control is idle. Watch `selectedLabel` (not `model`): the label depends
// on BOTH the model AND `groups`, so this also re-syncs when a pre-set model's option arrives
// asynchronously (the edit-form pattern). While the menu is open the user is actively typing,
// so an external change must not yank the text out from under them.
watch(selectedLabel, (lbl) => {
    if (!open.value) query.value = lbl;
});

// WR-0576 (select-all-on-open): when the popup opens with the committed rendering in the
// input, select the text so the first keystroke REPLACES it and starts a fresh filter.
// Guarded on equality, NOT on mere non-emptiness: when TYPING is what opened the popup
// (`onInput`), the query has already diverged and selecting would eat the user's edit.
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
defineExpose({focus: () => ensureRefValueExists(input).focus()});
</script>
