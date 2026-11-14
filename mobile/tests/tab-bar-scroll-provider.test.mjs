import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from '../../node_modules/react/index.js';
import TestRenderer, { act } from '../../node_modules/react-test-renderer/index.js';
import { createTabBarScrollTracker } from '../src/data/tab-bar-scroll.ts';

const require = createRequire(new URL('../../package.json', import.meta.url));
function fixture(reduced = false) {
  const context = React.createContext(null), callbacks = [], springs = [];
  let controls, renders = 0;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation(callback) {
      if (callback) { const current = this.value; callbacks.push(() => callback(current)); }
    }
  }
  const mocks = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { Animated: { Value, spring: (value, config) => ({ start(callback) { springs.push({ value, config, callback }); } }) } },
    '@/data/tab-bar-scroll': { createTabBarScrollTracker },
    '@/tab-bar-scroll': { TabBarScrollContext: context },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/TabBarScrollProvider.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => { if (!mocks[name]) throw new Error(`Missing mock: ${name}`); return mocks[name]; } });
  function Probe() { controls = React.useContext(context); renders++; return null; }
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(exports.TabBarScrollProvider, null, React.createElement(Probe))); });
  return {
    get controls() { return controls; }, get renders() { return renders; }, springs,
    scroll(y) { act(() => controls.onScroll({ nativeEvent: { contentOffset: { y }, contentInset: { top: 0, bottom: 0 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 700 } } })); },
    flush() { act(() => { callbacks.splice(0).forEach((callback) => callback()); }); },
    dispose() { act(() => renderer.unmount()); },
  };
}

test('scroll updates size directly without starting animations or rendering screens again', () => {
  const f = fixture();
  f.scroll(0); f.scroll(30); f.scroll(60);
  assert.equal(f.controls.progress.value, 0.5);
  assert.equal(f.springs.length, 0);
  assert.equal(f.renders, 1);
  f.dispose();
});

test('touch expansion yields to a new scroll at the displayed size using the latest queued event', () => {
  const f = fixture();
  f.scroll(0); f.scroll(120);
  f.controls.beginInteraction();
  assert.equal(f.springs.length, 1);
  f.controls.progress.value = 0.25; // Native spring is part-way through expanding.
  f.scroll(200);
  assert.equal(f.controls.progress.value, 0.25);
  f.controls.endInteraction();
  f.scroll(300); f.scroll(330); f.flush();
  assert.equal(f.controls.progress.value, 0.25);
  f.scroll(360);
  assert.equal(f.controls.progress.value, 0.5);
  f.dispose();
});

test('a stale native callback cannot overwrite a subsequent interaction', () => {
  const f = fixture();
  f.scroll(0); f.scroll(120);
  f.controls.expand(); f.controls.progress.value = 0.5;
  f.scroll(300);
  f.controls.beginInteraction(); f.controls.progress.value = 0.1;
  f.flush();
  assert.equal(f.controls.progress.value, 0.1);
  f.dispose();
});

test('reduced motion restores the bar immediately without a spring', () => {
  const f = fixture(true);
  f.scroll(0); f.scroll(120); f.controls.expand();
  assert.equal(f.controls.progress.value, 0);
  assert.equal(f.springs.length, 0);
  f.dispose();
});
