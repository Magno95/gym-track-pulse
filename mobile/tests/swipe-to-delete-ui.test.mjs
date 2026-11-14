import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from '../../node_modules/react/index.js';
import TestRenderer, { act } from '../../node_modules/react-test-renderer/index.js';
import * as swipe from '../src/swipe-delete.ts';
import { swipeMocks } from './swipe-mocks.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { typography, layout } = await import('../src/design.ts');

function fixture(props = {}) {
  const impacts = [], deletions = [], reports = [], mounts = [];
  function Content() { React.useEffect(() => { mounts.push('mounted'); }, []); return null; }
  const element = (tag) => React.forwardRef(function NativeElement({ children, ...rest }, ref) {
    return React.createElement(tag, { ...rest, ref }, children);
  });
  const gestures = swipeMocks(React, element);
  const mocks = {
    ...gestures.modules,
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { View: element('view'), Text: element('text'), StyleSheet: { create: (styles) => styles }, Platform: { OS: 'ios' },
      useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'expo-symbols': { SymbolView: element('symbol') },
    'expo-haptics': { impactAsync: async (style) => { impacts.push(style); }, ImpactFeedbackStyle: { Medium: 'medium' } },
    '@/theme': { usePalette: () => new Proxy({}, { get: () => '#FFFFFF' }) }, '@/design': { layout, typography }, '@/swipe-delete': swipe,
  };
  const exports = {};
  const source = readFileSync(new URL('../src/components/SwipeToDelete.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, console, require: (name) => {
    if (mocks[name]) return mocks[name];
    throw new Error(`Missing mock: ${name}`);
  } });
  const render = (extra = {}) => React.createElement(exports.SwipeToDelete, {
    onDelete: () => { deletions.push('deleted'); }, onSwipeChange: (_id, active) => reports.push(active), ...props, ...extra,
  }, React.createElement(Content));
  let renderer;
  act(() => { renderer = TestRenderer.create(render()); });
  const root = renderer.root;
  const row = () => root.findAllByType('reanimated').find((node) => node.props.onLayout);
  const pan = () => root.findByType('gesture').props.gesture;
  act(() => row().props.onLayout({ nativeEvent: { layout: { width: 350, height: 96 } } }));
  return { root, impacts, deletions, reports, mounts, row, pan,
    update(extra) { act(() => renderer.update(render(extra))); },
    /** Drag to `translation` and lift the finger there. */
    swipeTo(translation, velocityX = 0) {
      act(() => pan().onActivate({ translationX: 0 }));
      act(() => pan().onUpdate({ translationX: translation, numberOfPointers: 1 }));
      act(() => { pan().onDeactivate({ velocityX, canceled: false }); pan().onFinalize({ canceled: false }); });
    },
    finishAnimations() { act(() => gestures.finishAnimations()); },
    async settle() { await act(async () => { gestures.finishAnimations(); await Promise.resolve(); }); await act(async () => { gestures.finishAnimations(); }); },
    close() { act(() => renderer.unmount()); },
  };
}
const offsetOf = (v) => v.root.findByType('gesture').findByType('reanimated').props.style.at(-1)().transform[0].translateX;
// Copied into this realm: the component runs in its own VM context.
const closing = (v) => ({ ...v.row().props.style.at(-1)() });

test('the gesture is claimed natively with the shared activation ranges and a single finger', () => {
  const v = fixture();
  try {
    const pan = v.pan();
    assert.equal(pan.activeOffsetX, swipe.swipeActivation.activeOffsetX);
    assert.equal(pan.failOffsetX, swipe.swipeActivation.failOffsetX);
    assert.deepEqual(pan.failOffsetY, swipe.swipeActivation.failOffsetY);
    assert.equal(pan.maxPointers, 1);
    assert.equal(pan.enabled, true);
  } finally { v.close(); }
});

test('the card follows the finger and a short swipe springs back without deleting or parking', () => {
  const v = fixture();
  try {
    act(() => v.pan().onActivate({ translationX: -12 }));
    act(() => v.pan().onUpdate({ translationX: -72, numberOfPointers: 1 }));
    assert.equal(offsetOf(v), -60, 'the travel that activated the gesture must not make the card jump');
    assert.deepEqual(v.reports, [true]);
    act(() => { v.pan().onDeactivate({ velocityX: 0, canceled: false }); v.pan().onFinalize({ canceled: false }); });
    v.finishAnimations();
    assert.equal(offsetOf(v), 0);
    assert.deepEqual(v.reports, [true, false]);
    assert.deepEqual(v.deletions, []);
    assert.deepEqual(v.impacts, []);
  } finally { v.close(); }
});

test('a committed swipe sends the card off screen, closes the row including its spacing, then deletes', () => {
  const v = fixture({ spacing: 16, collapseGap: 12 });
  try {
    assert.equal(v.row().props.style[0].marginBottom, 16);
    v.swipeTo(-200);
    assert.equal(v.impacts.length, 1);
    assert.ok(offsetOf(v) <= -350, 'the whole card leaves the screen');
    assert.deepEqual(v.deletions, [], 'deletion waits for the animations');
    v.finishAnimations();
    assert.deepEqual(v.deletions, ['deleted']);
    assert.deepEqual(closing(v), { height: 0, marginBottom: -12, opacity: 0 });
  } finally { v.close(); }
});

test('a quick flick deletes with feedback even before the threshold', () => {
  const v = fixture();
  try {
    v.swipeTo(-90, -1500);
    v.finishAnimations();
    assert.deepEqual(v.deletions, ['deleted']);
    assert.equal(v.impacts.length, 1);
  } finally { v.close(); }
});

test('a declined confirmation brings the card back and leaves the row ready for another swipe', async () => {
  const answers = [false, true];
  const v = fixture({ confirm: async () => answers.shift() });
  try {
    v.swipeTo(-200);
    await v.settle();
    assert.deepEqual(v.deletions, []);
    assert.equal(offsetOf(v), 0);
    assert.deepEqual(closing(v), {}, 'a row that never closed keeps its natural height');
    v.swipeTo(-200);
    await v.settle();
    assert.deepEqual(v.deletions, ['deleted']);
  } finally { v.close(); }
});

test('a deletion that fails after the row closed restores a fresh, full-height row', () => {
  const v = fixture({ onDelete: () => false });
  try {
    v.swipeTo(-200);
    v.finishAnimations();
    assert.equal(offsetOf(v), 0);
    assert.deepEqual(closing(v), {});
    assert.equal(v.mounts.length, 2, 'the closed row is remounted so no collapsed height survives');
  } finally { v.close(); }
});

test('disabling a row mid-flight cancels its deletion and hides the action', () => {
  const v = fixture();
  try {
    assert.equal(v.root.findAllByType('symbol').length, 1);
    v.swipeTo(-200);
    v.update({ disabled: true });
    assert.equal(v.pan().enabled, false);
    assert.equal(offsetOf(v), 0);
    assert.equal(v.root.findAllByType('symbol').length, 0);
  } finally { v.close(); }
});
