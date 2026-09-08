// @vitest-environment happy-dom
import {mount} from '@vue/test-utils';
import {describe, expect, it} from 'vitest';

import FormField from '../src/components/FormField.vue';

// A slot stub that renders the wiring the field exposes, so we can assert it.
const wiringSlot = (scope: {
    controlId: string;
    errorId: string;
    required: boolean;
    invalid: boolean;
    describedby?: string;
}) => `ctl:${scope.controlId}|err:${scope.errorId}|req:${scope.required}|inv:${scope.invalid}|db:${scope.describedby}`;

describe('FormField', () => {
    it('renders a label, generates matching control/error ids, and reports valid state', () => {
        const wrapper = mount(FormField, {
            props: {label: 'Email', required: true, id: 'email'},
            slots: {default: wiringSlot},
        });

        expect(wrapper.find('label.ui-label').text()).toContain('Email');
        expect(wrapper.find('.ui-label__req').exists()).toBe(true);
        expect(wrapper.text()).toContain('ctl:email|err:email-error|req:true|inv:false|db:undefined');
        expect(wrapper.find('.ui-error').exists()).toBe(false);
    });

    it('renders the error and threads describedby to the slot when invalid', () => {
        const wrapper = mount(FormField, {
            props: {label: 'Email', id: 'email', error: 'Bad email'},
            slots: {default: wiringSlot},
        });

        expect(wrapper.find('.ui-error').text()).toBe('Bad email');
        expect(wrapper.text()).toContain('inv:true|db:email-error');
    });

    it('omits the label when none is given, keeping the wiring on the provided id', () => {
        const wrapper = mount(FormField, {props: {id: 'search'}, slots: {default: wiringSlot}});

        expect(wrapper.find('label').exists()).toBe(false);
        expect(wrapper.text()).toContain('ctl:search|err:search-error');
    });

    it('renders the vertical default with the control wrapped and no horizontal class', () => {
        const wrapper = mount(FormField, {props: {id: 'email'}, slots: {default: wiringSlot}});

        expect(wrapper.find('.ui-field').classes()).not.toContain('is-horizontal');
        expect(wrapper.find('.ui-field__control').exists()).toBe(true);
        expect(wrapper.find('.ui-field__control').text()).toContain('ctl:email');
    });

    it('marks the field horizontal when orientation is set on a labelled field', () => {
        const wrapper = mount(FormField, {
            props: {id: 'email', label: 'Email', orientation: 'horizontal'},
            slots: {default: wiringSlot},
        });

        expect(wrapper.find('.ui-field').classes()).toContain('is-horizontal');
    });

    it('ignores orientation without a label, so no empty label column is reserved', () => {
        const wrapper = mount(FormField, {
            props: {id: 'accept', orientation: 'horizontal'},
            slots: {default: wiringSlot},
        });

        expect(wrapper.find('.ui-field').classes()).not.toContain('is-horizontal');
    });

    it('keeps multi-node slot content together inside the control wrapper', () => {
        const wrapper = mount(FormField, {
            props: {id: 'email', orientation: 'horizontal'},
            slots: {default: '<input class="ui-control" /><small class="hint">Work address</small>'},
        });

        const control = wrapper.find('.ui-field__control');
        expect(control.find('input.ui-control').exists()).toBe(true);
        expect(control.find('small.hint').exists()).toBe(true);
        expect(wrapper.findAll('.ui-field > *')).toHaveLength(1);
    });
});
