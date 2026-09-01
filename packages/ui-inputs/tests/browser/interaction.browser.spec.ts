// Browser-mode INTERACTION spec (real Chromium, real CDP events) — scope: contract +
// interaction only; unit behaviour stays in the happy-dom suite; never duplicate a
// happy-dom spec here.
//
// What only a real browser can prove: disabled controls GENUINELY receive no events (VTU
// `trigger()` dispatches synthetically and would run handlers a real browser suppresses —
// the documented vacuous-assertion trap), Tab order is real, and keyboard walks ride the
// full CDP input pipeline.
import {afterEach, describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, ref} from 'vue';

import Checkbox from '../../src/components/Checkbox.vue';
import Combobox from '../../src/components/Combobox.vue';
import Disclosure from '../../src/components/Disclosure.vue';
import GroupCombobox from '../../src/components/GroupCombobox.vue';
import GroupSelect from '../../src/components/GroupSelect.vue';
import MultiCombobox from '../../src/components/MultiCombobox.vue';
import MultiSelect from '../../src/components/MultiSelect.vue';
import Pressable from '../../src/components/Pressable.vue';
import RadioGroup from '../../src/components/RadioGroup.vue';
import SingleSelect from '../../src/components/SingleSelect.vue';
import Switch from '../../src/components/Switch.vue';
import TextInput from '../../src/components/TextInput.vue';
import '../../styles.css';

type Fruit = {id: number; name: string};

const FRUITS: Fruit[] = [
    {id: 1, name: 'Watermelon'},
    {id: 2, name: 'Apricot'},
    {id: 3, name: 'Mango'},
];
// Sorted render order: Apricot(2), Mango(3), Watermelon(1).

// Grouped controls are CALLER-ordered (no alphabetical sort), so the flat option index runs
// through the groups in declaration order: Watermelon(0), Mango(1), Apricot(2).
const FRUIT_GROUPS: {options: Fruit[]; text: string}[] = [
    {
        text: 'Tropical',
        options: [
            {id: 1, name: 'Watermelon'},
            {id: 3, name: 'Mango'},
        ],
    },
    {text: 'Stone', options: [{id: 2, name: 'Apricot'}]},
];

const cleanupTargets: Element[] = [];
afterEach(() => {
    for (const el of cleanupTargets.splice(0)) el.remove();
});

