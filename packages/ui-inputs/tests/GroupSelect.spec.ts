// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it} from 'vitest';
import {h} from 'vue';

import GroupSelect from '../src/components/GroupSelect.vue';
import {groupMenu} from './find-menu';

type Fruit = {id: number; name: string};

const GROUPS = [
    {
        options: [
            {id: 1, name: 'Mango'},
            {id: 2, name: 'Kiwi'},
        ],
        text: 'Tropical',
    },
    {
        options: [
            {id: 3, name: 'Apricot'},
            {id: 4, name: 'Lime'},
        ],
        text: 'Stone',
    },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC + VTU mount inference
const mountGroupSelect = (props: Record<string, unknown>, slots?: Record<string, unknown>) =>
    mount(GroupSelect as any, {
        props: {groups: GROUPS, label: 'name', id: 'fruit', modelValue: null, ...props},
        slots,
        attachTo: document.body,
    });

afterEach(() => {
    document.body.innerHTML = '';
});

describe('GroupSelect', () => {
    it('renders a combobox button with placeholder and closed aria state', () => {
        const wrapper = mountGroupSelect({});
        const button = wrapper.find('button');

        expect(button.attributes('role')).toBe('combobox');
        expect(button.attributes('aria-expanded')).toBe('false');
        expect(button.attributes('aria-haspopup')).toBe('listbox');
        expect(button.find('.ui-groupselect__placeholder').text()).toBe('Select…');
        expect(button.attributes('aria-controls')).toBeUndefined();
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('opens on click and renders group headers with role="group" + aria-label and options with role="option"', async () => {
        const wrapper = mountGroupSelect({});
        await wrapper.find('button').trigger('click');

        expect(wrapper.find('button').attributes('aria-expanded')).toBe('true');
        const m = groupMenu(wrapper);
        expect(m.exists()).toBe(true);

        // APG listbox grouping: role="group" + aria-label live on the inner <ul> so the group
        // name is announced to AT; the wrapper <li> carries role="presentation" (html-aria
        // disallows role="group" on <li>). The visual header span is aria-hidden.
        const groupWrappers = m.findAll('.ui-groupselect__group');
        expect(groupWrappers.map((g) => g.attributes('role'))).toEqual(['presentation', 'presentation']);
        const groupUls = groupWrappers.map((g) => g.find('ul'));
        expect(groupUls.map((ul) => ul.attributes('role'))).toEqual(['group', 'group']);
        expect(groupUls.map((ul) => ul.attributes('aria-label'))).toEqual(['Tropical', 'Stone']);

        const headers = m.findAll('.ui-groupselect__group-header');
        expect(headers.map((h) => h.attributes('aria-hidden'))).toEqual(['true', 'true']);

        const options = m.findAll('.ui-groupselect__option');
        expect(options.every((o) => o.attributes('role') === 'option')).toBe(true);
    });

    it('intersperse group headers between their option rows', async () => {
        const wrapper = mountGroupSelect({});
        await wrapper.find('button').trigger('click');

        const m = groupMenu(wrapper);
        const items = m.findAll('li');
        // Tropical group-li, Mango, Kiwi, Stone group-li, Apricot, Lime
        expect(items[0].classes()).toContain('ui-groupselect__group');
        expect(items[1].classes()).toContain('ui-groupselect__option');
        expect(items[2].classes()).toContain('ui-groupselect__option');
        expect(items[3].classes()).toContain('ui-groupselect__group');
        expect(items[4].classes()).toContain('ui-groupselect__option');
        expect(items[5].classes()).toContain('ui-groupselect__option');
    });

    it('commits the clicked option, emits update:modelValue, and closes', async () => {
        const wrapper = mountGroupSelect({});
        await wrapper.find('button').trigger('click');

        const options = groupMenu(wrapper).findAll('.ui-groupselect__option');
        await options[2].trigger('click'); // Apricot (index 2)
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]);
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('shows the committed value label in the trigger, not the placeholder', () => {
        const wrapper = mountGroupSelect({modelValue: 2});
        expect(wrapper.find('.ui-groupselect__value').text()).toBe('Kiwi');
        expect(wrapper.find('.ui-groupselect__placeholder').exists()).toBe(false);
    });

    it('commits null on clear entry click', async () => {
        const wrapper = mountGroupSelect({clearLabel: 'None', modelValue: 1});
        await wrapper.find('button').trigger('click');

        await groupMenu(wrapper).find('.ui-groupselect__clear').trigger('click');
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('commits the highlighted option on Enter and closes; Escape closes without commit', async () => {
        const wrapper = mountGroupSelect({});
        const root = wrapper.find('.ui-groupselect');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        await root.trigger('keydown', {key: 'ArrowDown'}); // → index 0 (Mango)
        await root.trigger('keydown', {key: 'Enter'});

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1]); // Mango
        expect(groupMenu(wrapper).exists()).toBe(false);

        // Reopen and Escape
        await root.trigger('keydown', {key: 'ArrowDown'});
        expect(groupMenu(wrapper).exists()).toBe(true);
        await root.trigger('keydown', {key: 'Escape'});
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('Home/End jump to first and last option', async () => {
        const wrapper = mountGroupSelect({});
        const root = wrapper.find('.ui-groupselect');
        const button = wrapper.find('button');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        await root.trigger('keydown', {key: 'End'});
        expect(button.attributes('aria-activedescendant')).toBe('fruit-opt-3'); // Lime (last)
        await root.trigger('keydown', {key: 'Home'});
        expect(button.attributes('aria-activedescendant')).toBe('fruit-opt-0'); // Mango (first)
    });

    it('aria-activedescendant tracks the pointer across options and skips headers', async () => {
        const wrapper = mountGroupSelect({});
        const root = wrapper.find('.ui-groupselect');
        const button = wrapper.find('button');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open, pointer -1
        expect(button.attributes('aria-activedescendant')).toBeUndefined();

        await root.trigger('keydown', {key: 'ArrowDown'}); // → 0 (Mango)
        expect(button.attributes('aria-activedescendant')).toBe('fruit-opt-0');

        await root.trigger('keydown', {key: 'ArrowDown'}); // → 1 (Kiwi)
        expect(button.attributes('aria-activedescendant')).toBe('fruit-opt-1');

        // Headers have no id and are role="presentation" — the pointer only lands on options.
        const headerIds = groupMenu(wrapper)
            .findAll('.ui-groupselect__group-header')
            .map((h) => h.attributes('id'));
        expect(headerIds.every((id) => id === undefined)).toBe(true);
    });

    it('aria-selected marks the committed option, not the hovered one', async () => {
        const wrapper = mountGroupSelect({modelValue: 1}); // Mango
        await wrapper.find('button').trigger('click');

        const options = groupMenu(wrapper).findAll('.ui-groupselect__option');
        expect(options.map((o) => o.attributes('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);

        await options[2].trigger('mouseover'); // hover Apricot
        expect(options.map((o) => o.attributes('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    });

    it('does not open when disabled, by click or by keyboard', async () => {
        const wrapper = mountGroupSelect({disabled: true});
        await wrapper.find('button').trigger('click');
        expect(groupMenu(wrapper).exists()).toBe(false);

        await wrapper.find('.ui-groupselect').trigger('keydown', {key: 'ArrowDown'});
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('propagates required, invalid, and describedby to the trigger', () => {
        const wrapper = mountGroupSelect({required: true, invalid: true, describedby: 'fruit-error'});
        const button = wrapper.find('button');

        expect(button.attributes('aria-required')).toBe('true');
        expect(button.attributes('aria-invalid')).toBe('true');
        expect(button.attributes('aria-describedby')).toBe('fruit-error');
    });

    it('shows emptyText when all groups have no options', async () => {
        const wrapper = mountGroupSelect({groups: [], emptyText: 'Nothing here'});
        await wrapper.find('button').trigger('click');

        expect(groupMenu(wrapper).find('.ui-groupselect__empty').text()).toBe('Nothing here');
        expect(groupMenu(wrapper).findAll('.ui-groupselect__option')).toHaveLength(0);
    });

    it('omits the header row for a group with header=false but still renders its options', async () => {
        const wrapper = mountGroupSelect({
            groups: [
                {options: [{id: 1, name: 'Mango'}], text: 'Tropical', header: false},
                {options: [{id: 2, name: 'Apricot'}], text: 'Stone'},
            ],
        });
        await wrapper.find('button').trigger('click');

        const headers = groupMenu(wrapper).findAll('.ui-groupselect__group-header');
        expect(headers.map((h) => h.text())).toEqual(['Stone']); // only the second header
        expect(groupMenu(wrapper).findAll('.ui-groupselect__option')).toHaveLength(2);
    });

    it('renders mutedOptions with .is-muted and keeps them committable', async () => {
        const wrapper = mountGroupSelect({mutedOptions: [2]}); // Kiwi
        await wrapper.find('button').trigger('click');

        const options = groupMenu(wrapper).findAll('.ui-groupselect__option');
        expect(options.map((o) => o.classes().includes('is-muted'))).toEqual([false, true, false, false]);

        await options[1].trigger('click'); // Kiwi commits anyway
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2]);
    });

    it('#option slot receives correct typed props', async () => {
        const wrapper = mountGroupSelect(
            {modelValue: 1},
            {
                option: (props: {option: Fruit; index: number; selected: boolean; active: boolean}) =>
                    h('b', {class: 'swatch'}, `${props.option.name}#${props.index}${props.selected ? '*' : ''}`),
            },
        );
        await wrapper.find('button').trigger('click');

        const swatches = groupMenu(wrapper)
            .findAll('.swatch')
            .map((el) => el.text());
        expect(swatches).toEqual(['Mango#0*', 'Kiwi#1', 'Apricot#2', 'Lime#3']);
    });

    it('clear entry renders outside option index, aria-selected true when model null', async () => {
        const wrapper = mountGroupSelect({clearLabel: 'None'});
        await wrapper.find('button').trigger('click');

        const clear = groupMenu(wrapper).find('.ui-groupselect__clear');
        expect(clear.text()).toBe('None');
        expect(clear.attributes('id')).toBe('fruit-clear');
        expect(clear.attributes('aria-selected')).toBe('true'); // model is null

        // Options keep their own index space independent of the clear entry.
        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupselect__option')
                .map((o) => o.attributes('id')),
        ).toEqual(['fruit-opt-0', 'fruit-opt-1', 'fruit-opt-2', 'fruit-opt-3']);
    });

    it('ArrowDown lands on clear entry first, then options; Enter commits null', async () => {
        const wrapper = mountGroupSelect({clearLabel: 'None', modelValue: 1});
        const root = wrapper.find('.ui-groupselect');
        const button = wrapper.find('button');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        await root.trigger('keydown', {key: 'ArrowDown'}); // → clear entry
        expect(button.attributes('aria-activedescendant')).toBe('fruit-clear');
        await root.trigger('keydown', {key: 'Enter'});

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('uses optionsLabel as the listbox aria-label', async () => {
        const wrapper = mountGroupSelect({optionsLabel: 'Fruits'});
        await wrapper.find('button').trigger('click');
        expect(groupMenu(wrapper).attributes('aria-label')).toBe('Fruits');
    });

    it('closes on a click outside', async () => {
        const wrapper = mountGroupSelect({});
        await wrapper.find('button').trigger('click');
        expect(groupMenu(wrapper).exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('removes its document listener on unmount — no throw on post-unmount click', async () => {
        const wrapper = mountGroupSelect({});
        await wrapper.find('button').trigger('click');
        wrapper.unmount();
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });

    it('skips a group with no options — no header row, no option rows for it', async () => {
        const wrapper = mountGroupSelect({
            groups: [
                {options: [], text: 'Empty'},
                {options: [{id: 1, name: 'Mango'}], text: 'Tropical'},
            ],
        });
        await wrapper.find('button').trigger('click');

        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupselect__group-header')
                .map((h) => h.text()),
        ).toEqual(['Tropical']);
        expect(groupMenu(wrapper).findAll('.ui-groupselect__option')).toHaveLength(1);
    });

    it('hovering the clear entry highlights it (aria-activedescendant points at clear id)', async () => {
        const wrapper = mountGroupSelect({clearLabel: 'None', modelValue: 1});
        await wrapper.find('button').trigger('click');

        await groupMenu(wrapper).find('.ui-groupselect__clear').trigger('mouseover');
        expect(wrapper.find('button').attributes('aria-activedescendant')).toBe('fruit-clear');
    });

    it('resolves the display string via a getter label function', () => {
        const wrapper = mountGroupSelect({label: (o: Fruit) => `${o.name}!`, modelValue: 1});
        expect(wrapper.find('.ui-groupselect__value').text()).toBe('Mango!');
    });
});
