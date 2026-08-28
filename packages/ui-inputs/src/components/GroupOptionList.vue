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
        <template v-for="row in rows" :key="row.type === 'header' ? `h:${row.text}` : `o:${row.index}`">
            <!-- role="presentation": group headers are visual separators, not navigable options.
                 They carry no id, so aria-activedescendant never points at them. -->
            <li v-if="row.type === 'header'" :class="`${variant}__group-header`" role="presentation">{{ row.text }}</li>
            <li
                v-else
                :id="optionId(row.index)"
                :class="[`${variant}__option`, {'is-active': pointer === row.index, 'is-muted': isMuted(row.index)}]"
                role="option"
                :aria-selected="isSelected(row.index)"
                @mouseover="emit('hover', row.index)"
                @click="emit('commit', row.index)"
            >
                <!-- Index-scoped so `T` never crosses this boundary: the parent re-scopes the
                     index into its typed payload and owns the slotless fallback. -->
                <slot name="option" :index="row.index" />
            </li>
        </template>
    </ul>
</template>

<script setup lang="ts">
import {computed} from 'vue';

import type {GroupRow} from '../internal/group-rows';

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

// Reactive: rows changes when the filter changes in GroupCombobox, so this must recompute.
const hasOptions = computed(() => rows.some((row) => row.type === 'option'));
</script>
