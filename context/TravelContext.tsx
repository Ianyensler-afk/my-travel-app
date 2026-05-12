// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

interface TravelContextType { trips: any[]; setTrips: (trips: any[]) => void; currentTripId: string; setCurrentTripId: (id: string) => void; isDarkMode: boolean; themeColors: any; roomId: string; setRoomId: (id: string) => void; forceUpdateTick: number; }
const TravelContext = createContext<TravelContextType | undefined>(undefined);

export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  const [roomId, setRoomId] = useState<string>('local-only'); const [forceUpdateTick, setForceUpdateTick] = useState(0);

  const colorScheme = useColorScheme(); const isDarkMode = colorScheme === 'dark';

  // 🌟 UI 優化：改用專業、沉穩的高級冷藍色調與高反差文字
  const themeColors = {
    background: isDarkMode ? '#121212' : '#F4F6F8',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#E4E6EB' : '#2D3436',
    subText: isDarkMode ? '#A0A0A0' : '#636E72',
    border: isDarkMode ? '#333333' : '#DFE6E9',
    primary: '#0984E3', 
    secondary: '#00CEC9'
  };

  useEffect(() => {
    const loadLocal = async () => {
      try { const savedTrips = await AsyncStorage.getItem('@travel_db_trips'); if (savedTrips) { const parsed = JSON.parse(savedTrips); if (parsed.trips) setTrips(parsed.trips); if (parsed.currentTripId) setCurrentTripId(parsed.currentTripId); } } catch (e) { console.error(e); }
    }; loadLocal();
  }, []);

  return <TravelContext.Provider value={{ trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors, roomId, setRoomId, forceUpdateTick }}>{children}</TravelContext.Provider>;
};
export const useTravelContext = () => { const context = useContext(TravelContext); if (!context) throw new Error('Error'); return context; };