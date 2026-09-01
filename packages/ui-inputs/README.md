# @script-development/ui-inputs

Headless, themeable Vue 3 UI components — **form inputs** plus the **interactive controls that carry no value**
(`Pressable`, `Disclosure`) — styled entirely through `--ui-*` CSS custom properties.

Part of the Armory `ui-*` family. The components ship **no token vocabulary and no colour literal** — you map your design tokens onto the `--ui-*` contract once, and every component follows. Kendo-soft or brutalist, light or dark, from one component set.

## Install

```sh
npm install @script-development/ui-inputs
```

Peer dependency: `vue@^3.5`. Import the stylesheet once (e.g. in your entry):

```ts
import '@script-development/ui-inputs/style.css';
```

## Components

| Component                 | Purpose                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FormField`               | Label + error + required-marker composition wrapper (error-as-prop)                                                                                                                 |
| `FormLabel` / `FormError` | The atoms `FormField` composes                                                                                                                                                      |
| `TextInput`               | Native `text` / `email` / `password` / `search` / `tel` / `url` input                                                                                                               |
| `NumberInput`             | Native `number` input; owns the `NaN`→`null` empty-value guard                                                                                                                      |
| `DateInput`               | Native `date` input                                                                                                                                                                 |
| `Textarea`                | Native `textarea` with `rows`                                                                                                                                                       |
| `Checkbox`                | Native checkbox, visually restyled; non-nullable `boolean` model, `indeterminate` as a visual prop                                                                                  |
| `CheckboxGroup`           | Fieldset/legend group of checkboxes — models an array of option ids in **options order**                                                                                            |
| `Switch`                  | The checkbox chassis with `role="switch"` — an on/off toggle with a themeable track + thumb                                                                                         |
| `RadioGroup`              | Fieldset/legend radio group (`role="radiogroup"`) — models `T['id'] \| null`; **native** roving focus and arrow-key selection                                                       |
| `SingleSelect`            | Accessible button-triggered listbox over `@floating-ui/vue`, generic over your option type                                                                                          |
| `Combobox`                | Accessible **searchable/filtering** single-select — a text input that filters the listbox as you type; exposes an imperative `focus()` handle                                       |
| `MultiSelect`             | Accessible **multi-value** select — models an array of option ids; toggle-in-place listbox that stays open on commit, inline chip bar with per-chip remove                          |
| `MultiCombobox`           | Accessible **searchable multi-value** select — MultiSelect's array model + chips with Combobox's filter-as-you-type input as the trigger                                            |
| `GroupSelect`             | Accessible **grouped** single-select — `SingleSelect` over caller-ordered `groups` with `role="group"` headers; models `T['id'] \| null`                                            |
| `GroupCombobox`           | Accessible **searchable grouped** single-select — `GroupSelect`'s grouped listbox with `Combobox`'s filter-as-you-type input; exposes `focus()`                                     |
| `Pressable`               | A real `<button>` for an interactive control that carries **no value** — the keyboard-correct replacement for `<span @click>` / `<div @click>`; optional `aria-pressed` toggle mode |
| `Disclosure`              | Show/hide a region from a real `<button>` carrying `aria-expanded` + `aria-controls`; optionally wrapped in a real heading — the replacement for `<h2 @click>`                      |

```vue
<FormField id="fruit" label="Fruit" :error="errors.fruit" #default="{controlId, describedby, invalid}">
    <SingleSelect :id="controlId" v-model="fruit" :options="fruits" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

### The select family's shared extras

**Per-option content — the `#option` scoped slot.** All four selects render each option's
plain display string by default; the `option` slot replaces that content with your own
(colour swatches, icons, rich labels). The payload is `{option, index, selected, active}` —
typed against your option type `T`. Highlight and selection chrome (`.is-active`,
`aria-selected`) stay on the option row, **outside the slot**, so custom content never
re-creates them:

```vue
<SingleSelect id="label" v-model="labelId" :options="labels" label="name">
    <template #option="{option}">
        <span class="swatch" :style="{background: option.color}" /> {{ option.name }}
    </template>
</SingleSelect>
```

**Muted options.** `mutedOptions` (an array of option ids) renders the matching options
visually muted (`.is-muted`, themed by `--ui-option-text-muted`). Muted is **not** disabled:
muted options stay committable and stay in the keyboard path — use it for de-emphasis
("already assigned", "archived"), never for gating.

