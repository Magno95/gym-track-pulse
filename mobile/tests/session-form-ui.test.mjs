import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';
import React from '../../node_modules/react/index.js';
import TestRenderer, { act } from '../../node_modules/react-test-renderer/index.js';
import * as domain from '../src/domain.ts';
import * as editor from '../src/data/session-editor.ts';
import { buildSession, newExercise } from '../src/data/actions.ts';
import { emptyState, projectState } from '../src/data/model.ts';
import * as exercises from '../src/data/exercises.ts';
import { createModalDismissGuard } from '../src/modal-dismiss-guard.ts';
import * as swipe from '../src/swipe-delete.ts';
import { swipeMocks } from './swipe-mocks.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { typography, layout } = await import('../src/design.ts');

function fixture({ history = [], secondaryHistory = [], params = {}, exerciseSettings = {}, measurements = [], reducedMotion = true } = {}) {
  const frames = new Map(), listeners = new Map(), options = {}, scrolls = [], impacts = [], transitions = [];
  let nextFrame = 0;
  let keyboard;
  let inputY = 420;
  let addedRowY = 820;
  let uuid = 0;
  const palette = new Proxy({}, { get: () => '#FFFFFF' });
  const element = (tag) => React.forwardRef(function NativeElement({ children, ...props }, ref) {
    return React.createElement(tag, { ...props, ref }, children);
  });
  class Value {
    value = 0;
    addListener(callback) { this.callback = callback; return 'listener'; }
    removeListener() {}
    stopAnimation() {}
    setValue(value) { this.value = value; this.callback?.({ value }); }
  }
  const native = {
    View: element('view'), Text: element('text'), TextInput: element('input'), ScrollView: element('scroll'),
    KeyboardAvoidingView: element('keyboard-avoiding'), Pressable: element('pressable'), Switch: element('switch'),
    Button: element('button'), ActivityIndicator: element('spinner'),
    Animated: { Value, View: element('animated'), spring: () => ({ start() {} }), timing: () => ({ start() {} }) },
    Easing: { cubic: (value) => value, out: (value) => value },
    LayoutAnimation: { configureNext: (config) => transitions.push(config) },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 }, Platform: { OS: 'ios' }, Alert: { alert() {} },
    AppState: { addEventListener: () => ({ remove() {} }) },
    Keyboard: {
      isVisible: () => !!keyboard, metrics: () => keyboard,
      addListener(name, handler) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(handler);
        return { remove: () => listeners.get(name).delete(handler) };
      },
    },
  };
  const exercise = { ...newExercise('alice', 'curl'), name: 'Curl', ...exerciseSettings };
  const secondary = { ...newExercise('alice', 'press'), name: 'Press' };
  const writes = [];
  const workout = { data: { ...emptyState('alice'), exercises: [exercise, secondary], measurements }, loading: false, enqueue(change) {
    workout.data = projectState(workout.data, [{ owner: 'alice', change }], 'alice');
    writes.push(change);
  } };
  for (const [target, records] of [[exercise, history], [secondary, secondaryHistory]]) {
    target.sessions = records.map((record) => ({ ...buildSession(workout.data, target, record.date, record.sets, record.id, record.multiplier ?? 1), ...record.overrides }));
  }
  const navigation = { setOptions: (update) => Object.assign(options, update) };
  function Screen({ options: update }) {
    React.useLayoutEffect(() => { Object.assign(options, update); }, [update]);
    return null;
  }
  const gestures = swipeMocks(React, element);
  const mocks = {
    ...gestures.modules,
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    'expo-router': { Stack: { Screen }, useNavigation: () => navigation,
      useLocalSearchParams: () => ({ exerciseId: 'curl', date: '2026-11-13', inSession: '1', ...params }),
      useFocusEffect() {}, router: { back() {}, push() {}, setParams() {} } },
    'expo-router/js-tabs': { BottomTabBarHeightContext: React.createContext(0) },
    'expo-symbols': { SymbolView: element('symbol') },
    'expo-haptics': { selectionAsync: async () => {}, impactAsync: async (style) => { impacts.push(style); }, ImpactFeedbackStyle: { Medium: 'medium' } },
    'expo-crypto': { randomUUID: () => `row-${++uuid}` },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 16 }) },
    '@react-native-community/datetimepicker': { default: element('date') },
    '../tab-bar-scroll': { useTabBarScroll: () => () => {} },
    '@/workout': { useWorkout: () => workout }, '@/active-session': { useActiveSession: () => ({ active: { date: '2026-11-13' } }) },
    '@/domain': domain, '@/data/session-editor': editor, '@/data/exercises': exercises, '@/modal-dismiss-guard': { createModalDismissGuard }, '@/swipe-delete': swipe,
    '@/components/ExerciseChoice': { ExerciseChoice: element('exercise-choice') }, '@/components/ExerciseList': { ExerciseList: () => null },
    '@/components/ScreenState': { ScreenState: () => null },
  };
  function compile(path) {
    const exports = {};
    const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } }).outputText, { exports, console, Date, setTimeout, clearTimeout,
      requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame: (id) => frames.delete(id),
      require: (name) => {
        if (mocks[name]) return mocks[name];
        if (name.endsWith('/theme')) return { usePalette: () => palette };
        if (name.endsWith('/design')) return { layout, typography };
        if (name.endsWith('/useReducedMotion')) return { useReducedMotion: () => reducedMotion };
        throw new Error(`Missing mock: ${name}`);
      } });
    return exports;
  }
  mocks['@/components/UI'] = compile('components/UI.tsx');
  mocks['@/components/SwipeToDelete'] = compile('components/SwipeToDelete.tsx');
  mocks['@/components/SessionComparison'] = compile('components/SessionComparison.tsx');
  mocks['@/hooks/useSessionLayoutTransition'] = compile('hooks/useSessionLayoutTransition.ts');
  const SessionForm = compile('app/session-form.tsx').default;
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(SessionForm), { createNodeMock: ({ type, props }) => {
    if (type === 'scroll') return { measureInWindow: (callback) => callback(0, 100, 390, keyboard ? 360 : 700),
      scrollTo: (value) => scrolls.push(value) };
    if (type === 'input') return { measureInWindow: (callback) => callback(32, inputY, 140, 44) };
    if (type === 'view' && props.collapsable === false) return { measureInWindow: (callback) => callback(20, addedRowY, 350, 120) };
    return {};
  } }); });
  const root = renderer.root;
  function flushFrames() { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); }); }
  const buttons = () => root.findAllByType('pressable').filter((node) => node.props.accessibilityLabel.startsWith('Aggiungi serie'));
  return { root, options, scrolls, impacts, transitions, buttons, flushFrames, writes, workout,
    add() { act(() => buttons()[0].props.onPress()); },
    /** Measure the swipeable rows, then return the pan config of one of them. */
    swipe(index = 0) {
      act(() => root.findAllByType('reanimated').filter((node) => node.props.onLayout)
        .forEach((node) => node.props.onLayout({ nativeEvent: { layout: { width: 350, height: 120 } } })));
      return root.findAllByType('gesture')[index].props.gesture;
    },
    finishAnimations() { act(() => gestures.finishAnimations()); },
    inputY(value) { inputY = value; },
    layoutAddedRow(y = 820) {
      addedRowY = y;
      const target = root.findAll((node) => node.type === mocks['@/components/UI'].FormScrollTarget && node.props.active)[0];
      assert.ok(target, 'the newly added row must be the scroll target');
      act(() => {
        target.findAllByType('view')[0].props.onLayout();
        root.findByType('scroll').props.onContentSizeChange(390, 1600);
      });
      flushFrames();
    },
    showKeyboard() { act(() => { keyboard = { screenY: 500, height: 300 };
      for (const name of ['keyboardWillShow', 'keyboardDidShow', 'keyboardDidChangeFrame']) {
        listeners.get(name)?.forEach((handler) => handler({ endCoordinates: keyboard }));
      }
    }); flushFrames(); },
    close() { act(() => renderer.unmount()); },
  };
}

