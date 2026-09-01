# ui-inputs

Headless, themeable Vue 3 UI components — form inputs, plus the interactive controls that carry no value (`Pressable`, `Disclosure`) — styled entirely through `--ui-*` CSS custom properties.

`ui-inputs` opens the `ui-*` family: where `fs-*` packages are frontend **services**, `ui-*` packages are shared **UI components**. The components ship no token vocabulary and no hard-coded brand colour — you map your design tokens onto the `--ui-*` contract once, and every component follows. Soft and rounded or hard and brutalist, light or dark, from one component set.

```bash
npm install @script-development/ui-inputs
```

**Peer dependency:** `vue ^3.5.40`

Import the stylesheet once (e.g. in your app entry):

```typescript
import '@script-development/ui-inputs/style.css';
```

## Live Demo

Every control below is the real component, rendered by this page. The demo container maps a handful of `--ui-*` variables onto this site's own theme variables — which is exactly the adoption step your app performs with its design tokens (see [Theming](#theming-the-ui-contract)):

```css
.ui-demo {
    --ui-control-bg: var(--vp-c-bg);
    --ui-control-text: var(--vp-c-text-1);
    --ui-control-border-color: var(--vp-c-divider);
    --ui-menu-bg: var(--vp-c-bg-elv);
    /* … */
}
```

That is the whole trick: the components read variables, the consumer supplies values. Toggle this site's dark mode — the controls follow, because the mapped tokens do.

### SingleSelect

A button-triggered, keyboard-navigable listbox, generic over your option type. Open it with click, <kbd>Enter</kbd>, <kbd>Space</kbd>, or the arrow keys; navigation is announced to assistive tech via `aria-activedescendant`.

<ClientOnly>
<div class="ui-demo">
<FormField id="demo-fruit" label="Fruit" #default="{controlId, describedby, invalid}">
<SingleSelect :id="controlId" v-model="fruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<p class="ui-demo__state">Model value: <code>{{ fruit === null ? 'null' : JSON.stringify(fruit) }}</code></p>
</div>
</ClientOnly>

```vue
<FormField id="fruit" label="Fruit" #default="{controlId, describedby, invalid}">
    <SingleSelect :id="controlId" v-model="fruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

### Combobox

The searchable single-select: a text input that filters the listbox as you type. On <kbd>Escape</kbd>, <kbd>Tab</kbd>, or a click outside, the input snaps back to the committed label — a half-typed non-match never lingers. Try typing `ma`:

<ClientOnly>
<div class="ui-demo">
<FormField id="demo-city" label="City" #default="{controlId, describedby, invalid}">
<Combobox :id="controlId" v-model="city" :options="cities" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<p class="ui-demo__state">Model value: <code>{{ city === null ? 'null' : JSON.stringify(city) }}</code></p>
</div>
</ClientOnly>

```vue
<FormField id="city" label="City" #default="{controlId, describedby, invalid}">
    <Combobox :id="controlId" v-model="city" :options="cities" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

`Combobox` also exposes an imperative `focus()` handle via a template ref (`box.value?.focus()`) — the piece a focus-trap or command-palette integration needs.

### MultiSelect

Models an **array of option ids**. Committing an option toggles its membership and the listbox stays open, so picking several values is one open/close cycle. Committed values render as chips with per-chip remove buttons; <kbd>Backspace</kbd> on the focused trigger pops the last value.

<ClientOnly>
<div class="ui-demo">
<FormField id="demo-toppings" label="Toppings" #default="{controlId, describedby, invalid}">
<MultiSelect :id="controlId" v-model="toppingIds" :options="toppings" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<p class="ui-demo__state">Model value: <code>{{ JSON.stringify(toppingIds) }}</code></p>
</div>
</ClientOnly>

```vue
<FormField id="toppings" label="Toppings" #default="{controlId, describedby, invalid}">
    <MultiSelect :id="controlId" v-model="toppingIds" :options="toppings" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

### MultiCombobox

`MultiSelect`'s **searchable** sibling: the same array model, toggle-in-place commits, and chip bar — but the trigger is `Combobox`'s filter-as-you-type text input (the list opens on focus, click, or typing). On every toggle-commit the popup stays open, the query clears so the full list is re-offered, and focus returns to the input — so picking several values is type, <kbd>Enter</kbd>, type, <kbd>Enter</kbd>. <kbd>Backspace</kbd> with an empty query pops the last chip. Try typing `ca`:

<ClientOnly>
<div class="ui-demo">
<FormField id="demo-tags" label="Toppings (searchable)" #default="{controlId, describedby, invalid}">
<MultiCombobox :id="controlId" v-model="tagIds" :options="toppings" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<p class="ui-demo__state">Model value: <code>{{ JSON.stringify(tagIds) }}</code></p>
</div>
</ClientOnly>

```vue
<FormField id="tags" label="Toppings (searchable)" #default="{controlId, describedby, invalid}">
    <MultiCombobox :id="controlId" v-model="tagIds" :options="toppings" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

### GroupSelect & GroupCombobox

When options arrive **already partitioned** — active sprints above the backlog, tropical fruit above stone fruit — `GroupSelect` and `GroupCombobox` are `SingleSelect` / `Combobox` over **`groups`** instead of `options`. Each group renders a `role="group"` header; a single `v-model` selects across the whole set, and groups stay in **caller order** (there is no `alphabeticalSort` — the partition _is_ the order). `GroupCombobox` filters within groups and drops any group its filter empties. Try typing `a` in the searchable one:

<ClientOnly>
<div class="ui-demo">
<FormField id="demo-group-fruit" label="Fruit" #default="{controlId, describedby, invalid}">
<GroupSelect :id="controlId" v-model="groupFruit" :groups="fruitGroups" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<p class="ui-demo__state">Model value: <code>{{ groupFruit === null ? 'null' : JSON.stringify(groupFruit) }}</code></p>
<FormField id="demo-group-fruit-search" label="Fruit (searchable)" #default="{controlId, describedby, invalid}">
<GroupCombobox :id="controlId" v-model="groupFruitSearch" :groups="fruitGroups" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<p class="ui-demo__state">Model value: <code>{{ groupFruitSearch === null ? 'null' : JSON.stringify(groupFruitSearch) }}</code></p>
</div>
</ClientOnly>

