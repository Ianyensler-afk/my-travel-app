// 檔案路徑: D:\TravelApp\app\_layout.tsx
// 版本紀錄: v2.0.0 (終極醫療級防護版：導入 Error Boundary 阻絕白畫面與一鍵重置)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { TravelProvider } from '../context/TravelContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 🛡️ 終極醫療級防護盾：攔截所有會導致白畫面的崩潰，並提供 UI 救援面板
class GlobalErrorBoundary extends React.Component<any, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#F0F3F7' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#E74C3C', marginBottom: 12 }}>⚠️ 系統發生致命錯誤</Text>
          <Text style={{ fontSize: 13, color: '#333', marginBottom: 20, textAlign: 'center', paddingHorizontal: 10 }}>
            {String(this.state.error)}
          </Text>
          <Text style={{ fontSize: 13, color: '#555', marginBottom: 25, textAlign: 'center', lineHeight: 20 }}>
            這通常是因為剛才【還原的 JSON 資料】格式異常，或是網頁快取衝突導致 App 渲染崩潰。
          </Text>
          
          <TouchableOpacity
            onPress={async () => {
              try {
                await AsyncStorage.clear(); // ☢️ 徹底清除受損的資料毒藥
                if (Platform.OS === 'web') {
                  window.location.reload();
                } else {
                  alert('✅ 資料已完全清除！請將 App 從後台「完全滑掉關閉」後重新開啟。');
                }
              } catch (e) {}
            }}
            style={{ backgroundColor: '#E74C3C', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 8, elevation: 3 }}
          >
            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }}>🗑️ 清除所有資料並強制重置</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GlobalErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <TravelProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </TravelProvider>
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}