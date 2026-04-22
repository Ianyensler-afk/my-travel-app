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
}

const TravelContext = createContext<TravelContextType | undefined>(undefined);

export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  
  // 🌟 核心優化 3：自動偵測系統深色/淺色模式
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const themeColors = {
    background: isDarkMode ? '#121212' : '#F0F3F7',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    text: isDarkMode ? '#E0E0E0' : '#2C3E50',
    subText: isDarkMode ? '#A0A0A0' : '#7F8C8D',
    border: isDarkMode ? '#333333' : '#DDDDDD',
    primary: '#E74C3C',
    secondary: '#2C3E50'
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
      } catch (e) { console.error("全域資料載入失敗", e); }
    };
    loadGlobalState();
  }, []);

  // 當資料改變時，自動同步至本地端
  useEffect(() => {
    AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips, currentTripId }));
  }, [trips, currentTripId]);

  return (
    <TravelContext.Provider value={{ trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors }}>
      {children}
    </TravelContext.Provider>
  );
};

export const useTravelContext = () => {
  const context = useContext(TravelContext);
  if (!context) throw new Error('useTravelContext must be used within a TravelProvider');
  return context;
};