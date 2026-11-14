import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tabIndexAt, tabOffset } from '../src/data/tab-selector.ts';

test('dragging across the central action selects a section on either side, never the action', () => {
  // Four 70-point sections separated by the 52-point new-session action.
  assert.equal(Math.round(tabIndexAt(125, 70, 52)), 1);
  assert.equal(Math.round(tabIndexAt(137, 70, 52)), 2);
  assert.equal(tabIndexAt(192, 70, 52), 2);
});

test('the same drag selects the next section when the session hides the central action', () => {
  const start = tabOffset(1, 70, 0);
  assert.equal(Math.round(tabIndexAt(start + 70, 70, 0)), 2);
  assert.equal(Math.round(tabIndexAt(start - 70, 70, 0)), 0);
});

test('dragging beyond either end stays on a valid section at narrow and wide widths', () => {
  for (const width of [56, 84]) {
    for (const gap of [0, 52]) {
      assert.equal(tabIndexAt(-1000, width, gap), 0);
      assert.equal(tabIndexAt(1000, width, gap), 3);
    }
  }
});
