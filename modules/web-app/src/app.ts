/**
 * Virtual Gamepad Web App.
 *
 * Turns touches on the page into a standard-mapping gamepad state.
 * Every finger is tracked separately through Pointer Events:
 * - A finger that lands on a stick drives that stick until it lifts.
 * - Any other finger presses whatever button or D-pad direction is under it,
 *   so it can slide from one button to the next.
 *
 * Sends the state to the relay server for the session code the user enters
 * (or passes as `?session=`). `?server=host:port` points at a relay server
 * other than the one that served the page, e.g. when using the dev server.
 */

import {
  Button,
  type ButtonName,
  type GamepadState,
  isButtonName,
  isPressed,
  neutralState,
  sameState,
} from "@remote-gamepad/shared/gamepad";
import { isSessionCode } from "@remote-gamepad/shared/protocol";
import { Connection, type ConnectionStatus, relayUrl } from "./connection.ts";

/** Stick tilt below this fraction of full tilt counts as centered. */
const STICK_DEAD_ZONE = 0.12;
/** D-pad touches this close to the center press no direction. */
const DPAD_DEAD_ZONE = 0.2;
/** tan(22.5°). Splits the D-pad into 8 sectors of 45°: 4 directions and 4 diagonals. */
const DPAD_SECTOR = Math.tan(Math.PI / 8);
/** A tap is a touch shorter than this that stays inside the stick's dead zone. */
const TAP_MS = 250;
/** Pressing a stick this soon after tapping it clicks the stick. */
const DOUBLE_TAP_MS = 300;
/** Length of the haptic tap on button press. */
const HAPTIC_MS = 12;
/** `localStorage` key of the last session code, to rejoin on reload. */
const SESSION_KEY = "session";

const bit = (button: number) => 1 << button;
const round2 = (value: number) => Math.round(value * 100) / 100;

