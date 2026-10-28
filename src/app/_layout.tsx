import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { isRTL, restoreLanguage } from '@/i18n';
import { ConfirmHost, ToastHost } from '@/components/ui/feedback';
import { backend } from '@/services';
import { AppError } from '@/services/backend';
import { useSession } from '@/state/session';
import { baseFontAssets } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the backend on auth/permission errors; retry transient ones once.
      retry: (count, err) => !(err instanceof AppError) && count < 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(baseFontAssets);
  const { ready, setReady, setUser, setLang, lang } = useSession();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    (async () => {
      const l = await restoreLanguage();
      setLang(l);
      try {
        setUser(await backend.getSession());
      } catch {
        setUser(null);
      }
      setBooted(true);
    })();
  }, [setLang, setUser]);

  useEffect(() => {
    // Fonts failing to load must never block the app — system fonts are an acceptable fallback.
    if (booted && (fontsLoaded || fontError)) {
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [booted, fontsLoaded, fontError, setReady]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.ivory }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* Layout direction flips instantly for Urdu without an app restart. */}
          <View style={[styles.root, { direction: isRTL(lang) ? 'rtl' : 'ltr' }]}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory }, animation: Platform.OS === 'web' ? 'none' : 'default' }}>
              <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
            </Stack>
            <ToastHost />
            <ConfirmHost />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.ivory } });
