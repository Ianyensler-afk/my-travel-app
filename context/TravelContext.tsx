// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
// 版本紀錄: v1.1.0 (加入完整註解、強化非同步寫入的錯誤處理)

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

// 定義 Context 的資料型別
interface TravelContextType {
  trips: any[];
  setTrips: (trips: any[]) => void;
  currentTripId: string;
  setCurrentTripId: (id: string) => void;
  isDarkMode: boolean;
  themeColors: any;
}

// 建立 Context
const TravelContext = createContext<TravelContextType | undefined>(undefined);
const [isSyncing, setIsSyncing] = useState(false);
const [lastSync, setLastSync] = useState<string>('');
// Context Provider 元件：負責包裝整個 App 並提供全域狀態
export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  // 預設給定一個初始行程
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  
  // 🌟 核心優化 3：自動偵測系統深色/淺色模式
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  // 定義全域主題色票，根據深淺色模式自動切換
  const themeColors = {
    background: isDarkMode ? '#121212' : '#F0F3F7',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#E0E0E0' : '#2C3E50',
    subText: isDarkMode ? '#A0A0A0' : '#7F8C8D',
    border: isDarkMode ? '#333333' : '#DDDDDD',
    primary: '#F78FB3',    // 🌸 替換成截圖風格的櫻花粉
    secondary: '#FDA7DF'   // 🌸 次色調也換成柔和的粉紫
  };

  // 🌟 核心優化 1：App 啟動時一次性載入全域資料
  useEffect(() => {
    const loadGlobalState = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips) {
          const parsed = JSON.parse(savedTrips);
          if (parsed.trips && Array.isArray(parsed.trips)) setTrips(parsed.trips);
          if (parsed.currentTripId) setCurrentTripId(parsed.currentTripId);
        }
      } catch (e) { 
        console.error("全域資料載入失敗", e); 
      }
    };
    loadGlobalState();
  }, []);

  // 🌟 核心優化 2：防抖 (Debounce) 機制 + 雲端同步預留點
  useEffect(() => {
    const saveAndSyncState = async () => {
  setIsSyncing(true);
  try {
    await AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips, currentTripId }));
    // 模擬雲端寫入延遲
    await new Promise(r => setTimeout(r, 1000)); 
    setLastSync(new Date().toLocaleTimeString());
  } finally {
    setIsSyncing(false);
  }
};

    // 設定 800 毫秒的延遲，如果在 800 毫秒內資料又變了，就會清除舊的計時器
    const timeoutId = setTimeout(() => {
      saveAndSyncState();
    }, 800);

    // 清除計時器的 cleanup function
    return () => clearTimeout(timeoutId);
  }, [trips, currentTripId]);

  return (
    <TravelContext.Provider value={{ trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors }}>
      {children}
    </TravelContext.Provider>
  );
};

// 自訂 Hook：方便各元件存取 Context，並具備防呆機制
export const useTravelContext = () => {
  const context = useContext(TravelContext);
  if (!context) throw new Error('useTravelContext 必須在 TravelProvider 內部使用');
  return context;
};