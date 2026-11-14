import { Stack, ThemeProvider, DarkTheme, DefaultTheme, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/components/AuthProvider';
import { ScreenState } from '@/components/ScreenState';
import { useAuth } from '@/auth';
import { supabase } from '@/supabase';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WorkoutProvider } from '@/components/WorkoutProvider';
import { ActiveSessionProvider } from '@/components/ActiveSessionProvider';
import { RestTimerPresentation } from '@/components/RestTimerPresentation';
import { usePalette } from '@/theme';

function AppNavigator() {
  const { session } = useAuth();
  const p = usePalette();
  return <Stack screenOptions={{ headerTintColor: p.text, contentStyle: { backgroundColor: p.background } }}>
    <Stack.Protected guard={!!session}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'GymTrack' }} />
      <Stack.Screen name="exercise-form" options={{ title: 'Esercizio', presentation: 'modal' }} />
      <Stack.Screen name="session-form" options={{ title: 'Allenamento', presentation: 'modal' }} />
      <Stack.Screen name="rest-timer" options={{ title: 'Timer', presentation: 'formSheet', sheetAllowedDetents: [0.65], sheetGrabberVisible: true, headerShown: false }} />
      <Stack.Screen name="workout-session" options={{ title: 'In sessione' }} />
      <Stack.Screen name="measurement-form" options={{ title: 'Misurazioni', presentation: 'modal' }} />
      <Stack.Screen name="strava" options={{ title: 'Strava', presentation: 'modal' }} />
    </Stack.Protected>
    <Stack.Protected guard={!session}><Stack.Screen name="sign-in" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Screen name="strava-callback" options={{ title: 'Collegamento Strava' }} />
  </Stack>;
}
function AccountApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } }));
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  return <QueryClientProvider client={client}><WorkoutProvider><ActiveSessionProvider><AppNavigator /><RestTimerPresentation /></ActiveSessionProvider></WorkoutProvider></QueryClientProvider>;
}

function SessionNavigator() {
  const { session, loading, error, retry } = useAuth();
  if (loading) return <ScreenState title="GymTrack" message="Riprendiamo da dove eri rimasto." loading />;
  if (error) return <ScreenState title="Accesso non disponibile" message={error} onRetry={retry} />;
  return session ? <AccountApp key={session.user.id} /> : <AppNavigator />;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = usePalette();
  const baseTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...baseTheme, colors: { ...baseTheme.colors, primary: p.accent, background: p.background, card: p.surface, text: p.text, border: p.separator, notification: p.brand } };
  // Native gesture recognition (swipe to delete) needs this root above every screen.
  return <GestureHandlerRootView style={{ flex: 1 }}><ThemeProvider value={theme}>
    <StatusBar style="auto" />
    {supabase ? <AuthProvider><SessionNavigator /></AuthProvider>
      : <ScreenState title="GymTrack non è pronto" message="La configurazione dell’app non è disponibile." />}
  </ThemeProvider></GestureHandlerRootView>;
}
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <ScreenState title="Qualcosa non è andato a buon fine" message="Non riusciamo ad aprire questa schermata. Riprova." onRetry={() => void retry()} />;
}
