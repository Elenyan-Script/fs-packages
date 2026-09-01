<template>
    <div ref="root" class="ui-multicombobox">
        <div
            ref="box"
            class="ui-control ui-multicombobox__box"
            :class="{'is-open': open, 'has-value': model.length > 0, 'is-invalid': invalid, 'is-disabled': disabled}"
        >
            <!-- Chips render the committed values around the input (the APG editor-combobox
                 layout, stolen from our own MultiSelect). Removing must not open the menu:
                 structurally guaranteed — only the input opens, and a chip click never
                 reaches it. -->
            <span v-for="chip in chips" :key="String(chip.id)" class="ui-multicombobox__chip">
                {{ labelOf(chip) }}
                <button
                    type="button"
                    class="ui-multicombobox__chip-remove"
                    :disabled="disabled"
                    :aria-label="`${removeLabel} ${labelOf(chip)}`"
                    @click="remove(chip.id)"
                >
                    <svg class="ui-multicombobox__chip-x" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2" />
                    </svg>
                </button>
            </span>

            <!-- The INPUT is the trigger (kendo's searchable choreography; the APG-canonical
                 combobox — an in-popup search input has an awkward focus/activedescendant
                 story). It flexes over all remaining space, so clicking the empty part of
                 the chip bar is clicking the input. Keyboard listens HERE (not on the root,
                 like MultiSelect): the chip-remove buttons are focusable children of the
                 root, and Enter on one must remove the chip — never leak into the listbox
                 skeleton. Its resting state is EMPTY + placeholder: there is no single
                 committed label to snap to, so Combobox's commit-snaps-query→label and
                 closed-state label re-sync are deliberately NOT ported. -->
            <input
                :id="id"
                ref="input"
                type="text"
                class="ui-multicombobox__input"
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                :aria-expanded="open"
                :aria-required="required || undefined"
                :aria-invalid="invalid || undefined"
                :aria-describedby="describedbyWithSelection"
                :aria-controls="open ? listboxId : undefined"
                :aria-activedescendant="activeDescendant"
                :placeholder="model.length ? undefined : placeholder"
                :disabled="disabled"
                :value="query"
                @input="onInput"
                @click="onOpen"
                @focus="onOpen"
                @keydown="onInputKey"
            />
        </div>

        <!-- The input's accessible VALUE is the query, and the chips render outside it — so
             the committed selection is additionally conveyed through aria-describedby (the
             input-as-trigger analogue of MultiSelect's visually-hidden sr-value span). -->
        <span :id="selectionId" class="ui-multicombobox__sr-selection">{{ selectedSummary }}</span>

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
                variant="ui-multicombobox"
                multiselectable
                :rows="rows"
                :keys="optionKeys"
                :pointer="pointer"
                :listbox-id="listboxId"
                :option-id="optionId"
                :is-selected="isSelected"
                :is-muted="isMuted"
                :options-label="optionsLabel"
                :empty-text="emptyText"
                @hover="pointer = $event"
                @commit="commit"
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
import {computed, ref, useTemplateRef} from 'vue';

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
    removeLabel = 'Remove',
    mutedOptions,
} = defineProps<{
    options: T[];
    /** property name or getter for an option's display string. */
    label: LabelKey<T>;
    /** stable id — required so the input can pair with a label/error. */
    id: string;
    /** shown only while nothing is committed — chips replace it, like MultiSelect. */
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
    /**
     * verb prefixed to a chip's remove-button accessible name (`"${removeLabel} ${label}"`) —
     * a prop, not a literal, so Dutch territories can localise it (the `optionsLabel` ruling).
     */
    removeLabel?: string;
    /** ids rendered visually muted (`.is-muted`) — still committable, still in the keyboard path. */
    mutedOptions?: T['id'][];
}>();

defineSlots<{
    /**
     * Per-option content (swatches, icons, rich labels). Highlight/selection chrome stays
     * on the option row, outside the slot. Fallback: the plain display string.
     */
    option?: (props: {option: T; index: number; selected: boolean; active: boolean}) => unknown;
}>();

/** The committed membership: an array of option ids, in selection order. */
const model = defineModel<T['id'][]>({required: true});

/** Resolve an option's display string from the `label` prop (property name or getter). */
const labelOf = (option: T): string =>
    typeof label === 'function'
        ? label(option)
        : String((option as Record<PropertyKey, unknown>)[label as PropertyKey]);

// The input's text is LOCAL filter state — never a mirror of any committed label (there is
// no single one). It rests empty, follows the user's typing while open, and clears on every
// toggle-commit so the full list is re-offered.
const query = ref('');

// The visible list = filter by the trimmed, case-folded query (empty query ⇒ all),
// then the same optional alphabetical pass the siblings apply. Both aria-activedescendant
// and Enter index into THIS filtered list, not the raw `options`.
const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase();
    const matched = needle ? options.filter((option) => labelOf(option).toLowerCase().includes(needle)) : options;
    return alphabeticalSort ? [...matched].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : matched;
});

// The chip bar renders the committed values in selection order. An id whose option has not
// arrived yet (the async-options edit-form window) has no label to show — it stays in the
// model (Backspace still pops it) but renders no chip until its option loads.
const chips = computed(() =>
    model.value.flatMap((value) => {
        const option = options.find((candidate) => candidate.id === value);
        return option ? [option] : [];
    }),
);

/** The committed labels, selection-ordered — the aria-describedby selection surface. */
const selectedSummary = computed(() => chips.value.map(labelOf).join(', '));
const selectionId = computed(() => `${id}-selection`);
const describedbyWithSelection = computed(() =>
    describedby === undefined ? selectionId.value : `${describedby} ${selectionId.value}`,
);

