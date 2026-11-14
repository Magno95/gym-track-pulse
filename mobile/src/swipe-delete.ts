/** Slot of the trash action that sits beneath the card. */
export const deleteActionWidth = 88;
/** Space kept between the moving card and the action it uncovers. */
export const deleteRevealGap = 8;

/**
 * One decision per touch, taken natively: the first axis to leave its range wins.
 * Leftward travel claims the card; vertical travel leaves the touch to scrolling
 * and modal dismissal, rightward travel to page and back swipes.
 */
export const swipeActivation: { activeOffsetX: number; failOffsetX: number; failOffsetY: [number, number] } = {
  activeOffsetX: -12, failOffsetX: 12, failOffsetY: [-10, 10],
};

export function deleteSwipeThreshold(width: number) {
  'worklet';
  return Math.min(160, Math.max(112, width * 0.42));
}

/** The card follows the finger 1:1 to the left and resists a pull past its resting place. */
export function swipeOffset(translation: number, width: number) {
  'worklet';
  if (translation > 0) return (translation * 0.3) / (1 + translation / 120);
  return Math.max(0 - width, translation);
}

/** Hysteresis keeps finger jitter around the threshold from toggling the feedback. */
export function deleteSwipeArmed(offset: number, width: number, armed: boolean) {
  'worklet';
  return width > 0 && -offset >= deleteSwipeThreshold(width) - (armed ? 16 : 0);
}

/** Velocity in points per second. Past the threshold a release deletes, unless the card is thrown back. */
export function deleteSwipeRelease(offset: number, width: number, velocityX: number, armed: boolean, cancelled = false): 'delete' | 'close' {
  'worklet';
  if (cancelled || width <= 0) return 'close';
  if (armed) return velocityX > 700 ? 'close' : 'delete';
  const flick = velocityX <= -900 && -offset >= deleteSwipeThreshold(width) / 2;
  return flick ? 'delete' : 'close';
}

/** Width of the action uncovered beneath the card. */
export function deleteRevealWidth(offset: number, width: number) {
  'worklet';
  return Math.min(width, Math.max(0, -offset - deleteRevealGap));
}

/**
 * Horizontal shift of the right-anchored action slot: centered while the opening
 * is narrower than the slot, then `follow` moves it from the right edge (0)
 * through the middle (0.5) to the edge of the card (1).
 */
export function deleteActionShift(reveal: number, follow: number) {
  'worklet';
  const spare = reveal - deleteActionWidth;
  return spare < 0 ? -spare / 2 : 0 - spare * follow;
}
