import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (active) setReduced(value); })
      .catch(() => { /* Keep motion reduced when the preference is unavailable. */ });
    return () => { active = false; listener.remove(); };
  }, []);
  return reduced;
}
