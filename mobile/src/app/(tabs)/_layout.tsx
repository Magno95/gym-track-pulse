import { Tabs } from 'expo-router/js-tabs';
import { useAuth } from '@/auth';
import { SessionTabBar } from '@/components/SessionTabBar';
import { TabBarScrollProvider } from '@/components/TabBarScrollProvider';

// Expo Router reads this configuration export alongside the layout component.
// eslint-disable-next-line react-refresh/only-export-components
export const unstable_settings = { initialRouteName: 'session' };

function AccountTabs() {
  return <TabBarScrollProvider><Tabs screenOptions={{ headerShown: false, animation: 'none', tabBarStyle: { position: 'absolute' } }}
    tabBar={(props) => <SessionTabBar {...props} />}>
    <Tabs.Screen name="session" options={{ title: 'Sessione' }} />
    <Tabs.Screen name="(exercises)" options={{ title: 'Esercizi' }} />
    <Tabs.Screen name="start-session" options={{ title: 'Nuova sessione' }} />
    <Tabs.Screen name="history" options={{ title: 'Allenamenti' }} />
    <Tabs.Screen name="profile" options={{ title: 'Profilo' }} />
  </Tabs></TabBarScrollProvider>;
}
export default function TabsLayout() {
  const { session } = useAuth();
  return session ? <AccountTabs key={session.user.id} /> : null;
}