```vue
<FormField id="fruit" label="Fruit" #default="{controlId, describedby, invalid}">
    <GroupSelect :id="controlId" v-model="fruit" :groups="fruitGroups" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

The `groups` prop replaces `options` — each group carries its own `options`, a header `text`, and an optional `header` flag:

```ts
const fruitGroups = [
    {
        text: 'Tropical',
        options: [
            {id: 'mango', name: 'Mango'},
            {id: 'kiwi', name: 'Kiwi'},
        ],
    },
    {
        text: 'Stone',
        options: [
            {id: 'apricot', name: 'Apricot'},
            {id: 'peach', name: 'Peach'},
        ],
    },
];
```

Pass `header: false` on a group to render its options **flat** (a leading "ungrouped" run above the named groups); an empty group renders nothing, so a header never outlives its options.

### The checkbox family

`Checkbox`, `Switch`, `CheckboxGroup`, and `RadioGroup` sit on a **native input chassis** — a real `<input type="checkbox">` / `<input type="radio">` restyled through the same `--ui-*` contract, never a div-with-role — so keyboard and assistive-tech behaviour come from the platform. The radio group's arrow-key selection below is the **browser's own** roving focus; the component hand-rolls none of it.

<ClientOnly>
<div class="ui-demo">
<Checkbox id="demo-terms" v-model="accepted" label="Accept the terms" />
<p class="ui-demo__state">Model value: <code>{{ JSON.stringify(accepted) }}</code></p>
<Switch id="demo-notify" v-model="notifications" label="Email notifications" />
<p class="ui-demo__state">Model value: <code>{{ JSON.stringify(notifications) }}</code></p>
<CheckboxGroup id="demo-extras" v-model="extraIds" :options="toppings" option-label="name" label="Extras" />
<p class="ui-demo__state">Model value: <code>{{ JSON.stringify(extraIds) }}</code> — kept in options order, not click order</p>
<RadioGroup id="demo-size" v-model="size" :options="sizes" option-label="name" label="Size" required />
<p class="ui-demo__state">Model value: <code>{{ size === null ? 'null' : JSON.stringify(size) }}</code></p>
</div>
</ClientOnly>

```vue
<Checkbox id="terms" v-model="accepted" label="Accept the terms" />
<Switch id="notify" v-model="notifications" label="Email notifications" />
<CheckboxGroup id="extras" v-model="extraIds" :options="toppings" option-label="name" label="Extras" />
<RadioGroup id="size" v-model="size" :options="sizes" option-label="name" label="Size" required />
```

`Checkbox` and `Switch` model a **non-nullable `boolean`** — a checkbox is never "empty", unchecked _is_ `false` (the one deliberate exception to the family's nullable-model rule). `Checkbox` additionally takes `indeterminate` as a **prop**, mirrored onto the element's DOM property and drawn as a dash — purely visual, it never touches the model.

### Interactive controls that are not form inputs

`Pressable` and `Disclosure` carry no value and belong to no field. They exist to close the most common accessibility defect in a Vue codebase: a click handler on an element that cannot receive one. A bare `<span @click>` is invisible to the keyboard and announces no role — WCAG 2.1.1 _Keyboard_ and 4.1.2 _Name, Role, Value_, both Level A. `Pressable` renders a **real `<button>`**, so focusability, <kbd>Enter</kbd>/<kbd>Space</kbd> activation, `disabled` semantics and forced-colors treatment come from the platform. Tab into the controls below rather than clicking them.

<ClientOnly>
<div class="ui-demo">
<Pressable label="Show example" @click="pressCount += 1" />
<p class="ui-demo__state">Activated <code>{{ pressCount }}</code> times — by click, <kbd>Enter</kbd>, or <kbd>Space</kbd></p>
<Pressable v-model:pressed="bold" label="Bold" />
<p class="ui-demo__state">Toggle mode: <code>aria-pressed="{{ bold }}"</code> — absent entirely unless you bind <code>v-model:pressed</code></p>
<Disclosure id="demo-disclosure" label="What does headless mean here?" :heading-level="3">
<p>It means the package ships no token vocabulary and no colour literal — only structure, behaviour, and the <code>--ui-*</code> contract you map your own design tokens onto.</p>
</Disclosure>
</div>
</ClientOnly>

```vue
<Pressable label="Show example" @click="showExample" />
<Pressable v-model:pressed="bold" label="Bold" />

<Disclosure id="details" label="Details" :heading-level="3">
    <p>Anything at all.</p>
</Disclosure>
```

`Disclosure` puts a real button carrying `aria-expanded` + `aria-controls` **inside** the heading — the heading contains the button, it never behaves as one. The live shape it replaces is `<h2 @click="toggle">`, which is unreachable by keyboard and lies about its role.

### Composing with FormField — error state

`FormField` wires label, control, and error together (ids, `aria-describedby`, invalid flag) through its slot scope. The error is **a prop, never a service** — resolve the message in your app and pass it down. Clear the field below to see the invalid treatment appear:

<ClientOnly>
<div class="ui-demo">
<FormField id="demo-email" label="Email" required :error="emailError" #default="{controlId, describedby, invalid}">
<TextInput :id="controlId" v-model="email" type="email" placeholder="you@example.com" :invalid="invalid" :describedby="describedby" />
</FormField>
</div>
</ClientOnly>

```vue
<FormField id="email" label="Email" required :error="errors.email" #default="{controlId, describedby, invalid}">
    <TextInput :id="controlId" v-model="email" type="email" :invalid="invalid" :describedby="describedby" />
