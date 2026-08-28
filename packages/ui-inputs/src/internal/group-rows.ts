/** A row in a grouped listbox — either a non-navigable group header or a navigable option. */
export type GroupRow = {type: 'header'; text: string} | {type: 'option'; index: number};
