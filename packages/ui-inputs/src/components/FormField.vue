<template>
    <div class="ui-field" :class="{'is-horizontal': orientation === 'horizontal' && Boolean(label)}">
        <FormLabel v-if="label" :html-for="id" :required="required">{{ label }}</FormLabel>
        <!-- the control slot receives the wiring it needs to stay accessible; the wrapper keeps
             multi-node slot content in one grid cell when horizontal (display: contents otherwise) -->
        <div class="ui-field__control">
            <slot
                :control-id="id"
                :error-id="errorId"
                :required="required"
                :invalid="Boolean(error)"
                :describedby="error ? errorId : undefined"
            />
        </div>
        <FormError v-if="error" :error="error" :id="errorId" />
    </div>
</template>

<script setup lang="ts">
import FormError from './FormError.vue';
import FormLabel from './FormLabel.vue';

const {
    label,
    required = false,
    error,
    id,
    orientation = 'vertical',
} = defineProps<{
    /** label text; omit for an unlabelled field. */
    label?: string;
    required?: boolean;
    /** resolved error string, supplied by the consumer (error-as-prop). */
    error?: string;
    /** stable control id — pass `useId()` at the call site if you have no natural one. */
    id: string;
    /**
     * field layout. `'vertical'` (default) stacks the label above the control; `'horizontal'`
     * places the label in a fixed left column (width `--ui-field-label-width`) with the control
     * to its right and the error beneath the control. An unlabelled field ignores it — there is
     * no label to give a column to, so the control keeps the full width.
     */
    orientation?: 'vertical' | 'horizontal';
}>();

const errorId = `${id}-error`;
</script>
