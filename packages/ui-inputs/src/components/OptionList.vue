<template>
    <ul
        :id="listboxId"
        :class="`${variant}__menu`"
        role="listbox"
        :aria-label="optionsLabel"
        :aria-multiselectable="multiselectable || undefined"
    >
        <!-- The committing clear entry (SingleSelect/Combobox `clearLabel`) renders OUTSIDE
             the index space — its own <li> above the v-for, its own id (`${id}-clear`), its
             own highlight flag — so every option index below keeps mapping 1:1 onto the
             parent's list. It is an option to assistive tech (role="option" inside the
             listbox); aria-selected marks the committed-null state. -->
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
        <!-- The empty-state row renders as the SOLE child of the listbox (it only shows when
             there are zero options). A bare <li> here is doubly invalid: role="listbox" requires
             an owned role="option" (axe aria-required-children), and a <li> whose parent is a
             listbox (not a list) trips axe listitem. A presentational role clears the second but
             leaves the listbox with no required child. Rendering the message as a DISABLED option
             (the APG no-results pattern) satisfies both — it is a valid listbox child and gives
             the listbox its required option, while aria-disabled marks it non-selectable (the
             pointer never lands on it — useListbox has no navigable index when empty). -->
        <li v-if="!labels.length" :class="`${variant}__empty`" role="option" aria-disabled="true">{{ emptyText }}</li>
        <!-- The option row is the shared `ListboxOption` (its markup is byte-identical across
             the family); the index-scoped `option` slot forwards through so `T` never crosses
             this boundary — the parent re-scopes the index into its typed payload and owns the
             slotless fallback (the labelOf text). Highlight/selection chrome stays on the <li>
             inside ListboxOption, outside the slot, so custom content never re-creates it. -->
        <ListboxOption
            v-for="(optionLabel, index) in labels"
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
</template>

<script setup lang="ts">
import ListboxOption from './ListboxOption.vue';

/**
 * The listbox popup shared by every ui-inputs select control — INTERNAL, deliberately not
 * exported from the barrel (like `useListbox`, its behavioural twin). Where the composable
 * dedupes behaviour, this component dedupes markup: one `<ul>/<li>` body, parameterised only
 * by the class-prefix `variant`, so the `role="listbox"` / `role="option"` / position-keyed
 * `optionId` / committed-value `aria-selected` semantics stay byte-identical across the family.
 *
 * Entirely index-based, mirroring `useListbox`: the option type `T` never crosses this
 * boundary. The parent hands down parallel `labels`/`keys` arrays derived from ITS list
 * (SingleSelect `sorted`, Combobox `filtered`) plus index-keyed lookups, and receives
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
    labels,
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
    /** display strings, in render order — parallel to `keys`. */
    labels: string[];
    /** stable `v-for` keys (stringified option ids), parallel to `labels`. */
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
    variant: 'ui-select' | 'ui-combobox' | 'ui-multiselect' | 'ui-multicombobox';
    /** accessible name for the listbox popup (`aria-label`). */
    optionsLabel: string;
    /** shown when `labels` is empty. */
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
</script>
