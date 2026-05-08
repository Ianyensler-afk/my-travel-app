// 檔案路徑: D:\TravelApp\context\TravelContext.tsx

// 1. 最重要的：把失去的 React 與核心套件 import 回來！
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

// 2. Firebase 套件
import { initializeApp } from 'firebase/app';
import { doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';

// 3. 自動讀取 .env 中的金鑰
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// 4. 初始化 Firebase (帶有安全防護)
let app;
let db: any = null;

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  console.warn("⚠️ 警告: 找不到 Firebase 金鑰，雲端同步功能將暫時停用。");
}

// 5. 定義 Context 結構
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

// 這就是剛剛引發白畫面的核心指令，現在我們有 import 了，它安全了！
const TravelContext = createContext<TravelContextType | undefined>(undefined);

export const TravelProvider = ({ children }: { children: React.ReactNode }) => {
  const [trips, setTrips] = useState<any[]>([{ id: 'default', name: '我的行程', startDate: '2026-06-13', budget: '50000' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  
  const [roomId, setRoomId] = useState<string>('MyLoveTrip2026');
  const [forceUpdateTick, setForceUpdateTick] = useState(0);
  const isCloudUpdatingRef = useRef(false);

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

    if (!db || !roomId) return;
    
    const roomRef = doc(db, 'rooms', roomId);
    
    const unsubscribe = onSnapshot(roomRef, async (docSnap) => {
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        isCloudUpdatingRef.current = true; 

        if (cloudData.trips) setTrips(cloudData.trips);
        if (cloudData.currentTripId) setCurrentTripId(cloudData.currentTripId);
        await AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips: cloudData.trips, currentTripId: cloudData.currentTripId }));

        if (cloudData.timeline) await AsyncStorage.setItem('@travel_db_timeline', cloudData.timeline);
        if (cloudData.expenses) await AsyncStorage.setItem('@travel_db_expenses', cloudData.expenses);
        if (cloudData.packing) await AsyncStorage.setItem(`@travel_db_packing_${cloudData.currentTripId}`, cloudData.packing);

        setForceUpdateTick(prev => prev + 1);
        setTimeout(() => { isCloudUpdatingRef.current = false; }, 1000);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // 🌟 核心二：當本地資料改變時，打包上傳到 Firebase
  useEffect(() => {
    if (isCloudUpdatingRef.current) return;

    const syncToCloud = async () => {
      if (!db) return; 
      try {
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
        }, { merge: true }); 
        
      } catch (e) { console.warn("雲端同步失敗", e); }
    };

    const timeoutId = setTimeout(() => { syncToCloud(); }, 1500);
    return () => clearTimeout(timeoutId);
  }, [trips, currentTripId, forceUpdateTick]);

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