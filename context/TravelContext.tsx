// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
// 版本紀錄: v1.1.6 (終極非同步原子裝甲：保證行程狀態 100% 就位才開放渲染，杜絕 PWA 啟動首幀自爆)

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

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
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000', flights: [], hotels: [] }]);
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
    
    const loadLocal = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips && isMounted) {
          try {
            const parsed = JSON.parse(savedTrips);
            if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.trips)) {
                const cleanTrips = parsed.trips.filter(Boolean).map((t: any) => ({
                  id: String(t.id || `trip-${Date.now()}`),
                  name: String(t.name || '未命名行程'),
                  startDate: String(t.startDate || '2026-06-13'),
                  budget: String(t.budget || '50000'),
                  flights: Array.isArray(t.flights) ? t.flights.filter(Boolean).map((f:any) => ({...f})) : [],
                  hotels: Array.isArray(t.hotels) ? t.hotels.filter(Boolean).map((h:any) => ({...h})) : []
                }));
                
                if (cleanTrips.length > 0) {
                  setTrips(cleanTrips);
                }
              }
              if (parsed.currentTripId) {
                setCurrentTripId(String(parsed.currentTripId));
              }
            }
          } catch(e) {
            console.error("解析行程快取失敗", e);
          }
        }
      } catch (e) { 
        console.error("讀取本地行程失敗", e); 
      } finally {
        if (isMounted) {
          // 🛡️ 原子級同步保證：強迫 React 在下一個事件循環才釋放 Ready 鎖，確保 state 已經在底層完全穩定
          setTimeout(() => {
            if (isMounted) setIsReady(true);
          }, 50);
        }
      }
    };
    loadLocal();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isReady && trips.length > 0) {
      AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips, currentTripId })).catch(()=>{});
    }
  }, [trips, currentTripId, isReady]);

  // 🛡️ 載入期間直接返回null阻斷渲染，不給任何子組件崩潰的機會
  if (!isReady) return null;

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