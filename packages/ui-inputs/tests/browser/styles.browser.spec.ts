// Browser-mode CONTRACT spec (real Chromium) — scope: contract + interaction only; unit
// behaviour stays in the happy-dom suite; never duplicate a happy-dom spec here.
//
// First-ever coverage of styles.css: the shipped stylesheet applied in a real layout engine,
// asserted through getComputedStyle — the layer no happy-dom spec can see. Includes the
// WR-0512 regression pins (font-size source-order fight) and the state-variant hooks on a
// real keyboard :focus-visible.
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {cdp, page, userEvent} from 'vitest/browser';

// `?inline` yields the stylesheet as text so each test controls WHERE in the cascade the
// package sheet sits — the WR-0512 pins need both orderings, which a plain side-effect
// import (one fixed <style> position) cannot express.
import uiCss from '../../styles.css?inline';

const cleanupTargets: Element[] = [];

/** Append a stylesheet at the CURRENT end of <head> — later calls sit later in the cascade. */
const addStyle = (css: string): void => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    cleanupTargets.push(style);
};

/** A bare `<input class="ui-control">` inside a parent div (for inheritance assertions). */
const addControl = (parentStyle = ''): HTMLInputElement => {
    const parent = document.createElement('div');
    if (parentStyle) parent.setAttribute('style', parentStyle);
    const control = document.createElement('input');
    control.className = 'ui-control';
    parent.append(control);
    document.body.append(parent);
    cleanupTargets.push(parent);
    return control;
};

afterEach(() => {
    for (const el of cleanupTargets.splice(0)) el.remove();
    document.documentElement.removeAttribute('style');
});

describe('styles.css — resting defaults', () => {
    it('renders the documented resting --ui-* defaults on .ui-control', () => {
        addStyle(uiCss);
        const control = addControl();
        const computed = getComputedStyle(control);

        expect(computed.backgroundColor).toBe('rgb(255, 255, 255)'); // --ui-control-bg
        expect(computed.color).toBe('rgb(17, 24, 39)'); // --ui-control-text
        expect(computed.borderTopWidth).toBe('1px'); // --ui-control-border-width
        expect(computed.borderTopColor).toBe('rgb(209, 213, 219)'); // --ui-control-border-color
        expect(computed.borderTopLeftRadius).toBe('8px'); // --ui-control-radius
        expect(computed.boxShadow).toBe('none'); // --ui-control-shadow
    });

    it('renders the documented resting defaults on .ui-label and .ui-error', () => {
        addStyle(uiCss);
        const label = document.createElement('label');
        label.className = 'ui-label';
        const error = document.createElement('p');
        error.className = 'ui-error';
        document.body.append(label, error);
        cleanupTargets.push(label, error);

        expect(getComputedStyle(label).color).toBe('rgb(55, 65, 81)'); // --ui-label-color
        expect(getComputedStyle(label).fontSize).toBe('14px'); // --ui-label-size 0.875rem
        expect(getComputedStyle(error).color).toBe('rgb(220, 38, 38)'); // --ui-danger-text
        expect(getComputedStyle(error).fontSize).toBe('13px'); // --ui-error-size 0.8125rem
    });
});