test('modal dismissal stays available until a horizontal swipe is recognized, then stays locked through autosave until it ends', () => {
  const v = fixture();
  try {
    v.add();
    const pan = v.swipe();
    assert.equal(v.options.gestureEnabled, true, 'a touch or a vertical drag on a series must not block dismissal');
    act(() => pan.onActivate({ translationX: -12 }));
    assert.equal(v.options.gestureEnabled, false);
    const inputs = v.root.findAllByType('input');
    act(() => inputs[0].props.onChangeText('10'));
    act(() => inputs[1].props.onChangeText('20'));
    assert.equal(v.options.gestureEnabled, false, 'autosave must keep the swipe lock');
    act(() => { pan.onDeactivate({ velocityX: 0, canceled: true }); pan.onFinalize({ canceled: true }); });
    assert.equal(v.options.gestureEnabled, true);
  } finally { v.close(); }
});

test('the add action moves outside the scroll view at five sets, adds more, and returns inline at four', () => {
  const v = fixture();
  const isInScroll = (node) => { for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === 'scroll') return true; return false; };
  try {
    for (let count = 1; count <= 4; count++) {
      assert.equal(v.buttons().length, 1);
      assert.equal(isInScroll(v.buttons()[0]), true);
      v.add();
    }
    assert.equal(isInScroll(v.buttons()[0]), false, 'the fifth set needs a persistent add action');
    v.add();
    assert.equal(v.root.findAllByType('input').length, 12);
    for (let count = 6; count > 4; count--) {
      const row = v.root.findAllByType('text').find((node) => node.children.join('') === `SERIE ${count}`);
      act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }));
    }
    assert.equal(v.buttons().length, 1);
    assert.equal(isInScroll(v.buttons()[0]), true);
  } finally { v.close(); }
});