// The index-based view OptionList renders — parallel arrays derived from `filtered`, which
// stays the single list every index (pointer, commit, aria) is keyed against.
const optionLabels = computed(() => filtered.value.map(labelOf));
const optionKeys = computed(() => filtered.value.map((option) => String(option.id)));
// A flat control renders one headerless run — an all-option row sequence OptionList lays out
// flat (no group wrappers), the same component the grouped controls feed a header/option mix.
const rows = computed<GroupRow[]>(() => filtered.value.map((_, index) => ({type: 'option', index})));
/** `aria-selected` marks committed MEMBERSHIP — the pointer is conveyed by aria-activedescendant. */
const isSelected = (index: number): boolean => model.value.includes(filtered.value[index].id);
/** `.is-muted` marks visual de-emphasis only — a muted option stays committable. */
const isMuted = (index: number): boolean =>
    mutedOptions !== undefined && mutedOptions.includes(filtered.value[index].id);

const root = useTemplateRef<HTMLElement>('root');
// The BOX (the whole visual control) is the floating-ui reference — after a few chips the
// input can be a sliver on the last flex line, and anchoring the popup to that sliver would
// misplace it. The input stays the ARIA combobox and the focus/imperative-handle target.
const box = useTemplateRef<HTMLElement>('box');
const input = useTemplateRef<HTMLInputElement>('input');
// The teleported `.ui-menu-anchor` (null while closed) — floating-ui's floating element, and
// the box click-outside treats as inside. The <ul> inside it is positioned by nothing.
const floating = useTemplateRef<HTMLElement>('floating');

/** Toggle an id's membership — add when absent, drop when present. Always emits a fresh array. */
const toggleValue = (value: T['id']): void => {
    model.value = model.value.includes(value)
        ? model.value.filter((member) => member !== value)
        : [...model.value, value];
};

// Both keyboard (Enter via useListbox) and pointer (OptionList `commit`) funnel through this
// one guard. Toggle-in-place: a commit flips membership and the menu STAYS OPEN. The
// multi-combobox choreography on top (kendo's searchable mode): the query clears so the
// full list is re-offered, and DOM focus returns to the input (a pointer commit lands on a
// non-focusable <li> and would otherwise drop focus to the body). The highlight resets only
// when clearing the query actually changed the list — an unfiltered keyboard walk keeps its
// position, so Enter can toggle neighbouring options without restarting from the top.
// Read through a local rather than indexing blind: the clamp watcher normally keeps
// `pointer` in range, but a keypress landing between a filter change and the watcher flush
// would otherwise index off the end.
const commit = (index: number): boolean => {
    const highlighted = filtered.value[index];
    if (!highlighted) return false;
    toggleValue(highlighted.id);
    if (query.value !== '') {
        query.value = '';
        resetHighlight();
    }
    ensureRefValueExists(input).focus();
    return true;
};

const {open, pointer, listboxId, optionId, activeDescendant, floatingStyles, onKey, close, resetHighlight} = useListbox(
    {
        root,
        reference: box,
        floating,
        id: () => id,
        disabled: () => disabled,
        listLength: () => filtered.value.length,
        // Only ArrowDown opens a closed list — a printable key must fall through to the input so
        // it can filter (Combobox parity); focus, click, and typing are the other open paths.
        openKeys: (key) => key === 'ArrowDown',
        onCommit: commit,
        onDismiss: () => dismiss(),
        onOutside: () => dismiss(),
    },
);

// Close-without-commit (Escape, Tab, click outside): the query clears back to the resting
// empty state — a half-typed filter never lingers, and there is no committed label to revert to.
const dismiss = (): void => {
    query.value = '';
    close();
};

// Per-chip remove — drops one committed id. Removal unmounts the focused remove button,
// which would drop document.activeElement to the body — refocus the input (the APG chip
// treatment; same move `commit()` makes for the pointer path). The refocus must not TOGGLE
// the list, though: focus() fires the input's open-on-focus handler synchronously, so the
// prior open-state is restored before Vue paints (chip remove ≠ open, and removing while
// the list is open must not close it either).
const remove = (value: T['id']): void => {
    model.value = model.value.filter((member) => member !== value);
    const wasOpen = open.value;
    ensureRefValueExists(input).focus();
    open.value = wasOpen;
};
/** Backspace with an EMPTY query pops the LAST committed value (no-op when empty). */
const popLast = (): void => {
    if (model.value.length) model.value = model.value.slice(0, -1);
};

// Backspace with an empty query is the chip-popping analogue of deleting text; with text in
// the query it stays native editing. Everything else follows the shared listbox keyboard
// skeleton. The disabled guard mirrors the composable's own — the native :disabled blocks
// focus in a real browser, but the guard keeps synthetic dispatch honest too.
const onInputKey = (event: KeyboardEvent): void => {
    if (disabled) return;
    if (event.key === 'Backspace' && query.value === '') {
        popLast();
        return;
    }
    onKey(event);
};

// Typing filters and opens; the raw value is bound through `query`, and every keystroke
// resets the highlight (nothing is pre-selected — Enter with no highlight is a no-op).
const onInput = (event: Event) => {
    query.value = (event.target as HTMLInputElement).value;
    open.value = true;
    resetHighlight();
};
// Focusing or clicking the (enabled) input opens the list (kendo's searchable choreography —
// focus is managed into the input, and the list is its context). A disabled input never
// dispatches either event.
const onOpen = () => {
    open.value = true;
};

// The one sanctioned defineExpose: a PUBLIC imperative handle (Combobox parity).
// The input is non-null by lifetime; the loud accessor names the assumption if it ever breaks.
defineExpose({focus: () => ensureRefValueExists(input).focus()});
</script>