describe('styles.css — :root overrides (the --ui-* contract)', () => {
    it('overriding --ui-* vars on :root changes computed values', () => {
        addStyle(uiCss);
        const control = addControl();

        document.documentElement.style.setProperty('--ui-control-bg', 'rgb(1, 2, 3)');
        document.documentElement.style.setProperty('--ui-control-border-color', 'rgb(4, 5, 6)');
        document.documentElement.style.setProperty('--ui-control-radius', '3px');

        const computed = getComputedStyle(control);
        expect(computed.backgroundColor).toBe('rgb(1, 2, 3)');
        expect(computed.borderTopColor).toBe('rgb(4, 5, 6)');
        expect(computed.borderTopLeftRadius).toBe('3px');
    });

    it('accepts a border-width SHORTHAND value (`0 0 1px` — the isms underline idiom)', () => {
        addStyle(uiCss);
        const control = addControl();
        document.documentElement.style.setProperty('--ui-control-border-width', '0 0 1px');

        const computed = getComputedStyle(control);
        expect(computed.borderTopWidth).toBe('0px');
        expect(computed.borderRightWidth).toBe('0px');
        expect(computed.borderLeftWidth).toBe('0px');
        expect(computed.borderBottomWidth).toBe('1px');
    });

    it('overriding --ui-menu-* vars changes the shared listbox popup', () => {
        addStyle(uiCss);
        const menu = document.createElement('ul');
        menu.className = 'ui-select__menu';
        document.body.append(menu);
        cleanupTargets.push(menu);

        expect(getComputedStyle(menu).maxHeight).toBe('240px'); // --ui-menu-max-height 15rem
        document.documentElement.style.setProperty('--ui-menu-max-height', '100px');
        expect(getComputedStyle(menu).maxHeight).toBe('100px');
    });

    // KD-1136: floating-ui positions a `.ui-menu-anchor` box, and the menu is a static box
    // inside it. That indirection is what keeps `--ui-menu-min-width: 100%` measuring the
    // TRIGGER after the teleport — a percentage on the menu resolves against the anchor.
    const addAnchoredMenu = (referenceWidth: string): {anchor: HTMLElement; menu: HTMLElement} => {
        const anchor = document.createElement('div');
        anchor.className = 'ui-menu-anchor';
        // What the size() middleware writes.
        anchor.style.minWidth = referenceWidth;
        const menu = document.createElement('ul');
        menu.className = 'ui-select__menu';
        anchor.append(menu);
        document.body.append(anchor);
        cleanupTargets.push(anchor);
        return {anchor, menu};
    };

    it('gives the anchor the position and stacking the menu used to carry', () => {
        addStyle(uiCss);
        const {anchor, menu} = addAnchoredMenu('180px');

        // `fixed` matches useListbox's floating-ui strategy — a top-layer box positions
        // against the viewport.
        expect(getComputedStyle(anchor).position).toBe('fixed');
        expect(getComputedStyle(anchor).zIndex).toBe('50');
        // The menu itself must NOT be positioned — the anchor owns it now.
        expect(getComputedStyle(menu).position).toBe('static');
    });

    it('resolves the default --ui-menu-min-width: 100% against the trigger, not the body', () => {
        addStyle(uiCss);
        const {menu} = addAnchoredMenu('180px');

        // body is far wider than 180px; a percentage against body would prove the bug.
        expect(document.body.getBoundingClientRect().width).toBeGreaterThan(300);
        expect(menu.getBoundingClientRect().width).toBe(180);
    });

    it("keeps a territory's max(100%, 240px) floor working, and grows the anchor with it", () => {
        addStyle(uiCss);
        // kendo's shipped override, verbatim (shared/styles/ui-inputs.css).
        document.documentElement.style.setProperty('--ui-menu-min-width', 'max(100%, 240px)');
        const {anchor, menu} = addAnchoredMenu('180px');

        expect(menu.getBoundingClientRect().width).toBe(240);
        // The anchor must grow too, or shift()/hide() would measure a box narrower than the
        // menu and stop keeping it on-screen.
        expect(anchor.getBoundingClientRect().width).toBe(240);
    });

    it('lets the trigger win when it is wider than the territory floor', () => {
        addStyle(uiCss);
        document.documentElement.style.setProperty('--ui-menu-min-width', 'max(100%, 240px)');
        const {menu} = addAnchoredMenu('320px');

        expect(menu.getBoundingClientRect().width).toBe(320);
    });
});

describe('styles.css — WR-0512 font-size source-order regression pins', () => {
    it('the default reproduces the historical `font: inherit` (control text follows the parent)', () => {
        addStyle(uiCss);
        const control = addControl('font-size: 18px');
        expect(getComputedStyle(control).fontSize).toBe('18px');
    });

    it('pins the trap: a declaration utility EARLIER in source order silently loses to the package sheet', () => {
        // Utility first, package sheet last — the arrangement WR-0512 documented: both
        // selectors are one class (0,1,0), so the later sheet wins the tie and the
        // utility's font-size silently vanishes under the package's font reset.
        addStyle('.text-sm { font-size: 13px; }');
        addStyle(uiCss);
        const control = addControl('font-size: 18px');
        control.classList.add('text-sm');

        expect(getComputedStyle(control).fontSize).toBe('18px');
    });

    it('the --ui-control-font-size var wins by contract, regardless of source order', () => {
        // The escape hatch WR-0511/WR-0512 shipped: the utility sets the VAR the package
        // rule reads instead of fighting the declaration tie — so it survives even when the
        // package sheet comes last (where a plain font-size utility loses, pinned above).
        addStyle('.size-sm { --ui-control-font-size: 13px; }');
        addStyle(uiCss);
        const control = addControl('font-size: 18px');
        control.classList.add('size-sm');

        expect(getComputedStyle(control).fontSize).toBe('13px');
    });

    it('the same declaration utility LATER in source order wins — order-dependence is what makes the trap silent', () => {
        addStyle(uiCss);
        addStyle('.text-sm { font-size: 13px; }');
        const control = addControl('font-size: 18px');
        control.classList.add('text-sm');

        expect(getComputedStyle(control).fontSize).toBe('13px');
    });
});