**The open menu is promoted to the top layer.** The listbox carries the
[Popover API](https://developer.mozilla.org/docs/Web/API/Popover_API)'s `popover` attribute, so
while open the browser paints it in the **top layer** — above everything, clipped by nothing.
An `overflow: hidden` or stacking-context ancestor of the trigger can no longer cut it off,
which is the whole of KD-1136.

Crucially the menu is **never moved in the DOM**. It stays inside the control, so:

- your `--ui-*` map keeps applying, wherever you declared it — an app-shell class or a
  `<style scoped>` block reaches the menu exactly as it reaches the trigger;
- a control inside a shadow root keeps its encapsulated styles on the menu;
- click-outside stays honest, because the menu really is inside the control.

Requires the Popover API: Chrome 114+, Safari 17+, Firefox 125+ (Baseline since April 2024).

**Home/End + the empty-state announcement.** While the listbox is open, **Home** jumps the
keyboard highlight to the first option and **End** to the last — one shared keyboard skeleton,
all four selects (on the input-triggered `Combobox`/`MultiCombobox` this deliberately trades
away caret jumps while the popup is open; both readings are APG-sanctioned). And the empty
state ("No options" / `emptyText`) is **announced**, not just painted: every select carries a
persistent, visually-hidden `aria-live="polite"` region that speaks the empty text the moment
the (filtered) list drains to nothing — which matters most on the filterable components,
where typing can drain the list silently.

**The committing clear entry (`SingleSelect` / `Combobox`).** `clearLabel` renders a
committing entry **above** the options — choosing it commits `null` and closes, exactly like
choosing an option. It lives outside the option index space: its own keyboard slot between
"nothing highlighted" and the first option, its own `${id}-clear` id for
`aria-activedescendant`, and `aria-selected="true"` while the model is null. Pair it with
`emptyDisplayValue` — the string the trigger (or the Combobox input) renders as a **value**
when the model is null ("No sprint (backlog)") instead of the muted placeholder / blank
input. The entry is danger-toned by default (`--ui-clear-text`, chains to
`--ui-danger-text`).

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

### Combobox

`Combobox` shares `SingleSelect`'s generic contract (`:options`, `label`, `v-model`, `alphabeticalSort`,
`optionsLabel`, `emptyText`, `invalid`, `describedby`, `required`) but the trigger is a text `<input>`.
As the user types, the listbox filters to options whose label contains the query
(`labelOf(o).toLowerCase().includes(query)`), then the same optional alphabetical sort applies; an empty
query shows everything. Arrow keys and Enter navigate/commit the **filtered** list. On commit the input
shows the chosen label; on Escape, Tab, or a click outside the control the input snaps back to the
committed label so a half-typed non-match never lingers.

**Browse-to-change.** A query equal to the committed rendering (the committed option's label, or
`emptyDisplayValue` on a committed null) does **not** filter — opening a filled combobox shows the
full list, and the committed label sits fully selected so the first keystroke replaces it and starts
a fresh filter. The filter engages only once the query diverges from the committed rendering.

```vue
<FormField id="city" label="City" :error="errors.city" #default="{controlId, describedby, invalid}">
    <Combobox ref="cityBox" :id="controlId" v-model="city" :options="cities" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

**Imperative focus handle.** `Combobox` exposes `focus()` via `defineExpose`, so a parent can move DOM
focus onto the input programmatically (`cityBox.value?.focus()`) — the piece a focus-trap / command-palette
integration needs.

### MultiSelect

`MultiSelect` shares the family's generic contract (`:options`, `label`, `alphabeticalSort`,
`optionsLabel`, `emptyText`, `invalid`, `describedby`, `required`) but models **an array of option
ids** (`v-model="tagIds"`). Committing an option — Enter or click — **toggles its membership and the
listbox stays open**, so picking several values is one open/close cycle, not five. The committed
values render as an inline chip bar inside the control; every chip carries its own remove button
(`aria-label="${removeLabel} <label>"` — `removeLabel` defaults to `'Remove'` and is a prop so Dutch
territories can localise it, like `optionsLabel`), and **Backspace on the focused trigger pops the
last committed value**. There is no text input and no filtering — that stays `Combobox`'s job.

```vue
<FormField id="tags" label="Tags" :error="errors.tags" #default="{controlId, describedby, invalid}">
    <MultiSelect :id="controlId" v-model="tagIds" :options="tags" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

