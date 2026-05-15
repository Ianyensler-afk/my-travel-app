// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
// 版本紀錄: v1.1.4 (防彈淨化版：強制修復舊備份的行程資料，徹底防禦手機端白畫面)

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
  const [isReady, setIsReady] = useState(false);

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
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted && !isReady) setIsReady(true);
    }, 1500);

    const loadLocal = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips && isMounted) {
          try {
            const parsed = JSON.parse(savedTrips);
            // 🌟 終極防彈淨化器：確保舊備份的每一筆資料都是絕對安全的格式
            if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.trips) && parsed.trips.length > 0) {
                const cleanTrips = parsed.trips.map(t => ({
                  ...t,
                  id: String(t.id || `trip-${Date.now()}`),
                  name: String(t.name || '未命名行程'),
                  startDate: String(t.startDate || '2026-06-13'),
                  budget: String(t.budget || '50000'),
                  flights: Array.isArray(t.flights) ? t.flights : [],
                  hotels: Array.isArray(t.hotels) ? t.hotels : []
                }));
                setTrips(cleanTrips);
              }
              if (parsed.currentTripId) setCurrentTripId(String(parsed.currentTripId));
            }
          } catch(e) {}
        }
      } catch (e) { 
        console.error("讀取本地行程失敗", e); 
      } finally {
        if (isMounted) {
          clearTimeout(fallbackTimer);
          setIsReady(true);
        }
      }
    };
    loadLocal();

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips, currentTripId })).catch(()=>{});
    }
  }, [trips, currentTripId, isReady]);

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