describe('styles.css — state-variant hooks on real states', () => {
    it('focus hooks fire on real keyboard :focus-visible', async () => {
        addStyle(uiCss);
        // Kill the 0.12s box-shadow/border-color transition for THIS test: the hooks under
        // test are the state-variant declarations, not the transition, and synchronous reads
        // are what turned the old intermittent poll timeout into a hard, diagnosable failure —
        // which exposed its true cause as the hover-masks-ring specificity defect (regression
        // test below), keyed on where earlier spec files happened to park the virtual mouse.
        addStyle('.ui-control { transition: none !important; }');
        const control = addControl();
        document.documentElement.style.setProperty('--ui-control-bg-focus', 'rgb(10, 20, 30)');
        document.documentElement.style.setProperty('--ui-control-text-focus', 'rgb(3, 4, 5)');
        document.documentElement.style.setProperty('--ui-control-border-color-focus', 'rgb(7, 8, 9)');
        document.documentElement.style.setProperty('--ui-control-border-width-focus', '3px');

        expect(getComputedStyle(control).backgroundColor).toBe('rgb(255, 255, 255)');

        // Real keyboard focus (Tab), not element.focus() — :focus-visible must match.
        await userEvent.tab();
        expect(document.activeElement).toBe(control);

        const focused = getComputedStyle(control);
        expect(focused.backgroundColor).toBe('rgb(10, 20, 30)');
        expect(focused.color).toBe('rgb(3, 4, 5)');
        expect(focused.borderTopWidth).toBe('3px');
        // Transition disabled above — border-color and box-shadow are synchronous too.
        expect(focused.borderTopColor).toBe('rgb(7, 8, 9)');
        expect(focused.boxShadow).not.toBe('none'); // --ui-focus-ring applied
    });

    it('the focus ring survives a pointer resting on the control — hover must not mask :focus-visible', async () => {
        addStyle(uiCss);
        addStyle('.ui-control { transition: none !important; }');
        const control = addControl();

        control.focus(); // a text input matches :focus-visible on ANY focus in Chromium
        expect(document.activeElement).toBe(control);
        expect(getComputedStyle(control).boxShadow).not.toBe('none'); // ring present

        // Park the real (CDP) mouse over the focused control: hover's box-shadow declaration
        // defaults to none, and at its old (0,3,0) specificity it beat the (0,2,0) focus rule —
        // silently stripping the keyboard focus ring (and the .is-open/.is-invalid shadows)
        // whenever the pointer rested on the control. The :where() fix keeps hover at (0,2,0)
        // so the later state rules win the tie.
        await userEvent.hover(control);
        expect(getComputedStyle(control).boxShadow).not.toBe('none'); // ring survives hover
    });

    it('focus hooks are a no-op until a territory opts in (defaults chain to the resting vars)', async () => {
        addStyle(uiCss);
        const control = addControl();

        await userEvent.tab();
        expect(document.activeElement).toBe(control);

        const focused = getComputedStyle(control);
        expect(focused.backgroundColor).toBe('rgb(255, 255, 255)'); // --ui-control-bg-focus → --ui-control-bg
        expect(focused.color).toBe('rgb(17, 24, 39)'); // --ui-control-text-focus → --ui-control-text
        expect(focused.borderTopWidth).toBe('1px'); // --ui-control-border-width-focus → resting width
    });

    it('.is-invalid keys on the danger vars and honors the bg/text invalid hooks', () => {
        addStyle(uiCss);
        const control = addControl();
        control.classList.add('is-invalid');

        expect(getComputedStyle(control).borderTopColor).toBe('rgb(220, 38, 38)'); // --ui-danger-border
        expect(getComputedStyle(control).backgroundColor).toBe('rgb(255, 255, 255)'); // hook no-op by default

        document.documentElement.style.setProperty('--ui-control-bg-invalid', 'rgb(9, 9, 9)');
        document.documentElement.style.setProperty('--ui-control-text-invalid', 'rgb(8, 7, 6)');
        expect(getComputedStyle(control).backgroundColor).toBe('rgb(9, 9, 9)');
        expect(getComputedStyle(control).color).toBe('rgb(8, 7, 6)');
    });

    it('a disabled control renders the disabled background and not-allowed cursor', () => {
        addStyle(uiCss);
        const control = addControl();
        control.disabled = true;

        expect(getComputedStyle(control).backgroundColor).toBe('rgb(243, 244, 246)'); // --ui-control-bg-disabled
        expect(getComputedStyle(control).color).toBe('rgb(107, 114, 128)'); // --ui-control-text-muted
        expect(getComputedStyle(control).cursor).toBe('not-allowed');
    });
});

/** The bare check chassis (label.ui-check > span.ui-check__control > input.ui-check__input). */
const addCheck = (radio = false): HTMLInputElement => {
    const row = document.createElement('label');
    row.className = 'ui-check';
    const holder = document.createElement('span');
    holder.className = 'ui-check__control';
    const input = document.createElement('input');
    input.type = radio ? 'radio' : 'checkbox';
    input.className = radio ? 'ui-check__input ui-radio__input' : 'ui-check__input';
    holder.append(input);
    row.append(holder);
    document.body.append(row);
    cleanupTargets.push(row);
    return input;
};

