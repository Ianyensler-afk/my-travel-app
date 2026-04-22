import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
// 💡 引入我們剛剛建立的 Context Provider
import { TravelProvider, useTravelContext } from '../../context/TravelContext';

function TabLayoutContent() {
  const { isDarkMode, themeColors } = useTravelContext();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E74C3C', // 改用主色系
        tabBarInactiveTintColor: isDarkMode ? '#888' : '#A0A0A0',
        headerShown: false,
        tabBarStyle: { 
          paddingBottom: 5, 
          paddingTop: 5, 
          height: 60,
          backgroundColor: themeColors.card, // 支援深色模式的導覽列
          borderTopColor: themeColors.border
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '行程地圖',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '記帳分析',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="packing"
        options={{
          title: '行李清單',
          tabBarIcon: () => <Text style={{ fontSize: 22 }}>🧳</Text>,
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