/**
 * Controlled host with REAL two-way v-model wiring, so a commit round-trips into the DOM
 * (chips render, the trigger text updates) exactly as in a consuming app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
const renderControlled = <V>(component: any, initial: V, props: Record<string, unknown>) => {
    const model = ref(initial);
    render(
        defineComponent(
            () => () =>
                h(component, {
                    options: FRUITS,
                    label: 'name',
                    id: 'fruit',
                    ...props,
                    modelValue: model.value,
                    'onUpdate:modelValue': (value: V) => {
                        model.value = value;
                    },
                }),
        ),
    );
    return model;
};

const menu = () =>
    document.querySelector('.ui-select__menu, .ui-combobox__menu, .ui-multiselect__menu, .ui-multicombobox__menu');
const optionAt = (index: number): HTMLElement => document.querySelectorAll<HTMLElement>('[role="option"]')[index];

/** The grouped-control equivalent of `renderControlled` — feeds `groups`, not `options`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
const renderControlledGroups = <V>(component: any, initial: V, props: Record<string, unknown> = {}) => {
    const model = ref(initial);
    render(
        defineComponent(
            () => () =>
                h(component, {
                    groups: FRUIT_GROUPS,
                    label: 'name',
                    id: 'fruit',
                    ...props,
                    modelValue: model.value,
                    'onUpdate:modelValue': (value: V) => {
                        model.value = value;
                    },
                }),
        ),
    );
    return model;
};

const groupMenu = () => document.querySelector('.ui-groupselect__menu, .ui-groupcombobox__menu');
const groupHeaders = (variant: 'groupselect' | 'groupcombobox'): string[] =>
    [...document.querySelectorAll(`.ui-${variant}__group-header`)].map((h) => h.textContent?.trim() ?? '');

describe('SingleSelect — real keyboard walk', () => {
    it('Tab focuses, Enter opens, ArrowDown navigates, Enter commits, menu closes', async () => {
        const model = renderControlled<number | null>(SingleSelect, null, {});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(trigger);
        expect(menu()).toBeNull();

        await userEvent.keyboard('{Enter}');
        expect(menu()).not.toBeNull();

        await userEvent.keyboard('{ArrowDown}{ArrowDown}');
        expect(trigger.getAttribute('aria-activedescendant')).toBe('fruit-opt-1');

        await userEvent.keyboard('{Enter}');
        expect(model.value).toBe(3); // sorted index 1 = Mango
        expect(menu()).toBeNull();
        expect(trigger.textContent).toContain('Mango');
    });

    it('Escape dismisses without committing', async () => {
        const model = renderControlled<number | null>(SingleSelect, null, {});

        await userEvent.tab();
        await userEvent.keyboard('{ArrowDown}'); // opens
        expect(menu()).not.toBeNull();

        await userEvent.keyboard('{ArrowDown}{Escape}');
        expect(menu()).toBeNull();
        expect(model.value).toBeNull();
    });

    it('a real click outside the control closes the menu', async () => {
        const outside = document.createElement('button');
        outside.type = 'button';
        outside.textContent = 'outside';
        document.body.append(outside);
        cleanupTargets.push(outside);
        renderControlled<number | null>(SingleSelect, null, {});

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        expect(menu()).not.toBeNull();

        await userEvent.click(outside);
        expect(menu()).toBeNull();
    });
});

describe('disabled controls genuinely receive no events', () => {
    it('a forced real click on a disabled trigger dispatches no click — the menu never opens', async () => {
        renderControlled<number | null>(SingleSelect, null, {disabled: true});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;
        expect(trigger.matches(':disabled')).toBe(true);

        // {force: true} skips Playwright's actionability wait but still routes through the
        // real input pipeline — Chromium suppresses click events on disabled controls, so
        // the handler must never run. (A synthetic VTU `trigger('click')` WOULD run it.)
        await userEvent.click(trigger, {force: true});
        expect(menu()).toBeNull();
    });

    it('real Tab skips a disabled trigger entirely, so keyboard input cannot reach it', async () => {
        renderControlled<number | null>(SingleSelect, null, {disabled: true});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.tab();
        expect(document.activeElement).not.toBe(trigger);

        await userEvent.keyboard('{Enter}{ArrowDown} ');
        expect(menu()).toBeNull();
    });

    it('a disabled TextInput receives no typed input', async () => {
        const model = renderControlled<string | null>(TextInput, 'untouched', {
            options: undefined,
            label: undefined,
            disabled: true,
        });
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.matches(':disabled')).toBe(true);

        await userEvent.tab(); // cannot land on the disabled input
        expect(document.activeElement).not.toBe(input);
        await userEvent.keyboard('typed');

        expect(input.value).toBe('untouched');
        expect(model.value).toBe('untouched');
    });

    it('a disabled chip-remove button removes nothing on a forced real click', async () => {
        const model = renderControlled<number[]>(MultiSelect, [2, 3], {disabled: true});
        const remove = document.querySelector<HTMLButtonElement>('.ui-multiselect__chip-remove');
        expect(remove).not.toBeNull();
        expect((remove as HTMLButtonElement).matches(':disabled')).toBe(true);

        await userEvent.click(remove as HTMLButtonElement, {force: true});
        expect(model.value).toEqual([2, 3]);
    });
});

describe('Combobox — real typing filters and commits', () => {
    it('typing filters the list, ArrowDown highlights, Enter commits and closes', async () => {
        const model = renderControlled<number | null>(Combobox, null, {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        expect(menu()).not.toBeNull();
        expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);

        await userEvent.keyboard('ap');
        const options = document.querySelectorAll('[role="option"]');
        expect([...options].map((option) => option.textContent?.trim())).toEqual(['Apricot']);

        await userEvent.keyboard('{ArrowDown}');
        expect(input.getAttribute('aria-activedescendant')).toBe('fruit-opt-0');

        await userEvent.keyboard('{Enter}');
        expect(model.value).toBe(2);
        expect(input.value).toBe('Apricot');
        expect(menu()).toBeNull();
    });

    it('opening a filled combobox shows the FULL list and the first keystroke replaces the label (WR-0576)', async () => {
        renderControlled<number | null>(Combobox, 3, {}); // Mango committed
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.value).toBe('Mango');

        await userEvent.click(input);
        expect(menu()).not.toBeNull();
        // Browse-to-change: the committed label must not narrow the list on open…
        expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
        // …and the label sits fully selected (real Chromium selection, AFTER the click's
        // own caret placement), so typing REPLACES it instead of appending.
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe('Mango'.length);

        await userEvent.keyboard('ap');
        expect(input.value).toBe('ap'); // replaced, not 'Mangoap'
        const options = document.querySelectorAll('[role="option"]');
        expect([...options].map((option) => option.textContent?.trim())).toEqual(['Apricot']);
    });

    it('Escape reverts a half-typed query to the committed label', async () => {
        renderControlled<number | null>(Combobox, 2, {});
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.value).toBe('Apricot');

        await userEvent.click(input);
        await userEvent.keyboard('zzz');
        expect(input.value).toContain('zzz');

        await userEvent.keyboard('{Escape}');
        expect(input.value).toBe('Apricot');
        expect(menu()).toBeNull();
    });
});

describe('MultiSelect — chips, toggle-stays-open, Backspace', () => {
    it('a real click commit toggles membership while the menu STAYS open, and chips render', async () => {
        const model = renderControlled<number[]>(MultiSelect, [], {});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.click(trigger);
        expect(menu()).not.toBeNull();

        await userEvent.click(optionAt(0)); // Apricot
        expect(model.value).toEqual([2]);
        expect(menu()).not.toBeNull(); // toggle-in-place: commit must NOT close

        await userEvent.click(optionAt(1)); // Mango
        expect(model.value).toEqual([2, 3]);
        const chips = document.querySelectorAll('.ui-multiselect__chip');
        expect([...chips].map((chip) => chip.textContent?.trim())).toEqual(['Apricot', 'Mango']);

        await userEvent.click(optionAt(0)); // toggle Apricot back off
        expect(model.value).toEqual([3]);
    });

    it('a real click on a chip-remove button removes that chip and never opens the menu', async () => {
        const model = renderControlled<number[]>(MultiSelect, [2, 3], {});
        expect(document.querySelectorAll('.ui-multiselect__chip')).toHaveLength(2);

        await userEvent.click(document.querySelector('.ui-multiselect__chip-remove') as HTMLElement);
        expect(model.value).toEqual([3]);
        expect(menu()).toBeNull();
    });

    it('Backspace on the focused trigger pops the LAST committed value', async () => {
        const model = renderControlled<number[]>(MultiSelect, [2, 3], {});
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.click(trigger); // real click focuses the trigger (and opens the menu)
        await userEvent.keyboard('{Backspace}');
        expect(model.value).toEqual([2]);

        await userEvent.keyboard('{Backspace}');
        expect(model.value).toEqual([]);

        await userEvent.keyboard('{Backspace}'); // empty model: no-op, no throw
        expect(model.value).toEqual([]);
    });
});

describe('MultiCombobox — input-as-trigger, real focus choreography', () => {
    it('a real Tab focuses the input and focus alone OPENS the list', async () => {
        renderControlled<number[]>(MultiCombobox, [], {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(input);
        expect(menu()).not.toBeNull(); // kendo's searchable choreography — focus is the context
    });

    it('a real click commit toggles membership, STAYS open, clears the query, and REFOCUSES the input', async () => {
        const model = renderControlled<number[]>(MultiCombobox, [], {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        await userEvent.keyboard('ma'); // filter → Mango
        expect(input.value).toBe('ma');

        // A real click lands on a non-focusable <li>, which genuinely drops DOM focus off
        // the input (the part happy-dom cannot prove) — the component must pull it back.
        await userEvent.click(optionAt(0));
        expect(model.value).toEqual([3]); // Mango toggled in
        expect(menu()).not.toBeNull(); // menu stays open
        expect(input.value).toBe(''); // query cleared — the full list is re-offered
        expect(document.activeElement).toBe(input); // focus returned to the input
    });

    it('real Backspace with an empty query pops the last chip', async () => {
        const model = renderControlled<number[]>(MultiCombobox, [2, 3], {});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        await userEvent.keyboard('{Backspace}');
        expect(model.value).toEqual([2]);
    });
});

describe('GroupSelect — real keyboard walk across grouped options', () => {
    it('Enter opens, group headers render, ArrowDown skips headers, Enter commits the flat index', async () => {
        const model = renderControlledGroups<number | null>(GroupSelect, null);
        const trigger = document.getElementById('fruit') as HTMLButtonElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(trigger);
        expect(groupMenu()).toBeNull();

        await userEvent.keyboard('{Enter}');
        expect(groupMenu()).not.toBeNull();
        // Both group headers render, in caller order, above their options.
        expect(groupHeaders('groupselect')).toEqual(['Tropical', 'Stone']);

        // The keyboard walk rides the FLAT index and never lands on a header: Watermelon(0),
        // Mango(1) — the second option, which lives under the same first group.
        await userEvent.keyboard('{ArrowDown}{ArrowDown}');
        expect(trigger.getAttribute('aria-activedescendant')).toBe('fruit-opt-1');

        await userEvent.keyboard('{Enter}');
        expect(model.value).toBe(3); // Mango
        expect(groupMenu()).toBeNull();
        expect(trigger.textContent).toContain('Mango');
    });

    it('a real click commits an option from the SECOND group and closes', async () => {
        const model = renderControlledGroups<number | null>(GroupSelect, null);

        await userEvent.click(document.getElementById('fruit') as HTMLElement);
        expect(groupMenu()).not.toBeNull();

        await userEvent.click(optionAt(2)); // Apricot — the lone Stone-group option
        expect(model.value).toBe(2);
        expect(groupMenu()).toBeNull();
    });
});

describe('GroupCombobox — real typing filters within groups and commits', () => {
    it('typing narrows within groups, empties a group header, ArrowDown highlights, Enter commits', async () => {
        const model = renderControlledGroups<number | null>(GroupCombobox, null);
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.click(input);
        expect(groupMenu()).not.toBeNull();
        expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
        expect(groupHeaders('groupcombobox')).toEqual(['Tropical', 'Stone']);

        await userEvent.keyboard('ma'); // only Mango contains 'ma'
        expect([...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())).toEqual(['Mango']);
        // Stone drained to nothing — its header is gone, never left dangling above no options.
        expect(groupHeaders('groupcombobox')).toEqual(['Tropical']);

        await userEvent.keyboard('{ArrowDown}');
        expect(input.getAttribute('aria-activedescendant')).toBe('fruit-opt-0');

        await userEvent.keyboard('{Enter}');
        expect(model.value).toBe(3); // Mango
        expect(input.value).toBe('Mango');
        expect(groupMenu()).toBeNull();
    });
});

describe('RadioGroup — NATIVE roving focus and arrow-key selection', () => {
    it('Tab enters the group, real arrow keys move focus AND selection, the model follows change', async () => {
        // The component hand-rolls no keyboard code — this walk proves the browser provides
        // the radio-group roving (shared `name`) and that the model mirrors the native
        // change events the arrows fire. Only a real browser can prove this: happy-dom
        // implements no radio roving at all.
        const model = renderControlled<number | null>(RadioGroup, null, {optionLabel: 'name', label: 'Fruit'});
        const radioAt = (index: number) => document.getElementById(`fruit-opt-${index}`) as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(radioAt(0)); // first radio takes the group's tab stop
        expect(model.value).toBeNull(); // focus alone selects nothing

        await userEvent.keyboard('{ArrowDown}'); // native: moves focus AND checks the next radio
        expect(document.activeElement).toBe(radioAt(1));
        expect(model.value).toBe(FRUITS[1].id);

        await userEvent.keyboard('{ArrowRight}'); // horizontal arrows rove too
        expect(document.activeElement).toBe(radioAt(2));
        expect(model.value).toBe(FRUITS[2].id);

        await userEvent.keyboard('{ArrowUp}');
        expect(document.activeElement).toBe(radioAt(1));
        expect(model.value).toBe(FRUITS[1].id);
    });

    it('the checked radio is the single tab stop — Tab leaves the rest of the group alone', async () => {
        renderControlled<number | null>(RadioGroup, FRUITS[2].id, {optionLabel: 'name', label: 'Fruit'});
        const checked = document.getElementById('fruit-opt-2') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(checked); // roving tabindex: straight to the checked one

        await userEvent.tab();
        // One tab stop per group: the next Tab exits rather than visiting the siblings.
        expect(document.activeElement?.getAttribute('type')).not.toBe('radio');
    });
});

describe('checkbox family — disabled controls genuinely receive no events', () => {
    it('a forced real click on a disabled Checkbox never checks it', async () => {
        const model = renderControlled<boolean>(Checkbox, false, {options: undefined, label: 'Accept', disabled: true});
        const input = document.getElementById('fruit') as HTMLInputElement;
        expect(input.matches(':disabled')).toBe(true);

        await userEvent.click(input, {force: true});
        expect(input.checked).toBe(false);
        expect(model.value).toBe(false);
    });

    it('real Tab skips a disabled Switch; keyboard input cannot reach it', async () => {
        const model = renderControlled<boolean>(Switch, false, {
            options: undefined,
            label: 'Notifications',
            disabled: true,
        });
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).not.toBe(input);
        await userEvent.keyboard(' ');
        expect(model.value).toBe(false);
    });

    it('an enabled Switch toggles with a real keyboard Space', async () => {
        const model = renderControlled<boolean>(Switch, false, {options: undefined, label: 'Notifications'});
        const input = document.getElementById('fruit') as HTMLInputElement;

        await userEvent.tab();
        expect(document.activeElement).toBe(input);

        await userEvent.keyboard(' ');
        expect(model.value).toBe(true);
        await userEvent.keyboard(' ');
        expect(model.value).toBe(false);
    });
});

/** Mount a Pressable with a spy click handler; returns the recorded activation count. */
const renderPressable = (props: Record<string, unknown>) => {
    const clicks = ref(0);
    const pressed = ref<boolean | undefined>(props.pressed as boolean | undefined);
    render(
        defineComponent(
            () => () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(Pressable as any, {
                    label: 'Show example',
                    ...props,
                    ...(pressed.value === undefined ? {} : {pressed: pressed.value}),
                    onClick: () => {
                        clicks.value += 1;
                    },
                    'onUpdate:pressed': (value: boolean) => {
                        pressed.value = value;
                    },
                }),
        ),
    );
    return {clicks, pressed};
};

