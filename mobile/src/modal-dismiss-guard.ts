/** Keep native dismissal disabled while a card is swiped horizontally or the form has unsaved changes. */
export function createModalDismissGuard(setGestureEnabled: (enabled: boolean) => void) {
  const swipes = new Set<symbol>();
  let dirty = false;
  let enabled: boolean | undefined;
  function update() {
    const next = !dirty && swipes.size === 0;
    if (next === enabled) return;
    enabled = next;
    setGestureEnabled(next);
  }
  return {
    setDirty(value: boolean) { dirty = value; update(); },
    setSwipe(id: symbol, active: boolean) {
      if (active) swipes.add(id);
      else swipes.delete(id);
      update();
    },
  };
}
