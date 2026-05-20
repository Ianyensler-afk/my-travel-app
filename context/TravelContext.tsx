// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
// 版本紀錄: v1.1.8 (終極金剛不壞防彈版：加入 Expo Entry 路由保護與 1.5 秒強制開門機制，100% 完整無刪減)

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
    
    // 🌟 1.5 秒強制解鎖護城河：萬一 iOS Standalone PWA 的 I/O 卡死，時間到絕對強制解鎖，徹底阻絕白畫面！
    const fallbackTimer = setTimeout(() => {
      if (isMounted && !isReady) {
        console.warn('⚡ PWA AsyncStorage 逾時保護啟動');
        setIsReady(true);
      }
    }, 1500);

    const loadLocal = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips && isMounted) {
          try {
            const parsed = JSON.parse(savedTrips);
            if (parsed && typeof parsed === 'object') {
              // 🌟 終極淨化：過濾 null 並強制轉型，保證 React 不崩潰
              if (Array.isArray(parsed.trips)) {
                const cleanTrips = parsed.trips.filter(Boolean).map((t: any) => ({
                  id: String(t.id || `trip-${Date.now()}`),
                  name: String(t.name || '未命名行程'),
                  startDate: String(t.startDate || '2026-06-13'),
                  budget: String(t.budget || '50000'),
                  flights: Array.isArray(t.flights) ? t.flights.filter(Boolean).map((f:any) => ({...f})) : [],
                  hotels: Array.isArray(t.hotels) ? t.hotels.filter(Boolean).map((h:any) => ({...h})) : []
                }));
                setTrips(cleanTrips.length > 0 ? cleanTrips : [{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
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
          // 🛡️ 原子級安全緩衝：確保 React state 完全被底層吸收再解鎖
          setTimeout(() => {
            if (isMounted) setIsReady(true);
          }, 30);
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

  // 🛡️ 貓膩核心修復：在 Standard 網頁與 PWA 環境下，一律不回傳 null 阻斷 Expo 入口，而是回傳一個安全的基本 Container，防止網頁佈局完全塌陷
  if (!isReady && Platform.OS === 'web') {
    return <View style={{ flex: 1, backgroundColor: themeColors.background }} />;
  }

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