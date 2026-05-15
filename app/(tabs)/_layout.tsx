// 檔案路徑: D:\TravelApp\app\(tabs)\_layout.tsx
// 版本紀錄: v1.4.1 (修復 PWA 致命白畫面災難：移除高風險 position: fixed，改用安全防彈 CSS 與 viewport-fit)

import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, Text } from 'react-native';
import { TravelProvider, useTravelContext } from '../../context/TravelContext';

function TabLayoutContent() {
  const { isDarkMode, themeColors } = useTravelContext();

  // 🌟 修復白畫面：針對 PWA 環境使用更安全的鎖定方式，避免 iOS Safari 佈局塌陷
  useEffect(() => {
    if (Platform.OS === 'web') {
      // 1. 安全的 Viewport 鎖定 (加入 viewport-fit=cover 填滿瀏海螢幕)
      let metaViewport = document.querySelector('meta[name="viewport"]');
      if (!metaViewport) {
        metaViewport = document.createElement('meta');
        metaViewport.setAttribute('name', 'viewport');
        document.head.appendChild(metaViewport);
      }
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');

      // 2. 移除 position: fixed，改用原生的觸控防護
      const style = document.createElement('style');
      style.innerHTML = `
        /* 關閉橡皮筋回彈與手勢縮放，但不破壞 React Native Web 原有佈局 */
        html, body {
          overscroll-behavior-y: none;
          overscroll-behavior-x: none;
          touch-action: manipulation; /* 允許滑動，但禁止雙擊放大 */
          -webkit-user-select: none;  /* 防止長按反白造成的破版 */
          user-select: none;
          -webkit-tap-highlight-color: transparent; /* 移除點擊時的藍色預設底色 */
        }
        /* 確保輸入框可以正常打字與選取 */
        input, textarea, [contenteditable="true"] {
          -webkit-user-select: auto;
          user-select: text;
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: isDarkMode ? '#666' : '#B2BEC3',
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 55 : 48,
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
          elevation: 15,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 5,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      <Tabs.Screen
        name="trips"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🗺️</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>📊</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="packing"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🧳</Text>
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return (
    <TravelProvider>
      <TabLayoutContent />
    </TravelProvider>
  );
}