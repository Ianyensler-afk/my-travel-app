// 檔案路徑: D:\TravelApp\context\TravelContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

let app;
let db: any = null;

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  console.warn("⚠️ 警告: 找不到 Firebase 金鑰，雲端同步功能將暫時停用。");
}

interface TravelContextType {
  trips: any[];
  setTrips: (trips: any[]) => void;
  currentTripId: string;
  setCurrentTripId: (id: string) => void;
  isDarkMode: boolean;
  themeColors: any;
  roomId: string;
  setRoomId: (id: string) => void;
  forceUpdateTick: number; // 👈 這是讓畫面強迫更新的魔法訊號
}

const TravelContext = createContext<TravelContextType | undefined>(undefined);

export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  
  const [roomId, setRoomId] = useState<string>('MyLoveTrip2026');
  const [forceUpdateTick, setForceUpdateTick] = useState(0);
  const isCloudUpdatingRef = useRef(false);
  const lastHashRef = useRef(0); // 用來偵測本地資料有沒有被修改的雷達

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

  // 📥 引擎一：接收雲端資料並強制刷新畫面
  useEffect(() => {
    const loadLocal = async () => {
      try {
        const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
        if (savedTrips) {
          const parsed = JSON.parse(savedTrips);
          if (parsed.trips) setTrips(parsed.trips);
          if (parsed.currentTripId) setCurrentTripId(parsed.currentTripId);
        }
      } catch (e) {}
    };
    loadLocal();

    if (!db || !roomId) return;
    
    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), async (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        isCloudUpdatingRef.current = true; 

        if (cloudData.trips) setTrips(cloudData.trips);
        if (cloudData.currentTripId) setCurrentTripId(cloudData.currentTripId);
        await AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips: cloudData.trips, currentTripId: cloudData.currentTripId }));

        if (cloudData.timeline) await AsyncStorage.setItem('@travel_db_timeline', cloudData.timeline);
        if (cloudData.expenses) await AsyncStorage.setItem('@travel_db_expenses', cloudData.expenses);
        if (cloudData.packing) await AsyncStorage.setItem(`@travel_db_packing_${cloudData.currentTripId}`, cloudData.packing);

        // 🌟 敲響重整警鐘，通知所有子頁面重新抓資料！
        setForceUpdateTick(prev => prev + 1);
        setTimeout(() => { isCloudUpdatingRef.current = false; }, 1500);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // 📤 引擎二：雷達自動掃描本地變更並上傳 (每 2 秒掃一次)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!db || isCloudUpdatingRef.current) return; 
      try {
        const timeline = await AsyncStorage.getItem('@travel_db_timeline') || '[]';
        const expenses = await AsyncStorage.getItem('@travel_db_expenses') || '[]';
        const packing = await AsyncStorage.getItem(`@travel_db_packing_${currentTripId}`) || '[]';
        const tripsStr = JSON.stringify(trips);

        // 把所有資料長度加總當作「指紋」，只要有任何景點、花費新增，指紋就會變！
        const currentHash = timeline.length + expenses.length + packing.length + tripsStr.length;

        // 指紋變了，代表有新操作，立刻上傳！
        if (lastHashRef.current !== 0 && lastHashRef.current !== currentHash) {
          await setDoc(doc(db, 'rooms', roomId), {
            trips, currentTripId, timeline, expenses, packing, lastUpdated: new Date().toISOString()
          }, { merge: true }); 
        }
        lastHashRef.current = currentHash;
      } catch (e) {}
    }, 2000);

    return () => clearInterval(interval);
  }, [trips, currentTripId, roomId]);

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