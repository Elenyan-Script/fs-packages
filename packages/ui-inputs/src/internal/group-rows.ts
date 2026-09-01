/**
 * A row in a grouped listbox — a named group header, a headerless-group boundary, or a
 * navigable option. The `boundary` marker opens a new headerless run so a `header:false`
 * group that follows another group renders flat instead of being absorbed into the prior
 * group's `role="group"`.
 */
export type GroupRow = {type: 'header'; text: string} | {type: 'boundary'} | {type: 'option'; index: number};

/**
 * Turn caller-ordered groups into the flat header/boundary/option row sequence `OptionList`
 * lays out — the single-site encoding of the `GroupRow` invariant, shared by `GroupSelect`
 * (raw `groups`) and `GroupCombobox` (its filtered groups) so the boundary rule can never
 * drift between the two again.
 *
 * Only `options.length`, `text`, and `header` are read — never an option's contents — so the
 * caller keeps ownership of the option type. Option `index` runs across ALL groups in order,
 * matching the flat index every consumer (`pointer`, `isSelected`, the `#option` slot) keys on.
 *
 * A group with no options emits NOTHING: an empty group whose header rendered would confuse
 * users. (`GroupCombobox` pre-filters empty groups, so that guard is a no-op on its path.)
 */
export const buildGroupRows = (
    groups: readonly {options: readonly unknown[]; text: string; header?: boolean}[],
): GroupRow[] => {
    const rows: GroupRow[] = [];
    let index = 0;
    for (const group of groups) {
        if (!group.options.length) continue;
        // A named group emits its header; a headerless group emits a boundary so its options
        // never fold into the preceding group's role="group".
        rows.push(group.header !== false ? {type: 'header', text: group.text} : {type: 'boundary'});
        for (const _ of group.options) {
            rows.push({type: 'option', index: index++});
        }
    }
    return rows;
};
