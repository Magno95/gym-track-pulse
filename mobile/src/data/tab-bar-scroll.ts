type ScrollMetrics = {
  contentOffset: { y: number };
  contentInset: { top: number; bottom: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
};

const COLLAPSE_DISTANCE = 120;

/** Accumulate real scroll distance, excluding the iOS rubber-band bounce. */
export function createTabBarScrollTracker() {
  let previous: number | undefined;
  let progress = 0;

  return {
    reset(initialProgress = 0) { previous = undefined; progress = Math.max(0, Math.min(1, initialProgress)); },
    update(metrics: ScrollMetrics): number {
      const { contentOffset, contentInset, contentSize, layoutMeasurement } = metrics;
      const maximum = Math.max(0, contentSize.height + contentInset.top + contentInset.bottom - layoutMeasurement.height);
      const position = Math.max(0, Math.min(maximum, contentOffset.y + contentInset.top));
      const delta = previous === undefined ? 0 : position - previous;
      previous = position;

      // Equal travel in either direction must cancel out, including tiny jitter.
      progress = position === 0 ? 0 : Math.max(0, Math.min(1, progress + delta / COLLAPSE_DISTANCE));
      return progress;
    },
  };
}