describe('styles.css — checkbox family (--ui-check-* / --ui-switch-*)', () => {
    it('renders the check chassis defaults, chained to the resting control tokens', async () => {
        addStyle(uiCss);
        const input = addCheck();
        const computed = getComputedStyle(input);

        expect(computed.appearance).toBe('none'); // native input restyled, never a div-with-role
        expect(computed.width).toBe('18px'); // --ui-check-size 1.125rem
        expect(computed.height).toBe('18px');
        expect(computed.borderTopWidth).toBe('1px'); // --ui-check-border-width → --ui-control-border-width
        expect(computed.borderTopColor).toBe('rgb(209, 213, 219)'); // → --ui-control-border-color
        expect(computed.borderTopLeftRadius).toBe('4px'); // --ui-check-radius
        expect(computed.backgroundColor).toBe('rgb(255, 255, 255)'); // --ui-check-bg → --ui-control-bg

        // :checked keys on --ui-check-bg-checked, defaulting to --ui-control-border-open.
        // Background sits in the chassis's 0.12s transition — poll past it.
        input.checked = true;
        await expect.poll(() => getComputedStyle(input).backgroundColor).toBe('rgb(37, 99, 235)');

        // The radio variant is the same chassis, rounded.
        expect(getComputedStyle(addCheck(true)).borderTopLeftRadius).toBe('50%');
    });

    it('honors --ui-check-* overrides, including a border-width SHORTHAND (the underline idiom)', async () => {
        addStyle(uiCss);
        const input = addCheck();
        document.documentElement.style.setProperty('--ui-check-size', '24px');
        document.documentElement.style.setProperty('--ui-check-border-width', '0 0 2px');
        document.documentElement.style.setProperty('--ui-check-bg-checked', 'rgb(1, 2, 3)');

        const computed = getComputedStyle(input);
        expect(computed.width).toBe('24px');
        expect(computed.borderBottomWidth).toBe('2px');
        expect(computed.borderTopWidth).toBe('0px');

        input.checked = true;
        await expect.poll(() => getComputedStyle(input).backgroundColor).toBe('rgb(1, 2, 3)');
    });

    it('renders the switch track geometry and travels the thumb by track-width − track-height', async () => {
        addStyle(uiCss);
        const row = document.createElement('label');
        row.className = 'ui-switch';
        const holder = document.createElement('span');
        holder.className = 'ui-switch__control';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'ui-switch__input';
        const thumb = document.createElement('span');
        thumb.className = 'ui-switch__thumb';
        holder.append(input, thumb);
        row.append(holder);
        document.body.append(row);
        cleanupTargets.push(row);

        const track = getComputedStyle(input);
        expect(track.width).toBe('36px'); // --ui-switch-track-width 2.25rem
        expect(track.height).toBe('20px'); // --ui-switch-track-height 1.25rem
        expect(track.backgroundColor).toBe('rgb(209, 213, 219)'); // --ui-switch-track-bg → border-color token

        // Resting thumb: 14px (--ui-switch-thumb-size 0.875rem), vertically centred.
        expect(getComputedStyle(thumb).width).toBe('14px');
        expect(getComputedStyle(thumb).transform).toBe('matrix(1, 0, 0, 1, 0, -7)');

        input.checked = true;
        // --ui-switch-track-bg-checked; background and transform both ride 0.12s transitions.
        await expect.poll(() => getComputedStyle(input).backgroundColor).toBe('rgb(37, 99, 235)');
        // Travel = 36 − 20 = 16px.
        await expect.poll(() => getComputedStyle(thumb).transform).toBe('matrix(1, 0, 0, 1, 16, -7)');
    });
});

/** A bare `<input class="ui-switch__input">` — the switch track chassis, focusable. */
const addSwitchInput = (): HTMLInputElement => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'ui-switch__input';
    document.body.append(input);
    cleanupTargets.push(input);
    return input;
};

/** A bare `<button class="ui-pressable">` — the chrome-less interactive chassis. */
const addPressable = (parentStyle = ''): HTMLButtonElement => {
    const parent = document.createElement('div');
    if (parentStyle) parent.setAttribute('style', parentStyle);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-pressable';
    button.textContent = 'Press';
    parent.append(button);
    document.body.append(parent);
    cleanupTargets.push(parent);
    return button;
};

/** A `<div class="ui-pressable">` — the `as` escape hatch's shape, which cannot match :disabled. */
const addFallback = (extraClass: string, parent: HTMLElement = document.body): HTMLElement => {
    const fallback = document.createElement('div');
    fallback.className = `ui-pressable ${extraClass}`.trim();
    fallback.textContent = 'Row';
    parent.append(fallback);
    if (parent === document.body) cleanupTargets.push(fallback);
    return fallback;
};

/** What a pointer at the element's own centre would actually target. */
const hitAtCentre = (element: Element): Element | null => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
};

