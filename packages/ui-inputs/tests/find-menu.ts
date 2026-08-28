import type {VueWrapper} from '@vue/test-utils';

import GroupOptionList from '../src/components/GroupOptionList.vue';
import OptionList from '../src/components/OptionList.vue';

/**
 * The listbox is teleported out of the control (KD-1136), so `wrapper.find('.ui-*__menu')`
 * misses it. OptionList is still in the vnode tree; this is the VTU handle onto its `<ul>`.
 */
export const menu = (wrapper: VueWrapper) => wrapper.findComponent(OptionList);

/** GroupOptionList equivalent of `menu` — for GroupSelect and GroupCombobox. */
export const groupMenu = (wrapper: VueWrapper) => wrapper.findComponent(GroupOptionList);