test('a swipe past the threshold removes the set only after the card has left and the row has closed', () => {
  const v = fixture();
  try {
    v.add();
    const pan = v.swipe();
    act(() => pan.onActivate({ translationX: -12 }));
    assert.equal(v.options.gestureEnabled, false);
    act(() => pan.onUpdate({ translationX: -192, numberOfPointers: 1 }));
    assert.equal(v.impacts.length, 1, 'crossing the threshold gives one haptic');
    act(() => { pan.onDeactivate({ velocityX: -100, canceled: false }); pan.onFinalize({ canceled: false }); });
    assert.equal(v.options.gestureEnabled, true, 'the lock ends with the gesture, not with the animation');
    assert.equal(v.root.findAllByType('input').length, 4, 'the set stays until its exit animation has finished');
    v.finishAnimations();
    assert.equal(v.root.findAllByType('input').length, 2);
    assert.equal(v.impacts.length, 1);
    assert.equal(v.swipe().enabled, false, 'the last remaining set cannot be swiped away');
  } finally { v.close(); }
});

test('the release position decides: past the threshold deletes, pulled back or short springs back', () => {
  // The threshold of a 350pt card is 147pt and disarms 16pt earlier.
  for (const [release, deleted] of [[-800, true], [-140, true], [-80, false], [20, false]]) {
    const v = fixture();
    try {
      v.add();
      const pan = v.swipe();
      act(() => pan.onActivate({ translationX: 0 }));
      act(() => pan.onUpdate({ translationX: -180, numberOfPointers: 1 }));
      act(() => pan.onUpdate({ translationX: release, numberOfPointers: 1 }));
      act(() => { pan.onDeactivate({ velocityX: 0, canceled: false }); pan.onFinalize({ canceled: false }); });
      v.finishAnimations();
      assert.equal(v.root.findAllByType('input').length, deleted ? 2 : 4, `release at ${release}`);
      assert.equal(v.impacts.length, 1, 'feedback is given once, when the threshold is first crossed');
    } finally { v.close(); }
  }
});

test('adding from inline and floating actions reveals the new row after layout', () => {
  const v = fixture();
  try {
    for (let count = 2; count <= 6; count++) {
      const before = v.scrolls.length;
      v.add();
      assert.equal(v.scrolls.length, before, 'wait for the new row layout');
      v.layoutAddedRow();
      assert.ok(v.scrolls.length > before, `series ${count} must scroll into view`);
      assert.ok(v.scrolls.at(-1).y >= 172);
    }
  } finally { v.close(); }
});

test('adding a superset row with the keyboard open reveals that row above the footer', () => {
  const v = fixture();
  try {
    act(() => v.root.findByType('switch').props.onValueChange(true));
    act(() => v.root.findByType('exercise-choice').props.onChange('press'));
    act(() => v.root.findAllByType('input')[0].props.onFocus({}));
    v.showKeyboard();
    v.add();
    v.layoutAddedRow(600);
    assert.ok(v.scrolls.at(-1).y >= 292, 'the full new card must clear the keyboard and footer');
    act(() => v.root.findByType('scroll').props.onLayout());
    v.flushFrames();
    assert.ok(v.scrolls.at(-1).y >= 292, 'relayout must not return to the previously focused field');
  } finally { v.close(); }
});

