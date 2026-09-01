// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {h} from 'vue';

import GroupCombobox from '../src/components/GroupCombobox.vue';
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
const mountGroupCombobox = (props: Record<string, unknown>, slots?: Record<string, unknown>) =>
    mount(GroupCombobox as any, {
        props: {groups: GROUPS, label: 'name', id: 'fruit', modelValue: null, ...props},
        slots,
        attachTo: document.body,
    });

afterEach(() => {
    document.body.innerHTML = '';
});

describe('GroupCombobox', () => {
    it('renders an input with combobox role and no menu until opened', () => {
        const wrapper = mountGroupCombobox({});
        const input = wrapper.find('input');

        expect(input.attributes('role')).toBe('combobox');
        expect(input.attributes('aria-autocomplete')).toBe('list');
        expect(input.attributes('aria-expanded')).toBe('false');
        expect(input.attributes('aria-controls')).toBeUndefined();
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('opens on click and renders group headers + options', async () => {
        const wrapper = mountGroupCombobox({});
        await wrapper.find('input').trigger('click');

        expect(wrapper.find('input').attributes('aria-expanded')).toBe('true');
        const m = groupMenu(wrapper);
        expect(m.exists()).toBe(true);

        const headers = m.findAll('.ui-groupcombobox__group-header');
        expect(headers.map((h) => h.text())).toEqual(['Tropical', 'Stone']);

        const options = m.findAll('.ui-groupcombobox__option');
        expect(options.map((o) => o.text())).toEqual(['Mango', 'Kiwi', 'Apricot', 'Lime']);
    });

    it('filter narrows within groups; empty group is hidden; empty query shows all', async () => {
        const wrapper = mountGroupCombobox({});
        const input = wrapper.find('input');

        await input.setValue('a'); // Mango (has 'a'), Apricot (has 'a') — Kiwi and Lime do not
        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupcombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Mango', 'Apricot']);
        // Tropical still has Mango, Stone still has Apricot → both headers present
        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupcombobox__group-header')
                .map((h) => h.text()),
        ).toEqual(['Tropical', 'Stone']);

        await input.setValue('ki'); // only Kiwi
        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupcombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Kiwi']);
        // Stone has no match → its header is hidden
        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupcombobox__group-header')
                .map((h) => h.text()),
        ).toEqual(['Tropical']);

        await input.setValue('');
        expect(groupMenu(wrapper).findAll('.ui-groupcombobox__option')).toHaveLength(4);
    });

    it('commits on click, emits update:modelValue, closes, and snaps input to label', async () => {
        const wrapper = mountGroupCombobox({});
        await wrapper.find('input').trigger('click');

        const options = groupMenu(wrapper).findAll('.ui-groupcombobox__option');
        await options[2].trigger('click'); // Apricot (index 2)
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([3]);
        expect(groupMenu(wrapper).exists()).toBe(false);
        expect(wrapper.find('input').element.value).toBe('Apricot');
    });

    it('shows the committed value label in the input on mount', () => {
        const wrapper = mountGroupCombobox({modelValue: 2});
        expect(wrapper.find('input').element.value).toBe('Kiwi');
    });

    it('browse-to-change (WR-0576): opening with committed label shows the FULL list', async () => {
        const wrapper = mountGroupCombobox({modelValue: 1}); // Mango
        const input = wrapper.find('input');
        expect(input.element.value).toBe('Mango');

        await input.trigger('click');
        // Query equals committed label → filter must not engage.
        expect(groupMenu(wrapper).findAll('.ui-groupcombobox__option')).toHaveLength(4);
    });

    it('filter engages on divergence from the committed label', async () => {
        const wrapper = mountGroupCombobox({modelValue: 1}); // Mango
        await wrapper.find('input').trigger('click');
        await wrapper.find('input').setValue('Ki'); // diverged

        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupcombobox__option')
                .map((o) => o.text()),
        ).toEqual(['Kiwi']);
    });

    it('Escape reverts a half-typed query to the committed label', async () => {
        const wrapper = mountGroupCombobox({modelValue: 3}); // Apricot
        const input = wrapper.find('input');
        const root = wrapper.find('.ui-groupcombobox');

        await input.trigger('click');
        await input.setValue('zzz');
        expect(input.element.value).toBe('zzz');

        await root.trigger('keydown', {key: 'Escape'});
        expect(groupMenu(wrapper).exists()).toBe(false);
        expect(input.element.value).toBe('Apricot');
    });

    it('click-outside reverts a half-typed query', async () => {
        const wrapper = mountGroupCombobox({});
        const input = wrapper.find('input');

        await input.setValue('ap');
        expect(input.element.value).toBe('ap');
        expect(groupMenu(wrapper).exists()).toBe(true);

        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        await wrapper.vm.$nextTick();
        expect(groupMenu(wrapper).exists()).toBe(false);
        expect(input.element.value).toBe('');
    });

    it('select-all-on-open when input holds the committed label (WR-0576)', async () => {
        const wrapper = mountGroupCombobox({modelValue: 1}); // Mango
        const input = wrapper.find('input');

        await input.trigger('click');
        expect(input.element.selectionStart).toBe(0);
        expect(input.element.selectionEnd).toBe('Mango'.length);
    });

    it('does not select when typing is what opened the popup (WR-0576)', async () => {
        const wrapper = mountGroupCombobox({modelValue: 1}); // Mango
        const input = wrapper.find('input');
        const select = vi.spyOn(input.element, 'select');

        await input.setValue('Ma'); // typing opens; query diverged before open watcher runs
        expect(select).not.toHaveBeenCalled();
    });

    it('ArrowDown/Enter keyboard commit', async () => {
        const wrapper = mountGroupCombobox({});
        const root = wrapper.find('.ui-groupcombobox');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open, pointer -1
        await root.trigger('keydown', {key: 'ArrowDown'}); // → 0 (Mango)
        await root.trigger('keydown', {key: 'ArrowDown'}); // → 1 (Kiwi)
        await root.trigger('keydown', {key: 'Enter'});

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2]); // Kiwi
        expect(groupMenu(wrapper).exists()).toBe(false);
        expect(wrapper.find('input').element.value).toBe('Kiwi');
    });

    it('clearLabel: ArrowDown lands on clear entry; Enter commits null; input snaps to ""', async () => {
        const wrapper = mountGroupCombobox({clearLabel: 'None', modelValue: 1});
        const root = wrapper.find('.ui-groupcombobox');
        const input = wrapper.find('input');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        await root.trigger('keydown', {key: 'ArrowDown'}); // → clear entry
        expect(input.attributes('aria-activedescendant')).toBe('fruit-clear');
        await root.trigger('keydown', {key: 'Enter'});

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
        expect(groupMenu(wrapper).exists()).toBe(false);
        expect(input.element.value).toBe('');
    });

    it('aria-activedescendant tracks pointer through filtered options, not headers', async () => {
        const wrapper = mountGroupCombobox({});
        const root = wrapper.find('.ui-groupcombobox');
        const input = wrapper.find('input');

        await root.trigger('keydown', {key: 'ArrowDown'}); // open
        expect(input.attributes('aria-activedescendant')).toBeUndefined();

        await root.trigger('keydown', {key: 'ArrowDown'}); // → 0 (Mango)
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-0');

        await root.trigger('keydown', {key: 'ArrowDown'}); // → 1 (Kiwi)
        expect(input.attributes('aria-activedescendant')).toBe('fruit-opt-1');

        // Header rows carry no id.
        const headerIds = groupMenu(wrapper)
            .findAll('.ui-groupcombobox__group-header')
            .map((h) => h.attributes('id'));
        expect(headerIds.every((id) => id === undefined)).toBe(true);
    });

    it('aria-selected marks the committed option across the full filtered list', async () => {
        const wrapper = mountGroupCombobox({modelValue: 3}); // Apricot
        await wrapper.find('input').trigger('click');

        const options = groupMenu(wrapper).findAll('.ui-groupcombobox__option');
        // Mango, Kiwi, Apricot, Lime — Apricot (index 2) is selected
        expect(options.map((o) => o.attributes('aria-selected'))).toEqual(['false', 'false', 'true', 'false']);
    });

    it('does not open when disabled', async () => {
        const wrapper = mountGroupCombobox({disabled: true});
        await wrapper.find('input').trigger('click');
        expect(groupMenu(wrapper).exists()).toBe(false);

        await wrapper.find('.ui-groupcombobox').trigger('keydown', {key: 'ArrowDown'});
        expect(groupMenu(wrapper).exists()).toBe(false);
    });

    it('propagates required, invalid, and describedby to the input', () => {
        const wrapper = mountGroupCombobox({required: true, invalid: true, describedby: 'fruit-error'});
        const input = wrapper.find('input');

        expect(input.attributes('aria-required')).toBe('true');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('fruit-error');
    });

    it('omits aria-required/aria-invalid when the flags are false (the `|| undefined` branch)', () => {
        const input = mountGroupCombobox({}).find('input');
        expect(input.attributes('aria-required')).toBeUndefined();
        expect(input.attributes('aria-invalid')).toBeUndefined();
    });

    it('re-syncs input to committed label when model changes from outside while idle', async () => {
        const wrapper = mountGroupCombobox({});
        expect(wrapper.find('input').element.value).toBe('');

        await wrapper.setProps({modelValue: 4}); // Lime
        expect(wrapper.find('input').element.value).toBe('Lime');
    });

    it("shows label once a pre-set model's option arrives asynchronously (edit-form pattern)", async () => {
        const wrapper = mountGroupCombobox({modelValue: 1, groups: []});
        expect(wrapper.find('input').element.value).toBe('');

        await wrapper.setProps({groups: GROUPS});
        expect(wrapper.find('input').element.value).toBe('Mango');
    });

    it('does not yank the typed query when model changes from outside while open', async () => {
        const wrapper = mountGroupCombobox({});
        await wrapper.find('input').trigger('click');
        await wrapper.setProps({modelValue: 1}); // external change while open
        expect(wrapper.find('input').element.value).toBe('');
    });

    it('removes its document listener on unmount — no throw on post-unmount click', async () => {
        const wrapper = mountGroupCombobox({});
        await wrapper.find('input').trigger('click');
        wrapper.unmount();
        document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });

    it('shows emptyText when all groups are filtered out', async () => {
        const wrapper = mountGroupCombobox({emptyText: 'No match'});
        await wrapper.find('input').setValue('zzz');
        expect(groupMenu(wrapper).find('.ui-groupcombobox__empty').text()).toBe('No match');
        expect(groupMenu(wrapper).findAll('.ui-groupcombobox__option')).toHaveLength(0);
    });

    it('hovering an option moves the pointer to it (aria-activedescendant updates)', async () => {
        const wrapper = mountGroupCombobox({});
        await wrapper.find('input').trigger('click');

        await groupMenu(wrapper).findAll('.ui-groupcombobox__option')[1].trigger('mouseover'); // Kiwi (index 1)
        expect(wrapper.find('input').attributes('aria-activedescendant')).toBe('fruit-opt-1');
    });

    it('exposes an imperative focus() handle that moves DOM focus to the input', () => {
        const wrapper = mountGroupCombobox({});
        const inputEl = wrapper.find('input').element;
        expect(document.activeElement).not.toBe(inputEl);

        (wrapper.vm as unknown as {focus: () => void}).focus();
        expect(document.activeElement).toBe(inputEl);
    });

    it('resolves the display string via a getter label function', () => {
        const wrapper = mountGroupCombobox({label: (o: Fruit) => `${o.name}!`, modelValue: 1});
        expect(wrapper.find('input').element.value).toBe('Mango!');
    });

    it('omits the header row for a group with header=false but still renders its options', async () => {
        const wrapper = mountGroupCombobox({
            groups: [
                {options: [{id: 1, name: 'Mango'}], text: 'Tropical', header: false},
                {options: [{id: 2, name: 'Apricot'}], text: 'Stone'},
            ],
        });
        await wrapper.find('input').trigger('click');

        expect(
            groupMenu(wrapper)
                .findAll('.ui-groupcombobox__group-header')
                .map((h) => h.text()),
        ).toEqual(['Stone']);
        expect(groupMenu(wrapper).findAll('.ui-groupcombobox__option')).toHaveLength(2);
    });

    it('renders a header=false group AFTER a named group flat, not absorbed into the prior role="group"', async () => {
        const wrapper = mountGroupCombobox({
            groups: [
                {options: [{id: 1, name: 'Mango'}], text: 'Tropical'},
                {options: [{id: 2, name: 'Apricot'}], text: 'Stone', header: false},
            ],
        });
        await wrapper.find('input').trigger('click');
        const m = groupMenu(wrapper);

        // The named group's inner role="group" <ul> owns ONLY its own option — the boundary
        // marker keeps the headerless group's option out of it.
        const groupUl = m.find('.ui-groupcombobox__group ul[role="group"]');
        expect(groupUl.findAll('.ui-groupcombobox__option')).toHaveLength(1);
        expect(groupUl.find('.ui-groupcombobox__option').text()).toBe('Mango');

        expect(m.findAll('.ui-groupcombobox__group-header').map((h) => h.text())).toEqual(['Tropical']);
        expect(m.findAll(':scope > .ui-groupcombobox__option').map((o) => o.text())).toEqual(['Apricot']);
    });

    it('renders mutedOptions with .is-muted and keeps them committable', async () => {
        const wrapper = mountGroupCombobox({mutedOptions: [2]}); // Kiwi
        await wrapper.find('input').trigger('click');

        const options = groupMenu(wrapper).findAll('.ui-groupcombobox__option');
        expect(options.map((o) => o.classes().includes('is-muted'))).toEqual([false, true, false, false]);

        await options[1].trigger('click'); // Kiwi commits anyway
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2]);
    });

    it('renders per-option custom content through the #option scoped slot', async () => {
        const wrapper = mountGroupCombobox(
            {modelValue: 1},
            {
                option: (props: {option: Fruit; index: number; selected: boolean}) =>
                    h('b', {class: 'swatch'}, `${props.option.name}#${props.index}${props.selected ? '*' : ''}`),
            },
        );
        await wrapper.find('input').trigger('click');
        await wrapper.find('input').setValue('ki'); // only Kiwi (index 0 after filter)

        const swatches = groupMenu(wrapper)
            .findAll('.swatch')
            .map((el) => el.text());
        expect(swatches).toEqual(['Kiwi#0']);
    });
});