</FormField>
```

## Components

| Component                 | Purpose                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `FormField`               | Label + error + required-marker composition wrapper (error-as-prop)                                                                        |
| `FormLabel` / `FormError` | The atoms `FormField` composes — usable standalone                                                                                         |
| `TextInput`               | Native `text` / `email` / `password` / `search` / `tel` / `url` input                                                                      |
| `NumberInput`             | Native `number` input; owns the `NaN` → `null` empty-value guard                                                                           |
| `DateInput`               | Native `date` input with ISO `min` / `max` bounds                                                                                          |
| `Textarea`                | Native `textarea` with `rows`                                                                                                              |
| `Checkbox`                | Native checkbox, visually restyled; non-nullable `boolean` model, `indeterminate` as a visual prop                                         |
| `CheckboxGroup`           | Fieldset/legend group of checkboxes — models an array of option ids in **options order**                                                   |
| `Switch`                  | The checkbox chassis with `role="switch"` — an on/off toggle with a themeable track + thumb                                                |
| `RadioGroup`              | Fieldset/legend radio group (`role="radiogroup"`) — models `T['id'] \| null`; **native** roving focus + arrow-key selection                |
| `SingleSelect`            | Accessible button-triggered listbox, generic over your option type                                                                         |
| `Combobox`                | Accessible searchable/filtering single-select; exposes an imperative `focus()` handle                                                      |
| `MultiSelect`             | Accessible multi-value select — models an array of option ids; toggle-in-place listbox, inline chip bar with per-chip remove               |
| `MultiCombobox`           | Accessible **searchable** multi-value select — MultiSelect's model + chips with Combobox's filtering input as the trigger                  |
| `GroupSelect`             | Accessible **grouped** single-select — `SingleSelect` over caller-ordered `groups` with `role="group"` headers; models `T['id'] \| null`   |
| `GroupCombobox`           | Accessible **searchable grouped** single-select — `GroupSelect`'s listbox with `Combobox`'s filtering input; exposes `focus()`             |
| `Pressable`               | A real `<button>` for a control that carries **no value** — replaces `<span @click>` / `<div @click>`; optional `aria-pressed` toggle mode |
| `Disclosure`              | Show/hide a region from a real button (`aria-expanded` + `aria-controls`), optionally wrapped in a real heading — replaces `<h2 @click>`   |

Two types complete the public surface: `SelectItem` (`{id: string | number}` — the minimal shape every option must satisfy) and `LabelKey<T>` (`keyof T | ((option: T) => string)` — how to derive an option's display string).

## Contracts

### FormField

| Prop       | Type      | Default | Notes                                                                   |
| ---------- | --------- | ------- | ----------------------------------------------------------------------- |
| `id`       | `string`  | —       | Required. Stable control id — pass `useId()` if you have no natural one |
| `label`    | `string`  | —       | Omit for an unlabelled field                                            |
| `required` | `boolean` | `false` | Renders the required marker and threads `required` to the slot          |
| `error`    | `string`  | —       | Resolved error string (error-as-prop); renders `FormError` when present |

The default slot receives `{controlId, errorId, required, invalid, describedby}` — spread them onto the control as shown in the demos, and the label/error/aria wiring is complete.

### Text-like inputs

`TextInput`, `DateInput`, and `Textarea` model `string | null`; `NumberInput` models `number | null`. All four share `id` (required), `disabled`, `required`, `invalid`, and `describedby` props, plus:

| Component     | Extra props                         | Model            | Emits on clear |
| ------------- | ----------------------------------- | ---------------- | -------------- |
| `TextInput`   | `type`, `placeholder`               | `string \| null` | `''`           |
| `NumberInput` | `min`, `max`, `step`, `placeholder` | `number \| null` | `null`         |
| `DateInput`   | `min`, `max` (ISO `YYYY-MM-DD`)     | `string \| null` | `''`           |
| `Textarea`    | `rows`, `placeholder`               | `string \| null` | `''`           |

See [Nullable values](#nullable-values) for why the models are nullable and what each input emits when cleared.

### The select family

`SingleSelect`, `Combobox`, `MultiSelect`, and `MultiCombobox` share one generic contract (`<T extends SelectItem>`):

| Prop               | Type          | Default        | Notes                                                              |
| ------------------ | ------------- | -------------- | ------------------------------------------------------------------ |
| `options`          | `T[]`         | —              | Required                                                           |
| `label`            | `LabelKey<T>` | —              | Required. Property name or getter for an option's display string   |
| `id`               | `string`      | —              | Required. Pairs the trigger with a label/error                     |
| `placeholder`      | `string`      | `'Select…'`    |                                                                    |
| `disabled`         | `boolean`     | `false`        |                                                                    |
| `alphabeticalSort` | `boolean`     | `true`         | Sorts rendered options by display string                           |
| `required`         | `boolean`     | `false`        | Conveyed via `aria-required`                                       |
| `invalid`          | `boolean`     | `false`        | Invalid styling + `aria-invalid`                                   |
| `describedby`      | `string`      | —              | Id of the paired error element                                     |
| `emptyText`        | `string`      | `'No options'` | Shown when the (filtered) list is empty                            |
| `optionsLabel`     | `string`      | `'Options'`    | Accessible name for the listbox popup — a prop so you can localise |
| `mutedOptions`     | `T['id'][]`   | —              | Ids rendered visually muted (`.is-muted`) — still committable      |

The open listbox is promoted to the **top layer** via the [Popover API](https://developer.mozilla.org/docs/Web/API/Popover_API), so an `overflow: hidden` or stacking-context ancestor of the trigger cannot clip or bury the menu. It is **never moved in the DOM** — it stays inside the control, so your `--ui-*` map keeps applying wherever you declared it (an app-shell class, a `<style scoped>` block, a shadow root), and a click on the menu is correctly not a click-outside.

::: tip Browser support
The Popover API is Baseline since April 2024 — Chrome 114+, Safari 17+, Firefox 125+.
:::

They differ in what they model:

| Component       | Model             | Extras                                                                                                                |
| --------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `SingleSelect`  | `T['id'] \| null` | `clearLabel` / `emptyDisplayValue` (the committing clear entry — see below)                                           |
| `Combobox`      | `T['id'] \| null` | Text-input trigger that filters options; `focus()` exposed; `clearLabel` / `emptyDisplayValue`                        |
| `MultiSelect`   | `T['id'][]`       | Toggle-in-place commits, chip bar, `removeLabel` prop (default `'Remove'`, localisable)                               |
| `MultiCombobox` | `T['id'][]`       | MultiSelect's extras + the filtering input trigger; `focus()` exposed; query clears + input refocuses on every commit |

#### The `#option` scoped slot

All four selects render each option's plain display string by default; the `option` slot
replaces that content with your own (colour swatches, icons, rich labels). The payload is
`{option: T, index, selected, active}` — typed against your option type. Highlight and
selection chrome (`.is-active`, `aria-selected`) stay on the option row, **outside the
slot**, so custom content never has to re-create it:

```vue
<SingleSelect id="label" v-model="labelId" :options="labels" label="name">
    <template #option="{option}">
        <span class="swatch" :style="{background: option.color}" /> {{ option.name }}
    </template>
</SingleSelect>
```

#### The committing clear entry (`SingleSelect` / `Combobox`)

`clearLabel` renders a committing entry **above** the options — choosing it commits `null`
and closes, exactly like choosing an option. It lives outside the option index space: its
own keyboard slot between "nothing highlighted" and the first option, its own `${id}-clear`
id for `aria-activedescendant`, and `aria-selected="true"` while the model is null. In the
Combobox it also sits outside the filter — it renders whatever the query says.

Pair it with `emptyDisplayValue`: the string the trigger (or the Combobox input) renders as
a **value** when the model is null ("No sprint (backlog)") instead of the muted placeholder /
blank input. `has-value` styling stays keyed on an actual selection. The entry is
danger-toned by default (`--ui-clear-text`, chaining to `--ui-danger-text`).

```vue
<SingleSelect
    id="sprint"
    v-model="sprintId"
    :options="sprints"
    label="name"
    clear-label="No sprint"
    empty-display-value="No sprint (backlog)"
/>
```

#### Grouped variants (`GroupSelect` / `GroupCombobox`)

`GroupSelect` and `GroupCombobox` are the grouped single-selects. They share the family's
contract — `label`, `id`, `placeholder`, `disabled`, `required`, `invalid`, `describedby`,
`emptyText`, `optionsLabel`, `mutedOptions`, `clearLabel`, the `#option` slot, and (on
`GroupCombobox`) the imperative `focus()` handle — with **`options` replaced by `groups`** and
no `alphabeticalSort` (the partition is the order):

```ts
groups: {options: T[]; text: string; header?: boolean}[];
```

- Groups render in caller order; a single `T['id'] | null` model selects across the flattened option set.
- A named group renders `text` as a `role="group"` header labelling its options; `header: false` renders the group's options flat (with a boundary so they never fold into the preceding group) — a leading ungrouped run.
- An empty group renders nothing — a header never outlives its options, including when `GroupCombobox`'s filter drains a group.

### The checkbox family

