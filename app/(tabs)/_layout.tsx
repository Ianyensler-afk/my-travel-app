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
          // 🌟 修正：拉大底部留白與總高度，釋放字體空間
          paddingBottom: Platform.OS === 'ios' ? 25 : 12, 
          paddingTop: 8, 
          height: Platform.OS === 'ios' ? 90 : 70, 
          backgroundColor: themeColors.card,
          borderTopColor: themeColors.border,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        // 🌟 V1.1 優化：將底部字體改為加粗、稍微放大，呈現圓潤活潑感
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '900', 
          fontFamily: Platform.OS === 'ios' ? 'PingFang TC' : 'sans-serif-medium', // 使用較圓潤的系統字型
          marginBottom: 2
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '行程地圖',
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '記帳分析',
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>📊</Text>,
        }}
      />
      <Tabs.Screen
        name="packing"
        options={{
          title: '行李清單',
          tabBarIcon: () => <Text style={{ fontSize: 24 }}>🧳</Text>,
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