const control = () => document.querySelector('.ui-pressable') as HTMLElement;

describe('Pressable — real keyboard walk', () => {
    it('Tab focuses the native button, and BOTH Enter and Space activate it', async () => {
        const {clicks} = renderPressable({});

        await userEvent.tab();
        expect(document.activeElement).toBe(control()); // focusable with no author tabindex

        await userEvent.keyboard('{Enter}');
        expect(clicks.value).toBe(1);

        await userEvent.keyboard(' ');
        expect(clicks.value).toBe(2);
        // Exactly one activation per key: the component adds no key handling of its own on the
        // native path, so nothing double-fires.
    });

    it('toggle mode flips aria-pressed from the keyboard', async () => {
        const {pressed} = renderPressable({pressed: false});
        expect(control().getAttribute('aria-pressed')).toBe('false');

        await userEvent.tab();
        await userEvent.keyboard('{Enter}');
        expect(pressed.value).toBe(true);
        await expect.poll(() => control().getAttribute('aria-pressed')).toBe('true');

        await userEvent.keyboard(' ');
        expect(pressed.value).toBe(false);
    });

    it('a plain Pressable carries NO aria-pressed — it is an action, not a toggle', async () => {
        renderPressable({});
        expect(control().hasAttribute('aria-pressed')).toBe(false);
    });

    it('real Tab skips a disabled Pressable, and a forced real click activates nothing', async () => {
        const {clicks} = renderPressable({disabled: true});
        expect(control().matches(':disabled')).toBe(true);

        await userEvent.tab();
        expect(document.activeElement).not.toBe(control());
        await userEvent.keyboard('{Enter} ');

        // {force: true} skips the actionability wait but still rides the real input pipeline —
        // Chromium suppresses click on a disabled control.
        await userEvent.click(control(), {force: true});
        expect(clicks.value).toBe(0);
    });

    it('the `as` fallback is reachable and activatable by the SAME keys as the native button', async () => {
        const {clicks} = renderPressable({as: 'div'});
        expect(control().tagName).toBe('DIV');

        await userEvent.tab();
        expect(document.activeElement).toBe(control()); // tabindex="0" put it in the tab order

        await userEvent.keyboard('{Enter}');
        expect(clicks.value).toBe(1);

        // Space activates on keyUP, exactly as a native button does — and only once.
        await userEvent.keyboard(' ');
        expect(clicks.value).toBe(2);
    });

    it('real Tab skips a disabled `as` fallback', async () => {
        const {clicks} = renderPressable({as: 'div', disabled: true});

        await userEvent.tab();
        expect(document.activeElement).not.toBe(control());
        await userEvent.keyboard('{Enter} ');
        expect(clicks.value).toBe(0);
    });
});