`Checkbox` and `Switch` share `id` (required), `label` (inline label text; the default slot overrides it for rich content), `disabled`, `required`, `invalid`, and `describedby`. Both model a **non-nullable `boolean`**. `Checkbox` adds `indeterminate` (visual prop → the element's DOM property). Native `required` is never set — `aria-required` is the conveyance, as everywhere in the family.

`CheckboxGroup` and `RadioGroup` are generic over `T extends SelectItem` and render a chrome-less `<fieldset>` with a `<legend>`:

| Prop            | Type          | Default        | Notes                                                                                       |
| --------------- | ------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `options`       | `T[]`         | —              | Required. Rendered in the given order — groups never sort                                   |
| `optionLabel`   | `LabelKey<T>` | —              | Required. The family's display resolver — named `optionLabel` because `label` is the legend |
| `label`         | `string`      | —              | Required. The group legend                                                                  |
| `id`            | `string`      | —              | Required. On the fieldset, the base for position-keyed member ids, and (radios) the `name`  |
| `disabled`      | `boolean`     | `false`        | Threaded to every member                                                                    |
| `required`      | `boolean`     | `false`        | Group-level conveyance — see below                                                          |
| `invalid`       | `boolean`     | `false`        | `aria-invalid` on the fieldset; members mirror the invalid styling                          |
| `describedby`   | `string`      | —              | **One story:** the error IDREF lives on the fieldset only — members never repeat it         |
| `requiredLabel` | `string`      | `'(required)'` | `CheckboxGroup` only — screen-reader-only required text in the legend, localisable          |

They differ in what they model, mirroring the select family:

| Component       | Model             | Required conveyance                                                                                                                      |
| --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `CheckboxGroup` | `T['id'][]`       | Legend marker + sr-only `requiredLabel` — ARIA forbids `aria-required` on `role=group`, so the legend text is the group-level conveyance |
| `RadioGroup`    | `T['id'] \| null` | `aria-required` on the fieldset — it carries `role="radiogroup"`, which legitimately supports the attribute                              |

`CheckboxGroup` keeps its array in **options order** (not click order); an id whose option has not arrived yet (async options) is preserved at the tail. `RadioGroup`'s radios share one generated `name` (the group id), so the **browser** provides the roving tabindex and arrow-key selection — the component only mirrors the model from the native `change` event.

### Pressable and Disclosure

**`Pressable`** renders `<button type="button">` by default and that is the design, not a default to be talked out of: a native button supplies focusability, <kbd>Enter</kbd>/<kbd>Space</kbd> activation, `disabled` semantics and forced-colors behaviour for free and correctly. Hand-rolled ARIA is the fallback, never the default. The chassis is deliberately **chrome-less** (transparent background, no border, no padding, inherited font), so replacing a `<span @click>` with a `Pressable` changes the semantics without repainting the control. It lays out as `inline-flex` — except on the tags whose own `display` their parent's layout algorithm requires, where the component keeps the tag's own: the documented clickable `<tr>` stays a table row and its cells stay table cells. The root _is_ the interactive element here, so undeclared attrs (`aria-label` for an icon-only control, `title`, `data-*`, your own `@click`) fall through to it directly — nothing is re-aimed.

`v-model:pressed` opts into **toggle mode**: the control conveys `aria-pressed` and flips it on activation. Left unbound the attribute is absent, because a plain action button must not claim toggle semantics. This is the one place the package hand-sets an ARIA state, and deliberately: unlike `Switch`, where `role="switch"` on a native checkbox lets the native checked state map to `aria-checked`, a `<button>` has no native pressed state, so `aria-pressed` is the only conveyance there is.

**Initialise the ref you bind.** `defineModel` cannot tell an unbound model from one bound to `undefined`, and the unbound case has to win — so a `ref<boolean>()` left uninitialised produces a control that renders no `aria-pressed` and silently never toggles or emits. Development warns when a `pressed` binding arrives holding `undefined`.

**Both controls warn in development when they render with no accessible name.** `label` is optional on `Pressable` and `Disclosure` alike and their slots may render empty, so nothing in the types stops a consumer producing a focusable, correctly-roled, _unnamed_ control — a WCAG 4.1.2 (Level A) failure, and on `Disclosure` a trigger whose only content is the `aria-hidden` chevron. On mount each control checks that a name arrives by one of four routes — rendered content, `aria-label`, `aria-labelledby` or `title` — and `console.warn`s once, naming all four, when none does. Rendered content is counted the way the accessible name is computed: an `aria-hidden="true"` subtree contributes nothing, so a control whose only content is a decorative icon still warns rather than being silenced by it. Icon-only usage with `aria-label` is legitimate and stays silent. It takes `aria-labelledby` at its word rather than dereferencing the IDREF (the target may legitimately mount later), so a _dangling_ reference passes it — axe is the layer that catches that one.

Every dev-only warning in this package is gated on `process.env.NODE_ENV`, which Vite and webpack substitute for you; **rollup needs `@rollup/plugin-replace`**. Where nothing substitutes it the package fails _silent_ rather than warning — a library must not `console.warn` into a host it cannot identify, and a missing `process` global must not become a `ReferenceError` at mount.

The **`as` escape hatch is discouraged**. Where a button genuinely cannot be used — a clickable `<tr>`, an element whose parent forbids interactive content — `as` renders another tag and the component hand-rolls the _whole_ contract together: `role="button"`, `tabindex`, <kbd>Enter</kbd> on keydown, <kbd>Space</kbd> on keyup (dispatching a real click, so a fall-through `@click` still runs), and a disabled emulation (`tabindex="-1"` + `aria-disabled`, **plus a click stop**). Half a contract is worse than none — and the stop is the half that is easy to miss. `as` is matched **case-insensitively**, because `<component :is>` resolves tag names that way: `as="BUTTON"` renders a genuine native button and takes the native path with it. The native path is **not** protected by the browser here: Chromium withholds a click on a disabled `<button>` only for user activation, and a `dispatchEvent` still runs every listener on one (measured). The stop is therefore what keeps a fall-through `@click` off a disabled control on **both** paths, not a nicety the fallback needs and the button does not. It is a real guard in the component — `preventDefault()` plus `stopImmediatePropagation()`, in the **capture** phase — **not** a `pointer-events: none` in the stylesheet: that rule takes the control out of hit-testing altogether, so a pointer over a disabled control targets whatever sits behind it and an _ancestor's_ `@click` fires. The capture phase is what makes the whole subtree inert: a bubble-phase stop on the root arrives only after a nested `<a href>` or `<button @click>` has already run. And `preventDefault()` is the half no propagation stop can supply — it withholds the element's _own_ default action, which is what keeps a disabled `as="a"` from following its `href`. Never aim `as` at an element the browser already activates (`a[href]`, `summary`): the component would hand-roll a `role="button"` and a second key-to-click translation on top of the ones the element already has — **development warns when you do**.

**Keys inside an `as` fallback belong to the child that has focus.** Both key handlers check the event's origin and ignore anything that reached the root by bubbling, so a nested `<input>` keeps its spacebar and a nested `<button>` keeps its own <kbd>Enter</kbd>. Without that check every <kbd>Space</kbd> typed into an inline filter field is swallowed and converted into an activation of the row — the field cannot hold a space at all. The check is deliberately **not** applied to the click handler: a click targets the element under the pointer, so the ordinary `<Pressable as="div"><span>Label</span></Pressable>` shape legitimately reports a child as the target, and the same guard there would stop the row responding to the mouse. Keys follow focus; clicks follow the pointer. A **disabled** control is deaf to keys in the full sense — both handlers stop the event rather than returning, so a consumer's fall-through `@keydown`/`@keyup` does not run on it either. That path is reachable, not theoretical: a disabled fallback keeps `tabindex="-1"`, which is out of the tab order but still mouse-focusable. One consequence to plan for: the child's own click still _bubbles_, so a row with its own `@click` counts an activation when a nested button is pressed, by keyboard or mouse alike — put `@click.stop` on the child where that is not what you want.

**`Disclosure`** pairs a real button to its panel by a stable derived id (`${id}-panel`). Pass `headingLevel` to wrap the trigger in a real `<h1>`…`<h6>`; omit it where the disclosure is not a section heading and the wrapper stays a plain div, leaving the document outline untouched. Expansion is UI state, not form data, so — unlike the value-carrying components, whose model is required — it works **uncontrolled** out of the box; bind `v-model:expanded` only when the parent needs to drive or observe it. The panel is always mounted and hidden with `v-show`, never `v-if`: `aria-controls` is an IDREF, and one pointing at nothing names no relationship for assistive tech to expose — so the reference resolves in both states. Wrap genuinely expensive panel content in your own `v-if` inside the slot. No landmark role is stamped on the panel — a disclosure is not automatically a region, and doing so on every instance would flood the landmark list.

### Attribute fall-through

Props the components do not declare — `name`, `autocomplete`, `inputmode`, `data-*`, … — fall through to the underlying native control via Vue's attribute inheritance. You do not need a declared prop to make a field participate in autofill or a native form post. (`Checkbox` and `Switch` re-aim attrs at the native **input** — their root is the wrapping `<label>`.)

## Theming — the `--ui-*` contract

Every visual rule in the shipped stylesheet keys on a `--ui-*` custom property — colours **and structure**: `--ui-control-border-width`, `--ui-control-radius`, `--ui-control-shadow`, `--ui-label-transform`, and so on. The defaults are declared under `:where(:root)`, carrying zero specificity, so any selector you write overrides them. Remap under `:root` for an app-wide theme, or under any scoping selector for a per-section theme.

The variable surface groups into:

- **Field / label** — `--ui-field-gap`, `--ui-field-margin`, `--ui-label-color`, `--ui-label-size`, `--ui-label-weight`, `--ui-label-transform`, `--ui-label-tracking`
- **Pressable** (`Pressable` + the `Disclosure` trigger) — `--ui-pressable-gap`, `--ui-pressable-pad`, `--ui-pressable-min-height`, `--ui-pressable-bg`, `--ui-pressable-text`, `--ui-pressable-font-size`, `--ui-pressable-line-height`, `--ui-pressable-border-width`, `--ui-pressable-border-color`, `--ui-pressable-radius`, `--ui-pressable-text-disabled`, `--ui-pressable-bg-pressed`, `--ui-pressable-text-pressed`; plus `--ui-disclosure-panel-pad` / `--ui-disclosure-panel-gap`
- **Control** (inputs + select triggers) — `--ui-control-bg`, `--ui-control-text`, `--ui-control-text-muted`, `--ui-control-border-width`, `--ui-control-border-color`, `--ui-control-border-open`, `--ui-control-radius`, `--ui-control-pad-x`, `--ui-control-pad-y`, `--ui-control-shadow`, `--ui-control-shadow-hover`, `--ui-control-bg-disabled`, `--ui-focus-ring`, `--ui-control-font-size`, `--ui-control-line-height`, `--ui-control-min-height`
- **Listbox menu** — `--ui-menu-bg`, `--ui-menu-border-width`, `--ui-menu-border-color`, `--ui-menu-radius`, `--ui-menu-pad`, `--ui-menu-shadow`, `--ui-menu-max-height`, `--ui-menu-min-width`, `--ui-menu-max-width`, `--ui-menu-font-size`
- **Option** — `--ui-option-radius`, `--ui-option-pad`, `--ui-option-bg-active`, `--ui-option-min-height`, `--ui-option-text-muted` (`.is-muted`), `--ui-option-bg-selected` / `--ui-option-text-selected` (MultiSelect `[aria-selected="true"]`), `--ui-clear-text` (the clear entry)
- **Chip** (MultiSelect) — `--ui-chip-bg`, `--ui-chip-text`, `--ui-chip-radius`, `--ui-chip-pad`, each defaulting to an existing resting token so chips are neutral until you opt in
- **Check** (Checkbox / CheckboxGroup / RadioGroup) — `--ui-check-size`, `--ui-check-border-width` (shorthand-valued, like the control's), `--ui-check-border-color`, `--ui-check-bg`, `--ui-check-bg-checked`, `--ui-check-mark-color`, `--ui-check-radius`, `--ui-check-gap` (control ↔ label), `--ui-check-item-gap` (group rows) — every colour default derives from an existing resting token (`--ui-control-bg`, `--ui-control-border-color`, `--ui-control-border-open`), so your token map themes the family with no new mappings
- **Switch** — `--ui-switch-track-width`, `--ui-switch-track-height`, `--ui-switch-track-radius`, `--ui-switch-track-bg`, `--ui-switch-track-bg-checked`, `--ui-switch-thumb-size`, `--ui-switch-thumb-bg` — the thumb travels track-width − track-height, so geometry stays coherent under any override
- **Error / danger** — `--ui-danger-text`, `--ui-danger-border`, `--ui-danger-shadow`, `--ui-error-size`, `--ui-error-weight`

The shipped `styles.css` is the authoritative list — every variable is declared there with its default.

### Structural variables take shorthand values

`--ui-control-border-width` feeds a `border-width` declaration, so it accepts the full shorthand grammar. An underline-only field style — no side or top borders — is one line:

```css
:root {
    --ui-control-border-width: 0 0 1px; /* bottom border only */
    --ui-control-radius: 0;
}
```

`--ui-field-margin` is likewise a full `margin` shorthand (default `0 0 1.25rem`). This is what makes the contract _structural_: radically different field shapes are variable maps, not CSS overrides.

### State-variant hooks

Each interactive state has background/text/border hooks. Every hook **defaults to its resting counterpart**, so the contract is a no-op until you opt in:

| Var                               | Fires on         | Default                          |
| --------------------------------- | ---------------- | -------------------------------- |
| `--ui-control-bg-focus`           | `:focus-visible` | `var(--ui-control-bg)`           |
| `--ui-control-text-focus`         | `:focus-visible` | `var(--ui-control-text)`         |
| `--ui-control-border-color-focus` | `:focus-visible` | `var(--ui-control-border-color)` |
| `--ui-control-border-width-focus` | `:focus-visible` | `var(--ui-control-border-width)` |
| `--ui-control-bg-invalid`         | `.is-invalid`    | `var(--ui-control-bg)`           |
| `--ui-control-text-invalid`       | `.is-invalid`    | `var(--ui-control-text)`         |

The `.is-open` and `.is-invalid` state classes follow `:focus-visible` in source order, so they keep winning their border/background — the focus hooks only take effect on a plain focused control.

### Two media queries the tokens do not reach

The stylesheet ends with two gated blocks that deliberately step **outside** the `--ui-*` contract, because the user's own preferences outrank the theme.

`@media (forced-colors: active)` — a high-contrast theme makes the user agent ignore author colours outright, so anything conveyed by colour alone disappears. Three states would: keyboard focus (painted through `box-shadow`, which forced-colors strips), the `aria-pressed` toggle state, and the `as` fallback's disabled state. The block restores each with a **system colour** — `Highlight` for the focus outline, `Highlight` / `HighlightText` for the pressed surface, `GrayText` for both disabled paths — rather than opting out with `forced-color-adjust`, since speaking the user's palette is the point of the mode. Your `--ui-pressable-bg-pressed` / `--ui-pressable-text-disabled` overrides do not apply there, and that is correct.

`@media (prefers-reduced-motion: reduce)` zeroes every transition the sheet declares, scoped to the `ui-*` surfaces that carry one so your own transitions stay untouched.

### Typography escape hatch

`--ui-control-font-size` (default `inherit`) sizes control text, and `--ui-control-line-height` (default `inherit`) completes the decomposition. The control's `font` is decomposed into longhands — all inheriting except the two var-keyed ones — so both read from their variable rather than from a consumer utility class, which would otherwise lose the source-order tie against the package stylesheet. The listbox popup gets its own hook, `--ui-menu-font-size` (default `inherit` — the popup never leaves the control, so it inherits from the component root), so an adapter never needs a `text-[13px]` utility on the popup.

### Menu width clamps

`--ui-menu-min-width` (default `100%` — of the `.ui-menu-anchor`, i.e. the trigger width) and `--ui-menu-max-width` (default `none`) clamp the listbox popup without a specificity fight:

```css
:root {
    --ui-menu-min-width: max(100%, 240px);
    --ui-menu-max-width: calc(100vw - 16px);
}
```

`100%` means the trigger width: the popup sits inside a `.ui-menu-anchor` box that floating-ui sizes to the trigger. When the menu outgrows the trigger, the anchor grows with it.

### Touch targets

`--ui-control-min-height` and `--ui-option-min-height` (both default `auto` — the measured status quo) put a floor under the control and the listbox options. WCAG 2.5.5's 44px minimum target is deliberately the **consumer's** call — assign the floor under your own coarse-pointer media query:

```css
@media (hover: none) and (pointer: coarse) {
    :root {
        --ui-control-min-height: 2.75rem;
        --ui-option-min-height: 2.75rem;
    }
}
```

## Two Themes, One Component Set

The centerpiece of the contract: the panels below render **the same components, bound to the same state** — select a fruit in one panel and the other follows. Only the `--ui-*` map differs. Note this is not just palette: border width, radius, shadow shape, label casing, and chip geometry all diverge.

<ClientOnly>
<div class="demo-theme-compare">
<div class="demo-theme-panel demo-soft">
<p class="demo-theme-title">Soft</p>
<FormField id="soft-name" label="Full name" required :error="themeNameError" #default="{controlId, describedby, invalid}">
<TextInput :id="controlId" v-model="themeName" placeholder="Ada Lovelace" :invalid="invalid" :describedby="describedby" />
</FormField>
<FormField id="soft-fruit" label="Favourite fruit" #default="{controlId, describedby, invalid}">
<SingleSelect :id="controlId" v-model="themeFruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<FormField id="soft-toppings" label="Toppings" #default="{controlId, describedby, invalid}">
<MultiSelect :id="controlId" v-model="themeToppingIds" :options="toppings" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
</div>
<div class="demo-theme-panel demo-brutalist">
<p class="demo-theme-title">Brutalist</p>
<FormField id="hard-name" label="Full name" required :error="themeNameError" #default="{controlId, describedby, invalid}">
<TextInput :id="controlId" v-model="themeName" placeholder="Ada Lovelace" :invalid="invalid" :describedby="describedby" />
</FormField>
<FormField id="hard-fruit" label="Favourite fruit" #default="{controlId, describedby, invalid}">
<SingleSelect :id="controlId" v-model="themeFruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
<FormField id="hard-toppings" label="Toppings" #default="{controlId, describedby, invalid}">
<MultiSelect :id="controlId" v-model="themeToppingIds" :options="toppings" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
</div>
</div>
</ClientOnly>

The two maps, in full — each is nothing but variable assignments:

::: code-group

```css [soft.css]
.demo-soft {
    --ui-label-color: #6b7280;
    --ui-label-size: 0.8125rem;
    --ui-control-bg: #f9fafb;
    --ui-control-bg-focus: #ffffff; /* state-variant hook in action */
    --ui-control-text: #1f2937;
    --ui-control-border-color: #e5e7eb;
    --ui-control-border-color-focus: #a5b4fc;
    --ui-control-border-open: #6366f1;
    --ui-control-radius: 14px;
    --ui-control-shadow: inset 0 1px 2px rgba(17, 24, 39, 0.04);
    --ui-focus-ring: 0 0 0 4px rgba(99, 102, 241, 0.18);
    --ui-menu-bg: #ffffff;
    --ui-menu-border-color: #e5e7eb;
    --ui-menu-radius: 14px;
    --ui-menu-shadow: 0 12px 32px rgba(17, 24, 39, 0.12);
    --ui-option-radius: 10px;
    --ui-option-bg-active: #eef2ff;
    --ui-chip-bg: #eef2ff;
    --ui-chip-text: #4338ca;
    --ui-chip-radius: 999px;
}
```

```css [brutalist.css]
.demo-brutalist {
    --ui-label-color: #111111;
    --ui-label-size: 0.75rem;
    --ui-label-weight: 700;
    --ui-label-transform: uppercase;
    --ui-label-tracking: 0.08em;
    --ui-control-bg: #ffffff;
    --ui-control-text: #111111;
    --ui-control-border-width: 2px;
    --ui-control-border-color: #111111;
    --ui-control-border-open: #111111;
    --ui-control-radius: 0;
    --ui-control-shadow: 4px 4px 0 #111111;
    --ui-control-shadow-hover: 4px 4px 0 #111111;
    --ui-focus-ring: 0 0 0 3px #ffd43b;
    --ui-menu-bg: #ffffff;
    --ui-menu-border-width: 2px;
    --ui-menu-border-color: #111111;
    --ui-menu-radius: 0;
    --ui-menu-shadow: 8px 8px 0 #111111;
    --ui-option-radius: 0;
    --ui-option-bg-active: #ffd43b;
    --ui-chip-bg: #111111;
    --ui-chip-text: #ffffff;
    --ui-chip-radius: 0;
    --ui-danger-text: #c2255c;
    --ui-danger-border: #c2255c;
    --ui-danger-shadow: 4px 4px 0 #c2255c;
}
```

:::

## Adoption Playbook

Lessons from live adoptions, distilled. Following these keeps an adoption to a few hours instead of a few days.

### Map tokens, never bake hex

Write **one** token map that assigns your design system's variables to the `--ui-*` contract:

```css
:root {
    --ui-control-bg: var(--app-surface);
    --ui-control-text: var(--app-text-primary);
    --ui-control-border-color: var(--app-border);
    --ui-danger-text: rgb(var(--app-danger-rgb));
    /* … */
}
```

Never copy resolved hex values into the map. When the map points at your tokens, everything your token layer already does — dark/light switching, density modes, per-tenant palettes — travels to the components **for free**. A map of baked hex values freezes one snapshot of your theme and silently detaches from every future token change.

### One map per app in a multi-design-system codebase

If one repository serves multiple apps with different design languages, write **one map per app, colocated with that app** — and keep any shared/unbranded layer free of design-system-specific maps. The maps will usually differ in palette but agree in structure; that is the contract working as intended. A single "shared" map naming several design systems couples layers that are deliberately separate.

### Keep your components as thin adapters

Adopting does not mean rewriting every call site. The proven pattern: reshape your existing component (`AppSelect`, `BaseInput`, …) into a **thin adapter** over the ui-inputs atom — preserving your call-site API and absorbing any value-type or boolean impedance inside the adapter. Call sites stay untouched; the behaviour, a11y wiring, and theming migrate underneath them.

### Nullable values

Every text-like input models `string | null` and `NumberInput` models `number | null`, matching how a backend serialises a nullable column:

- A `null` from the backend **binds directly** — the control renders empty. No `?? ''` at the call site; a smuggled fallback there hides real `null`s from your form logic.
- Clearing a string input emits `''` (the raw native value). A Laravel backend's `ConvertEmptyStringsToNull` middleware maps that back to `null` on submit — the fleet convention.
- `NumberInput` is the one exception: an empty number input emits `null` (not `NaN`, not `''`), since a `number` model can never hold `''` honestly. The `NaN` → `null` guard lives in the component — delete your local ones.
- A field that is nullable on the wire but non-null in your domain (e.g. a quantity defaulting to 1) should use a **decoupled local ref** coerced at submit time — widen the local form state, never the wire type.

### The accessibility model

The select family keeps DOM focus on the trigger and conveys the keyboard-focused option via `aria-activedescendant`, so arrow-key navigation is announced rather than silent. The wiring, so you know what you are getting:

- The trigger carries `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls` while open (the IDREF only resolves inside the listbox it owns).
- Option ids are **position-keyed** (`${id}-opt-${index}`) — derived from the option's position in the rendered list, not from `option.id`, so a non-unique or whitespace-containing id can never break the IDREF linkage.
- `aria-selected` marks the **committed** value, never the option under the keyboard pointer — keyboard/hover focus stays visual (`.is-active`) plus `aria-activedescendant`; selection only moves on <kbd>Enter</kbd> or click.
- `MultiSelect`'s and `MultiCombobox`'s listboxes are `aria-multiselectable="true"`; `aria-selected` marks membership, and every chip's remove button carries an accessible name (`"${removeLabel} ${label}"`). `MultiCombobox` additionally conveys the committed selection through an `aria-describedby` summary (its input's accessible value is the query).
- <kbd>Home</kbd>/<kbd>End</kbd> jump the keyboard highlight to the first/last option while the listbox is open, and the empty state (`emptyText`) is announced through a persistent, visually-hidden `aria-live="polite"` region — a filtered list draining to nothing is never silent.
- `required` and `invalid` are conveyed via `aria-required` / `aria-invalid`; pair `describedby` with the error element's id — `FormField` does all of this for you.

`Pressable` and `Disclosure` follow the same rule from the other end: rather than describing a control to assistive tech, they _are_ the control — a real `<button>`, whose role, focusability and activation the platform supplies. The only ARIA either sets by hand is the state a button has no native equivalent for (`aria-pressed`, `aria-expanded` + `aria-controls`).

Preserve this model when writing adapters: pass `id`, `invalid`, and `describedby` through, don't re-create them.

### Errors are a prop, never a service

The components never import an error service. Resolve the message in your app — from a validation-error bag, a translation layer, wherever — and pass `error` (to `FormField`) or `invalid` + `describedby` (to the inputs). This keeps the package agnostic to how your app produces validation errors, and composes cleanly with [fs-form](/packages/form)'s 422 error bag.

### Testing in a consumer (`shallowMount` architectures)

Because the atoms live inside `FormField`'s scoped slot, a codebase whose unit tests standardise on `shallowMount` needs a targeted unstub to reach the real controls:

```typescript
shallowMount(MyFormSection, {global: {stubs: {FormField: false, TextInput: false, SingleSelect: false}}});
```

Let integration tests (`mount`) own real composition. Two more test-surface notes:

- `findComponent(SingleSelect)` trips TypeScript on the generic component object — use `findComponent({name: 'SingleSelect'})` instead.
- Don't copy the package's internal `required || undefined` idiom into a call site where `required` is constant-true — on a branch-coverage-gated codebase that's a permanently dead branch. Bind the literal.

### What the package does not cover

No file or range atoms; no date _picker_ (`DateInput` wraps the native control); no headless combobox-_input_ primitive; no imperative focus handle on `TextInput` (only `Combobox` exposes `focus()`). When you need one of these, inline native markup inside `FormField`'s slot — the slot hands you `controlId`, `describedby`, and `invalid`, so a native control composes with the label/error chrome without waiting on a package atom.

<script setup lang="ts">
import {computed, ref} from 'vue';

import {Checkbox, CheckboxGroup, Combobox, Disclosure, FormField, GroupCombobox, GroupSelect, MultiCombobox, MultiSelect, Pressable, RadioGroup, SingleSelect, Switch, TextInput} from '../../packages/ui-inputs/src/index';

import '../../packages/ui-inputs/styles.css';

const fruits = [
    {id: 'apple', name: 'Apple'},
    {id: 'banana', name: 'Banana'},
    {id: 'cherry', name: 'Cherry'},
    {id: 'dragonfruit', name: 'Dragonfruit'},
    {id: 'elderberry', name: 'Elderberry'},
];

const cities = [
    {id: 'ams', name: 'Amsterdam'},
    {id: 'ber', name: 'Berlin'},
    {id: 'lis', name: 'Lisbon'},
    {id: 'mad', name: 'Madrid'},
    {id: 'osl', name: 'Oslo'},
    {id: 'pra', name: 'Prague'},
    {id: 'rom', name: 'Rome'},
    {id: 'vie', name: 'Vienna'},
];

const toppings = [
    {id: 'caramel', name: 'Caramel'},
    {id: 'hazelnut', name: 'Hazelnut'},
    {id: 'sprinkles', name: 'Sprinkles'},
    {id: 'whipped-cream', name: 'Whipped cream'},
];

const sizes = [
    {id: 'small', name: 'Small'},
    {id: 'medium', name: 'Medium'},
    {id: 'large', name: 'Large'},
];

const pressCount = ref(0);
const bold = ref(false);

const fruit = ref<string | null>(null);
const city = ref<string | null>(null);
const toppingIds = ref<string[]>([]);
const tagIds = ref<string[]>([]);

const fruitGroups = [
    {text: 'Tropical', options: [{id: 'mango', name: 'Mango'}, {id: 'kiwi', name: 'Kiwi'}, {id: 'papaya', name: 'Papaya'}]},
    {text: 'Stone', options: [{id: 'apricot', name: 'Apricot'}, {id: 'peach', name: 'Peach'}, {id: 'plum', name: 'Plum'}]},
];
const groupFruit = ref<string | null>(null);
const groupFruitSearch = ref<string | null>(null);

const accepted = ref(false);
const notifications = ref(true);
const extraIds = ref<string[]>(['sprinkles']);
const size = ref<string | null>(null);

const email = ref<string | null>('you@example.com');
const emailError = computed(() => (email.value ? undefined : 'The email field is required.'));

const themeName = ref<string | null>(null);
const themeNameError = computed(() => (themeName.value === null ? undefined : themeName.value ? undefined : 'The full name field is required.'));
const themeFruit = ref<string | null>('apple');
const themeToppingIds = ref<string[]>(['caramel', 'sprinkles']);
</script>

<style>
/* Demo containers — the --ui-* map onto this site's own theme tokens. */
.ui-demo {
    --ui-control-bg: var(--vp-c-bg);
    --ui-control-bg-disabled: var(--vp-c-bg-soft);
    --ui-control-text: var(--vp-c-text-1);
    --ui-control-text-muted: var(--vp-c-text-2);
    --ui-control-border-color: var(--vp-c-divider);
    --ui-control-border-open: var(--vp-c-brand-1);
    --ui-focus-ring: 0 0 0 3px var(--vp-c-brand-soft);
    --ui-label-color: var(--vp-c-text-1);
    --ui-menu-bg: var(--vp-c-bg-elv);
    --ui-menu-border-color: var(--vp-c-divider);
    --ui-option-bg-active: var(--vp-c-default-soft);
    --ui-field-margin: 0;
    padding: 1.5rem;
    border: 1px solid var(--vp-c-divider);
    border-radius: 8px;
    background: var(--vp-c-bg-soft);
    margin: 1rem 0;
}
.ui-demo__state {
    margin: 0.75rem 0 0;
    font-size: 0.8125rem;
    color: var(--vp-c-text-2);
}

/* VitePress's `.vp-doc ul` / `.vp-doc li + li` rules (0,1,1 / 0,1,2) outweigh the
   package's single-class menu selectors (0,1,0), re-adding list markers, indent, and
   inter-item margins inside the demos — something no real consumer sees. Restore the
   package's own menu layout at winning specificity. Chips are spans; the only <ul>s
   in the demos are the listbox menus (and the grouped listbox's nested role="group"
   sub-lists). */
.vp-doc .ui-demo ul[role='listbox'],
.vp-doc .ui-demo ul[role='group'],
.vp-doc .demo-theme-panel ul[role='listbox'],
.vp-doc .demo-theme-panel ul[role='group'] {
    list-style: none;
    margin: 0.25rem 0 0;
    padding: var(--ui-menu-pad);
}
.vp-doc .ui-demo ul[role='group'],
.vp-doc .demo-theme-panel ul[role='group'] {
    margin: 0;
    padding: 0;
}
.vp-doc .ui-demo ul[role='listbox'] li + li,
.vp-doc .ui-demo ul[role='group'] li + li,
.vp-doc .demo-theme-panel ul[role='listbox'] li + li,
.vp-doc .demo-theme-panel ul[role='group'] li + li {
    margin-top: 0;
}

/* The two-theme comparison. Each panel commits to a light rendering deliberately —
   the themes are the demo, not the site's dark/light mode. */
.demo-theme-compare {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 1rem 0;
}
.demo-theme-panel {
    flex: 1 1 280px;
    min-width: 0;
    padding: 1.5rem;
    border: 1px solid var(--vp-c-divider);
    border-radius: 8px;
}
.demo-theme-title {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--vp-c-text-2);
}

