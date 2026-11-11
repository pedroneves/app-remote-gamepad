/**
 * Gamepad model shared by all components.
 * Follows the W3C "standard" gamepad mapping: 17 buttons and 4 axes.
 */

/** Standard mapping button indexes. Bit n of a button mask is button n. */
export const Button = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  View: 8,
  Menu: 9,
  LeftStick: 10,
  RightStick: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
  Guide: 16,
} as const;

export type ButtonName = keyof typeof Button;

export const BUTTON_COUNT = 17;
export const AXIS_COUNT = 4;

/** Axis indexes inside `GamepadState.axes`. */
export const Axis = {
  LeftX: 0,
  LeftY: 1,
  RightX: 2,
  RightY: 3,
} as const;

export interface GamepadState {
  /** Button bitmask. Bit n is standard-mapping button n. */
  buttons: number;
  /** Left trigger, 0 to 1 (button 6). */
  leftTrigger: number;
  /** Right trigger, 0 to 1 (button 7). */
  rightTrigger: number;
  /** `[leftX, leftY, rightX, rightY]`, -1 to 1. Up and left are negative. */
  axes: [number, number, number, number];
}

export function isButtonName(name: string): name is ButtonName {
  return Object.hasOwn(Button, name);
}

/** All buttons released, sticks centered. */
export function neutralState(): GamepadState {
  return { buttons: 0, leftTrigger: 0, rightTrigger: 0, axes: [0, 0, 0, 0] };
}

export function isPressed(buttons: number, button: number): boolean {
  return (buttons & (1 << button)) !== 0;
}

export function sameState(a: GamepadState, b: GamepadState): boolean {
  return a.buttons === b.buttons &&
    a.leftTrigger === b.leftTrigger &&
    a.rightTrigger === b.rightTrigger &&
    a.axes.every((value, i) => value === b.axes[i]);
}