/**
 * A fallback nested in an ancestor that has its own @click — the shape a clickable row or card
 * actually has in a consuming app, and the only shape in which the hit-testing defect is visible.
 */
const renderNestedFallback = (props: Record<string, unknown> = {}) => {
    const ancestorClicks = ref(0);
    const controlClicks = ref(0);
    render(
        defineComponent(
            () => () =>
                h(
                    'div',
                    {
                        style: 'padding: 24px',
                        onClick: () => {
                            ancestorClicks.value += 1;
                        },
                    },
                    [
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                        h(Pressable as any, {
                            label: 'Show example',
                            as: 'div',
                            ...props,
                            onClick: () => {
                                controlClicks.value += 1;
                            },
                        }),
                    ],
                ),
        ),
    );
    return {ancestorClicks, controlClicks};
};

/**
 * The platform consequence of the chassis `type`, and it is browser-only on purpose: implicit form
 * submission is a real navigation the layout engine performs, not something a DOM shim can be
 * trusted to model. A consumer's `type="submit"` used to beat the chassis `type="button"` outright
 * — Vue merges fallthrough attrs onto the root AFTER the template bindings and the fallthrough wins
 * — so a `<Pressable>` inside a form submitted it, which is the one thing the component's own
 * docblock promises it never does.
 */
describe('Pressable — a consumer `type` cannot make it submit a surrounding form', () => {
    const renderInForm = (children: (submits: {value: number}) => unknown[]) => {
        const submits = ref(0);
        render(
            defineComponent(
                () => () =>
                    h(
                        'form',
                        {
                            onSubmit: (event: Event) => {
                                event.preventDefault(); // a real submit would navigate the runner away
                                submits.value += 1;
                            },
                        },
                        children(submits),
                    ),
            ),
        );
        return submits;
    };

    it('stays inert as a submitter even when handed type="submit"', async () => {
        const submits = renderInForm(() => [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(Pressable as any, {label: 'Go', type: 'submit'}),
        ]);

        await userEvent.click(control());

        expect(control().getAttribute('type')).toBe('button');
        expect(submits.value).toBe(0);
    });

    it('POSITIVE CONTROL — a plain <button> in the same fixture DOES submit it', async () => {
        // Both halves of the control. It proves the fixture can submit at all (so the zero above
        // means "withheld", not "no form here"), and it is the platform fact that makes the chassis
        // `type` load-bearing: a button in a form with no type of its own IS a submit button.
        const submits = renderInForm(() => [h('button', {id: 'native-submit'}, 'Go')]);

        await userEvent.click(document.getElementById('native-submit') as HTMLElement);

        expect(submits.value).toBe(1);
    });
});