test('a system interruption or another finger never deletes an armed row', () => {
  for (const interruption of ['system', 'multitouch']) {
    const v = fixture();
    try {
      v.add();
      const pan = v.swipe();
      act(() => pan.onActivate({ translationX: 0 }));
      act(() => pan.onUpdate({ translationX: -180, numberOfPointers: 1 }));
      if (interruption === 'system') act(() => pan.onDeactivate({ velocityX: 0, canceled: true }));
      else {
        act(() => pan.onUpdate({ translationX: -200, numberOfPointers: 2 }));
        act(() => pan.onDeactivate({ velocityX: 0, canceled: false }));
      }
      act(() => pan.onFinalize({ canceled: interruption === 'system' }));
      v.finishAnimations();
      assert.equal(v.impacts.length, 1);
      assert.equal(v.root.findAllByType('input').length, 4);
    } finally { v.close(); }
  }
});

test('both superset exercises get their own persistent add action above four sets', () => {
  const v = fixture();
  try {
    act(() => v.root.findByType('switch').props.onValueChange(true));
    act(() => v.root.findByType('exercise-choice').props.onChange('press'));
    for (let index = 0; index < 4; index++) v.add();
    // The primary action has moved to the footer; the secondary is now first inline.
    for (let index = 0; index < 4; index++) v.add();
    assert.equal(v.root.findAllByType('input').length, 21); // Two fields per set and the multiplier.
    assert.deepEqual(v.buttons().map((node) => node.props.accessibilityLabel), ['Aggiungi serie · Curl', 'Aggiungi serie · Press']);
    const scrollingActions = v.root.findByType('scroll').findAllByType('pressable').filter((node) => node.props.accessibilityLabel.startsWith('Aggiungi serie'));
    assert.equal(scrollingActions.length, 0);
    v.add();
    assert.equal(v.root.findAllByType('input').length, 23);
  } finally { v.close(); }
});

test('keyboard appearance and moving focus to another numeric field leave extra space above the footer', () => {
  const v = fixture();
  try {
    const inputs = v.root.findAllByType('input');
    act(() => inputs[0].props.onFocus({}));
    v.showKeyboard();
    assert.ok(v.scrolls.length > 0, 'keyboard appearance must reveal the focused input');
    assert.ok(v.scrolls.at(-1).y >= 32, 'input bottom must clear the visible viewport by at least 28pt');
    const scroll = v.root.findByType('scroll');
    act(() => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 100 } } }));
    v.inputY(450);
    act(() => inputs[1].props.onFocus({}));
    v.flushFrames();
    assert.ok(v.scrolls.at(-1).y >= 166, 'changing fields with an open keyboard must also reveal the input');
  } finally { v.close(); }
});

test('an input with enough clearance does not cause an unnecessary scroll', () => {
  const v = fixture();
  try {
    v.inputY(200);
    act(() => v.root.findAllByType('input')[0].props.onFocus({}));
    v.showKeyboard();
    assert.equal(v.scrolls.length, 0);
  } finally { v.close(); }
});

test('deleting the focused row does not scroll to its removed input when the keyboard changes', () => {
  const v = fixture();
  try {
    v.add();
    act(() => v.root.findAllByType('input')[0].props.onFocus({}));
    const row = v.root.findAllByType('text').find((node) => node.children.join('') === 'SERIE 1');
    act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }));
    v.showKeyboard();
    assert.equal(v.scrolls.length, 0);
  } finally { v.close(); }
});

const comparisonToggle = (v, name = 'Curl') => v.root.findAllByType('switch').find((node) => node.props.accessibilityLabel === `Confronta ${name} con la sessione precedente`);
const textValues = (v) => v.root.findAllByType('text').map((node) => node.children.join(''));
const previousRecord = { id: 'previous', date: '2026-11-10', sets: [{ reps: '12', weight: '22.5' }, { reps: '10', weight: '20' }, { reps: '8', weight: '20' }] };

