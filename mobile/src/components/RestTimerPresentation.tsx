import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import { useActiveSession } from '../active-session';
import { restTimerToPresent } from '../data/rest-timer-navigation';

export function RestTimerPresentation() {
  const { active } = useActiveSession();
  const navigation = useRootNavigationState();
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!navigation?.key || appState !== 'active') return;
    // Let a completed user dismissal cancel the rest before deciding to restore
    // its sheet. This also waits for deep-link navigation to settle on resume.
    const frame = requestAnimationFrame(() => {
      const rest = restTimerToPresent(active, navigation.routes[navigation.index]);
      if (rest) router.navigate({ pathname: '/rest-timer', params: { notificationId: rest.notificationId } });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, appState, navigation]);

  return null;
}
