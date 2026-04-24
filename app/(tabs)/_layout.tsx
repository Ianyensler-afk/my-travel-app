// 檔案路徑: D:\TravelApp\app\(tabs)\_layout.tsx
// 版本紀錄: v1.2.0 (隱藏文字標籤，放大圖示)

import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text } from 'react-native';
import { TravelProvider, useTravelContext } from '../../context/TravelContext';

function TabLayoutContent() {
  const { isDarkMode, themeColors } = useTravelContext();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: themeColors.primary, 
        tabBarInactiveTintColor: isDarkMode ? '#888' : '#A0A0A0',
        headerShown: false,
        // 🌟 解法 5：強制隱藏文字標籤
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
          // 確保 icon 垂直居中
          justifyContent: 'center',
          alignItems: 'center'
        }
      }}>
      
      <Tabs.Screen
        name="trips"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>🗺️</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>📊</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="packing"
        options={{
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>🧳</Text>
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