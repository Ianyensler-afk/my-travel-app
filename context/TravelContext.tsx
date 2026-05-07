// 檔案路徑: D:\TravelApp\context\TravelContext.tsx
// 版本紀錄: v2.0.0 (導入 Firebase Firestore 即時雙向同步引擎)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

// 🌟 請將此處替換為您在 Firebase Console 取得的設定
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface TravelContextType {
  trips: any[];
  setTrips: (trips: any[]) => void;
  currentTripId: string;
  setCurrentTripId: (id: string) => void;
  isDarkMode: boolean;
  themeColors: any;
  roomId: string;           // 🌟 新增：房間 ID
  setRoomId: (id: string) => void;
  forceUpdateTick: number;  // 🌟 新增：雲端資料更新時，通知子元件重新渲染的觸發器
}

const TravelContext = createContext<TravelContextType | undefined>(undefined);

export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  
  // 🌟 雲端房間設定 (您可以預設一個專屬暗號，例如 "MyLoveTrip2026")
  const [roomId, setRoomId] = useState<string>('MyLoveTrip2026');
  const [forceUpdateTick, setForceUpdateTick] = useState(0);
  const isCloudUpdatingRef = useRef(false); // 防止無限迴圈同步的鎖

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

  // 🌟 核心一：載入本地資料與 Firebase 雙向綁定
  useEffect(() => {
    // 先載入本地資料求快
    const loadLocal = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips) {
          const parsed = JSON.parse(savedTrips);
          if (parsed.trips) setTrips(parsed.trips);
          if (parsed.currentTripId) setCurrentTripId(parsed.currentTripId);
        }
      } catch (e) { console.error(e); }
    };
    loadLocal();

    // 啟動 Firebase Firestore 即時監聽
    if (!roomId) return;
    const roomRef = doc(db, 'rooms', roomId);
    
    const unsubscribe = onSnapshot(roomRef, async (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        // 鎖住，避免觸發本地的上傳
        isCloudUpdatingRef.current = true; 

        // 1. 同步 Trips
        if (cloudData.trips) setTrips(cloudData.trips);
        if (cloudData.currentTripId) setCurrentTripId(cloudData.currentTripId);
        await AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips: cloudData.trips, currentTripId: cloudData.currentTripId }));

        // 2. 自動將雲端的其他模組資料寫入本地 AsyncStorage
        if (cloudData.timeline) await AsyncStorage.setItem('@travel_db_timeline', cloudData.timeline);
        if (cloudData.expenses) await AsyncStorage.setItem('@travel_db_expenses', cloudData.expenses);
        if (cloudData.packing) await AsyncStorage.setItem(`@travel_db_packing_${cloudData.currentTripId}`, cloudData.packing);

        // 3. 敲響更新鐘，讓 index, explore, packing 重新讀取 AsyncStorage
        setForceUpdateTick(prev => prev + 1);
        
        // 釋放鎖定 (給予一點緩衝時間)
        setTimeout(() => { isCloudUpdatingRef.current = false; }, 1000);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // 🌟 核心二：當本地資料改變時，打包上傳到 Firebase (Debounce)
  useEffect(() => {
    if (isCloudUpdatingRef.current) return; // 如果是雲端剛載下來的，不要馬上傳回去

    const syncToCloud = async () => {
      try {
        // 收集所有本地資料
        const timeline = await AsyncStorage.getItem('@travel_db_timeline') || '[]';
        const expenses = await AsyncStorage.getItem('@travel_db_expenses') || '[]';
        const packing = await AsyncStorage.getItem(`@travel_db_packing_${currentTripId}`) || '[]';

        const roomRef = doc(db, 'rooms', roomId);
        await setDoc(roomRef, {
          trips,
          currentTripId,
          timeline,
          expenses,
          packing,
          lastUpdated: new Date().toISOString()
        }, { merge: true }); // 使用 merge 避免覆蓋未更改的欄位
        
      } catch (e) { console.warn("雲端同步失敗", e); }
    };

    const timeoutId = setTimeout(() => { syncToCloud(); }, 1500); // 放寬到 1.5 秒避免 API 頻繁請求
    return () => clearTimeout(timeoutId);
  }, [trips, currentTripId, forceUpdateTick]); // forceUpdateTick 確保子模組更新時也能觸發

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