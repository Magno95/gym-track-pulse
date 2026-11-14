import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  deleteActionShift, deleteActionWidth, deleteRevealGap, deleteRevealWidth, deleteSwipeArmed, deleteSwipeRelease,
  deleteSwipeThreshold, swipeActivation, swipeOffset,
} from '../src/swipe-delete.ts';

test('the touch is claimed by leftward travel only, before the scroll view and never after a vertical or rightward start', () => {
  assert.ok(swipeActivation.activeOffsetX < 0, 'only a leftward drag starts the swipe');
  assert.ok(swipeActivation.failOffsetX > 0, 'a rightward drag hands the touch to page and back swipes');
  const [up, down] = swipeActivation.failOffsetY;
  assert.equal(-up, down);
  assert.ok(down <= 10, 'a vertical drag must fail the swipe no later than the native scroll starts');
  assert.ok(-swipeActivation.activeOffsetX > down, 'a diagonal drag scrolls instead of swiping');
});

test('the card follows the finger to the left and only resists a pull to the right', () => {
  assert.equal(swipeOffset(-80, 350), -80);
  assert.equal(swipeOffset(-900, 350), -350);
  assert.equal(swipeOffset(0, 350), 0);
  let previous = 0;
  for (const pull of [10, 60, 200, 900]) {
    const offset = swipeOffset(pull, 350);
    assert.ok(offset > previous && offset < pull * 0.3 && offset < 36);
    previous = offset;
  }
  assert.equal(swipeOffset(-80, 0), 0, 'an unmeasured card does not move');
});

test('deletion arms beyond the action with a bounded drag on phone and tablet', () => {
  for (const width of [280, 350, 390, 768]) {
    const threshold = deleteSwipeThreshold(width);
    assert.ok(threshold > deleteActionWidth);
    assert.ok(threshold <= 160);
    assert.ok(threshold < width * 0.65);
    assert.equal(deleteSwipeArmed(-deleteActionWidth, width, false), false);
    assert.equal(deleteSwipeArmed(-threshold, width, false), true);
  }
  assert.equal(deleteSwipeArmed(-200, 0, false), false);
});

test('crossing the threshold triggers feedback once, jitter does not repeat it, and pulling back disarms deletion', () => {
  const threshold = deleteSwipeThreshold(390);
  let armed = false;
  let haptics = 0;
  for (const distance of [80, threshold, threshold + 3, threshold - 10, threshold + 1]) {
    const next = deleteSwipeArmed(-distance, 390, armed);
    if (next && !armed) haptics += 1;
    armed = next;
  }
  assert.equal(haptics, 1);
  assert.equal(armed, true);
  armed = deleteSwipeArmed(-100, 390, armed);
  assert.equal(armed, false);
  assert.equal(deleteSwipeRelease(-100, 390, 0, armed), 'close');
  assert.equal(deleteSwipeArmed(-threshold, 390, armed), true);
});

test('a release past the threshold deletes; anything shorter springs back without parking', () => {
  assert.equal(deleteSwipeRelease(-165, 390, 0, true), 'delete');
  assert.equal(deleteSwipeRelease(-165, 390, -400, true), 'delete');
  assert.equal(deleteSwipeRelease(-165, 390, 300, true), 'delete', 'lifting the finger with a small rebound still deletes');
  for (const offset of [-20, -deleteActionWidth, -100, 0, 12]) assert.equal(deleteSwipeRelease(offset, 390, 0, false), 'close');
});

test('an armed card thrown back to the right is not deleted', () => {
  assert.equal(deleteSwipeRelease(-165, 390, 1200, true), 'close');
});

test('cancellation, an extra finger and an unmeasured card never delete', () => {
  assert.equal(deleteSwipeRelease(-180, 390, 0, true, true), 'close');
  assert.equal(deleteSwipeRelease(-180, 390, -2000, false, true), 'close');
  assert.equal(deleteSwipeRelease(-180, 0, -2000, true), 'close');
});

test('a decisive left flick deletes before the threshold, a short or slow one does not', () => {
  const half = deleteSwipeThreshold(390) / 2;
  assert.equal(deleteSwipeRelease(-half, 390, -1200, false), 'delete');
  assert.equal(deleteSwipeRelease(-half + 1, 390, -3000, false), 'close');
  assert.equal(deleteSwipeRelease(-half - 20, 390, -500, false), 'close');
  assert.equal(deleteSwipeRelease(-half - 20, 390, 1200, false), 'close');
});

test('the action is uncovered beneath the card, behind a gap, up to the full row', () => {
  assert.equal(deleteRevealWidth(0, 350), 0);
  assert.equal(deleteRevealWidth(-deleteRevealGap, 350), 0);
  assert.equal(deleteRevealWidth(-100, 350), 100 - deleteRevealGap);
  assert.equal(deleteRevealWidth(-390, 350), 350, 'the action fills the row once the card has left');
  assert.equal(deleteRevealWidth(20, 350), 0);
});

test('the trash stays centered in a narrow opening, then moves with the card once deletion is armed', () => {
  assert.equal(deleteActionShift(40, 0), (deleteActionWidth - 40) / 2);
  assert.equal(deleteActionShift(40, 1), (deleteActionWidth - 40) / 2);
  assert.equal(deleteActionShift(deleteActionWidth, 0), 0);
  assert.equal(deleteActionShift(200, 0), 0, 'parked at the right edge before the threshold');
  assert.equal(deleteActionShift(200, 1), -(200 - deleteActionWidth), 'follows the edge of the card when armed');
  assert.equal(deleteActionShift(350, 0.5), -(350 - deleteActionWidth) / 2, 'centered in the full row while leaving');
});