/**
 * The same contest on `Disclosure`'s trigger, and the same browser-only reason: implicit form
 * submission is a real navigation, not something a DOM shim can be trusted to model. The trigger's
 * `type="button"` used to sit ABOVE the `$attrs` spread, where an attribute loses to it — so a
 * consumer's `type="submit"` made a `<Disclosure>` inside a form submit it, while also expanding
 * (measured pre-fix in this browser: `TYPE=submit SUBMITS=1 EXPANDED=true`).
 */
describe('Disclosure — a consumer `type` cannot make its trigger submit a surrounding form', () => {
    const renderInForm = (children: () => unknown[]) => {
        const submits = ref(0);
        render(
            defineComponent(
                () => () =>
                    h(
                        'form',
                        {
                            onSubmit: (event: Event) => {
                                event.preventDefault(); // a real submit would navigate the runner away
                                submits.value += 1;
                            },
                        },
                        children(),
                    ),
            ),
        );
        return submits;
    };

    it('toggles WITHOUT submitting, even when handed type="submit"', async () => {
        const submits = renderInForm(() => [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(Disclosure as any, {id: 'submitting', label: 'Details', type: 'submit'}),
        ]);
        const trigger = document.querySelector('.ui-disclosure__trigger') as HTMLElement;

        await userEvent.click(trigger);

        expect(trigger.getAttribute('type')).toBe('button');
        expect(submits.value).toBe(0);
        // …and it still does its own job. A trigger that submitted nothing because it had stopped
        // working would satisfy the line above just as well.
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('POSITIVE CONTROL — a plain <button> in the same fixture DOES submit it', async () => {
        const submits = renderInForm(() => [h('button', {id: 'disclosure-native-submit'}, 'Go')]);

        await userEvent.click(document.getElementById('disclosure-native-submit') as HTMLElement);

        expect(submits.value).toBe(1);
    });
});

/** What a pointer at the element's own centre would actually target. */
const hitAtCentre = (element: Element): Element | null => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
};

describe('Pressable — a real pointer on a disabled `as` fallback', () => {
    it('activates NEITHER the control nor its ancestor — inert, not transparent', async () => {
        const {ancestorClicks, controlClicks} = renderNestedFallback({disabled: true});

        // The measurement that found the defect. `pointer-events: none` used to take the control
        // out of hit-testing, so this returned the ANCESTOR and a real pointer never touched the
        // control at all — which also meant the component's own disabled guard could never run.
        expect(hitAtCentre(control())).toBe(control());

        // {force: true} skips Playwright's actionability wait (aria-disabled reads as "not
        // enabled") but still rides the real CDP input pipeline, so the browser does its own
        // hit-testing at the point — which is the thing under test.
        await userEvent.click(control(), {force: true});
        expect(controlClicks.value).toBe(0);
        // The harm: an ancestor's handler firing from a click on a control that is disabled.
        expect(ancestorClicks.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same fixture, enabled, reaches both handlers', async () => {
        const {ancestorClicks, controlClicks} = renderNestedFallback();

        expect(hitAtCentre(control())).toBe(control());

        await userEvent.click(control());
        // Without this, the zeros above would be consistent with a fixture that wires nothing.
        expect(controlClicks.value).toBe(1);
        expect(ancestorClicks.value).toBe(1);
    });
});

/**
 * The shape the nested-key defect actually harms: a clickable row (the `as` fallback) with an
 * inline control inside it. Only a real browser can settle this one — happy-dom performs neither
 * the native Enter-to-click translation on the nested button nor the text insertion on the nested
 * input, so it can prove the event was left alone but not that the field still WORKS.
 */
const renderFallbackWithChildren = () => {
    const rowClicks = ref(0);
    const childClicks = ref(0);
    render(
        defineComponent(
            () => () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(
                    Pressable as any,
                    {
                        as: 'div',
                        label: 'Row',
                        onClick: () => {
                            rowClicks.value += 1;
                        },
                    },
                    {
                        default: () => [
                            h('input', {id: 'nested-filter'}),
                            h('button', {
                                id: 'nested-remove',
                                type: 'button',
                                onClick: () => {
                                    childClicks.value += 1;
                                },
                            }),
                        ],
                    },
                ),
        ),
    );
    return {rowClicks, childClicks};
};

describe('Pressable — a real keyboard inside an `as` fallback', () => {
    const filter = () => document.getElementById('nested-filter') as HTMLInputElement;
    const remove = () => document.getElementById('nested-remove') as HTMLButtonElement;

    it("a nested <input> keeps its SPACEBAR — the row must not translate a child's keys", async () => {
        // The headline harm, end to end through the real CDP input pipeline. Unguarded, every
        // Space keydown reaching the root was preventDefault()ed AND converted into an activation
        // of the row: the field could not hold a space, and the row fired on every attempt.
        const {rowClicks} = renderFallbackWithChildren();

        // Focus, never click: a real pointer click on the child would bubble to the row's own
        // @click and confound the count with an activation that has nothing to do with keys.
        filter().focus();
        await userEvent.keyboard('a b');

        expect(filter().value).toBe('a b'); // the space actually landed in the field
        expect(rowClicks.value).toBe(0); // …and nothing activated the row
    });

    it('gives Enter on a nested <button> to the BUTTON — and the row then sees exactly what a MOUSE click gives it', async () => {
        // Two halves, and the scope is worth stating precisely. (a) The child's own activation is
        // restored: unguarded, the row preventDefault()ed the Enter, so the button's handler never
        // ran at ALL — measured 0 — and the row activated instead through the row's own synthetic
        // click. This is the half happy-dom structurally cannot show. (b) The row still counting an
        // activation is NOT the same defect and is not this component's to suppress: it is the
        // child's real click BUBBLING, exactly as a mouse click on that button does. A consumer who
        // does not want it writes `@click.stop` on the child. Asserted as an equivalence against
        // the mouse rather than as a bare number, so the two causes cannot be confused.
        const {rowClicks, childClicks} = renderFallbackWithChildren();

        remove().focus();
        await userEvent.keyboard('{Enter}');
        expect(childClicks.value).toBe(1);
        expect(rowClicks.value).toBe(1); // the bubbled click, not a translated key

        await userEvent.click(remove());
        expect(childClicks.value).toBe(2);
        // One activation apiece, keyboard and pointer alike — the equivalence, stated as two
        // concrete numbers so it cannot hold vacuously at zero.
        expect(rowClicks.value).toBe(2);
    });

    it('POSITIVE CONTROL — the ROW itself still activates on Enter and Space', async () => {
        // Same fixture, same focusable children, focus on the root. Without this the two zeros
        // above are equally consistent with a fallback that has stopped answering the keyboard.
        const {rowClicks} = renderFallbackWithChildren();

        control().focus();
        expect(document.activeElement).toBe(control());

        await userEvent.keyboard('{Enter}');
        expect(rowClicks.value).toBe(1);

        await userEvent.keyboard(' ');
        expect(rowClicks.value).toBe(2);
    });
});

describe('Disclosure — real keyboard walk', () => {
    const trigger = () => document.getElementById('details') as HTMLButtonElement;
    const panel = () => document.getElementById('details-panel') as HTMLElement;

    const renderDisclosure = (props: Record<string, unknown> = {}) => {
        const expanded = ref(false);
        render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(
                        Disclosure as any,
                        {
                            id: 'details',
                            label: 'Details',
                            headingLevel: 2,
                            ...props,
                            expanded: expanded.value,
                            'onUpdate:expanded': (value: boolean) => {
                                expanded.value = value;
                            },
                        },
                        {default: () => h('p', 'Panel body')},
                    ),
            ),
        );
        return expanded;
    };

    it('Tab focuses the trigger, Enter and Space flip aria-expanded and show/hide the region', async () => {
        const expanded = renderDisclosure();

        // The heading is NOT the tab stop — the button inside it is.
        await userEvent.tab();
        expect(document.activeElement).toBe(trigger());
        expect(document.activeElement?.tagName).toBe('BUTTON');

        expect(trigger().getAttribute('aria-expanded')).toBe('false');
        expect(getComputedStyle(panel()).display).toBe('none');

        await userEvent.keyboard('{Enter}');
        expect(expanded.value).toBe(true);
        await expect.poll(() => trigger().getAttribute('aria-expanded')).toBe('true');
        expect(getComputedStyle(panel()).display).not.toBe('none');

        await userEvent.keyboard(' ');
        expect(expanded.value).toBe(false);
        await expect.poll(() => trigger().getAttribute('aria-expanded')).toBe('false');
        expect(getComputedStyle(panel()).display).toBe('none');
    });

    it('the heading itself is inert — only the button it contains is reachable', async () => {
        renderDisclosure();
        const heading = document.querySelector('h2') as HTMLElement;

        // The defect being replaced is a heading that behaves as a control: not focusable, and a
        // real click on the heading padding (outside the button) toggles nothing.
        heading.focus();
        expect(document.activeElement).not.toBe(heading);
    });

    it('real Tab skips a disabled Disclosure trigger', async () => {
        const expanded = renderDisclosure({disabled: true});

        await userEvent.tab();
        expect(document.activeElement).not.toBe(trigger());
        await userEvent.keyboard('{Enter} ');
        expect(expanded.value).toBe(false);
    });
});

