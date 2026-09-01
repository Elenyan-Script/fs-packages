<template>
    <ul :id="listboxId" :class="`${variant}__menu`" role="listbox" :aria-label="optionsLabel">
        <!-- The committing clear entry renders OUTSIDE the index space — its own <li> above the
             rows, its own id (`${id}-clear`), its own highlight flag — so every option index
             below keeps mapping 1:1 onto the parent's list. -->
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
        <!-- The empty-state row renders as a disabled option (APG no-results pattern): a valid
             listbox child that satisfies role="listbox"'s required owned role="option", while
             aria-disabled marks it non-selectable. -->
        <li v-if="!hasOptions" :class="`${variant}__empty`" role="option" aria-disabled="true">{{ emptyText }}</li>
        <!-- APG listbox grouping pattern: named groups use role="group" + aria-label on the
             inner <ul> so the group name is announced to AT; the <li> wrapper carries
             role="presentation" (html-aria disallows role="group" on <li>). The visual
             header span is aria-hidden to avoid double-reading.
             Options without a header (header:false groups) render flat — no group wrapper. -->
        <template v-for="(run, ri) in groupedRuns" :key="ri">
            <li v-if="run.header !== null" :class="`${variant}__group`" role="presentation">
                <span :class="`${variant}__group-header`" aria-hidden="true">{{ run.header }}</span>
                <ul role="group" :aria-label="run.header">
                    <ListboxOption
                        v-for="index in run.indices"
                        :key="index"
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
                    :key="index"
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
 * The grouped listbox popup for GroupSelect/GroupCombobox — INTERNAL, not barrel-exported.
 * It owns ONLY the group layout (the `role="group"` + `aria-label` wrappers and the headerless
 * runs); the option row itself is the shared `ListboxOption`, the same component `OptionList`
 * renders, so the `role="option"` / `aria-selected` / `is-active`+`is-muted` / hover+commit
 * markup is no longer forked between the flat and grouped bodies. `groupedRuns` turns the flat
 * `GroupRow[]` into named/headerless runs; a `boundary` row closes the open run so a
 * `header:false` group after a named one renders flat instead of being absorbed.
 */

const {
    rows,
    pointer,
    listboxId,
    optionId,
    isSelected,
    isMuted,
    variant,
    optionsLabel,
    emptyText,
    clearLabel,
    clearId,
    clearActive = false,
    clearSelected = false,
} = defineProps<{
    /** mixed sequence of header/option rows in render order. */
    rows: GroupRow[];
    /** the highlighted index (`-1` for none) — owned by the parent, moved via `hover`. */
    pointer: number;
    /** the listbox `id` the trigger's `aria-controls` points at. */
    listboxId: string;
    /** position-keyed option-id scheme from `useListbox` (`${id}-opt-${index}`). */
    optionId: (index: number) => string;
    /** whether the option at an index is the COMMITTED value (`aria-selected`). */
    isSelected: (index: number) => boolean;
    /** whether the option at an index is visually MUTED (`.is-muted`) — still committable. */
    isMuted: (index: number) => boolean;
    /** class prefix of the owning control. */
    variant: 'ui-groupselect' | 'ui-groupcombobox';
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel: string;
    /** shown when there are no navigable options. */
    emptyText: string;
    /** display string of the committing clear entry — absent means no entry renders. */
    clearLabel?: string;
    /** the clear entry's activedescendant id (`${id}-clear`, from `useListbox`). */
    clearId?: string;
    /** whether the clear entry holds the highlight. */
    clearActive?: boolean;
    /** whether the clear entry is the COMMITTED state (`aria-selected` — model is null). */
    clearSelected?: boolean;
}>();

const emit = defineEmits<{hover: [index: number]; commit: [index: number]; clearHover: []; clearCommit: []}>();

const hasOptions = computed(() => rows.some((row) => row.type === 'option'));

// Converts the flat GroupRow[] into runs keyed by header. Named runs use role="group"; runs
// without a header (from `header:false` groups) render options flat in the listbox. A
// `boundary` row closes the open run so the following headerless options start their own run
// (via the `!current` path) rather than being absorbed into a preceding group.
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
