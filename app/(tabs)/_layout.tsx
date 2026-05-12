// 檔案路徑: D:\TravelApp\app\(tabs)\_layout.tsx
// 版本紀錄: v1.3.0 (新增 Web PWA 全局鎖定防護，解決畫面動來動去的問題)

import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, Text } from 'react-native';
import { TravelProvider, useTravelContext } from '../../context/TravelContext';

function TabLayoutContent() {
  const { isDarkMode, themeColors } = useTravelContext();

  // 🌟 新增：針對 Web 版本的終極畫面鎖定防護
  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.innerHTML = `
        /* 鎖定根元素，防止瀏覽器預設的回彈與下拉重整 */
        html, body, #root {
          width: 100%;
          height: 100%;
          overflow: hidden; 
          overscroll-behavior-y: none; /* 關閉 iOS 橡皮筋回彈 */
          overscroll-behavior-x: none;
          position: fixed; /* 將畫面釘死 */
          touch-action: pan-x pan-y;
        }
      `;
      document.head.appendChild(style);
      return () => { document.head.removeChild(style); };
    }
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.primary, 
        tabBarInactiveTintColor: isDarkMode ? '#888' : '#A0A0A0',
        headerShown: false,
        tabBarShowLabel: false, 
        tabBarStyle: { 
          height: Platform.OS === 'ios' ? 60 : 50, 
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          justifyContent: 'center',
          alignItems: 'center'
        }
      }}>
      
      <Tabs.Screen name="trips" options={{ tabBarIcon: ({ focused }) => ( <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>🏠</Text> ) }} />
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ focused }) => ( <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>🗺️</Text> ) }} />
      <Tabs.Screen name="explore" options={{ tabBarIcon: ({ focused }) => ( <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>📊</Text> ) }} />
      <Tabs.Screen name="packing" options={{ tabBarIcon: ({ focused }) => ( <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>🧳</Text> ) }} />
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