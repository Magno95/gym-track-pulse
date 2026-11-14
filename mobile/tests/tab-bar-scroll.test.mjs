import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTabBarScrollTracker } from '../src/data/tab-bar-scroll.ts';

function scroller({ top = 0, bottom = 0, height = 2000, viewport = 700 } = {}) {
  const tracker = createTabBarScrollTracker();
  return {
    scroll(y) {
      return tracker.update({ contentOffset: { y }, contentInset: { top, bottom },
        contentSize: { height }, layoutMeasurement: { height: viewport } });
    },
    expand() { tracker.reset(); },
  };
}

test('scroll distance continuously resizes the bar through intermediate sizes', () => {
  const bar = scroller();
  assert.equal(bar.scroll(0), 0);
  assert.equal(bar.scroll(30), 0.25);
  assert.equal(bar.scroll(60), 0.5);
  assert.equal(bar.scroll(90), 0.75);
  assert.equal(bar.scroll(120), 1);
  assert.equal(bar.scroll(300), 1);
});

test('reversing direction expands smoothly from the current size, even far from the top', () => {
  const bar = scroller();
  bar.scroll(0);
  bar.scroll(400);
  assert.equal(bar.scroll(370), 0.75);
  assert.equal(bar.scroll(340), 0.5);
  assert.equal(bar.scroll(310), 0.25);
  assert.equal(bar.scroll(280), 0);
  assert.equal(bar.scroll(310), 0.25);
});

test('stopping mid-scroll keeps the intermediate size and small jitter has only a tiny effect', () => {
  const bar = scroller();
  bar.scroll(0);
  assert.equal(bar.scroll(60), 0.5);
  assert.equal(bar.scroll(60), 0.5);
  assert.ok(Math.abs(bar.scroll(59) - 0.5) < 0.02);
  assert.ok(Math.abs(bar.scroll(60) - 0.5) < 0.02);
});

test('slow and fast scroll events over the same distance produce the same size', () => {
  const slow = scroller(), fast = scroller();
  slow.scroll(0); fast.scroll(0);
  for (let y = 1; y < 60; y++) slow.scroll(y);
  assert.ok(Math.abs(slow.scroll(60) - fast.scroll(60)) < 1e-12);
  slow.scroll(300); fast.scroll(300);
  for (let y = 299; y > 260; y--) slow.scroll(y);
  assert.ok(Math.abs(slow.scroll(260) - fast.scroll(260)) < 1e-12);
});

test('automatic iOS header insets and bottom safe area preserve the scroll direction', () => {
  const bar = scroller({ top: 150, bottom: 34 });
  assert.equal(bar.scroll(-150), 0);
  assert.equal(bar.scroll(-90), 0.5);
  assert.equal(bar.scroll(-120), 0.25);
  assert.equal(bar.scroll(-150), 0);
});

test('bouncing beyond the bottom does not count as scrolling back up', () => {
  const bar = scroller({ height: 1000, viewport: 700, bottom: 34 });
  bar.scroll(0);
  assert.equal(bar.scroll(334), 1);
  assert.equal(bar.scroll(380), 1);
  assert.equal(bar.scroll(350), 1);
  assert.equal(bar.scroll(334), 1);
  assert.equal(bar.scroll(304), 0.75);
});

test('pulling down and rebounding at the top keeps the bar expanded', () => {
  const bar = scroller({ top: 150 });
  for (const y of [-150, -190, -220, -170, -150]) assert.equal(bar.scroll(y), 0);
});

test('short content cannot compact the bar through overscroll', () => {
  const bar = scroller({ height: 200 });
  for (const y of [0, 100, 0, -80, 0]) assert.equal(bar.scroll(y), 0);
});

test('interaction or a new page starts expanded at its own scroll position', () => {
  const bar = scroller();
  bar.scroll(0);
  assert.equal(bar.scroll(300), 1);
  bar.expand();
  assert.equal(bar.scroll(600), 0);
  assert.equal(bar.scroll(630), 0.25);
  assert.equal(bar.scroll(660), 0.5);
  bar.expand();
  assert.equal(bar.scroll(0), 0);
  assert.equal(bar.scroll(30), 0.25);
});

test('repeated small reversals do not make the bar drift in size', () => {
  const bar = scroller();
  bar.scroll(0); bar.scroll(60);
  for (let i = 0; i < 1000; i++) { bar.scroll(59); bar.scroll(60); }
  assert.ok(Math.abs(bar.scroll(60) - 0.5) < 1e-12);
});

test('a gesture can resume from a partially completed expansion without jumping', () => {
  const tracker = createTabBarScrollTracker();
  tracker.reset(0.25);
  const metrics = { contentInset: { top: 0, bottom: 0 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 700 } };
  assert.equal(tracker.update({ ...metrics, contentOffset: { y: 500 } }), 0.25);
  assert.equal(tracker.update({ ...metrics, contentOffset: { y: 530 } }), 0.5);
});
