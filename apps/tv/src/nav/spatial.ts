// Spatial (D-pad) navigation. Pure geometry lives in pickNext so it can be
// unit tested; installSpatialNav wires it to real DOM focus.

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Candidate<T> {
  item: T;
  box: Box;
}

// How much a sideways miss costs relative to forward distance. High enough
// that "down" prefers the item directly below over a nearer diagonal one.
const CROSS_WEIGHT = 4;

/**
 * Choose the best focus target from `from` in direction `dir`, or null.
 *
 * Left/right is strict: a target must line up with the current item or sit
 * within a shallow angle of it, so "right" at the end of a row never drops
 * into the row below. Up/down prefers targets within 45 degrees but falls
 * back to anything in that direction, so differently shaped regions (tabs
 * above a keyboard, say) always stay reachable.
 */
export function pickNext<T>(from: Box, candidates: Candidate<T>[], dir: Dir): T | null {
  const horizontal = dir === 'left' || dir === 'right';
  const scored: { item: T; forward: number; cross: number }[] = [];

  for (const { item, box } of candidates) {
    let forward: number;
    if (dir === 'right') forward = box.left - from.right;
    else if (dir === 'left') forward = from.left - box.right;
    else if (dir === 'down') forward = box.top - from.bottom;
    else forward = from.top - box.bottom;

    // Must lie beyond the current element's far edge (1px tolerance).
    if (forward < -1) continue;

    const cross = horizontal
      ? gap(from.top, from.bottom, box.top, box.bottom)
      : gap(from.left, from.right, box.left, box.right);
    scored.push({ item, forward: Math.max(forward, 0), cross });
  }

  const cone = scored.filter((s) => s.cross <= s.forward * (horizontal ? 0.5 : 1));
  const pool = cone.length > 0 || horizontal ? cone : scored;

  let best: T | null = null;
  let bestScore = Infinity;
  for (const s of pool) {
    const score = s.forward + s.cross * CROSS_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = s.item;
    }
  }
  return best;
}

/** Distance between two 1-D spans; 0 when they overlap. */
function gap(a1: number, a2: number, b1: number, b2: number): number {
  if (b2 < a1) return a1 - b2;
  if (b1 > a2) return b1 - a2;
  return 0;
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const SELECTOR = '[data-focusable]:not([disabled])';

export interface SpatialNavOptions {
  onBack?: () => void;
  smooth?: () => boolean;
}

/** Focusable elements, limited to the topmost open dialog if there is one. */
function focusables(): HTMLElement[] {
  const modals = document.querySelectorAll<HTMLElement>('[data-nav-modal]');
  const scope: ParentNode = modals.length ? modals[modals.length - 1] : document;
  return Array.from(scope.querySelectorAll<HTMLElement>(SELECTOR));
}

function move(dir: Dir): void {
  const all = focusables();
  const current = document.activeElement as HTMLElement | null;
  if (!current || !all.includes(current)) {
    (all.find((el) => el.hasAttribute('data-autofocus')) ?? all[0])?.focus({ preventScroll: true });
    return;
  }
  // A [data-nav-group] (the side rail) keeps up/down inside itself, so
  // running off the end of the menu never jumps into the content area.
  const group = current.closest('[data-nav-group]');
  const vertical = dir === 'up' || dir === 'down';
  const pool = all.filter((el) => el !== current && (!group || !vertical || group.contains(el)));
  let next = pickNext(
    current.getBoundingClientRect(),
    pool.map((el) => ({ item: el, box: el.getBoundingClientRect() })),
    dir,
  );
  // Entering a group from outside lands on its current item, not the nearest.
  const nextGroup = next?.closest('[data-nav-group]');
  if (nextGroup && nextGroup !== group) {
    next = nextGroup.querySelector<HTMLElement>('[aria-current]') ?? next;
  }
  next?.focus({ preventScroll: true });
}

/** Standard-mapping gamepad: D-pad or left stick moves, A selects, B goes back. */
export type PadAction = Dir | 'select' | 'back';

export function readPad(buttons: readonly boolean[], axes: readonly number[]): PadAction | null {
  if (buttons[12] || axes[1] < -0.6) return 'up';
  if (buttons[13] || axes[1] > 0.6) return 'down';
  if (buttons[14] || axes[0] < -0.6) return 'left';
  if (buttons[15] || axes[0] > 0.6) return 'right';
  if (buttons[0]) return 'select';
  if (buttons[1]) return 'back';
  return null;
}

const REPEAT_FIRST_MS = 400;
const REPEAT_MS = 130;

export function installSpatialNav(opts: SpatialNavOptions = {}): () => void {
  const back = () => {
    // Send Escape through the normal path so open dialogs can claim it first.
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(ev);
  };

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

    if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) {
      e.preventDefault();
      opts.onBack?.();
      return;
    }
    const dir = KEY_DIR[e.key];
    if (!dir) return;
    if (typing && (dir === 'left' || dir === 'right')) return;
    e.preventDefault();
    move(dir);
  };

  const onFocusIn = (e: FocusEvent) => {
    const el = e.target as HTMLElement;
    if (!el.matches?.(SELECTOR) || el.hasAttribute('data-noscroll')) return;
    el.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: opts.smooth?.() === false ? 'auto' : 'smooth',
    });
  };

  // Gamepad polling, with hold-to-repeat for directions only.
  let raf = 0;
  let held: PadAction | null = null;
  let nextAt = 0;
  const poll = (now: number) => {
    raf = requestAnimationFrame(poll);
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((p) => p && p.connected);
    const action = pad ? readPad(pad.buttons.map((b) => b.pressed), pad.axes) : null;
    if (!action) {
      held = null;
      return;
    }
    const isDir = action !== 'select' && action !== 'back';
    if (action === held && (!isDir || now < nextAt)) return;
    nextAt = now + (action === held ? REPEAT_MS : REPEAT_FIRST_MS);
    held = action;
    if (action === 'select') (document.activeElement as HTMLElement | null)?.click();
    else if (action === 'back') back();
    else move(action);
  };
  raf = requestAnimationFrame(poll);

  window.addEventListener('keydown', onKey);
  window.addEventListener('focusin', onFocusIn);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('focusin', onFocusIn);
  };
}

export function focusDefault(): void {
  const all = focusables();
  (all.find((el) => el.hasAttribute('data-autofocus')) ?? all[0])?.focus({ preventScroll: true });
}
