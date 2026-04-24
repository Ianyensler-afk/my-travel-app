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
        // 🌟 V1.1 優化：改用主色系 (珊瑚西瓜紅) 增加活力
        tabBarActiveTintColor: themeColors.primary, 
        tabBarInactiveTintColor: isDarkMode ? '#888' : '#A0A0A0',
        headerShown: false, // 隱藏預設頂部標題列，改由各頁面自行實作自訂 Header
        tabBarStyle: { 
          // 根據平台設定適當的導覽列高度
          height: Platform.OS === 'ios' ? 60 : 50, 
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
          elevation: 10, // Android 陰影
          shadowColor: '#000', // iOS 陰影
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10, // 縮小字體以確保各平台安全顯示範圍
          fontWeight: 'bold', 
          marginBottom: Platform.OS === 'web' ? 4 : 0 
        }
      }}>
      
      {/* 🗺️ 第一頁：行程地圖 */}
      <Tabs.Screen
        name="index"
        options={{
          title: '行程地圖',
          // 加上 focused 判斷，選取時圖示不透明，未選取時稍微變淡
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>🗺️</Text>
          ),
        }}
      />
      
      {/* 📊 第二頁：記帳分析 */}
      <Tabs.Screen
        name="explore"
        options={{
          title: '記帳分析',
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>📊</Text>
          ),
        }}
      />
      
      {/* 🧳 第三頁：行李清單 */}
      <Tabs.Screen
        name="packing"
        options={{
          title: '行李清單',
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