/**
 * The consumer's fall-through `@click` on a DISABLED Disclosure trigger. This describe lives in the
 * browser suite and CANNOT be moved into the happy-dom one: happy-dom does not run listeners for a
 * `dispatchEvent`-delivered click on a disabled `<button>`, so it reports this defect as ABSENT —
 * with a working positive control, which is what makes it dangerous. Chromium runs them (measured
 * on the unfixed code: enabled=1, disabled=1). A happy-dom version of this spec would pass on the
 * broken component and pin the wrong behaviour permanently.
 *
 * `dispatchEvent` rather than `userEvent.click` is likewise deliberate: Chromium's real input
 * pipeline never produces a click on a disabled native button at all, so a forced user click leaves
 * BOTH arms at zero and asserts nothing about the merge order. The reachable path is the
 * programmatic one, and that is the one the guard has to close.
 */
describe("Disclosure — a disabled trigger and the consumer's fall-through @click", () => {
    const trigger = () => document.getElementById('leaky') as HTMLButtonElement;

    const renderWithConsumerClick = (disabled: boolean) => {
        const consumerClicks = ref(0);
        const expanded = ref(false);
        render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(
                        Disclosure as any,
                        {
                            id: 'leaky',
                            label: 'Details',
                            disabled,
                            onClick: () => {
                                consumerClicks.value += 1;
                            },
                            expanded: expanded.value,
                            'onUpdate:expanded': (value: boolean) => {
                                expanded.value = value;
                            },
                        },
                        {default: () => h('p', 'Panel body')},
                    ),
            ),
        );
        return {consumerClicks, expanded};
    };

    const dispatchClick = (element: Element): void => {
        element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    };

    it('runs NEITHER toggle nor the consumer handler — inert, not merely un-toggling', () => {
        const {consumerClicks, expanded} = renderWithConsumerClick(true);

        dispatchClick(trigger());

        // The defect: `v-bind="$attrs"` merged ahead of `@click` put the consumer's handler FIRST,
        // so it ran before `toggle` could stop the event. Our handler must be merged first and stop.
        expect(consumerClicks.value).toBe(0);
        expect(expanded.value).toBe(false);
    });

    it('POSITIVE CONTROL — the same fixture, enabled, runs BOTH', async () => {
        const {consumerClicks, expanded} = renderWithConsumerClick(false);

        dispatchClick(trigger());

        // Without this arm the zeros above are consistent with a fixture that wires nothing, or
        // with a stop that swallows the consumer's handler unconditionally.
        expect(consumerClicks.value).toBe(1);
        expect(expanded.value).toBe(true);
        await expect.poll(() => trigger().getAttribute('aria-expanded')).toBe('true');
    });
});

