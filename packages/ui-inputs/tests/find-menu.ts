import type {VueWrapper} from '@vue/test-utils';

import OptionList from '../src/components/OptionList.vue';

/**
 * The listbox is teleported out of the control (KD-1136), so `wrapper.find('.ui-*__menu')`
 * misses it. OptionList is still in the vnode tree; this is the VTU handle onto its `<ul>`.
 * Every select control — flat and grouped alike — renders the one `OptionList`.
 */
export const menu = (wrapper: VueWrapper) => wrapper.findComponent(OptionList);

/** Grouped alias of `menu`, kept for readability at GroupSelect/GroupCombobox call sites. */
export const groupMenu = menu;
