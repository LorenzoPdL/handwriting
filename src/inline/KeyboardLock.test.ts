/**
 * The keyboard lock holds `inputmode="none"` on every note editor while it is
 * on, gives each one back what it had when it comes off, survives the pen's own
 * keyboard hold, steps aside when someone asks to type, and is remembered on
 * this device.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	keyboardLocked,
	onKeyboardLockChanged,
	registerKeyboardLockEditor,
	resetKeyboardLockForTest,
	setKeyboardLock,
	setKeyboardLockStore,
} from "./KeyboardLock";
import { focusClaimedPenEditor, setKeyboardFocus } from "./InlineFocus";

/** Just enough of an element: attributes, listeners, focus and blur. */
class Editable {
	private readonly attrs = new Map<string, string>();
	private readonly listeners = new Map<string, Set<(e: Event) => void>>();
	focused = false;
	getAttribute(name: string): string | null {
		return this.attrs.get(name) ?? null;
	}
	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value);
	}
	removeAttribute(name: string): void {
		this.attrs.delete(name);
	}
	addEventListener(type: string, fn: (e: Event) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(fn);
	}
	removeEventListener(type: string, fn: (e: Event) => void): void {
		this.listeners.get(type)?.delete(fn);
	}
	fire(type: string, init: Record<string, unknown> = {}): void {
		for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, ...init } as unknown as Event);
	}
	focus(): void {
		this.focused = true;
	}
	blur(): void {
		this.focused = false;
		this.fire("blur");
	}
}

const editor = (inputmode: string | null = null): Editable => {
	const el = new Editable();
	if (inputmode !== null) el.setAttribute("inputmode", inputmode);
	return el;
};
const asEl = (e: Editable) => e as unknown as HTMLElement;

afterEach(() => resetKeyboardLockForTest());

describe("the keyboard lock", () => {
	it("holds every registered editor's keyboard down, and gives back what each had", () => {
		const plain = editor();
		const text = editor("text");
		registerKeyboardLockEditor(asEl(plain));
		registerKeyboardLockEditor(asEl(text));
		expect(plain.getAttribute("inputmode")).toBeNull();

		setKeyboardLock(true);
		expect(keyboardLocked()).toBe(true);
		expect(plain.getAttribute("inputmode")).toBe("none");
		expect(text.getAttribute("inputmode")).toBe("none");

		setKeyboardLock(false);
		expect(plain.getAttribute("inputmode")).toBeNull();
		expect(text.getAttribute("inputmode")).toBe("text");
	});

	it("locks an editor that mounts while it is on, and releases it on unmount", () => {
		setKeyboardLock(true);
		const late = editor();
		const release = registerKeyboardLockEditor(asEl(late));
		expect(late.getAttribute("inputmode")).toBe("none");
		release();
		expect(late.getAttribute("inputmode")).toBeNull();
		setKeyboardLock(false);
		expect(late.getAttribute("inputmode"), "an unmounted editor is no longer the lock's").toBeNull();
	});

	it("leaves alone an inputmode someone else set while it was locked", () => {
		const el = editor();
		registerKeyboardLockEditor(asEl(el));
		setKeyboardLock(true);
		el.setAttribute("inputmode", "numeric");
		setKeyboardLock(false);
		expect(el.getAttribute("inputmode")).toBe("numeric");
	});

	it("tells its listeners after every change, and only on a change", () => {
		const heard = vi.fn();
		const stop = onKeyboardLockChanged(heard);
		setKeyboardLock(true);
		setKeyboardLock(true);
		setKeyboardLock(false);
		expect(heard).toHaveBeenCalledTimes(2);
		stop();
		setKeyboardLock(true);
		expect(heard).toHaveBeenCalledTimes(2);
	});

	it("survives the pen's own keyboard hold being released by a finger tap", () => {
		// The pen holds the keyboard down for its contact, and the next finger
		// contact hands the ordinary keyboard back. Under the lock that finger
		// tap is exactly the one that must NOT bring the keyboard up.
		const content = editor();
		const root = editor();
		registerKeyboardLockEditor(asEl(content));
		focusClaimedPenEditor({ hasFocus: false, focus: () => content.focus(), contentDOM: asEl(content), dom: asEl(root) });
		setKeyboardLock(true);
		root.fire("pointerdown", { pointerType: "touch" });
		expect(content.getAttribute("inputmode")).toBe("none");
		content.blur();
		expect(content.getAttribute("inputmode")).toBe("none");
	});

	it("comes off when someone asks for the keyboard to type", () => {
		const content = editor();
		registerKeyboardLockEditor(asEl(content));
		setKeyboardLock(true);
		setKeyboardFocus({ focus: () => content.focus(), contentDOM: asEl(content) }, true);
		expect(keyboardLocked()).toBe(false);
		expect(content.getAttribute("inputmode"), "focused while still saying it wants no keyboard").toBeNull();
		expect(content.focused).toBe(true);
	});

	it("is remembered on this device, in either spelling the store hands back", () => {
		const saved = new Map<string, unknown>();
		const store = { load: (k: string) => saved.get(k) ?? null, save: (k: string, v: string) => void saved.set(k, v) };
		setKeyboardLockStore(store);
		expect(keyboardLocked()).toBe(false);
		setKeyboardLock(true);
		expect(saved.get("handwriting-device-keyboard-lock")).toBe("true");

		resetKeyboardLockForTest();
		setKeyboardLockStore(store);
		expect(keyboardLocked()).toBe(true);

		resetKeyboardLockForTest();
		setKeyboardLockStore({ load: () => true, save: () => {} });
		expect(keyboardLocked()).toBe(true);

		resetKeyboardLockForTest();
		setKeyboardLockStore({ load: () => "false", save: () => {} });
		expect(keyboardLocked()).toBe(false);
	});

	it("a store that throws leaves it unlocked and working", () => {
		setKeyboardLockStore({ load: () => { throw new Error("denied"); }, save: () => { throw new Error("denied"); } });
		expect(keyboardLocked()).toBe(false);
		setKeyboardLock(true);
		expect(keyboardLocked()).toBe(true);
	});
});
