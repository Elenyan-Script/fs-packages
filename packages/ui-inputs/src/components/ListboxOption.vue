<template>
    <li
        :id="optionId(index)"
        :class="[`${variant}__option`, {'is-active': active, 'is-muted': muted}]"
        role="option"
        :aria-selected="selected"
        @mouseover="emit('hover', index)"
        @click="emit('commit', index)"
    >
        <slot />
    </li>
</template>

<script setup lang="ts">
/**
 * ONE selectable listbox option `<li>` — INTERNAL, not barrel-exported. This is the single
 * source of the option-row markup shared by `OptionList` (flat) and `GroupOptionList`
 * (grouped + headerless runs): the `role="option"` / position-keyed `id` / committed-value
 * `aria-selected` / `is-active`+`is-muted` chrome / `hover`+`commit` wiring all live HERE, so
 * an a11y or markup fix to an option lands once instead of in every listbox body.
 *
 * Index-based like `useListbox` and its listbox parents: the option type `T` never crosses
 * this boundary. The owner passes the index plus the same index-keyed lookups it feeds the
 * listbox (`optionId`, and the resolved `active`/`muted`/`selected` flags) and gets `hover`
 * (pointer move) / `commit` (activation) back by index — it stays the sole owner of `pointer`
 * and the commit disposition. Per-option content flows through the default slot; the parent
 * keeps the highlight/selection chrome on this `<li>`, outside the slot, so custom content
 * never re-creates it.
 */
const {index, variant, optionId, active, muted, selected} = defineProps<{
    /** the option's position in the listbox index space — its identity for id/hover/commit. */
    index: number;
    /** class prefix of the owning control — the only visual divergence across the family. */
    variant:
        | 'ui-select'
        | 'ui-combobox'
        | 'ui-multiselect'
        | 'ui-multicombobox'
        | 'ui-groupselect'
        | 'ui-groupcombobox';
    /** position-keyed option-id scheme from `useListbox` (`${id}-opt-${index}`). */
    optionId: (index: number) => string;
    /** whether this option holds the highlight (`.is-active`) — the pointer, owned by the parent. */
    active: boolean;
    /** whether this option is visually MUTED (`.is-muted`) — still committable. */
    muted: boolean;
    /** whether this option is the COMMITTED value (`aria-selected`), never the pointer. */
    selected: boolean;
}>();

const emit = defineEmits<{hover: [index: number]; commit: [index: number]}>();
</script>
