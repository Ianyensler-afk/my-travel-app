// 檔案路徑: D:\TravelApp\context\TravelContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

interface TravelContextType {
  trips: any[];
  setTrips: (trips: any[]) => void;
  currentTripId: string;
  setCurrentTripId: (id: string) => void;
  isDarkMode: boolean;
  themeColors: any;
  roomId: string;
  setRoomId: (id: string) => void;
  forceUpdateTick: number;
}

const TravelContext = createContext<TravelContextType | undefined>(undefined);

export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  
  const [roomId, setRoomId] = useState<string>('local-only');
  const [forceUpdateTick, setForceUpdateTick] = useState(0);
  
  // 🌟 修復：PWA 白畫面防護鎖，防止初次掛載時非同步讀取衝突
  const [isReady, setIsReady] = useState(Platform.OS === 'web' ? false : true);

  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const themeColors = {
    background: isDarkMode ? '#121212' : '#F0F3F7',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#E0E0E0' : '#2C3E50',
    subText: isDarkMode ? '#A0A0A0' : '#7F8C8D',
    border: isDarkMode ? '#333333' : '#DDDDDD',
    primary: '#F78FB3',
    secondary: '#FDA7DF'
  };

  useEffect(() => {
    const loadLocal = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips) {
          const parsed = JSON.parse(savedTrips);
          if (parsed.trips) setTrips(parsed.trips);
          if (parsed.currentTripId) setCurrentTripId(parsed.currentTripId);
        }
      } catch (e) { 
        console.error("讀取本地行程失敗", e); 
      } finally {
        if (Platform.OS === 'web') {
          // 稍微延遲解鎖，讓 PWA 環境穩定
          setTimeout(() => setIsReady(true), 50);
        }
      }
    };
    loadLocal();
  }, []);

  // 等待環境準備好再渲染，徹底消滅白畫面
  if (!isReady && Platform.OS === 'web') return null;

  return (
    <TravelContext.Provider value={{ trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors, roomId, setRoomId, forceUpdateTick }}>
      {children}
    </TravelContext.Provider>
  );
};

export const useTravelContext = () => {
  const context = useContext(TravelContext);
  if (!context) throw new Error('useTravelContext 必須在 TravelProvider 內部使用');
  return context;
};