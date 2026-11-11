/**
 * Page script. A content script in the page's own world (`"world": "MAIN"`).
 * It runs at `document_start`, before any of the page's scripts.
 *
 * Adds a virtual standard-mapping gamepad to `navigator.getGamepads()` and
 * fires `gamepadconnected` and `gamepaddisconnected` for it. Input comes from
 * the bridge script through `window.postMessage`.
 *
 * The page can't construct real `Gamepad` objects, so the virtual gamepad is a
 * plain object whose prototype is `Gamepad.prototype` (so `instanceof Gamepad`
 * holds), with its values as own properties that hide the prototype's getters.
 */

import {
  AXIS_COUNT,
  Button,
  BUTTON_COUNT,
  type GamepadState,
  isPressed,
  neutralState,
  sameState,
} from "../shared/gamepad.ts";
import { type InputEvent, isPageMessage } from "./messages.ts";

/** With no message from the controller for this long, the gamepad goes back to neutral. */
const INPUT_TIMEOUT_MS = 500;
/** Analog triggers count as pressed above this value. */
const TRIGGER_THRESHOLD = 0.1;
/** Chrome's `Gamepad.id` format, with the USB ids of an Xbox 360 controller. */
const GAMEPAD_ID = "Virtual Gamepad (STANDARD GAMEPAD Vendor: 045e Product: 028e)";

const nativeGetGamepads = Navigator.prototype.getGamepads;

/** The virtual gamepad's current snapshot. `null` while disconnected. */
let gamepad: Gamepad | null = null;
let state = neutralState();
let inputTimer: number | undefined;

/** Defines read-only, enumerable own properties, like a real gamepad's getters. */
function fake<T>(prototype: object, values: Record<string, unknown>): T {
  const properties: PropertyDescriptorMap = {};
  for (const [key, value] of Object.entries(values)) {
    properties[key] = { value, enumerable: true };
  }
  return Object.create(prototype, properties);
}

function button(pressed: boolean, value: number): GamepadButton {
  return fake(GamepadButton.prototype, { pressed, touched: pressed || value > 0, value });
}

function buttons(s: GamepadState): GamepadButton[] {
  const triggers: Record<number, number> = {
    [Button.LT]: s.leftTrigger,
    [Button.RT]: s.rightTrigger,
  };
  return Array.from({ length: BUTTON_COUNT }, (_, i) => {
    const pressed = isPressed(s.buttons, i);
    const trigger = triggers[i];
    if (trigger === undefined) return button(pressed, pressed ? 1 : 0);
    const value = Math.max(trigger, pressed ? 1 : 0);
    return button(value > TRIGGER_THRESHOLD, value);
  });
}

/** Rumble isn't forwarded to the phone. Effects resolve right away. */
const vibrationActuator = fake<GamepadHapticActuator>(
  typeof GamepadHapticActuator === "function" ? GamepadHapticActuator.prototype : Object.prototype,
  {
    effects: Object.freeze(["dual-rumble"]),
    type: "dual-rumble",
    playEffect: () => Promise.resolve("complete"),
    reset: () => Promise.resolve("complete"),
  },
);

function snapshot(index: number, connected: boolean, s: GamepadState): Gamepad {
  return fake(Gamepad.prototype, {
    id: GAMEPAD_ID,
    index,
    connected,
    mapping: "standard",
    timestamp: performance.now(),
    axes: Object.freeze(s.axes.slice(0, AXIS_COUNT)),
    buttons: Object.freeze(buttons(s)),
    vibrationActuator,
  });
}

/** Fires a gamepad event. `new GamepadEvent()` only takes a real `Gamepad`, so the event is built by hand. */
function fire(type: "gamepadconnected" | "gamepaddisconnected", pad: Gamepad): void {
  const event = new Event(type);
  Object.setPrototypeOf(event, GamepadEvent.prototype);
  Object.defineProperty(event, "gamepad", { value: pad, enumerable: true });
  dispatchEvent(event);
}

/** The first slot no real gamepad uses. */
function freeIndex(): number {
  const real = nativeGetGamepads.call(navigator);
  const index = real.findIndex((pad) => !pad);
  return index === -1 ? real.length : index;
}

function connect(): void {
  if (gamepad) return;
  state = neutralState();
  gamepad = snapshot(freeIndex(), true, state);
  fire("gamepadconnected", gamepad);
}

function disconnect(): void {
  clearTimeout(inputTimer);
  if (!gamepad) return;
  const last = snapshot(gamepad.index, false, neutralState());
  gamepad = null;
  state = neutralState();
  fire("gamepaddisconnected", last);
}

function setState(next: GamepadState): void {
  if (!gamepad || sameState(next, state)) return;
  state = next;
  gamepad = snapshot(gamepad.index, true, state);
}

/** Restarts the countdown to neutral. Called on every message from the controller. */
function stillAlive(): void {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => setState(neutralState()), INPUT_TIMEOUT_MS);
}

function handle(event: InputEvent): void {
  switch (event.kind) {
    case "controller":
      if (event.connected) connect();
      else disconnect();
      break;
    case "state":
      connect();
      setState(event.state);
      stillAlive();
      break;
    case "alive":
      stillAlive();
      break;
  }
}

Navigator.prototype.getGamepads = function getGamepads(this: Navigator) {
  const pads = [...nativeGetGamepads.call(this)];
  if (gamepad) {
    while (pads.length <= gamepad.index) pads.push(null);
    pads[gamepad.index] = gamepad;
  }
  return pads;
};

addEventListener("message", (e) => {
  if (e.source === window && isPageMessage(e.data)) handle(e.data.event);
});