test('comparison transforms existing inputs and score without losing focus or animating keystrokes', () => {
  const v = fixture({ history: [previousRecord], reducedMotion: false });
  try {
    const input = v.root.findAllByType('input')[0];
    act(() => input.props.onChangeText('8'));
    act(() => v.root.findAllByType('input')[1].props.onChangeText('25'));
    act(() => input.props.onFocus({}));
    const score = v.root.findAllByType('text').find((node) => node.children.join('') === '200 pt');
    assert.equal(v.transitions.length, 0, 'typing must remain immediate');
    for (const enabled of [true, false, true]) {
      act(() => comparisonToggle(v).props.onValueChange(enabled));
      assert.equal(v.root.findAllByType('input')[0], input, 'the focused native input must not remount');
      assert.equal(v.root.findAllByType('text').find((node) => node.children.join('') === '200 pt'), score,
        'the current score must move within the same summary, rather than replacing it');
    }
    assert.equal(v.transitions.length, 3);
    v.showKeyboard();
    assert.ok(v.scrolls.length > 0, 'the focused field must still be tracked after changing comparison mode');
    v.add();
    assert.equal(v.transitions.length, 4, 'adding a set animates the layout too');
    v.layoutAddedRow();
    assert.equal(v.root.findAllByType('input').length, 4);
  } finally { v.close(); }
});

test('reduced motion keeps comparison and adding sets available without layout animation', () => {
  const v = fixture({ history: [previousRecord], reducedMotion: true });
  try {
    act(() => comparisonToggle(v).props.onValueChange(true));
    v.add();
    assert.equal(comparisonToggle(v).props.value, true);
    assert.equal(v.root.findAllByType('input').length, 4);
    assert.equal(v.transitions.length, 0);
  } finally { v.close(); }
});

test('comparison is offered only when the exercise has a session on an earlier workout day', () => {
  for (const history of [[], [{ ...previousRecord, date: '2026-11-13' }], [{ ...previousRecord, date: '2026-11-20' }]]) {
    const v = fixture({ history });
    try { assert.equal(comparisonToggle(v), undefined); }
    finally { v.close(); }
  }
  const v = fixture({ history: [previousRecord] });
  try { assert.equal(comparisonToggle(v).props.value, false); }
  finally { v.close(); }
});

test('comparison pairs unequal set counts, preserves editable drafts and never changes historical sets', () => {
  const v = fixture({ history: [previousRecord] });
  try {
    const historyBefore = JSON.stringify(v.workout.data.exercises[0].sessions[0]);
    act(() => v.root.findAllByType('input')[0].props.onChangeText('7'));
    act(() => comparisonToggle(v).props.onValueChange(true));
    assert.equal(comparisonToggle(v).props.value, true);
    assert.equal(v.root.findAllByType('input').length, 2, 'previous values must be read-only');
    assert.equal(v.root.findAllByType('input')[0].props.value, '7');
    assert.equal(textValues(v).filter((value) => value === 'Nessuna serie').length, 2);
    assert.ok(textValues(v).includes('22,5'));
    assert.equal(v.writes.length, 0, 'changing the view must not persist the incomplete draft');
    v.add();
    v.layoutAddedRow();
    assert.equal(v.root.findAllByType('input').length, 4);
    const row = v.root.findAllByType('text').find((node) => node.props.onAccessibilityAction && node.children.join('') === 'SERIE 1');
    act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }));
    assert.equal(v.root.findAllByType('input').length, 2);
    assert.equal(v.root.findAllByType('input')[0].props.value, '7');
    assert.equal(JSON.stringify(v.workout.data.exercises[0].sessions[0]), historyBefore);
    act(() => comparisonToggle(v).props.onValueChange(false));
    assert.equal(v.root.findAllByType('input')[0].props.value, '7');
    assert.equal(textValues(v).includes('Nessuna serie'), false);
  } finally { v.close(); }
});

test('the current comparison score updates live while the saved previous score remains unchanged', () => {
  const v = fixture({ history: [{ ...previousRecord, sets: [{ reps: '10', weight: '20' }], overrides: { value: 333 } }] });
  try {
    act(() => v.root.findAllByType('input')[0].props.onChangeText('8'));
    act(() => v.root.findAllByType('input')[1].props.onChangeText('25'));
    const writesBefore = v.writes.length;
    act(() => comparisonToggle(v).props.onValueChange(true));
    assert.equal(v.writes.length, writesBefore);
    assert.ok(textValues(v).includes('200 pt'));
    assert.ok(textValues(v).includes('333 pt'));
    assert.ok(textValues(v).includes('10 nov 2026'));
    act(() => v.root.findAllByType('input')[0].props.onChangeText('10'));
    assert.ok(textValues(v).includes('250 pt'));
    assert.ok(textValues(v).includes('333 pt'));
    v.add();
    assert.equal(v.root.findAllByType('input').length, 4);
    assert.ok(textValues(v).includes('Nessuna serie'), 'current extra sets remain visible without a historical match');
    assert.ok(textValues(v).includes('500 pt'));
  } finally { v.close(); }
});