.demo-soft {
    background: #fafbff;
    --ui-label-color: #6b7280;
    --ui-label-size: 0.8125rem;
    --ui-control-bg: #f9fafb;
    --ui-control-bg-focus: #ffffff;
    --ui-control-text: #1f2937;
    --ui-control-text-muted: #9ca3af;
    --ui-control-border-color: #e5e7eb;
    --ui-control-border-color-focus: #a5b4fc;
    --ui-control-border-open: #6366f1;
    --ui-control-radius: 14px;
    --ui-control-shadow: inset 0 1px 2px rgba(17, 24, 39, 0.04);
    --ui-focus-ring: 0 0 0 4px rgba(99, 102, 241, 0.18);
    --ui-menu-bg: #ffffff;
    --ui-menu-border-color: #e5e7eb;
    --ui-menu-radius: 14px;
    --ui-menu-shadow: 0 12px 32px rgba(17, 24, 39, 0.12);
    --ui-option-radius: 10px;
    --ui-option-bg-active: #eef2ff;
    --ui-chip-bg: #eef2ff;
    --ui-chip-text: #4338ca;
    --ui-chip-radius: 999px;
}

.demo-brutalist {
    background: #fffdf5;
    --ui-label-color: #111111;
    --ui-label-size: 0.75rem;
    --ui-label-weight: 700;
    --ui-label-transform: uppercase;
    --ui-label-tracking: 0.08em;
    --ui-control-bg: #ffffff;
    --ui-control-text: #111111;
    --ui-control-text-muted: #6b7280;
    --ui-control-border-width: 2px;
    --ui-control-border-color: #111111;
    --ui-control-border-open: #111111;
    --ui-control-radius: 0;
    --ui-control-shadow: 4px 4px 0 #111111;
    --ui-control-shadow-hover: 4px 4px 0 #111111;
    --ui-focus-ring: 0 0 0 3px #ffd43b;
    --ui-menu-bg: #ffffff;
    --ui-menu-border-width: 2px;
    --ui-menu-border-color: #111111;
    --ui-menu-radius: 0;
    --ui-menu-shadow: 8px 8px 0 #111111;
    --ui-option-radius: 0;
    --ui-option-bg-active: #ffd43b;
    --ui-chip-bg: #111111;
    --ui-chip-text: #ffffff;
    --ui-chip-radius: 0;
    --ui-danger-text: #c2255c;
    --ui-danger-border: #c2255c;
    --ui-danger-shadow: 4px 4px 0 #c2255c;
}
</style>
