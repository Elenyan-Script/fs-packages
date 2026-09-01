<template>
    <div ref="root" class="ui-groupselect" @keydown="onKey">
        <button
            :id="id"
            ref="reference"
            type="button"
            class="ui-control ui-groupselect__trigger"
            :class="{'is-open': open, 'has-value': selected !== undefined, 'is-invalid': invalid}"
            :disabled="disabled"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-required="required || undefined"
            :aria-invalid="invalid || undefined"
            :aria-describedby="describedby"
            :aria-controls="open ? listboxId : undefined"
            :aria-activedescendant="activeDescendant"
            @click="toggle"
        >
            <span v-if="selected === undefined" class="ui-groupselect__placeholder">{{ placeholder }}</span>
            <span v-else class="ui-groupselect__value">{{ labelOf(selected) }}</span>
            <svg class="ui-groupselect__chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
        </button>

        <!-- WR-0521: the empty state must be ANNOUNCED, not just painted — a persistent,
             visually-hidden live region (mounted for the component's whole lifetime, so
             the emptyText lands as a content CHANGE, the reliable live-region path). -->
        <span class="ui-live-region" role="status" aria-live="polite">{{
            open && flatOptions.length === 0 ? emptyText : ''
        }}</span>

        <!-- KD-1136. The anchor is promoted to the TOP LAYER in place (Popover API) — it is
             never moved in the DOM, so no ancestor's overflow can clip it and no stacking
             context can bury it, while scoped `--ui-*` maps still reach it. floating-ui
             positions the ANCHOR, not the <ul>: the size() middleware sizes it to the
             trigger, so the menu's `min-width: 100%` measures the trigger. -->
        <div v-if="open" ref="floating" popover="manual" class="ui-menu-anchor" :style="floatingStyles">
            <OptionList
                variant="ui-groupselect"
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
                        :option="flatOptions[index]"
                        :index="index"
                        :selected="isSelected(index)"
                        :active="pointer === index"
                    >
                        {{ labelOf(flatOptions[index]) }}
                    </slot>
                </template>
            </OptionList>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends SelectItem">
import {computed, useTemplateRef} from 'vue';

import type {LabelKey, SelectItem} from '../types';

import {useListbox} from '../composables/useListbox';
import {buildGroupRows} from '../internal/group-rows';
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
    /** stable id — required so the trigger can pair with a label/error. */
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
     * display string of a committing CLEAR ENTRY rendered above the options — commits
     * `null` and closes. Lives outside the option index space.
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

// All options across all groups in declaration order — the flat index space useListbox and
// commit/isSelected/isMuted operate on. Groups are caller-ordered; no alphabeticalSort.
const flatOptions = computed(() => groups.flatMap((g) => g.options));
const selected = computed(() => flatOptions.value.find((option) => option.id === model.value));
// Stable `v-for` keys for OptionList, indexed by the flat option index `rows` navigates.
const optionKeys = computed(() => flatOptions.value.map((option) => String(option.id)));

// The mixed header/boundary/option row sequence — the encoding lives once in `buildGroupRows`
// (shared with GroupCombobox), so the boundary/empty-group rules stay a single-site invariant.
const rows = computed(() => buildGroupRows(groups));

/** `aria-selected` marks the COMMITTED value — OptionList only asks about rendered indices. */
const isSelected = (index: number): boolean => flatOptions.value[index].id === model.value;
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean =>
    mutedOptions !== undefined && mutedOptions.includes(flatOptions.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
const reference = useTemplateRef<HTMLElement>('reference');
// The teleported `.ui-menu-anchor` (null while closed) — floating-ui's floating element.
const floating = useTemplateRef<HTMLElement>('floating');

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through
// this one guard. Read through a local rather than indexing blind: the clamp watcher normally
// keeps `pointer` in range, but a keypress landing between an `groups` change and the watcher
// flush would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = flatOptions.value[index];
    // v8 ignore next
    if (!highlighted) return false;
    model.value = highlighted.id;
    close();
    return true;
};

// The clear entry commits the family's other legal value — null — and closes, exactly like
// choosing an option. Always a real commit (null is always committable), so always `true`.
const commitClear = (): boolean => {
    model.value = null;
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
} = useListbox({
    root,
    reference,
    floating,
    id: () => id,
    disabled: () => disabled,
    listLength: () => flatOptions.value.length,
    // A closed GroupSelect opens on Enter, ArrowDown, or Space.
    openKeys: (key) => ['Enter', 'ArrowDown', ' '].includes(key),
    onCommit: commit,
    onDismiss: () => close(),
    onOutside: () => close(),
    clearEntry: () => clearLabel !== undefined,
    onClearCommit: commitClear,
});

const toggle = () => {
    open.value = !open.value;
};
</script>