function required<E extends Element>(selector: string, root: ParentNode = document): E {
  const el = root.querySelector<E>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

function buttonBit(name: string | undefined): number {
  if (name === undefined || !isButtonName(name)) throw new Error(`Unknown button: ${name}`);
  return bit(Button[name]);
}

/**
 * An analog stick. Tilt is the distance of the finger from the stick's center,
 * as a fraction of its radius. Double-tap and hold clicks the stick.
 */
class Stick {
  x = 0;
  y = 0;
  clicked = false;

  #pointerId: number | null = null;
  #downAt = 0;
  #leftDeadZone = false;
  #lastTapAt = -Infinity;

  constructor(
    readonly el: HTMLElement,
    readonly knob: HTMLElement,
    readonly clickButton: number,
  ) {}

  grab(e: PointerEvent): boolean {
    if (this.#pointerId !== null) return false;
    this.#pointerId = e.pointerId;
    this.#downAt = e.timeStamp;
    this.#leftDeadZone = false;
    this.clicked = e.timeStamp - this.#lastTapAt < DOUBLE_TAP_MS;
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add("active");
    this.move(e);
    return true;
  }

  move(e: PointerEvent): void {
    const rect = this.el.getBoundingClientRect();
    const radius = rect.width / 2;
    const travel = radius - this.knob.offsetWidth / 2;

    let dx = (e.clientX - rect.left - radius) / radius;
    let dy = (e.clientY - rect.top - radius) / radius;
    const tilt = Math.min(Math.hypot(dx, dy), 1);
    if (tilt === 1) {
      const scale = 1 / Math.hypot(dx, dy);
      dx *= scale;
      dy *= scale;
    }
    this.knob.style.transform = `translate(${dx * travel}px, ${dy * travel}px)`;

    if (tilt < STICK_DEAD_ZONE) {
      this.x = 0;
      this.y = 0;
      return;
    }
    // Rescale so output starts at 0 right outside the dead zone.
    this.#leftDeadZone = true;
    const scale = (tilt - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE) / tilt;
    this.x = round2(dx * scale);
    this.y = round2(dy * scale);
  }

  release(e: PointerEvent): void {
    const wasTap = !this.#leftDeadZone && e.timeStamp - this.#downAt < TAP_MS;
    this.#lastTapAt = wasTap && !this.clicked ? e.timeStamp : -Infinity;
    this.reset();
  }

  reset(): void {
    this.#pointerId = null;
    this.x = 0;
    this.y = 0;
    this.clicked = false;
    this.knob.style.transform = "";
    this.el.classList.remove("active");
  }
}

/** What a finger on the screen is doing. */
type Contact =
  | { kind: "stick"; stick: Stick }
  | { kind: "buttons"; buttons: number };

const pad = required<HTMLElement>("#pad");
const readout = required<HTMLElement>("#readout");
const dpad = required<HTMLElement>("[data-dpad]");

function makeStick(side: "left" | "right", clickButton: number): Stick {
  const el = required<HTMLElement>(`[data-stick=${side}]`);
  return new Stick(el, required(".knob", el), clickButton);
}

const leftStick = makeStick("left", Button.LeftStick);
const rightStick = makeStick("right", Button.RightStick);
const sticks = [leftStick, rightStick];

/** Button elements and the bit each one presses. */
const buttonBits = new Map<Element, number>();
for (const el of pad.querySelectorAll<HTMLElement>("[data-button]")) {
  buttonBits.set(el, buttonBit(el.dataset.button));
}

/** Elements that light up while their button is pressed. */
const indicators: { el: Element; mask: number }[] = [
  ...[...buttonBits].map(([el, mask]) => ({ el, mask })),
  ...[...pad.querySelectorAll<HTMLElement>("[data-dpad-dir]")].map((el) => ({
    el,
    mask: buttonBit(el.dataset.dpadDir),
  })),
  ...sticks.map((stick) => ({ el: stick.el, mask: bit(stick.clickButton) })),
];

/** D-pad directions at a point. Diagonals press two directions. */
function dpadButtonsAt(x: number, y: number): number {
  const rect = dpad.getBoundingClientRect();
  const dx = (x - rect.left) / (rect.width / 2) - 1;
  const dy = (y - rect.top) / (rect.height / 2) - 1;
  if (Math.hypot(dx, dy) < DPAD_DEAD_ZONE) return 0;

  let buttons = 0;
  if (-dy > Math.abs(dx) * DPAD_SECTOR) buttons |= bit(Button.DpadUp);
  if (dy > Math.abs(dx) * DPAD_SECTOR) buttons |= bit(Button.DpadDown);
  if (-dx > Math.abs(dy) * DPAD_SECTOR) buttons |= bit(Button.DpadLeft);
  if (dx > Math.abs(dy) * DPAD_SECTOR) buttons |= bit(Button.DpadRight);
  return buttons;
}

/** Buttons under a point. */
function buttonsAt(x: number, y: number): number {
  const el = document.elementFromPoint(x, y)?.closest("[data-button], [data-dpad]");
  if (!el) return 0;
  if (el === dpad) return dpadButtonsAt(x, y);
  return buttonBits.get(el) ?? 0;
}

const contacts = new Map<number, Contact>();
let state = neutralState();

function computeState(): GamepadState {
  let buttons = 0;
  for (const contact of contacts.values()) {
    if (contact.kind === "buttons") buttons |= contact.buttons;
  }
  for (const stick of sticks) {
    if (stick.clicked) buttons |= bit(stick.clickButton);
  }
  return {
    buttons,
    leftTrigger: isPressed(buttons, Button.LT) ? 1 : 0,
    rightTrigger: isPressed(buttons, Button.RT) ? 1 : 0,
    axes: [leftStick.x, leftStick.y, rightStick.x, rightStick.y],
  };
}

const buttonNames = Object.keys(Button) as ButtonName[];
const fmt = (value: number) => value.toFixed(2).padStart(5);

function describe(s: GamepadState): string {
  const pressed = buttonNames.filter((name) => isPressed(s.buttons, Button[name]));
  const [lx, ly, rx, ry] = s.axes;
  return `L ${fmt(lx)} ${fmt(ly)}   R ${fmt(rx)} ${fmt(ry)}   ${pressed.join(" ") || "-"}`;
}

function update(): void {
  const next = computeState();
  if (sameState(next, state)) return;

  if (next.buttons & ~state.buttons) navigator.vibrate?.(HAPTIC_MS);
  for (const { el, mask } of indicators) {
    el.classList.toggle("pressed", (next.buttons & mask) !== 0);
  }
  readout.textContent = describe(next);
  state = next;
  connection?.send();
}

/** Lifts every finger. Used when the page loses focus so nothing stays pressed. */
function releaseAll(): void {
  contacts.clear();
  for (const stick of sticks) stick.reset();
  update();
}

/** Asks for fullscreen and landscape. Not every browser supports this, so failures are ignored. */
function enterFullscreen(): void {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== "function") return;
  root.requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      return orientation.lock?.("landscape");
    })
    .catch(() => {});
}