/**
 * `.ui-pressable` sets `display: inline-flex`, which is right for a button and wrong for the one
 * `as` target the documentation puts first: a clickable `<tr>` stops being a table row and its
 * cells lose their table boxes. Only a real layout engine can settle this — happy-dom computes no
 * used `display` at all, so the happy-dom suite can prove the marker class is applied and nothing
 * about what it does.
 */
describe('Pressable — `as` must not repaint a structural display', () => {
    const renderRows = () => {
        render(
            defineComponent(
                () => () =>
                    h('table', [
                        h('tbody', [
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                            h(
                                Pressable as any,
                                {as: 'tr', label: 'Row', id: 'row'},
                                {default: () => [h('td', {id: 'cell'}, 'Cell')]},
                            ),
                        ]),
                    ]),
            ),
        );
        return {
            row: document.getElementById('row') as HTMLElement,
            cell: document.getElementById('cell') as HTMLElement,
        };
    };

    it('leaves as="tr" a table row, and its cells table cells', () => {
        const {row, cell} = renderRows();

        expect(row.tagName).toBe('TR');
        // The defect: `inline-flex` here takes the row out of the table's layout algorithm and the
        // cell's own `display: table-cell` is computed against a flex container instead.
        expect(getComputedStyle(row).display).toBe('table-row');
        expect(getComputedStyle(cell).display).toBe('table-cell');
        // …and the chassis is still ON it — this is a display carve-out, not an opt-out.
        expect(getComputedStyle(row).cursor).toBe('pointer');
    });

    it('POSITIVE CONTROL — the ordinary button and as="div" keep the chassis display', () => {
        renderPressable({});
        expect(getComputedStyle(control()).display).toBe('inline-flex');
    });

    it('POSITIVE CONTROL — as="div" keeps it too', () => {
        renderPressable({as: 'div'});
        expect(getComputedStyle(control()).display).toBe('inline-flex');
    });
});

/**
 * Disabled inertness against the PLATFORM's own behaviour, which is the half no happy-dom spec can
 * see: a real anchor's navigation, a real pointer's hit-testing, and real keys arriving after a
 * real mouse-focus. Each arm carries its enabled positive control in the same fixture — the
 * disabled arms are all zeros, and a zero proves nothing beside a fixture that wires nothing.
 *
 * `dispatchEvent` rather than `userEvent.click` on the arms that assert a stop: Chromium's real
 * input pipeline produces no click on a disabled NATIVE button at all, so a forced user click
 * leaves both arms at zero and asserts nothing.
 */
describe('Pressable — a disabled control against real platform behaviour', () => {
    const NAV = '#pressable-nav';

    afterEach(() => {
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    });

    const renderAnchor = (disabled: boolean) => {
        const clicks = ref(0);
        render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Pressable as any, {
                        as: 'a',
                        href: NAV,
                        label: 'Go',
                        disabled,
                        onClick: () => {
                            clicks.value += 1;
                        },
                    }),
            ),
        );
        return clicks;
    };

    const dispatchClick = (element: Element): boolean =>
        element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));

    it('does not FOLLOW an as="a" href while disabled — the fallback has no native disabled', () => {
        const clicks = renderAnchor(true);

        const notCancelled = dispatchClick(control());

        expect(notCancelled).toBe(false); // preventDefault() ran
        expect(location.hash).toBe(''); // …and the browser therefore did not navigate
        expect(clicks.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same anchor, enabled, DOES navigate and run the handler', () => {
        const clicks = renderAnchor(false);

        dispatchClick(control());

        // Without this the assertions above hold on an anchor that never navigates at all, and the
        // whole finding would read as fixed on code that never had it.
        expect(location.hash).toBe(NAV);
        expect(clicks.value).toBe(1);
    });

    it('lets a real Escape reach an ANCESTOR while disabled — inert is not deaf for everyone', async () => {
        // Only a real browser closes this chain: the disabled fallback keeps `tabindex="-1"` and
        // the stylesheet keeps it hit-testable, so a real pointer FOCUSES it (happy-dom cannot
        // prove that), and the key then originates on the control itself — no interactive
        // descendant involved. Stopping propagation to silence the consumer's own handler used to
        // kill this climb too, so a dialog listening for Escape above a disabled row never closed.
        const ancestor: KeyboardEvent[] = [];
        const record = (event: Event) => ancestor.push(event as KeyboardEvent);
        document.addEventListener('keydown', record);

        try {
            const {clicks} = renderPressable({as: 'div', disabled: true});
            const element = control();

            await userEvent.click(element, {force: true});
            expect(document.activeElement).toBe(element); // mouse-focusable at tabindex="-1"

            await userEvent.keyboard('{Escape}');

            expect(ancestor.map((event) => event.key)).toContain('Escape');
            expect(clicks.value).toBe(0); // …and the control itself stayed inert
        } finally {
            document.removeEventListener('keydown', record);
        }
    });

    const renderWithInteractiveChild = (disabled: boolean) => {
        const childClicks = ref(0);
        render(
            defineComponent(
                () => () =>
                    h(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                        Pressable as any,
                        {as: 'div', label: 'Row', disabled},
                        {
                            default: () => [
                                h('a', {id: 'child-link', href: NAV}, 'Open'),
                                h('button', {
                                    id: 'child-button',
                                    type: 'button',
                                    onClick: () => {
                                        childClicks.value += 1;
                                    },
                                }),
                            ],
                        },
                    ),
            ),
        );
        return childClicks;
    };

    it('is inert for its whole SUBTREE — a real pointer on a nested link or button does nothing', async () => {
        // The leak a bubble-phase stop on the root cannot close: the child's own handler runs on the
        // way UP, before the root ever sees the event, and the anchor's navigation is a default
        // action no `stopImmediatePropagation()` withholds.
        const childClicks = renderWithInteractiveChild(true);
        const link = document.getElementById('child-link') as HTMLElement;
        const button = document.getElementById('child-button') as HTMLElement;

        // The children are still hit-testable — the fix is a guard, not `pointer-events: none`.
        expect(hitAtCentre(link)).toBe(link);

        await userEvent.click(link, {force: true});
        await userEvent.click(button, {force: true});

        expect(location.hash).toBe('');
        expect(childClicks.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same children, enabled, navigate and fire', async () => {
        const childClicks = renderWithInteractiveChild(false);
        const link = document.getElementById('child-link') as HTMLElement;
        const button = document.getElementById('child-button') as HTMLElement;

        await userEvent.click(button);
        expect(childClicks.value).toBe(1);

        await userEvent.click(link);
        expect(location.hash).toBe(NAV);
    });

    const renderWithKeyHandlers = (disabled: boolean) => {
        const keydowns = ref(0);
        const keyups = ref(0);
        render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Pressable as any, {
                        as: 'div',
                        label: 'Row',
                        disabled,
                        onKeydown: () => {
                            keydowns.value += 1;
                        },
                        onKeyup: () => {
                            keyups.value += 1;
                        },
                    }),
            ),
        );
        return {keydowns, keyups};
    };

    it('is deaf to keys after a real MOUSE focus — tabindex="-1" is still mouse-focusable', async () => {
        // The reachability argument, measured rather than assumed: a disabled fallback is out of the
        // TAB order but a pointer press still focuses it, and the control deliberately stays in
        // hit-testing — so the consumer's fall-through key handlers are reachable on a control that
        // is supposed to be inert.
        const {keydowns, keyups} = renderWithKeyHandlers(true);

        await userEvent.click(control(), {force: true});
        expect(document.activeElement).toBe(control()); // the reachability half

        await userEvent.keyboard('{Enter} a');

        expect(keydowns.value).toBe(0);
        expect(keyups.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same handlers run on the ENABLED control', async () => {
        const {keydowns, keyups} = renderWithKeyHandlers(false);

        await userEvent.click(control());
        expect(document.activeElement).toBe(control());

        await userEvent.keyboard('{Enter}');

        expect(keydowns.value).toBeGreaterThan(0);
        expect(keyups.value).toBeGreaterThan(0);
    });
});

