// 檔案路徑: D:\TravelApp\app\(tabs)\_layout.tsx
// 版本紀錄: v1.1.0 (加入完整註解、優化底部導覽列 Icon 點擊的視覺回饋)

import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text } from 'react-native';
// 💡 引入 Context Provider，確保全局狀態能向下傳遞
import { TravelProvider, useTravelContext } from '../../context/TravelContext';

function TabLayoutContent() {
  const { isDarkMode, themeColors } = useTravelContext();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.primary, 
        tabBarInactiveTintColor: isDarkMode ? '#888' : '#A0A0A0',
        headerShown: false,
        tabBarStyle: { 
          height: Platform.OS === 'ios' ? 60 : 50, 
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: 'bold', 
          marginBottom: Platform.OS === 'web' ? 4 : 0 
        }
      }}>
      
      {/* 🌟 1. 新增的「總管頁面」排在第一個 */}
      <Tabs.Screen
        name="trips"
        options={{
          title: '總覽',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>🏠</Text>
          ),
        }}
      />

      {/* 🗺️ 2. 行程地圖 */}
      <Tabs.Screen
        name="index"
        options={{
          title: '地圖',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>🗺️</Text>
          ),
        }}
      />
      
      {/* 📊 3. 記帳分析 */}
      <Tabs.Screen
        name="explore"
        options={{
          title: '記帳',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>📊</Text>
          ),
        }}
      />
      
      {/* 🧳 4. 行李清單 */}
      <Tabs.Screen
        name="packing"
        options={{
          title: '行李',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>🧳</Text>
          ),
        }}
      />
    </Tabs>
  );
}
/**
 * 💡 應用程式根元件
 * 用 Provider 包裝整個 Layout，讓所有 Tab 路由都能取得 TravelContext 的狀態
 */
export default function TabLayout() {
  return (
    <TravelProvider>
      <TabLayoutContent />
    </TravelProvider>
  );
}