describe('styles.css — pressable chassis (--ui-pressable-*)', () => {
    it('is CHROME-LESS by default, so adopting it in place of a bare <span @click> repaints nothing', () => {
        addStyle(uiCss);
        const pressable = addPressable('font-size: 18px');
        const computed = getComputedStyle(pressable);

        // A UA button paints a grey background, a border and padding; the point of this component
        // is that swapping a `<span @click>` for it changes the semantics, not the pixels.
        expect(computed.backgroundColor).toBe('rgba(0, 0, 0, 0)'); // --ui-pressable-bg: transparent
        expect(computed.borderTopWidth).toBe('0px'); // --ui-pressable-border-width
        expect(computed.paddingTop).toBe('0px'); // --ui-pressable-pad
        // …and the text keeps inheriting, which a UA button does NOT do.
        expect(computed.fontSize).toBe('18px'); // --ui-pressable-font-size: inherit
        expect(computed.cursor).toBe('pointer');
    });

    it('reads --ui-pressable-font-size, so a consumer utility survives the source-order tie (WR-0512)', () => {
        // The trap pinned on .ui-control applies here too: a plain font-size utility EARLIER in
        // the cascade loses to the package's font reset, the var wins by contract.
        addStyle('.size-sm { --ui-pressable-font-size: 13px; }');
        addStyle(uiCss);
        const pressable = addPressable('font-size: 18px');
        pressable.classList.add('size-sm');

        expect(getComputedStyle(pressable).fontSize).toBe('13px');
    });

    it('paints the focus ring on a real keyboard :focus-visible', async () => {
        addStyle(uiCss);
        addStyle('.ui-pressable { transition: none !important; }');
        const pressable = addPressable();

        expect(getComputedStyle(pressable).boxShadow).toBe('none');

        await userEvent.tab();
        expect(document.activeElement).toBe(pressable);
        // The keyboard affordance this component exists to supply.
        expect(getComputedStyle(pressable).boxShadow).not.toBe('none');
    });

    it('gives toggle mode a VISIBLE pressed state, not just aria-pressed', () => {
        addStyle(uiCss);
        const pressable = addPressable();

        expect(getComputedStyle(pressable).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        // Keyed on the ARIA attribute itself, so the rendering cannot drift out of step with what
        // assistive tech is told. Unlike the other state hooks this default is NOT a no-op: a
        // toggle whose state only reaches a screen reader is invisible to everyone else.
        pressable.setAttribute('aria-pressed', 'true');
        expect(getComputedStyle(pressable).backgroundColor).toBe('rgb(243, 244, 246)'); // --ui-option-bg-active

        document.documentElement.style.setProperty('--ui-pressable-bg-pressed', 'rgb(1, 2, 3)');
        expect(getComputedStyle(pressable).backgroundColor).toBe('rgb(1, 2, 3)');
    });

    it('mirrors disabled on BOTH paths — :disabled natively, .is-disabled on the `as` fallback', () => {
        addStyle(uiCss);
        const native = addPressable();
        native.disabled = true;
        expect(getComputedStyle(native).color).toBe('rgb(107, 114, 128)'); // --ui-control-text-muted
        expect(getComputedStyle(native).cursor).toBe('not-allowed');

        // A <div role="button"> cannot match :disabled, so the fallback mirrors it as a class. The
        // affordance has to be mirrored explicitly: the resting `cursor: pointer` would otherwise
        // survive on a control that does nothing.
        const fallback = addFallback('is-disabled');
        expect(getComputedStyle(fallback).color).toBe('rgb(107, 114, 128)');
        expect(getComputedStyle(fallback).cursor).toBe('not-allowed');
    });

    it('leaves a DISABLED fallback IN hit-testing — `pointer-events: none` must not come back', () => {
        // The rule this pins used to carry `pointer-events: none`, on the rationale that a plain
        // <div> has no native event suppression. It suppressed nothing: it removed the control from
        // hit-testing, so a pointer at its centre targeted whatever sat BEHIND it and an ancestor's
        // own @click fired on a control that is supposed to be inert. Transparent is worse than
        // inert, and the component's stopImmediatePropagation() is what actually does the job now
        // (interaction.browser.spec.ts pins the end-to-end harm).
        addStyle(uiCss);
        const ancestor = document.createElement('div');
        ancestor.style.cssText = 'padding: 24px';
        const disabled = addFallback('is-disabled', ancestor);
        // Same fixture, same stylesheet, enabled: without it a passing result would prove only
        // that elementFromPoint returns SOMETHING, not that the disabled rule stopped hiding it.
        const enabled = addFallback('', ancestor);
        document.body.append(ancestor);
        cleanupTargets.push(ancestor);

        expect(getComputedStyle(disabled).pointerEvents).not.toBe('none');
        expect(hitAtCentre(disabled)).toBe(disabled);
        expect(hitAtCentre(enabled)).toBe(enabled);
    });

    it('rotates the Disclosure chevron off the ARIA state, and leaves the heading unstyled', async () => {
        addStyle(uiCss);
        const heading = document.createElement('h2');
        heading.className = 'ui-disclosure__header';
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ui-pressable ui-disclosure__trigger';
        trigger.setAttribute('aria-expanded', 'false');
        const chevron = document.createElement('span');
        chevron.className = 'ui-disclosure__chevron';
        trigger.append(chevron);
        heading.append(trigger);
        document.body.append(heading);
        cleanupTargets.push(heading);

        expect(getComputedStyle(chevron).transform).toBe('none');

        trigger.setAttribute('aria-expanded', 'true');
        await expect.poll(() => getComputedStyle(chevron).transform).toBe('matrix(-1, 0, 0, -1, 0, 0)'); // 180deg

        // The consumer's <h2> must keep looking like their <h2> — the package only guarantees the
        // button inside it is a real button, so it resets margin and nothing else.
        expect(getComputedStyle(heading).fontSize).not.toBe('16px');
    });
});

// WR-0587 F-1. Every focusable control sets `outline: none` and conveys focus through
// box-shadow (--ui-focus-ring). Forced-colors mode STRIPS box-shadow, so keyboard focus goes
// invisible family-wide. The fix is a `@media (forced-colors: active)` block restoring a real
// outline on every focus surface. Emulated here through CDP (Emulation.setEmulatedMedia) —
// getComputedStyle then reflects the forced-colors cascade in a real engine, which no static
// text scan can prove. Reset in afterEach so forced-colors never leaks into the serial siblings.
describe('styles.css — forced-colors keyboard focus (WR-0587 F-1)', () => {
    afterEach(async () => {
        await cdp().send('Emulation.setEmulatedMedia', {features: []});
    });

    const enableForcedColors = () =>
        cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'forced-colors', value: 'active'}]});

    it('restores a visible outline on a focused .ui-control (box-shadow ring is not enough in forced-colors)', async () => {
        addStyle(uiCss);
        const control = addControl();
        await enableForcedColors();

        control.focus(); // a text input matches :focus-visible on any focus in Chromium
        expect(document.activeElement).toBe(control);

        const focused = getComputedStyle(control);
        // The restored outline — the load-bearing indicator once box-shadow is stripped.
        expect(focused.outlineStyle).toBe('solid');
        expect(focused.outlineWidth).toBe('2px');
    });

    it('restores a visible outline on a focused .ui-pressable (Pressable + the Disclosure trigger)', async () => {
        addStyle(uiCss);
        const pressable = addPressable();
        await enableForcedColors();

        pressable.focus();
        expect(document.activeElement).toBe(pressable);

        const focused = getComputedStyle(pressable);
        // The box-shadow ring the component paints is STRIPPED in forced-colors — a new focusable
        // surface that skipped this block would go invisible exactly like WR-0587 F-1.
        expect(focused.outlineStyle).toBe('solid');
        expect(focused.outlineWidth).toBe('2px');
    });

    /**
     * Resolve a system colour the way the ENGINE does, from a throwaway element inside the same
     * forced-colors context — so the assertions below pin `Highlight` / `GrayText` themselves and
     * not whatever hex Chromium's emulated palette happens to use this version.
     */
    const systemColour = (property: 'color' | 'backgroundColor', value: string): string => {
        const probe = document.createElement('div');
        probe.style.setProperty(property === 'color' ? 'color' : 'background-color', value);
        document.body.append(probe);
        cleanupTargets.push(probe);
        return getComputedStyle(probe)[property];
    };

    it('conveys the PRESSED state with a system colour — author colours alone are ignored here', async () => {
        // Measured at HEAD before the fix: pressed computed `rgb(255, 255, 255)` on Canvas white
        // against an unpressed `rgba(255, 255, 255, 0)` — DIFFERENT strings, IDENTICAL pixels, with
        // black text on both. A naive `not.toBe(plain)` would have passed on the defect, which is
        // why this pins the system colours rather than mere inequality.
        addStyle(uiCss);
        const plain = addPressable();
        const pressed = addPressable();
        pressed.setAttribute('aria-pressed', 'true');
        await enableForcedColors();

        expect(getComputedStyle(pressed).backgroundColor).toBe(systemColour('backgroundColor', 'Highlight'));
        expect(getComputedStyle(pressed).color).toBe(systemColour('color', 'HighlightText'));
        // …and the pair is genuinely distinguishable, in the same fixture and the same sheet.
        expect(getComputedStyle(pressed).color).not.toBe(getComputedStyle(plain).color);
    });

    it('conveys DISABLED with GrayText on BOTH paths — the `as` fallback was the broken leg', async () => {
        // The native path already gets GrayText from the UA's own disabled-button treatment; the
        // fallback is a <div>, which the UA owes nothing, so at HEAD a disabled row computed
        // pixel-identical to an enabled one. Asserted across the two paths, as the non-forced
        // sibling spec does, plus against the enabled control that makes the zero meaningful.
        addStyle(uiCss);
        const native = addPressable();
        native.disabled = true;
        const fbEnabled = addFallback('');
        const fbDisabled = addFallback('is-disabled');
        await enableForcedColors();

        const grey = systemColour('color', 'GrayText');
        expect(getComputedStyle(native).color).toBe(grey);
        expect(getComputedStyle(fbDisabled).color).toBe(grey);
        // POSITIVE CONTROL — an ENABLED fallback in the same fixture is NOT greyed, so the two
        // assertions above are not just reporting that forced-colors flattens everything.
        expect(getComputedStyle(fbEnabled).color).not.toBe(grey);
    });

    it('restores the outline on the MultiSelect / MultiCombobox box (:focus-within) and the check + switch inputs (:focus-visible)', async () => {
        addStyle(uiCss);

        // MultiSelect box carries focus via :focus-within on the box, not the inner trigger.
        const msBox = document.createElement('div');
        msBox.className = 'ui-multiselect__box';
        msBox.tabIndex = 0;
        const mcBox = document.createElement('div');
        mcBox.className = 'ui-multicombobox__box';
        mcBox.tabIndex = 0;
        document.body.append(msBox, mcBox);
        cleanupTargets.push(msBox, mcBox);

        const check = addCheck();
        const sw = addSwitchInput();

        await enableForcedColors();

        for (const el of [msBox, mcBox, check, sw]) {
            el.focus();
            expect(document.activeElement).toBe(el);
            const s = getComputedStyle(el);
            expect(s.outlineStyle).toBe('solid');
            expect(s.outlineWidth).toBe('2px');
        }
    });
});

