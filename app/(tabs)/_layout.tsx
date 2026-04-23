import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text } from 'react-native';
// 💡 引入我們剛剛建立的 Context Provider
import { TravelProvider, useTravelContext } from '../../context/TravelContext';

function TabLayoutContent() {
  const { isDarkMode, themeColors } = useTravelContext();

  return (
    <Tabs
      screenOptions={{
        // 🌟 V1.1 優化：改用主色系 (珊瑚西瓜紅) 增加活力
        tabBarActiveTintColor: themeColors.primary, 
        tabBarInactiveTintColor: isDarkMode ? '#888' : '#A0A0A0',
        headerShown: false,
        tabBarStyle: { 
          paddingBottom: Platform.OS === 'ios' ? 20 : 6, // 給予底部更多安全距離
          paddingTop: 6, 
          height: Platform.OS === 'ios' ? 85 : 60, // 壓縮總高度，避免佔用螢幕
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
        },
        tabBarLabelStyle: {
          fontSize: 10, // 字體稍微縮小，確保絕對安全
          fontWeight: 'bold', 
          marginBottom: Platform.OS === 'web' ? 4 : 0 
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '行程地圖',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '記帳分析',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="packing"
        options={{
          title: '行李清單',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧳</Text>,
        }}
      />
    </Tabs>
  );
}

// 💡 用 Provider 包裝整個 Layout
export default function TabLayout() {
  return (
    <TravelProvider>
      <TabLayoutContent />
    </TravelProvider>
  );
}