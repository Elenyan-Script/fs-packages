<template>
    <ul
        :id="listboxId"
        :class="`${variant}__menu`"
        role="listbox"
        :aria-label="optionsLabel"
        :aria-multiselectable="multiselectable || undefined"
    >
        <!-- The committing clear entry (SingleSelect/Combobox/GroupSelect/GroupCombobox
             `clearLabel`) renders OUTSIDE the index space — its own <li> above the rows, its
             own id (`${id}-clear`), its own highlight flag — so every option index below keeps
             mapping 1:1 onto the parent's list. It is an option to assistive tech (role="option"
             inside the listbox); aria-selected marks the committed-null state. -->
        <li
            v-if="clearLabel !== undefined"
            :id="clearId"
            :class="[`${variant}__clear`, {'is-active': clearActive}]"
            role="option"
            :aria-selected="clearSelected"
            @mouseover="emit('clearHover')"
            @click="emit('clearCommit')"
        >
            {{ clearLabel }}
        </li>
        <!-- The empty-state row renders as the SOLE navigable child of the listbox (it only
             shows when there are zero options). A bare <li> here is doubly invalid: role="listbox"
             requires an owned role="option" (axe aria-required-children), and a <li> whose parent
             is a listbox (not a list) trips axe listitem. A presentational role clears the second
             but leaves the listbox with no required child. Rendering the message as a DISABLED
             option (the APG no-results pattern) satisfies both — it is a valid listbox child and
             gives the listbox its required option, while aria-disabled marks it non-selectable
             (the pointer never lands on it — useListbox has no navigable index when empty). -->
        <li v-if="!hasOptions" :class="`${variant}__empty`" role="option" aria-disabled="true">{{ emptyText }}</li>
        <!-- The row sequence is `rows`: flat controls pass an all-option run (no headers); the
             grouped controls interleave header/boundary rows. `groupedRuns` collapses that into
             named/headerless runs. APG listbox grouping pattern: a NAMED group uses role="group"
             + aria-label on the inner <ul> so the group name is announced to AT; the <li> wrapper
             carries role="presentation" (html-aria disallows role="group" on <li>), and the visual
             header span is aria-hidden to avoid double-reading. Options without a header (flat
             controls, or `header:false` groups) render flat — no group wrapper. The run key mixes
             the group's identity (its header, or the flat marker) WITH its position, so a filter
             that drops a group never reuses a header node for a different group.
             The option row itself is the shared `ListboxOption` (its markup is byte-identical
             across the family); the index-scoped `option` slot forwards through so `T` never
             crosses this boundary — the parent re-scopes the index into its typed payload and owns
             the slotless fallback (the labelOf text). Highlight/selection chrome stays on the <li>
             inside ListboxOption, outside the slot, so custom content never re-creates it. -->
        <template v-for="(run, ri) in groupedRuns" :key="run.header !== null ? `h${ri}:${run.header}` : `b${ri}`">
            <li v-if="run.header !== null" :class="`${variant}__group`" role="presentation">
                <span :class="`${variant}__group-header`" aria-hidden="true">{{ run.header }}</span>
                <ul role="group" :aria-label="run.header">
                    <ListboxOption
                        v-for="index in run.indices"
                        :key="keys[index]"
                        :index="index"
                        :variant="variant"
                        :option-id="optionId"
                        :active="pointer === index"
                        :muted="isMuted(index)"
                        :selected="isSelected(index)"
                        @hover="emit('hover', $event)"
                        @commit="emit('commit', $event)"
                    >
                        <slot name="option" :index="index" />
                    </ListboxOption>
                </ul>
            </li>
            <template v-else>
                <ListboxOption
                    v-for="index in run.indices"
                    :key="keys[index]"
                    :index="index"
                    :variant="variant"
                    :option-id="optionId"
                    :active="pointer === index"
                    :muted="isMuted(index)"
                    :selected="isSelected(index)"
                    @hover="emit('hover', $event)"
                    @commit="emit('commit', $event)"
                >
                    <slot name="option" :index="index" />
                </ListboxOption>
            </template>
        </template>
    </ul>
</template>

<script setup lang="ts">
import {computed} from 'vue';

import type {GroupRow} from '../internal/group-rows';

import ListboxOption from './ListboxOption.vue';