// WR-0587 F-7. The stylesheet declares seven 0.12s transitions with no reduced-motion gate.
// The fix is a `@media (prefers-reduced-motion: reduce)` block zeroing them. Emulated through
// CDP so getComputedStyle reports the gated transition in a real engine.
describe('styles.css — reduced-motion gate (WR-0587 F-7)', () => {
    afterEach(async () => {
        await cdp().send('Emulation.setEmulatedMedia', {features: []});
    });

    it('zeroes every declared transition under prefers-reduced-motion: reduce', async () => {
        addStyle(uiCss);
        const control = addControl();
        const check = addCheck();

        const pressable = addPressable();

        // Baseline: the eases are present (no reduced-motion preference).
        expect(getComputedStyle(control).transitionDuration).not.toBe('0s');
        expect(getComputedStyle(check).transitionDuration).not.toBe('0s');
        expect(getComputedStyle(pressable).transitionDuration).not.toBe('0s');

        await cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});

        expect(getComputedStyle(control).transitionDuration).toBe('0s');
        expect(getComputedStyle(check).transitionDuration).toBe('0s');
        // Every NEW transition the sheet declares must join the gate — the pressable's focus-ring
        // ease and the disclosure chevron's rotate.
        expect(getComputedStyle(pressable).transitionDuration).toBe('0s');
    });
});

