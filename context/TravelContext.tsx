// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
// 版本紀錄: v1.2.0 (全域資料淨化與格式防護盾版：徹底終結畸形 JSON 導致冷啟動白畫面問題)

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

// 🛡️ 核心安全工具：無敵日期與數值洗滌罩，阻絕 Google 試算表產生的格式毒藥
const sanitizeString = (val: any, fallback: string): string => {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  return str === 'null' || str === 'undefined' ? fallback : str;
};

const sanitizeDate = (dateVal: any): string => {
  const defaultDate = '2026-06-13';
  if (!dateVal) return defaultDate;
  const str = String(dateVal).trim();
  
  // 處理 Google 試算表可能將日期轉換成的 5 位數序號 (例如 46186)
  if (/^\d{5}$/.test(str)) {
    try {
      const excelSerial = parseInt(str, 10);
      const date = new Date((excelSerial - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (e) {}
  }
  
  // 處理斜線轉換 yyyy/mm/dd -> yyyy-mm-dd
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      return parts.map((p, i) => i > 0 ? p.padStart(2, '0') : p).join('-');
    }
  }

  // 驗證標準格式 yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  return defaultDate;
};

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
    
    // 🌟 1.5 秒強制解鎖護城河：防止 PWA 的 I/O 卡死引發白畫面
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
              if (Array.isArray(parsed.trips)) {
                // 🌟 核心數據淨化：過濾 null/未定義，並強力轉型，防止結構塌陷
                const cleanTrips = parsed.trips.filter(Boolean).map((t: any) => ({
                  id: sanitizeString(t.id, `trip-${Date.now()}`),
                  name: sanitizeString(t.name, '未命名行程'),
                  startDate: sanitizeDate(t.startDate),
                  budget: sanitizeString(t.budget, '50000'),
                  flights: Array.isArray(t.flights) ? t.flights.filter(Boolean).map((f: any) => ({
                    id: sanitizeString(f.id, String(Date.now())),
                    airline: sanitizeString(f.airline, ''),
                    flightNo: sanitizeString(f.flightNo, ''),
                    date: sanitizeString(f.date, ''),
                    depTime: sanitizeString(f.depTime, ''),
                    arrTime: sanitizeString(f.arrTime, ''),
                    terminal: sanitizeString(f.terminal, ''),
                    gate: sanitizeString(f.gate, ''),
                    seat: sanitizeString(f.seat, '')
                  })) : [],
                  hotels: Array.isArray(t.hotels) ? t.hotels.filter(Boolean).map((h: any) => ({
                    id: sanitizeString(h.id, String(Date.now())),
                    hotelName: sanitizeString(h.hotelName, ''),
                    checkInDate: sanitizeString(h.checkInDate, ''),
                    checkOutDate: sanitizeString(h.checkOutDate, ''),
                    checkInTime: sanitizeString(h.checkInTime, '15:00'),
                    confCode: sanitizeString(h.confCode, ''),
                    phone: sanitizeString(h.phone, ''),
                    notes: sanitizeString(h.notes, '')
                  })) : []
                }));
                
                if (isMounted) {
                  setTrips(cleanTrips.length > 0 ? cleanTrips : [{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
                }
              }
              if (parsed.currentTripId && isMounted) {
                setCurrentTripId(sanitizeString(parsed.currentTripId, 'default'));
              }
            }
          } catch (e) {
            console.error("解析存檔失敗，還原安全預設值", e);
          }
        }
      } catch (e) { 
        console.error("讀取本地行程失敗", e); 
      } finally {
        if (isMounted) {
          clearTimeout(fallbackTimer);
          setTimeout(() => {
            if (isMounted) setIsReady(true);
          }, 50);
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
    if (isReady && trips && trips.length > 0) {
      AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips, currentTripId })).catch(() => {});
    }
  }, [trips, currentTripId, isReady]);

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