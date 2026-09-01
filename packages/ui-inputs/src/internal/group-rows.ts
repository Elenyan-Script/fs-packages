/**
 * A row in a grouped listbox — a named group header, a headerless-group boundary, or a
 * navigable option. The `boundary` marker opens a new headerless run so a `header:false`
 * group that follows another group renders flat instead of being absorbed into the prior
 * group's `role="group"`.
 */
export type GroupRow = {type: 'header'; text: string} | {type: 'boundary'} | {type: 'option'; index: number};
