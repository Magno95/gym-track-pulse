/**
 * Stand-ins for the native gesture and animation modules. A swipe is driven by
 * calling the pan config found on the `gesture` element; timed animations (the
 * card leaving, the row closing) finish only on `finishAnimations()`. Animated
 * styles stay functions: call one to read the style for the current values.
 */
export function swipeMocks(React, element) {
  const timed = [];
  return {
    finishAnimations() { while (timed.length) timed.shift()(true); },
    modules: {
      'react-native-gesture-handler': {
        GestureDetector: ({ gesture, children }) => React.createElement('gesture', { gesture }, children),
        usePanGesture: (config) => config,
      },
      'react-native-reanimated': {
        default: { View: element('reanimated') },
        useSharedValue: (initial) => React.useState(() => ({ value: initial }))[0],
        useAnimatedStyle: (style) => style,
        withSpring: (value) => value,
        withTiming: (value, _config, done) => { if (done) timed.push(done); return value; },
        interpolate: (value) => value, interpolateColor: () => '#000000', Extrapolation: { CLAMP: 'clamp' },
        Easing: { bezier: () => (value) => value, out: (easing) => easing, quad: (value) => value },
      },
      'react-native-worklets': { scheduleOnRN: (callback, ...args) => callback(...args) },
    },
  };
}