test('historical bodyweight comparison keeps added load, duration and the saved body weight', () => {
  const v = fixture({ exerciseSettings: { is_bodyweight: true, unit: 'time' },
    measurements: [{ effective_date: '2026-11-01', weight_kg: 70 }, { effective_date: '2026-11-13', weight_kg: 80 }],
    history: [{ ...previousRecord, sets: [{ reps: '30', weight: '5' }] }] });
  try {
    act(() => comparisonToggle(v).props.onValueChange(true));
    const labels = textValues(v);
    assert.ok(labels.includes('70 kg corporei'));
    assert.ok(labels.includes(`${(2250).toLocaleString('it-IT')} pt`));
    assert.ok(labels.includes('+ kg'));
    assert.ok(labels.includes('30'));
    assert.ok(labels.includes('5'));
    assert.equal(labels.includes('75'), false, 'the historical added-load column must not show total body weight');
  } finally { v.close(); }
});

test('superset comparisons use each exercise history independently and new exercise selection resets the toggle', () => {
  const v = fixture({ history: [previousRecord], secondaryHistory: [{ ...previousRecord, id: 'previous-press', date: '2026-11-09' }] });
  try {
    act(() => v.root.findAllByType('switch').find((node) => node.props.accessibilityLabel === 'Superset').props.onValueChange(true));
    act(() => v.root.findByType('exercise-choice').props.onChange('press'));
    act(() => comparisonToggle(v).props.onValueChange(true));
    assert.equal(comparisonToggle(v, 'Press').props.value, false);
    act(() => comparisonToggle(v, 'Press').props.onValueChange(true));
    assert.ok(textValues(v).includes('10 nov 2026'));
    assert.ok(textValues(v).includes('9 nov 2026'));
    act(() => v.root.findByType('exercise-choice').props.onChange(''));
    act(() => v.root.findByType('exercise-choice').props.onChange('press'));
    assert.equal(comparisonToggle(v, 'Press').props.value, false);
    assert.equal(comparisonToggle(v).props.value, true);
  } finally { v.close(); }
});

test('a long legacy history keeps Add Set fixed while comparing and restores it inline when comparison closes', () => {
  const v = fixture({ history: [{ ...previousRecord, overrides: { sets: null, series: 6, reps: 12, weight: 20, value: 1440 } }] });
  const isInScroll = (node) => { for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === 'scroll') return true; return false; };
  try {
    assert.equal(isInScroll(v.buttons()[0]), true);
    act(() => comparisonToggle(v).props.onValueChange(true));
    assert.equal(textValues(v).filter((value) => value === 'Nessuna serie').length, 5);
    assert.equal(v.buttons().length, 1);
    assert.equal(isInScroll(v.buttons()[0]), false);
    v.add();
    v.layoutAddedRow();
    assert.equal(v.root.findAllByType('input').length, 4);
    act(() => comparisonToggle(v).props.onValueChange(false));
    assert.equal(v.buttons().length, 1);
    assert.equal(isInScroll(v.buttons()[0]), true);
  } finally { v.close(); }
});

test('editing an older session compares against its own previous day rather than the most recent session overall', () => {
  const v = fixture({ params: { sessionId: 'edited' }, history: [previousRecord,
    { ...previousRecord, id: 'edited', date: '2026-11-11' }, { ...previousRecord, id: 'later', date: '2026-11-12' }] });
  try {
    act(() => comparisonToggle(v).props.onValueChange(true));
    assert.ok(textValues(v).includes('10 nov 2026'));
    assert.ok(textValues(v).includes('11 nov 2026'));
    assert.equal(textValues(v).includes('12 nov 2026'), false);
    assert.equal(v.writes.length, 0);
  } finally { v.close(); }
});