/**
 * The listbox popup shared by every ui-inputs select control — INTERNAL, deliberately not
 * exported from the barrel (like `useListbox`, its behavioural twin). Where the composable
 * dedupes behaviour, this component dedupes markup: one `<ul>/<li>` body, parameterised only
 * by the class-prefix `variant`, so the `role="listbox"` / `role="option"` / position-keyed
 * `optionId` / committed-value `aria-selected` semantics stay byte-identical across the family.
 *
 * Both the flat controls (SingleSelect/Combobox/MultiSelect/MultiCombobox) and the grouped
 * ones (GroupSelect/GroupCombobox) render through this single component: the ONLY difference
 * is the `rows` a parent hands down. A flat control passes a run of all-option rows (no headers,
 * rendered flat); a grouped control interleaves `header`/`boundary` rows and this component
 * folds them into named `role="group"` runs. `boundary` closes the open run so a `header:false`
 * group after a named one renders flat instead of being absorbed into the preceding group.
 *
 * Entirely index-based, mirroring `useListbox`: the option type `T` never crosses this
 * boundary. The parent hands down `rows` + `keys` derived from ITS list (SingleSelect `sorted`,
 * Combobox `filtered`, GroupSelect the flattened groups) plus index-keyed lookups, and receives
 * `hover`/`commit` back by index — the parent stays the sole owner of `pointer` and of the
 * commit disposition. Per-option content flows through the index-scoped `option` slot; the
 * clear entry (`clear*` props) sits above the list, outside the index space.
 *
 * The single `<ul>` root is LOAD-BEARING: parents reach the floating element through the
 * `.ui-menu-anchor` wrapper that parents teleport (KD-1136) — floating-ui positions the
 * ANCHOR, and this `<ul>` is a static box inside it. That is what keeps `--ui-menu-min-width:
 * 100%` resolving against the trigger rather than against body. This component renders no
 * positioning of its own and takes no floating-ui styles.
 */
const {
    rows,
    keys,
    pointer,
    listboxId,
    optionId,
    isSelected,
    isMuted,
    variant,
    optionsLabel,
    emptyText,
    multiselectable = false,
    clearLabel,
    clearId,
    clearActive = false,
    clearSelected = false,
} = defineProps<{
    /** the render-order row sequence: an all-option run for flat controls, or a header/option/
     *  boundary mix for the grouped ones. */
    rows: GroupRow[];
    /** stable `v-for` keys (stringified option ids), indexed by option index — parallel to the
     *  parent's flattened option list. */
    keys: string[];
    /** the highlighted index (`-1` for none) — owned by the parent, moved via `hover`. */
    pointer: number;
    /** the listbox `id` the trigger's `aria-controls` points at. */
    listboxId: string;
    /** position-keyed option-id scheme from `useListbox` (`${id}-opt-${index}`). */
    optionId: (index: number) => string;
    /** whether the option at an index is the COMMITTED value (`aria-selected`), never the pointer. */
    isSelected: (index: number) => boolean;
    /** whether the option at an index is visually MUTED (`.is-muted`) — still committable. */
    isMuted: (index: number) => boolean;
    /** class prefix of the owning control — the only visual divergence across the family. */
    variant:
        | 'ui-select'
        | 'ui-combobox'
        | 'ui-multiselect'
        | 'ui-multicombobox'
        | 'ui-groupselect'
        | 'ui-groupcombobox';
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel: string;
    /** shown when there are no navigable options. */
    emptyText: string;
    /** marks the listbox `aria-multiselectable` (MultiSelect) — absent, not "false", otherwise. */
    multiselectable?: boolean;
    /** display string of the committing clear entry — absent means no entry renders. */
    clearLabel?: string;
    /** the clear entry's activedescendant id (`${id}-clear`, from `useListbox`). */
    clearId?: string;
    /** whether the clear entry holds the highlight (`useListbox.clearHighlighted`). */
    clearActive?: boolean;
    /** whether the clear entry is the COMMITTED state (`aria-selected` — model is null). */
    clearSelected?: boolean;
}>();

const emit = defineEmits<{hover: [index: number]; commit: [index: number]; clearHover: []; clearCommit: []}>();

const hasOptions = computed(() => rows.some((row) => row.type === 'option'));

// Collapse the flat GroupRow[] into runs keyed by header. Named runs use role="group"; runs
// without a header (a flat control's whole list, or a `header:false` group) render options flat
// in the listbox. A `boundary` row closes the open run so the following headerless options start
// their own run (via the `!current` path) rather than being absorbed into a preceding group.
const groupedRuns = computed(() => {
    const runs: {header: string | null; indices: number[]}[] = [];
    let current: {header: string | null; indices: number[]} | null = null;
    for (const row of rows) {
        if (row.type === 'header') {
            current = {header: row.text, indices: []};
            runs.push(current);
        } else if (row.type === 'boundary') {
            current = null;
        } else {
            if (!current) {
                current = {header: null, indices: []};
                runs.push(current);
            }
            current.indices.push(row.index);
        }
    }
    return runs;
});
</script>