pad.addEventListener("pointerdown", (e) => {
  enterFullscreen();
  const stickEl = e.target instanceof Element ? e.target.closest("[data-stick]") : null;
  const stick = sticks.find((s) => s.el === stickEl);
  if (stick?.grab(e)) {
    contacts.set(e.pointerId, { kind: "stick", stick });
  } else {
    contacts.set(e.pointerId, { kind: "buttons", buttons: buttonsAt(e.clientX, e.clientY) });
  }
  update();
});

addEventListener("pointermove", (e) => {
  const contact = contacts.get(e.pointerId);
  if (!contact) return;
  if (contact.kind === "stick") contact.stick.move(e);
  else contact.buttons = buttonsAt(e.clientX, e.clientY);
  update();
});

function lift(e: PointerEvent): void {
  const contact = contacts.get(e.pointerId);
  if (!contact) return;
  contacts.delete(e.pointerId);
  if (contact.kind === "stick") contact.stick.release(e);
  update();
}
addEventListener("pointerup", lift);
addEventListener("pointercancel", lift);

// Joining a session

const joinForm = required<HTMLFormElement>("#join");
const codeInput = required<HTMLInputElement>("#code");
const joinError = required<HTMLElement>("#join-error");
const statusButton = required<HTMLButtonElement>("#status");
const params = new URLSearchParams(location.search);

let connection: Connection | null = null;
let session = "";

const STATUS_TEXT: Record<ConnectionStatus, (code: string) => string> = {
  connecting: () => "Connecting…",
  waiting: (code) => `Waiting for Chrome · ${code}`,
  connected: (code) => `Connected · ${code}`,
  unreachable: () => "Can't reach the server. Retrying…",
  taken: (code) => `Another phone is using ${code}`,
};

function showStatus(status: ConnectionStatus): void {
  statusButton.dataset.status = status;
  statusButton.textContent = STATUS_TEXT[status](session);
}

function storedSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeSession(code: string): void {
  try {
    localStorage.setItem(SESSION_KEY, code);
  } catch {
    // Private browsing can refuse storage. The code then lasts until reload.
  }
}

function showJoin(): void {
  codeInput.value = session;
  joinError.textContent = "";
  document.body.dataset.view = "join";
}

function join(code: string): void {
  session = code;
  storeSession(code);
  connection?.close();
  connection = new Connection(relayUrl(code, params.get("server")), () => state, showStatus);
  document.body.dataset.view = "pad";
}

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = codeInput.value.replace(/\D/g, "");
  if (!isSessionCode(code)) {
    joinError.textContent = "The code has 6 digits.";
    return;
  }
  codeInput.blur();
  enterFullscreen();
  join(code);
});
statusButton.addEventListener("click", showJoin);

addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseAll();
  else connection?.wake();
});
addEventListener("contextmenu", (e) => e.preventDefault());

readout.textContent = describe(state);

const initialSession = params.get("session") ?? storedSession();
if (isSessionCode(initialSession)) join(initialSession);
else showJoin();