The listbox is marked `aria-multiselectable="true"`; `aria-selected` marks committed **membership**
(selected options remain listed, toggled in place), while the keyboard pointer stays conveyed by
`aria-activedescendant` — the same position-keyed `${id}-opt-${index}` option-id scheme as
`SingleSelect` (see below), so an unusual `option.id` can never break the IDREF linkage. An id whose
option has not loaded yet (async options) stays in the model but renders no chip until it resolves.

Chips theme through `--ui-chip-bg` / `--ui-chip-text` / `--ui-chip-radius` / `--ui-chip-pad`, each
defaulting to an existing resting token (`--ui-option-bg-active`, `--ui-control-text`,
`--ui-option-radius`) — neutral out of the box, remap to opt in.

### MultiCombobox

`MultiCombobox` is `MultiSelect`'s **searchable** sibling: the same `T['id'][]` model,
toggle-in-place commits, chip bar (with `removeLabel`), and `aria-multiselectable` listbox —
but the trigger is Combobox's filter-as-you-type text `<input>` (the APG-canonical
input-as-trigger combobox; an in-popup search field has an awkward focus story). The list
opens on focus, click, or typing.

The **multi-specific query choreography** differs from `Combobox`, because there is no single
committed label to snap to. The input rests **empty + placeholder**; on every toggle-commit
the popup **stays open**, the **query clears** so the full list is re-offered, and DOM focus
**returns to the input** — so picking several values is type, Enter, type, Enter. Escape,
Tab, or a click outside closes and clears the query. **Backspace with an empty query pops the
last chip** (with text in the query it stays native editing). Since the input's own value is
the query, the committed selection is additionally conveyed to assistive tech through an
`aria-describedby` summary (the input-as-trigger analogue of MultiSelect's hidden value span).

```vue
<FormField id="tags" label="Tags" :error="errors.tags" #default="{controlId, describedby, invalid}">
    <MultiCombobox :id="controlId" v-model="tagIds" :options="tags" label="name" :invalid="invalid" :describedby="describedby" />
</FormField>
```

Like `Combobox` it exposes an imperative `focus()` handle. `clearLabel` / `emptyDisplayValue`
deliberately do not transfer — an empty array is the multi "nothing", so there is no `null`
to commit and no committed label to name.

### Grouped selects (`GroupSelect` / `GroupCombobox`)

`GroupSelect` and `GroupCombobox` are the single-selects for options that arrive **already
partitioned** — active sprints above the backlog, tropical fruit above stone fruit. They
mirror `SingleSelect` / `Combobox` closely (model `T['id'] | null`, the `#option` slot,
`mutedOptions`, `clearLabel`, the announced empty state, the top-layer popup, and — on
`GroupCombobox` — the imperative `focus()` handle) with one contract swap: **`options` becomes
`groups`**.

```ts
groups: {options: T[]; text: string; header?: boolean}[];
```

Each group carries its own `options`, a header `text`, and an optional `header` flag. Groups
render in **caller order** — there is no `alphabeticalSort`, because the partition _is_ the
order — and the flat option index runs through them in sequence, so a single `v-model` selects
across the whole set.

- A **named** group renders `text` as a `role="group"` header labelling its options for
  assistive tech.
- `header: false` renders a **headerless** group: its options render flat, and a boundary keeps
  them from folding into the preceding group's `role="group"`. Use it for a leading "ungrouped"
  run above the named groups.
- An **empty** group (no options) renders nothing — no dangling header. On `GroupCombobox` this
  also covers a group the filter drains to nothing: a header never outlives its options.

```vue
<FormField id="fruit" label="Fruit" :error="errors.fruit" #default="{controlId, describedby, invalid}">
    <GroupSelect
        :id="controlId"
        v-model="fruit"
        :groups="[
            {text: 'Tropical', options: tropical},
            {text: 'Stone', options: stone},
        ]"
        label="name"
        :invalid="invalid"
        :describedby="describedby"
    />
</FormField>
```

### Checkbox family

`Checkbox`, `CheckboxGroup`, `Switch`, and `RadioGroup` all sit on a **native input chassis** —
a real `<input type="checkbox">` / `<input type="radio">` restyled with `appearance: none`, never
a div-with-role — so keyboard and assistive-tech semantics come from the platform.

**`Checkbox`** models a non-nullable `boolean` (`v-model="accepted"`) — a checkbox is never
"empty", unchecked IS `false`. The label renders inline via the `label` prop (the default slot
overrides it for rich content); the whole row is the hit target. `indeterminate` is a **prop**
mirrored onto the element's DOM property (drawn as a dash) — purely visual, it never touches the
model. Native `required` is never set; `aria-required` is the conveyance, like the whole family.
Undeclared attrs (`name`, `data-*`, …) fall through to the **input**, not the label root.

**`Switch`** is the same chassis with `role="switch"` on the native checkbox — the native checked
state maps to `aria-checked` (HTML-AAM), so the component never sets it by hand. Same
non-nullable `boolean` model; distinct track + thumb surface on `--ui-switch-*` vars.

**`CheckboxGroup`** renders a chrome-less `<fieldset>` with a `<legend>` (the `label` prop) and
one checkbox per option (`optionLabel` is the family's property-name-or-getter display resolver —
renamed from the selects' `label` because `label` is the legend here). It models
**`T['id'][]` kept in options order**, not click order; an id whose option has not arrived yet
(async options) is preserved at the tail. Error wiring is **one story**: `aria-describedby` (and
`aria-invalid`) live on the fieldset only — members mirror the invalid _styling_ but never repeat
the IDREF. Because ARIA forbids `aria-required` on `role=group`, the required state is conveyed
group-level through the legend: the visual `*` marker plus screen-reader-only text
(`requiredLabel`, default `'(required)'`, localisable).

**`RadioGroup`** is the same fieldset shape with native radios sharing one generated `name` (the
group id) — the **browser** provides the roving tabindex and arrow-key selection, the component
hand-rolls neither and only mirrors the model from `change`. It models `T['id'] | null` (`null` =
nothing selected, the SingleSelect shape). The fieldset carries `role="radiogroup"`, which —
unlike plain `group` — legitimately carries `aria-required`, so here the attribute is the
group-level conveyance.

```vue
<Checkbox id="terms" v-model="accepted" label="Accept the terms" />
<Switch id="notify" v-model="notifications" label="Email notifications" />
<CheckboxGroup id="toppings" v-model="toppingIds" :options="toppings" option-label="name" label="Toppings" />
<RadioGroup id="size" v-model="size" :options="sizes" option-label="name" label="Size" />
```

The family themes through `--ui-check-*` (box size, border — shorthand-valued like
`--ui-control-border-width` — checked fill, mark colour, radius, control↔label gap, group item
spacing) and `--ui-switch-*` (track width/height/radius, checked/unchecked track colours, thumb
size/colour). Every colour default derives from an existing resting token
(`--ui-control-bg`, `--ui-control-border-color`, `--ui-control-border-open`), so an existing
`--ui-*` token map themes the checkbox family with no new mappings — remap to opt in.

### Interactive controls that are not form inputs

`Pressable` and `Disclosure` carry no value and belong to no field. They exist because the single most
common accessibility defect in a Vue codebase is a click handler on an element that cannot receive one:
a bare `<span @click>` is invisible to the keyboard and announces no role (WCAG 2.1.1 _Keyboard_ and
4.1.2 _Name, Role, Value_, both Level A). No linter and no input component catches it.

**`Pressable` renders a real `<button type="button">`.** That is the whole design: focusability,
Enter/Space activation, `disabled` semantics and forced-colors treatment come from the platform,
correctly, for free — hand-rolled ARIA is the fallback, never the default. The chassis is
_chrome-less_ (transparent background, no border, no padding, inherited font), so swapping a
`<span @click>` for a `Pressable` changes the semantics without repainting the control. It lays out
as `inline-flex` — except on the tags whose own `display` their parent's layout algorithm requires,
where the component keeps the tag's own: a clickable `<tr>` stays a table row.

```vue
<Pressable label="Show example" @click="showExample" />
<Pressable v-model:pressed="bold" label="Bold" />
```

`v-model:pressed` opts into **toggle mode**: the control conveys `aria-pressed` and flips it on
activation. Left unbound the attribute is absent — a plain action button must not claim toggle
semantics. (This is the one place the package sets an ARIA state by hand, and deliberately: unlike
`Switch`, where `role="switch"` on a native checkbox lets the native checked state map to
`aria-checked`, a `<button>` has no native pressed state, so `aria-pressed` is the only conveyance
there is.) **Initialise the ref you bind**: `defineModel` cannot tell an unbound model from one
bound to `undefined`, so a `ref<boolean>()` left uninitialised produces a control that renders no
`aria-pressed` and silently never toggles — development warns when it sees a `pressed` binding
holding `undefined`. Give an icon-only control an accessible name with `aria-label` — undeclared
attrs fall through to the button, because here the root _is_ the interactive element.

**Both controls warn in development when they render with no accessible name.** `label` is optional
on `Pressable` and `Disclosure` alike and their slots may render empty, so nothing in the types stops
a consumer producing a focusable, correctly-roled, _unnamed_ control — a WCAG 4.1.2 (Level A)
failure, and on `Disclosure` a trigger whose only content is the `aria-hidden` chevron. On mount each
control checks that a name arrives by one of four routes — rendered content, `aria-label`,
`aria-labelledby` or `title` — and `console.warn`s once, naming all four, when none does. Rendered
content is counted the way the accessible name is computed: an `aria-hidden="true"` subtree
contributes nothing, so a control whose only content is a decorative icon still warns. Icon-only
usage with `aria-label` is legitimate and stays silent. It takes `aria-labelledby` at its word rather
than dereferencing the IDREF (the target may legitimately mount later), so a _dangling_ reference
passes it — axe is the layer that catches that one.

Every dev-only warning here is gated on `process.env.NODE_ENV`, which Vite and webpack substitute for
you; **rollup needs `@rollup/plugin-replace`**. Where nothing substitutes it the package fails
_silent_ rather than warning — a library must not `console.warn` into a host it cannot identify, and
a missing `process` global must not become a `ReferenceError` at mount.

**The `as` escape hatch is discouraged.** For the cases where a button genuinely cannot be used — a
clickable `<tr>`, an element whose parent forbids interactive content — `as` renders another tag and
the component hand-rolls the _whole_ contract together: `role="button"`, `tabindex`, Enter on keydown,
Space on keyup (dispatching a real click, so your own `@click` still runs), and a disabled emulation
(`tabindex="-1"` + `aria-disabled`, **plus a click stop**). Half a contract is worse
than none — and the stop is the half that is easy to miss. `as` is matched **case-insensitively**,
because `<component :is>` resolves tag names that way: `as="BUTTON"` renders a genuine native button
and takes the native path with it. The native path is **not** protected by
the browser here: Chromium withholds a click on a disabled `<button>` only for user activation, and a
`dispatchEvent` still runs every listener on one (measured). The stop is therefore what keeps a
fall-through `@click` off a disabled control on **both** paths, not a nicety the fallback needs and
the button does not. It is a real guard in the component — `preventDefault()` plus
`stopImmediatePropagation()`, in the **capture** phase — **not** a `pointer-events: none` in the
stylesheet: that rule takes the control out of hit-testing altogether, so a pointer over it targets
whatever sits behind it and an _ancestor's_ `@click` fires. The capture phase is what makes the whole
subtree inert: a bubble-phase stop on the root arrives only after a nested `<a href>` or
`<button @click>` has already run. And `preventDefault()` is the half no propagation stop can supply —
it withholds the element's _own_ default action, which is what keeps a disabled `as="a"` from
following its `href`. Never point `as` at an element the browser already activates (`a[href]`,
`summary`) — the component would hand-roll a `role="button"` and a second key-to-click translation on
top of the ones the element already has, and **development warns when you do**.

**Keys inside an `as` fallback belong to the child that has focus.** Both key handlers check the
event's origin and ignore anything that reached the root by bubbling, so a nested `<input>` keeps
its spacebar and a nested `<button>` keeps its own Enter. Without that check every Space typed into
an inline filter field is swallowed and converted into an activation of the row — the field cannot
hold a space at all. The check is deliberately **not** applied to the click handler: a click targets
the element under the pointer, so the ordinary `<Pressable as="div"><span>Label</span></Pressable>`
shape legitimately reports a child as the target, and the same guard there would stop the row
responding to the mouse. Keys follow focus; clicks follow the pointer. A **disabled** control is deaf to keys in the full
sense — both handlers stop the event rather than returning, so a consumer's fall-through
`@keydown`/`@keyup` does not run on it either; a disabled fallback keeps `tabindex="-1"`, which is out
of the tab order but still mouse-focusable. One consequence to plan for:
the child's own click still **bubbles**, so a row with its own `@click` counts an activation when a
nested button is pressed, by keyboard or mouse alike — put `@click.stop` on the child where that is
not what you want.

**`Disclosure`** shows and hides a region from a real button carrying `aria-expanded` and
`aria-controls`, paired to the panel by the stable `${id}-panel` derived id. Pass `headingLevel` and
the trigger is wrapped in a real `<h2>`…`<h6>`: **the heading contains the button, it never behaves as
one** — a heading with a click handler on it is the exact defect this replaces. Omit `headingLevel`
where the disclosure is not a section heading and the wrapper stays a plain div, leaving the document
outline untouched.

```vue
<Disclosure id="details" label="Details" :heading-level="2">
    <p>Anything at all.</p>
    <template #trigger>Rich <strong>trigger</strong> content</template>
</Disclosure>
```

Expansion is UI state, not form data, so — unlike the value-carrying components, whose model is
required — `Disclosure` works **uncontrolled** out of the box; bind `v-model:expanded` only when the
parent needs to drive or observe it. The panel is always mounted and hidden with `v-show`, never
`v-if`: `aria-controls` is an IDREF, and one pointing at nothing names no relationship for assistive
tech to expose — the reference has to resolve in both states. Wrap genuinely expensive panel content
in your own `v-if` inside the slot.

Both theme through `--ui-pressable-*` (gap, padding, min-height, background, text, font-size,
line-height, border width/colour, radius, disabled text, and the `[aria-pressed="true"]` pair) and
`--ui-disclosure-panel-pad` / `--ui-disclosure-panel-gap`. Every default is either neutral or derived
from an existing resting token, with one deliberate exception: `--ui-pressable-bg-pressed` defaults to
`--ui-option-bg-active` rather than to a no-op, because a toggle whose state reaches only a screen
reader is invisible to everyone else.

## Theming

Every visual rule keys on a `--ui-*` custom property — colours **and** structure (`--ui-control-border-width`, `--ui-control-radius`, `--ui-control-shadow`, `--ui-label-transform`, …). Remap them under any selector to theme the whole set; the shipped defaults render out of the box. Dark/light is orthogonal — pair with `@script-development/fs-theme`'s `data-theme` switching.

### State-variant hooks

The control has a background/text/border hook for each interactive state, so a strong focus or invalid treatment stays a one-line remap instead of a hand-written `:focus-visible` override block. Every hook **defaults to its resting counterpart**, so the contract is a no-op until you opt in:

| Var                               | Fires on         | Default                          |
| --------------------------------- | ---------------- | -------------------------------- |
| `--ui-control-bg-focus`           | `:focus-visible` | `var(--ui-control-bg)`           |
| `--ui-control-text-focus`         | `:focus-visible` | `var(--ui-control-text)`         |
| `--ui-control-border-color-focus` | `:focus-visible` | `var(--ui-control-border-color)` |
| `--ui-control-border-width-focus` | `:focus-visible` | `var(--ui-control-border-width)` |
| `--ui-control-bg-invalid`         | `.is-invalid`    | `var(--ui-control-bg)`           |
| `--ui-control-text-invalid`       | `.is-invalid`    | `var(--ui-control-text)`         |

The `.is-open` and `.is-invalid` state classes follow `:focus-visible` in source order, so they keep winning their border/background where they did before — the focus hooks only take effect on a plain focused control.

The listbox options carry the same discipline: `--ui-option-text-muted` (fires on `.is-muted`, defaults to the resting option text) and the MultiSelect membership pair `--ui-option-bg-selected` / `--ui-option-text-selected` (fire on `[aria-selected="true"]` in the MultiSelect popup, default `transparent` / resting text — the pointer highlight keeps winning its background). All no-ops until you opt in.

### Two media queries the tokens do not reach

The stylesheet ends with two gated blocks that deliberately step **outside** the `--ui-*` contract,
because the user's own preferences outrank the theme.

`@media (forced-colors: active)` — a high-contrast theme makes the user agent ignore author colours
outright, so anything conveyed by colour alone disappears. Three states would: keyboard focus
(painted through `box-shadow`, which forced-colors strips), the `aria-pressed` toggle state, and the
`as` fallback's disabled state. The block restores each with a **system colour** — `Highlight` for
the focus outline, `Highlight` / `HighlightText` for the pressed surface, `GrayText` for both
disabled paths — rather than opting out with `forced-color-adjust`, since speaking the user's
palette is the point of the mode. Your `--ui-pressable-bg-pressed` / `--ui-pressable-text-disabled`
overrides do not apply there, and that is correct.

`@media (prefers-reduced-motion: reduce)` zeroes every transition the sheet declares, scoped to the
`ui-*` surfaces that carry one so your own transitions stay untouched.

### Typography escape hatch

`--ui-control-font-size` (default `inherit`) sizes control text, and `--ui-control-line-height` (default `inherit`) completes the decomposition. The control's `font` is decomposed into longhands (`font-family`/`font-size`/`font-style`/`font-variant`/`font-weight`/`font-stretch`/`line-height`, all inheriting except the two var-keyed ones), so both read from their var rather than from a consumer utility class — which would otherwise lose the source-order tie against the package stylesheet. The defaults are byte-identical to the historical `font: inherit`. The listbox popup has its own hook: `--ui-menu-font-size` (default `inherit` — the popup never leaves the control, so it inherits from the component root; set the var to size menu text independently).

### Menu width clamps

`--ui-menu-min-width` (default `100%` — of the `.ui-menu-anchor`, i.e. the trigger width) and
`--ui-menu-max-width` (default `none`) clamp the listbox popup. A territory caps them without
fighting specificity:

```css
:root {
    --ui-menu-min-width: max(100%, 240px);
    --ui-menu-max-width: calc(100vw - 16px);
}
```

`100%` means the trigger width: the popup sits inside a `.ui-menu-anchor` box that floating-ui
sizes to the trigger. When the menu outgrows the trigger — a floor like the one above, or a long
option — the anchor grows with it, so the popup stays on-screen.

### Touch targets

`--ui-control-min-height` and `--ui-option-min-height` (both default `auto` — the measured status quo) put a floor under the control and the listbox options. WCAG 2.5.5's 44px target is the **consumer's** call: assign them under your own coarse-pointer media query rather than expecting the package to decide for every territory:

```css
@media (hover: none) and (pointer: coarse) {
    :root {
        --ui-control-min-height: 2.75rem;
        --ui-option-min-height: 2.75rem;
    }
}
```

## Nullable values

Every text-like input (`TextInput`, `DateInput`, `Textarea`) models `string | null`, and `NumberInput` models `number | null`. A `null` from a nullable backend column binds directly — the control renders empty, no `?? ''` at the call site. When the user clears the field, the string inputs emit `''` (the raw native value); a Laravel backend's `ConvertEmptyStringsToNull` middleware maps that back to `null` on submit. `NumberInput` is the one exception: an empty number input emits `null` (not `NaN`, not `''`), since a `number` model can never hold `''` honestly — so it round-trips to `null` without relying on the middleware.

## SingleSelect and assistive tech

The listbox keeps DOM focus on the trigger and conveys the keyboard-focused option with
`aria-activedescendant`, so arrow-key navigation is announced rather than silent. The trigger
carries `aria-controls` while open (the IDREF only resolves inside the listbox it owns), and each
option gets a stable `${id}-opt-${index}` keyed on its **position** in the rendered list, not on
`option.id`.

`aria-selected` marks the **committed** value — not the option under the keyboard pointer or the
mouse. Keyboard/hover focus is visual (`.is-active`) plus `aria-activedescendant`; selection only
moves on Enter or click. Because the IDREF is position-derived, a non-unique or
whitespace-containing `option.id` never breaks the `aria-activedescendant` linkage.

## Errors are a prop, never a service

The components never import an error service. Resolve the message in your app and pass `error` (to `FormField`) or `invalid` + `describedby` (to the inputs). That keeps the package agnostic to how your territory produces validation errors.