/**
 * The same disabled-key leak one path over: a key that reaches the control from a focusable
 * DESCENDANT. The origin check used to run first and bare-return, so the consumer's fall-through
 * `@keydown`/`@keyup` fired on an inert control exactly as it did for root-origin keys.
 *
 * Browser-only, and for two independent reasons. The reachability half is a platform fact —
 * `tabindex="-1"` is out of the tab order but still MOUSE-focusable, which is what puts focus
 * inside a disabled control in the first place — and happy-dom neither hit-tests nor focuses on a
 * pointer press. The "child keeps its own keys" half needs a layout engine to insert a character;
 * happy-dom can show the event was left alone but not that the field still WORKS.
 */
describe('Pressable — a disabled control and a focusable DESCENDANT', () => {
    const renderDisabledRowWithChildren = (disabled: boolean) => {
        const keydowns = ref(0);
        const keyups = ref(0);
        render(
            defineComponent(
                () => () =>
                    h(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                        Pressable as any,
                        {
                            as: 'div',
                            label: 'Row',
                            disabled,
                            onKeydown: () => {
                                keydowns.value += 1;
                            },
                            onKeyup: () => {
                                keyups.value += 1;
                            },
                        },
                        {default: () => [h('input', {id: 'inner-filter'})]},
                    ),
            ),
        );
        return {keydowns, keyups, filter: document.getElementById('inner-filter') as HTMLInputElement};
    };

    it("gives the consumer NOTHING while keeping the child's own keys — real pointer, real keyboard", async () => {
        const {keydowns, keyups, filter} = renderDisabledRowWithChildren(true);

        // Reachability, measured rather than argued: a real pointer press puts focus INSIDE a
        // disabled control, because the control stays in hit-testing and the child is focusable.
        await userEvent.click(filter, {force: true});
        expect(document.activeElement).toBe(filter);

        await userEvent.keyboard('a b');

        // The guard withholds the consumer's handler and touches the event itself not at all, so
        // the field still works. This is the assertion that keeps the fix from being "disable the
        // subtree's keyboard".
        expect(filter.value).toBe('a b');
        // …and none of it reached the consumer's handlers on the inert row.
        expect(keydowns.value).toBe(0);
        expect(keyups.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same fixture, enabled, reaches the consumer AND types', async () => {
        const {keydowns, keyups, filter} = renderDisabledRowWithChildren(false);

        await userEvent.click(filter);
        await userEvent.keyboard('a b');

        // Without this arm the two zeros above are equally consistent with a fixture whose
        // handlers were never wired, or with a row that stopped answering the keyboard entirely.
        expect(filter.value).toBe('a b');
        expect(keydowns.value).toBeGreaterThan(0);
        expect(keyups.value).toBeGreaterThan(0);
    });

    const dispatchKey = (element: Element, type: 'keydown' | 'keyup', value: string): void => {
        element.dispatchEvent(new KeyboardEvent(type, {key: value, bubbles: true, cancelable: true}));
    };

    it('withholds the consumer on a PROGRAMMATIC descendant key too — the leak is the handler, not the input pipeline', () => {
        const {keydowns, keyups, filter} = renderDisabledRowWithChildren(true);

        dispatchKey(filter, 'keydown', 'Enter');
        dispatchKey(filter, 'keyup', 'Enter');
        dispatchKey(filter, 'keydown', ' ');
        dispatchKey(filter, 'keyup', ' ');

        expect(keydowns.value).toBe(0);
        expect(keyups.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same dispatches reach the consumer while enabled', () => {
        const {keydowns, keyups, filter} = renderDisabledRowWithChildren(false);

        dispatchKey(filter, 'keydown', 'Enter');
        dispatchKey(filter, 'keyup', 'Enter');

        expect(keydowns.value).toBe(1);
        expect(keyups.value).toBe(1);
    });
});
