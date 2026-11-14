import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completedExerciseSwipe, createExerciseSwipeGate, exerciseSection, exerciseSectionDirection, exerciseSwipeTarget, isExerciseSwipe } from '../src/exercise-navigation.ts';

test('exercise sections support route defaults and swiping in visual tab order', () => {
  assert.equal(exerciseSection(undefined), 'details');
  assert.equal(exerciseSection('unknown'), 'details');
  assert.equal(completedExerciseSwipe('details', -100, 4, 390), 'sessions');
  assert.equal(completedExerciseSwipe('sessions', -100, 4, 390), 'statistics');
  assert.equal(completedExerciseSwipe('statistics', 100, -4, 390), 'sessions');
  assert.equal(completedExerciseSwipe('sessions', 100, -4, 390), 'details');
});

test('right from Details exits to Exercises; left from Statistics stays at the end', () => {
  assert.equal(exerciseSwipeTarget('details', 100), 'exercises');
  assert.equal(completedExerciseSwipe('details', 100, 0, 390), 'exercises');
  assert.equal(exerciseSwipeTarget('statistics', -100), null);
  assert.equal(completedExerciseSwipe('statistics', -100, 0, 390), null);
  assert.equal(exerciseSwipeTarget('details', 0), null);
  assert.equal(completedExerciseSwipe('details', 25, 0, 390), null);
});

test('tab transitions share the swipe direction including non-adjacent tab taps', () => {
  assert.equal(exerciseSectionDirection('details', 'sessions'), 1);
  assert.equal(exerciseSectionDirection('details', 'statistics'), 1);
  assert.equal(exerciseSectionDirection('statistics', 'sessions'), -1);
  assert.equal(exerciseSectionDirection('statistics', 'details'), -1);
  assert.equal(exerciseSectionDirection('details', 'details'), 0);
});

test('vertical scrolling, diagonal drags, taps and short horizontal drags keep the section', () => {
  assert.equal(isExerciseSwipe(4, 100), false);
  assert.equal(isExerciseSwipe(100, 80), false);
  assert.equal(isExerciseSwipe(8, 0), false);
  for (const [dx, dy] of [[0, 0], [5, 100], [-100, 80], [-25, 0], [-65, 0]]) {
    assert.equal(completedExerciseSwipe('sessions', dx, dy, 390), null);
  }
});

test('commit distance scales with screen width and respects minimum touch distance', () => {
  assert.equal(completedExerciseSwipe('sessions', -47, 0, 240), null);
  assert.equal(completedExerciseSwipe('sessions', -48, 0, 240), 'statistics');
  assert.equal(completedExerciseSwipe('sessions', -100, 0, 900), null);
  assert.equal(completedExerciseSwipe('sessions', -170, 0, 900), 'statistics');
});

test('a touch beginning on a session row cannot become a section swipe even after leaving the row', () => {
  const gate = createExerciseSwipeGate();
  gate.begin(1); // Screen capture runs before the nested row capture.
  gate.exclude(); // Row capture does not claim the responder or wait for a drag.
  for (const dx of [-100, 100]) {
    assert.equal(gate.allowsSwipe() && completedExerciseSwipe('sessions', dx, 0, 390), false);
  }
  // No release/cancel reset: the entire touch, including the final callback, stays excluded.
  assert.equal(gate.allowsSwipe(), false);
});

test('next touch restores section swipes after row release, cancellation or row unmount', () => {
  const gate = createExerciseSwipeGate();
  for (const end of ['release', 'cancel', 'unmount']) {
    gate.begin(1);
    gate.exclude();
    gate.begin(1); // The next sequence resets regardless of how the previous one ended.
    assert.equal(gate.allowsSwipe(), true, end);
    assert.equal(completedExerciseSwipe('sessions', -100, 0, 390), 'statistics');
  }
});

test('adding a second touch excludes the sequence until a new single touch', () => {
  const gate = createExerciseSwipeGate();
  gate.begin(1);
  gate.begin(2);
  assert.equal(gate.allowsSwipe(), false);
  gate.begin(1);
  assert.equal(gate.allowsSwipe(), true);
});
