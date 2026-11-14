import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModalDismissGuard } from '../src/modal-dismiss-guard.ts';

test('a horizontal card swipe disables native dismissal and its end restores it', () => {
  const options = [];
  const guard = createModalDismissGuard((enabled) => options.push(enabled));
  const card = Symbol();
  guard.setDirty(false);
  guard.setSwipe(card, true); // The native pan has claimed the touch.
  guard.setSwipe(card, true); // A repeated report for the same card does not nest the lock.
  assert.deepEqual(options, [true, false]);
  guard.setSwipe(card, false); // End, cancellation or removal of the card.
  assert.deepEqual(options, [true, false, true]);
});

test('autosave while a card is swiped cannot reenable the native dismiss gesture', () => {
  const options = [];
  const guard = createModalDismissGuard((enabled) => options.push(enabled));
  const card = Symbol();
  guard.setDirty(false);
  guard.setSwipe(card, true);
  guard.setDirty(true);
  guard.setDirty(false); // Autosave finishes while the swipe is still under way.
  assert.deepEqual(options, [true, false]);
  guard.setSwipe(card, false);
  assert.deepEqual(options, [true, false, true]);
});

test('deleting a swiped card releases its lock without bypassing unsaved changes', () => {
  const options = [];
  const guard = createModalDismissGuard((enabled) => options.push(enabled));
  const card = Symbol();
  guard.setDirty(false);
  guard.setSwipe(card, true);
  guard.setDirty(true);
  guard.setSwipe(card, false); // The gesture ends before the card leaves.
  guard.setSwipe(card, false); // The unmount cleanup must be harmless.
  assert.deepEqual(options, [true, false]);
  guard.setDirty(false);
  assert.deepEqual(options, [true, false, true]);
});

test('the end of one swipe cannot unlock dismissal while another card is still swiped', () => {
  const options = [];
  const guard = createModalDismissGuard((enabled) => options.push(enabled));
  const first = Symbol(); const second = Symbol();
  guard.setDirty(false);
  guard.setSwipe(first, true);
  guard.setSwipe(second, true);
  guard.setSwipe(first, false);
  assert.deepEqual(options, [true, false]);
  guard.setSwipe(second, false);
  assert.deepEqual(options, [true, false, true]);
});
