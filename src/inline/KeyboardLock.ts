/**
 * The keyboard lock: while it is on, tapping a note never raises the
 * on-screen keyboard.
 *
 * On a tablet a finger tap in a note places the caret, and placing the caret
 * focuses the editor, which is exactly what raises the soft keyboard - so a
 * tap meant to scroll, to dismiss something or to follow a link threw the
 * keyboard over half the page. The pen already keeps it down for the length
 * of its own contact (`quietKeyboardForPen`, InlineFocus.ts), but the first
 * finger contact hands the ordinary keyboard back, by design, because that
 * contact might be someone who wants to type.
 *
 * The lock says nobody does. It holds `inputmode="none"` on every note's
 * editor for as long as it is on: taps still place the caret, select text and
 * follow links, and a hardware keyboard still types, but the browser is told
 * the editor wants no on-screen keyboard. Turning the lock off gives each
 * editor back the inputmode it had. Asking for the keyboard on purpose - the
 * Keyboard button, which turns pen input off to type - lifts the lock first
 * (`setKeyboardFocus`, InlineFocus.ts), so the two can never leave a person
 * asking to type with no keyboard.
 *
 * The choice is THIS DEVICE's, kept in Obsidian's per-vault, per-device local
 * store beside the pen-hardware latch: a tablet that wants it locked must not
 * lock the keyboard of a phone the vault syncs to.
 */

const KEYBOARD_LOCK_KEY = "handwriting-device-keyboard-lock";

/** The strip button's id. Handled by the strip itself, so it needs no registered command. */
export const KEYBOARD_LOCK_TOGGLE = "handwriting:keyboard-lock-toggle";

export interface KeyboardLockStore {
	load(key: string): unknown;
	save(key: string, value: string): void;
}

let locked = false;
let store: KeyboardLockStore | null = null;
const listeners = new Set<() => void>();
/** Every mounted note editor's content element, with the inputmode it had before the lock took it. */
const editors = new Map<HTMLElement, string | null>();

export function keyboardLocked(): boolean {
	return locked;
}

/** Lock or unlock, everywhere at once, and remember it on this device. */
export function setKeyboardLock(on: boolean): void {
	if (on === locked) return;
	locked = on;
	for (const content of editors.keys()) apply(content);
	try {
		store?.save(KEYBOARD_LOCK_KEY, on ? "true" : "false");
	} catch {
		/* storage denied: the lock still holds for this session */
	}
	for (const listener of listeners) listener();
}

/** Called after every change, for the strips to repaint the button. */
export function onKeyboardLockChanged(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/**
 * A note editor mounted: hold its keyboard down whenever the lock is on.
 * Returns the release for its unmount, which also gives it back its inputmode.
 */
export function registerKeyboardLockEditor(content: HTMLElement): () => void {
	if (!editors.has(content)) {
		editors.set(content, content.getAttribute("inputmode"));
		apply(content);
	}
	return () => {
		if (!editors.has(content)) return;
		const prior = editors.get(content) ?? null;
		editors.delete(content);
		if (locked) restore(content, prior);
	};
}

function apply(content: HTMLElement): void {
	if (locked) {
		// Read fresh at lock time: whatever it holds now is what unlocking gives back.
		const current = content.getAttribute("inputmode");
		if (current !== "none") editors.set(content, current);
		content.setAttribute("inputmode", "none");
	} else restore(content, editors.get(content) ?? null);
}

function restore(content: HTMLElement, prior: string | null): void {
	// Changed by someone else since: theirs now, leave it.
	if (content.getAttribute("inputmode") !== "none") return;
	if (prior === null || prior === "none") content.removeAttribute("inputmode");
	else content.setAttribute("inputmode", prior);
}

/** Wired from `onload`, before any note mounts; restores this device's last choice. */
export function setKeyboardLockStore(s: KeyboardLockStore | null): void {
	store = s;
	let stored: unknown = null;
	try {
		stored = s?.load(KEYBOARD_LOCK_KEY) ?? null;
	} catch {
		return;
	}
	// `loadLocalStorage` can hand the stored string back JSON-decoded, so both spellings count.
	locked = stored === "true" || stored === true;
}

export function resetKeyboardLockForTest(): void {
	locked = false;
	store = null;
	listeners.clear();
	editors.clear();
}