// FormField orientation — the label/control/error placement no happy-dom spec can see, asserted
// through real layout geometry. Vertical is the historical flex column; horizontal is the opt-in
// grid (label-left / control-right / error-under-control).
describe('styles.css — FormField orientation layout', () => {
    // The horizontal grid exists from 48rem; below it the field is the vertical default. That contract
    // can only be observed by driving the viewport, so this describe is the one place in the suite
    // that does: it widens when the runner starts out narrower than the breakpoint and puts the
    // runner's own size back after every test, so nothing here leaks into the specs that follow.
    const BREAKPOINT_PX = 48 * 16;
    const runnerViewport = {width: window.innerWidth, height: window.innerHeight};

    beforeEach(async () => {
        if (window.innerWidth < BREAKPOINT_PX) await page.viewport(1024, 768);
    });

    afterEach(async () => {
        await page.viewport(runnerViewport.width, runnerViewport.height);
    });

    /** The FormField chassis: `.ui-field > .ui-label + .ui-field__control(.ui-control) + .ui-error`. */
    const addField = (
        orientation?: 'horizontal',
    ): {field: HTMLElement; label: HTMLElement; control: HTMLElement; input: HTMLElement; error: HTMLElement} => {
        const field = document.createElement('div');
        field.className = orientation ? 'ui-field is-horizontal' : 'ui-field';
        const label = document.createElement('label');
        label.className = 'ui-label';
        label.textContent = 'Label';
        const control = document.createElement('div');
        control.className = 'ui-field__control';
        const input = document.createElement('input');
        input.className = 'ui-control';
        control.append(input);
        const error = document.createElement('p');
        error.className = 'ui-error';
        error.textContent = 'Bad';
        field.append(label, control, error);
        document.body.append(field);
        cleanupTargets.push(field);
        return {field, label, control, input, error};
    };

    it('stacks the label above the control by default (vertical flex column)', () => {
        addStyle(uiCss);
        const {field, label, control, input} = addField();

        expect(getComputedStyle(field).display).toBe('flex');
        expect(getComputedStyle(field).flexDirection).toBe('column');
        expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(input.getBoundingClientRect().top + 1);
        // The wrapper generates no box of its own here, so the column sees label, input, error — as before it existed.
        expect(getComputedStyle(control).display).toBe('contents');
    });

    it('does not add a second gap in the vertical default when the slot renders nothing', () => {
        addStyle(uiCss);
        const {label, control, error} = addField();
        control.replaceChildren();

        // label → error distance is exactly one --ui-field-gap (0.4rem = 6.4px), not two.
        const distance = error.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
        expect(distance).toBeCloseTo(6.4, 0);
    });

    it('lets the control column shrink instead of overflowing a narrow field when horizontal', () => {
        addStyle(uiCss);
        document.documentElement.style.setProperty('--ui-field-label-width', '100px');
        const {field, input} = addField('horizontal');
        field.style.width = '300px';
        input.setAttribute('size', '300');
        input.style.width = '100%';

        expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth + 1);
    });

    it('puts the label in a fixed left column with the error under the control when horizontal', () => {
        addStyle(uiCss);
        document.documentElement.style.setProperty('--ui-field-label-width', '180px');
        const {field, label, control, error} = addField('horizontal');

        expect(getComputedStyle(field).display).toBe('grid');

        const l = label.getBoundingClientRect();
        const c = control.getBoundingClientRect();
        const e = error.getBoundingClientRect();

        // Label sits to the LEFT of the control, sharing its row, in a column narrower than the control.
        expect(l.right).toBeLessThanOrEqual(c.left + 1);
        expect(l.top).toBeLessThan(c.bottom);
        expect(l.width).toBeLessThan(c.width);
        // The error is BELOW the control and in the control's column — never under the label.
        expect(e.top).toBeGreaterThanOrEqual(c.bottom - 1);
        expect(e.left).toBeGreaterThanOrEqual(c.left - 1);
    });

    it('sizes the label column from --ui-field-label-width', () => {
        addStyle(uiCss);
        document.documentElement.style.setProperty('--ui-field-label-width', '180px');
        const {label} = addField('horizontal');

        expect(label.getBoundingClientRect().width).toBeCloseTo(180, 0);
    });

    it('aligns only the label with --ui-field-label-align; the control stays pinned to the row top', () => {
        addStyle(uiCss);
        // Controls taller than their label, so the alignment has room to show.
        const startField = addField('horizontal');
        startField.input.style.height = '80px';
        const centerField = addField('horizontal');
        centerField.input.style.height = '80px';
        centerField.field.style.setProperty('--ui-field-label-align', 'center');

        const start = {
            label: startField.label.getBoundingClientRect(),
            control: startField.control.getBoundingClientRect(),
        };
        const center = {
            label: centerField.label.getBoundingClientRect(),
            control: centerField.control.getBoundingClientRect(),
        };

        // start (the default): the label's top meets the control's top.
        expect(Math.abs(start.label.top - start.control.top)).toBeLessThanOrEqual(1);
        // center: the label's midpoint meets the control's midpoint.
        const labelMid = (center.label.top + center.label.bottom) / 2;
        const controlMid = (center.control.top + center.control.bottom) / 2;
        expect(Math.abs(labelMid - controlMid)).toBeLessThanOrEqual(1);
        // The control itself did not move: it starts at its row's top under either alignment.
        expect(start.control.top - startField.field.getBoundingClientRect().top).toBeCloseTo(
            center.control.top - centerField.field.getBoundingClientRect().top,
            0,
        );
    });

    it('keeps the control at the row top when a wrapped label makes the row taller than the control', () => {
        addStyle(uiCss);
        document.documentElement.style.setProperty('--ui-field-label-width', '60px');
        const {field, label, control} = addField('horizontal');
        field.style.setProperty('--ui-field-label-align', 'center');
        label.textContent = 'A label long enough to wrap onto several lines in a narrow column';

        const l = label.getBoundingClientRect();
        const c = control.getBoundingClientRect();

        expect(l.height).toBeGreaterThan(c.height);
        expect(Math.abs(c.top - field.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    });

    it('collapses a horizontal field to the vertical shape below 48rem — a phone has no room for a label column', async () => {
        addStyle(uiCss);
        await page.viewport(375, 800);
        const {field, label, control, input} = addField('horizontal');

        // Byte-identical to the vertical default: flex column, wrapper generating no box, label above the input.
        expect(getComputedStyle(field).display).toBe('flex');
        expect(getComputedStyle(field).flexDirection).toBe('column');
        expect(getComputedStyle(control).display).toBe('contents');
        expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(input.getBoundingClientRect().top + 1);

        // And the grid comes back the moment there is room for it.
        await page.viewport(1024, 768);
        expect(getComputedStyle(field).display).toBe('grid');
    });
});
