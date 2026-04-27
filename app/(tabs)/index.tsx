// 檔案路徑: D:\TravelApp\app\(tabs)\index.tsx
// 版本紀錄: v1.5.0 (大掃除修復版：喚醒原生背景排隊引擎、消除 React 迴圈衝突、修正 orderIndex)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any; if (Platform.OS !== 'web') { DateTimePicker = require('@react-native-community/datetimepicker').default; }

interface IPlace { id: string; tripId: string; day: number; timeSlot: string; name: string; transitMode: string; transitTime: string; coords: { lat: number; lng: number } | null; orderIndex: number; stayTime?: number; }

let MapView: any = View; let Marker: any = View;
if (Platform.OS !== 'web') { const Maps = require('react-native-maps'); MapView = Maps.default; Marker = Maps.Marker; }
const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

const DAY_COLORS = ['#FF7675', '#74B9FF', '#55E6C1', '#FDCB6E', '#A29BFE', '#E17055', '#00CEC9', '#2D3436'];
const TIME_SLOTS = ['早上', '中午', '下午', '晚上'];
const TIME_WEIGHT = { '早上': 1, '中午': 2, '下午': 3, '晚上': 4 };
const TRANSIT_MODES = ['🚶 步行', '🚆 地鐵', '🚕 計程車', '🚌 公車'];
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 8000) => {
  const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout);
  try { const response = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); return response; } catch (error) { clearTimeout(id); throw error; }
};

const timeToMins = (timeStr: string) => { const [h, m] = timeStr.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const minsToTime = (mins: number) => { const h = Math.floor(mins / 60) % 24; const m = mins % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

const parseTransitTime = (timeStr: string) => {
  if (!timeStr || ['無法估算', '手動確認', '無路線', '估算中', '金鑰遭拒', '網路阻擋', '距離太遠'].some(s => timeStr.includes(s))) return 0;
  let mins = 0; const hMatch = timeStr.match(/(\d+)\s*[h小時]/); const mMatch = timeStr.match(/(\d+)\s*[m分]/);
  if (hMatch) mins += parseInt(hMatch[1], 10) * 60; if (mMatch) mins += parseInt(mMatch[1], 10);
  return mins;
};

export default function HomeScreen() {
  const { trips, setTrips, currentTripId, themeColors, isDarkMode } = useTravelContext();
  const [places, setPlaces] = useState<IPlace[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [newPlace, setNewPlace] = useState(''); const [selectedDay, setSelectedDay] = useState(1); const [selectedTime, setSelectedTime] = useState('早上');
  const [dayStartTimes, setDayStartTimes] = useState<Record<number, string>>({});
  const [editingStayId, setEditingStayId] = useState<string | null>(null); const [stayTimeInfo, setStayTimeInfo] = useState('');
  const [showTimePickerDay, setShowTimePickerDay] = useState<number | null>(null);
  const [editingTransitId, setEditingTransitId] = useState<string | null>(null); const [transitTimeInfo, setTransitTimeInfo] = useState('');
  const [collapsedDays, setCollapsedDays] = useState<number[]>([]); const [mapVisibleDays, setMapVisibleDays] = useState<number[]>([1]); 
  const mapRef = useRef<any>(null); const [weatherData, setWeatherData] = useState<any>({});
  const saveTimeoutRef = useRef<any>(null); const isCalculatingRef = useRef(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false); const [bulkText, setBulkText] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  
  const placesRef = useRef(places);

  // 🌟 QE 核心修復：確保 placesRef 永遠與最新狀態同步，這能喚醒背景原生自動運算引擎！
  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  const HEADER_COLOR = '#FF7675'; 

  useFocusEffect(useCallback(() => {
    const loadLocalData = async () => {
      try {
        const savedPlaces = await AsyncStorage.getItem('@travel_db_timeline');
        const savedStartTimes = await AsyncStorage.getItem('@travel_db_start_times');
        if (savedStartTimes) setDayStartTimes(JSON.parse(savedStartTimes));

        if (savedPlaces) {
          const parsedPlaces = JSON.parse(savedPlaces);
          if (Array.isArray(parsedPlaces)) {
            const cleanPlaces = parsedPlaces.map((p: any) => ({ ...p, orderIndex: p.orderIndex || 0, stayTime: p.stayTime || 60, transitTime: p.transitTime?.includes('估算中') ? '' : p.transitTime }));
            setPlaces(cleanPlaces);
            const days = [...new Set(cleanPlaces.map((p: any) => p.day))] as number[];
            if(days.length > 0 && mapVisibleDays.length === 0) setMapVisibleDays(days);
            const currentTripPlaces = cleanPlaces.filter(p => p.tripId === currentTripId);
            fetchWeather(1, currentTripPlaces);
          }
        }
      } catch (e) {} setIsDataLoaded(true);
    };
    loadLocalData(); return () => { isCalculatingRef.current = false; };
  }, [currentTripId]));

  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];
  
  const fetchTransitTime = async (originPlace: any, destPlace: any, modeLabel: string, tripName: string) => {
    if (!originPlace || !destPlace) return { time: '無法估算', mode: modeLabel };
    if (!GOOGLE_MAPS_API_KEY) return { time: '缺金鑰', mode: modeLabel };

    const originStr = originPlace.coords ? `${originPlace.coords.lat},${originPlace.coords.lng}` : originPlace.name;
    const destStr = destPlace.coords ? `${destPlace.coords.lat},${destPlace.coords.lng}` : destPlace.name;
    
    const fetchFromGoogle = async (apiMode: string) => {
      const baseUrl = Platform.OS === 'web' ? '/api/maps' : 'https://maps.googleapis.com/maps/api';
      let targetUrl = `${baseUrl}/directions/json?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&mode=${apiMode}&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
      if (apiMode === 'transit' || apiMode === 'driving') targetUrl += '&departure_time=now';
      
      const res = await fetchWithTimeout(targetUrl, {}, 6000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_message || 'API 請求失敗');
      return data;
    };

    try {
      let apiMode = 'transit'; 
      if (modeLabel.includes('步行')) apiMode = 'walking'; 
      if (modeLabel.includes('計程車') || modeLabel.includes('開車')) apiMode = 'driving';
      
      let data = await fetchFromGoogle(apiMode);

      if (data.status === 'REQUEST_DENIED') return { time: '金鑰遭拒', mode: modeLabel };
      
      // 🌟 智慧備援：如果搭車找不到路線 (通常是因為太近了)，自動降級改用「步行」計算！
      if ((data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') && apiMode === 'transit') {
        apiMode = 'walking';
        data = await fetchFromGoogle(apiMode);
        modeLabel = '🚶 步行';
      }

      if (data.status === 'OK' && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        const timeText = leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text;

        // 🌟 智慧載具辨識：解析 Google 回傳的真實交通工具
        let finalMode = modeLabel;
        if (apiMode === 'transit' && leg.steps) {
          const transitStep = leg.steps.find((s: any) => s.travel_mode === 'TRANSIT');
          if (transitStep && transitStep.transit_details?.line?.vehicle?.type) {
            const vType = transitStep.transit_details.line.vehicle.type;
            if (['BUS', 'INTERCITY_BUS', 'TROLLEYBUS'].includes(vType)) finalMode = '🚌 公車';
            else if (['SUBWAY', 'TRAIN', 'TRAM', 'HEAVY_RAIL'].includes(vType)) finalMode = '🚆 地鐵';
          }
        }

        return { time: timeText, mode: finalMode };
      } else if (data.status === 'ZERO_RESULTS') {
        return { time: '距離太遠', mode: modeLabel };
      } else {
        return { time: '無路線', mode: modeLabel };
      }
    } catch (e) { 
      console.error("路線抓取錯誤:", e);
      return { time: '網路阻擋', mode: modeLabel }; 
    }
  };

  // 🌟 原生背景運算引擎：現在有了 placesRef 的支援，它能完美自動運作了！
  useEffect(() => {
    const processQueue = async () => {
      if (isCalculatingRef.current) return;
      isCalculatingRef.current = true;

      try {
        while (true) {
          const currentPlaces = placesRef.current.filter(p => p.tripId === currentTripId);
          const activeDaysList = [...new Set(currentPlaces.map(p => p.day))];
          let target: IPlace | null = null; 
          let nextPlace: IPlace | null = null;

          for (const day of activeDaysList) {
            const dayPlaces = currentPlaces.filter(p => p.day === day).sort((a, b) => { 
              const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot]; 
              return timeDiff !== 0 ? timeDiff : a.orderIndex - b.orderIndex; 
            });
            for (let i = 0; i < dayPlaces.length - 1; i++) { 
              if (dayPlaces[i].transitTime === '') { 
                target = dayPlaces[i]; 
                nextPlace = dayPlaces[i+1]; 
                break; 
              } 
            }
            if (target) break;
          }

          if (!target || !nextPlace) break;

          setPlaces(prev => prev.map(p => p.id === target!.id ? { ...p, transitTime: '⏳ 估算中...' } : p));
          const res = await fetchTransitTime(target, nextPlace, target.transitMode || '🚆 地鐵', currentTrip.name);
          setPlaces(prev => prev.map(p => p.id === target!.id ? { ...p, transitTime: res.time, transitMode: res.mode } : p));
          
          await new Promise(r => setTimeout(r, 2500));
        }
      } finally {
        isCalculatingRef.current = false;
      }
    };

    if (places.some(p => p.tripId === currentTripId && p.transitTime === '')) { 
      processQueue(); 
    }
  }, [places, currentTripId, currentTrip.name]);

  useEffect(() => {
    if (isDataLoaded) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => { 
        const safePlacesToSave = places.map(p => p.transitTime.includes('估算中') ? { ...p, transitTime: '' } : p);
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(safePlacesToSave)); 
        AsyncStorage.setItem('@travel_db_start_times', JSON.stringify(dayStartTimes)); 
      }, 500);
    }
  }, [places, dayStartTimes, isDataLoaded]);

  const currentTripPlaces = useMemo(() => places.filter(p => p.tripId === currentTripId), [places, currentTripId]);
  const activeDays = useMemo(() => {
    const days = [...new Set(currentTripPlaces.map(p => p.day))].sort((a, b) => a - b);
    return days.length === 0 ? [1] : days;
  }, [currentTripPlaces]);

  const getDateForDay = useCallback((dayNum: number) => {
    const startDateStr = currentTrip?.startDate || '2026-06-13';
    const [y, m, d] = startDateStr.split('-');
    if (!y || !m || !d) return '日期錯誤';
    const start = new Date(Number(y), Number(m) - 1, Number(d)); 
    const target = new Date(start); target.setDate(start.getDate() + (dayNum - 1));
    return `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}`;
  }, [currentTrip?.startDate]);

  const fetchWeather = async (dayNum: number, placesList = places) => {
    try {
      const dayPlaces = placesList.filter(p => String(p.tripId) === String(currentTripId) && p.day === dayNum && p.coords);
      if (dayPlaces.length === 0) return;
      const lat = dayPlaces[0]?.coords?.lat || 48.8566; 
      const lng = dayPlaces[0]?.coords?.lng || 2.3522;
      
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
      const data = await res.json();
      
      const tempMax = Math.round(data.daily.temperature_2m_max[0]); 
      const tempMin = Math.round(data.daily.temperature_2m_min[0]);
      const pop = data.daily.precipitation_probability_max[0]; 
      const code = data.daily.weathercode[0];
      
      let icon = '☀️'; 
      if (code > 0) icon = '⛅'; 
      if (code >= 51) icon = '☔';
      
      const displayStr = `${icon} ${tempMin}~${tempMax}°C (☔${pop}%)`;
      setWeatherData((prev: any) => ({ ...prev, [dayNum]: displayStr }));

      try {
        const cacheKey = `@travel_db_weather_${String(currentTripId)}`;
        const existingCache = await AsyncStorage.getItem(cacheKey);
        const weatherObj = existingCache ? JSON.parse(existingCache) : {};
        weatherObj[dayNum] = { tempMax, tempMin, pop, icon, code };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(weatherObj));
      } catch (innerErr) {
        console.warn('天氣寫入失敗', innerErr);
      }
    } catch (e) {
      console.warn("天氣 API 錯誤", e);
    }
  };

  const calculateRoutes = async () => {
    setIsCalculating(true);
    const updatedPlaces = [...places];

    const days = [...new Set(places.filter(p => String(p.tripId) === String(currentTripId)).map(p => p.day))].sort((a, b) => a - b);

    for (let d of days) {
      const dayPlacesList = updatedPlaces.filter(p => String(p.tripId) === String(currentTripId) && p.day === d).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0));
      
      for (let i = 0; i < dayPlacesList.length - 1; i++) {
        const originPlace = dayPlacesList[i];
        const destPlace = dayPlacesList[i+1];
        const placeIndex = updatedPlaces.findIndex(p => p.id === originPlace.id);

        try {
          // 🌟 QE 終極收束：不再讓 calculateRoutes 自己亂跑 API，統一呼叫我們寫好的超強大 fetchTransitTime
          const currentMode = originPlace.transitMode || '🚆 地鐵';
          const result = await fetchTransitTime(originPlace, destPlace, currentMode, currentTrip.name);
          
          let durationText = result.time;
          
          // 只有當回傳的是正常時間時，才進行縮寫處理
          if (durationText && !['無法估算', '無路線', '金鑰遭拒', '距離太遠', '計算失敗', '網路阻擋'].includes(durationText)) {
            durationText = durationText.replace('mins', 'm').replace('min', 'm').replace('hours', 'h').replace('hour', 'h');
          }

          (updatedPlaces[placeIndex] as any).transitTime = durationText;
          (updatedPlaces[placeIndex] as any).transitMode = result.mode; // 🌟 同步更新剛剛自動辨識出來的「步行/公車/地鐵」

        } catch (e) {
          console.warn("交通計算 API 呼叫失敗", e);
          (updatedPlaces[placeIndex] as any).transitTime = "計算失敗";
        }
      }
    }
    setPlaces(updatedPlaces);
    setIsCalculating(false);
  };

  // 🌟 當景點真正異動時，確保天氣會自動同步 (交通時間交由背景 processQueue 處理)
  const tripPlacesSequence = places
    .filter(p => String(p.tripId) === String(currentTripId))
    .map(p => `${p.id}-${p.name}`)
    .join(',');

  useEffect(() => {
    if (tripPlacesSequence) {
      fetchWeather(1, places);
    }
  }, [tripPlacesSequence, currentTripId]);

  const handleExportData = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys(); const allData = await AsyncStorage.multiGet(allKeys);
      const exportObj: any = {}; allData.forEach(([key, value]) => { exportObj[key] = JSON.parse(value || '{}'); });
      const exportStr = JSON.stringify(exportObj);
      if (Platform.OS === 'web') {
        const blob = new Blob([exportStr], { type: "application/json" }); const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "TravelApp_Backup.json"; a.click(); URL.revokeObjectURL(url);
        alert("🎉 備份檔案已下載！");
      } else { alert("請複製以下資料：\n\n" + exportStr); }
    } catch (e) { alert("匯出失敗"); }
  };

  const handleImportData = async () => {
    let jsonStr = '';
    if (Platform.OS === 'web') { jsonStr = window.prompt("📥 請貼上您的備份代碼 (JSON)：") || ''; } 
    else { alert("手機版目前請於網頁版使用！"); }
    if (!jsonStr) return;
    try {
      const parsedData = JSON.parse(jsonStr);
      const kvPairs = Object.keys(parsedData).map(key => [key, JSON.stringify(parsedData[key])]);
      await AsyncStorage.multiSet(kvPairs as any); alert("🎉 資料還原成功！請重新整理頁面。");
    } catch (e) { alert("格式錯誤，還原失敗！"); }
  };

  const openInGoogleMaps = (place: IPlace) => {
    const query = `${currentTrip?.name || ''} ${place.name}`.trim();
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  };

  const openRouteInGoogleMaps = (origin: string, dest: string, modeLabel: string) => {
    let travelMode = 'transit'; if (modeLabel.includes('步行')) travelMode = 'walking'; if (modeLabel.includes('開車') || modeLabel.includes('計程車')) travelMode = 'driving';
    const o = `${currentTrip.name} ${origin}`; const d = `${currentTrip.name} ${dest}`;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=${travelMode}`);
  };

  const fetchCoordinates = async (placeName: string) => {
    if (!GOOGLE_MAPS_API_KEY) return null;
    try {
      const targetUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(currentTrip.name + ' ' + placeName)}&key=${GOOGLE_MAPS_API_KEY}`;
      if (Platform.OS !== 'web') {
        const res = await fetchWithTimeout(targetUrl, {}, 5000);
        const data = await res.json();
        if (data.status === 'OK' && data.results.length > 0) return data.results[0].geometry.location;
        return null;
      }

      const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
      ];

      for (const proxy of proxies) {
        try {
          const res = await fetchWithTimeout(proxy, {}, 5000);
          const data = await res.json();
          if (data.status === 'OK' && data.results.length > 0) return data.results[0].geometry.location;
        } catch (e) {}
      }
    } catch (e) {} return null;
  };

  const addPlace = async () => {
    if (!newPlace) return; const currentName = newPlace; setNewPlace(''); 
    const coords = await fetchCoordinates(currentName);
    const placeObj: IPlace = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, tripId: currentTripId, day: selectedDay, timeSlot: selectedTime, name: currentName, transitMode: '🚆 地鐵', transitTime: '', coords: coords, orderIndex: Date.now(), stayTime: 60 };
    setPlaces(prev => [...prev, placeObj]); if(!mapVisibleDays.includes(selectedDay)) setMapVisibleDays([...mapVisibleDays, selectedDay]);
  };

  const handleBulkImport = async () => {
    const lines = bulkText.replace(/(第\d+天)/g, '\n$1').split(/\r?\n/).map(l => l.trim()).filter(l => l); if(lines.length === 0) return;
    let targetDay = selectedDay; let targetTime = selectedTime; let newPlaces: IPlace[] = []; let baseOrder = Date.now();
    for(let line of lines) {
      const dayMatch = line.match(/第(\d+)天/); if(dayMatch) { targetDay = parseInt(dayMatch[1], 10); line = line.replace(dayMatch[0], '').trim(); }
      if(!line) continue; 
      const timeMatch = TIME_SLOTS.find(t => line.includes(t)); if(timeMatch) { targetTime = timeMatch; line = line.replace(timeMatch, '').trim(); }
      let cleanName = line.replace(/\t/g, ' ').replace(/^[-*•.\d\s]+/, '').trim(); if(!cleanName) continue;
      newPlaces.push({ id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, tripId: currentTripId, day: targetDay, timeSlot: targetTime, name: cleanName, transitMode: '🚆 地鐵', transitTime: '', coords: null, orderIndex: baseOrder++, stayTime: 60 });
    }
    if(newPlaces.length > 0) {
      setPlaces(prev => [...prev, ...newPlaces]); setIsBulkModalOpen(false); setBulkText('');
      for(const p of newPlaces) { 
        const coords = await fetchCoordinates(p.name); 
        setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, coords } : item)); 
        await new Promise(r => setTimeout(r, 1500)); 
      }
    }
  };

  const getCascadedPlacesForDay = useCallback((day: number) => {
    const dayPlaces = places.filter(p => p.day === day && p.tripId === currentTripId).sort((a, b) => { const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot]; if (timeDiff !== 0) return timeDiff; return (a.orderIndex || 0) - (b.orderIndex || 0); });
    let currentMins = timeToMins(dayStartTimes[day] || "09:00"); 
    return dayPlaces.map((p) => {
      const arrMins = currentMins; const depMins = currentMins + (p.stayTime || 60);
      currentMins = depMins + parseTransitTime(p.transitTime); 
      return { ...p, arrivalTime: minsToTime(arrMins), departureTime: minsToTime(depMins) };
    });
  }, [places, currentTripId, dayStartTimes]);

  const movePlace = (placeId: string, direction: string) => {
    const placeToMove = places.find(p => p.id === placeId); if (!placeToMove) return;
    const dayPlaces = places.filter(p => p.day === placeToMove.day && p.tripId === currentTripId).sort((a, b) => { const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot]; return timeDiff !== 0 ? timeDiff : (a.orderIndex || 0) - (b.orderIndex || 0); });
    const index = dayPlaces.findIndex(p => p.id === placeId);
    if (direction === 'up' && index > 0) {
      const swapTarget = dayPlaces[index - 1];
      setPlaces(prev => prev.map(p => { if (p.id === placeId) return { ...p, timeSlot: swapTarget.timeSlot, orderIndex: swapTarget.orderIndex || 0 }; if (p.id === swapTarget.id) return { ...p, timeSlot: placeToMove.timeSlot, orderIndex: placeToMove.orderIndex || 0 }; return p; }));
      setPlaces(prev => prev.map(p => p.day === placeToMove.day && p.tripId === currentTripId ? { ...p, transitTime: '' } : p));
    } else if (direction === 'down' && index < dayPlaces.length - 1) {
      const swapTarget = dayPlaces[index + 1];
      setPlaces(prev => prev.map(p => { if (p.id === placeId) return { ...p, timeSlot: swapTarget.timeSlot, orderIndex: swapTarget.orderIndex || 0 }; if (p.id === swapTarget.id) return { ...p, timeSlot: placeToMove.timeSlot, orderIndex: placeToMove.orderIndex || 0 }; return p; }));
      setPlaces(prev => prev.map(p => p.day === placeToMove.day && p.tripId === currentTripId ? { ...p, transitTime: '' } : p));
    }
  };

  return (
    <KeyboardWrapper style={[styles.container, {backgroundColor: themeColors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {isBulkModalOpen && (
        <Modal visible={true} transparent={true} animationType="slide">
          <View style={styles.modalBackground}>
            <View style={[styles.modalContent, {backgroundColor: themeColors.card}]}>
              <Text style={{fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: themeColors.text}}>📝 智慧批次匯入</Text>
              <TextInput style={[styles.bulkInput, {backgroundColor: themeColors.background, color: themeColors.text}]} multiline={true} value={bulkText} onChangeText={setBulkText} textAlignVertical="top" />
              <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15}}>
                <TouchableOpacity onPress={() => setIsBulkModalOpen(false)} style={[styles.bulkBtn, {backgroundColor: '#95A5A6'}]}><Text style={{color:'#FFF'}}>取消</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleBulkImport} style={[styles.bulkBtn, {backgroundColor: HEADER_COLOR}]}><Text style={{color:'#FFF', fontWeight:'bold'}}>開始匯入</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 頂部標題區 */}
      <View style={[styles.header, { backgroundColor: HEADER_COLOR }]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 15}}>
          <View style={{flex: 1}}>
            <Text style={styles.headerText}>🗺️ {currentTrip?.name} 行程地圖</Text>
            <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4}}>{currentTrip?.startDate} 出發</Text>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity onPress={calculateRoutes} style={[styles.syncBtn, {marginRight: 10, backgroundColor: '#FF9F43'}]}>
              <Text style={{color: '#FFF', fontSize: 11, fontWeight: 'bold'}}>{isCalculating ? '🔄 計算中' : '🔄 重算'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleImportData} style={styles.syncBtn}><Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📥 還原</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleExportData} style={[styles.syncBtn, {marginLeft: 8}]}><Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📤 備份</Text></TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 地圖區域 */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          (() => {
            const visiblePlaces = places.filter(p => mapVisibleDays.includes(p.day) && p.tripId === currentTripId).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0));
            let webMapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(currentTrip?.name || 'London')}`;
            if (GOOGLE_MAPS_API_KEY && visiblePlaces.length > 1) {
              const origin = encodeURIComponent(`${currentTrip.name} ${visiblePlaces[0].name}`);
              const dest = encodeURIComponent(`${currentTrip.name} ${visiblePlaces[visiblePlaces.length - 1].name}`);
              const waypoints = visiblePlaces.slice(1, -1).map(p => encodeURIComponent(`${currentTrip.name} ${p.name}`)).join('|');
              webMapUrl = `https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_API_KEY}&origin=${origin}&destination=${dest}&mode=transit`;
              if (waypoints) { webMapUrl += `&waypoints=${waypoints}`; }
            } else if (GOOGLE_MAPS_API_KEY && visiblePlaces.length === 1) {
              webMapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(currentTrip.name + ' ' + visiblePlaces[0].name)}`;
            }
            return <iframe width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy" src={webMapUrl}></iframe>;
          })()
        ) : (
          <MapView ref={mapRef} style={{width: '100%', height: '100%'}} initialRegion={{latitude: 35.6812, longitude: 139.7671, latitudeDelta: 0.1, longitudeDelta: 0.1}}>
            {places.filter(p => mapVisibleDays.includes(p.day) && p.coords && p.tripId === currentTripId).map((p) => {
              const seqNum = currentTripPlaces.filter(dp => dp.day === p.day).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0)).findIndex(dp => dp.id === p.id) + 1;
              return (
                <Marker key={p.id} coordinate={{latitude: p.coords!.lat, longitude: p.coords!.lng}} title={p.name}>
                  <View style={[styles.customPin, { backgroundColor: DAY_COLORS[(p.day - 1) % DAY_COLORS.length], minWidth: 32 }]}><Text style={{fontSize: 10, color: '#FFF', fontWeight: 'bold'}}>D{p.day}-{seqNum}</Text></View>
                </Marker>
              );
            })}
          </MapView>
        )}
        <View style={[styles.mapFilterStrip, {backgroundColor: isDarkMode ? 'rgba(30,30,30,0.9)' : 'rgba(255,255,255,0.9)'}]}>
          <TouchableOpacity onPress={() => setMapVisibleDays(activeDays)} style={[styles.filterBtn, {backgroundColor: themeColors.border}]}><Text style={{fontSize: 10, color: themeColors.text}}>✅ 全選</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMapVisibleDays([])} style={[styles.filterBtn, {backgroundColor: themeColors.border}]}><Text style={{fontSize: 10, color: themeColors.text}}>❌ 清除</Text></TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeDays.map(day => {
              const isVisible = mapVisibleDays.includes(day); const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length];
              return (
                <TouchableOpacity key={day} onPress={() => setMapVisibleDays(isVisible ? mapVisibleDays.filter(d => d !== day) : [...mapVisibleDays, day])} style={[styles.dayFilterChip, { backgroundColor: isVisible ? dayColor : themeColors.background, borderColor: isVisible ? dayColor : themeColors.border }]}>
                  <Text style={{fontSize: 12, fontWeight: 'bold', color: isVisible ? '#FFF' : themeColors.subText}}>第{day}天</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <View style={[styles.inputCard, {backgroundColor: themeColors.card}]}>
        <View style={styles.row}>
          <View style={[styles.daySelector, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
            <TouchableOpacity onPress={() => setSelectedDay(Math.max(1, selectedDay - 1))} style={styles.dayBtn}><Text>➖</Text></TouchableOpacity>
            <View style={{alignItems: 'center'}}><Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 13 }}>第 {selectedDay} 天</Text></View>
            <TouchableOpacity onPress={() => setSelectedDay(selectedDay + 1)} style={styles.dayBtn}><Text>➕</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 10 }}>
            {TIME_SLOTS.map(time => (
              <TouchableOpacity key={time} style={[styles.timeChip, { backgroundColor: selectedTime === time ? themeColors.secondary : themeColors.background, borderColor: themeColors.border }]} onPress={() => setSelectedTime(time)}>
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: selectedTime === time ? '#FFF' : themeColors.subText }}>{time}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={[styles.row, {marginTop: 10}]}>
          <TextInput style={[styles.input, {backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border}]} placeholderTextColor={themeColors.subText} placeholder="輸入景點名稱..." value={newPlace} onChangeText={setNewPlace} onSubmitEditing={addPlace} />
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#9B59B6', marginRight: 5 }]} onPress={() => setIsBulkModalOpen(true)}><Text style={{color: 'white', fontWeight: 'bold'}}>📝 批次</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: HEADER_COLOR }]} onPress={addPlace}><Text style={{color: 'white', fontWeight: 'bold'}}>新增</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.timelineArea} keyboardShouldPersistTaps="handled">
        {activeDays.filter(day => mapVisibleDays.includes(day)).map(day => {
          const isCollapsed = collapsedDays.includes(day); const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length]; 
          const cascadedPlaces = getCascadedPlacesForDay(day);
          
          return (
          <View key={`day-${day}`} style={{ marginBottom: 15 }}>
            <View style={[styles.dayHeader, { backgroundColor: dayColor }]}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setCollapsedDays(isCollapsed ? collapsedDays.filter(d => d !== day) : [...collapsedDays, day])}>
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 15 }}>{isCollapsed ? '▶️' : '▼'} 第 {day} 天 ({getDateForDay(day)})</Text>
              </TouchableOpacity>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                {Platform.OS === 'web' ? (
                  <input type="time" value={dayStartTimes[day] || '09:00'} onChange={(e) => setDayStartTimes({...dayStartTimes, [day]: e.target.value})} onClick={(e) => e.stopPropagation()} style={{backgroundColor: 'rgba(255,255,255,0.9)', color: '#333', fontWeight: 'bold', padding: '2px 6px', borderRadius: '5px', marginRight: '8px', border: 'none', outline: 'none', fontSize: '13px'}} />
                ) : (
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowTimePickerDay(day); }} style={{backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginRight: 8}}>
                    <Text style={{color: '#FFF', fontWeight: 'bold', fontSize:13}}>{dayStartTimes[day] || '09:00'} ✏️</Text>
                  </TouchableOpacity>
                )}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}><Text style={{ color: '#FFF', fontSize: 11 }}>{weatherData[day] || '☁️'}</Text></View>
              </View>
            </View>

            {!isCollapsed ? cascadedPlaces.map((place: any, index) => {
              const isLast = index === cascadedPlaces.length - 1; 
              const isError = ['無路線', '無法估算', '需手動確認', '金鑰遭拒', '網路阻擋', '距離太遠', '計算失敗'].includes(place.transitTime);
              const transitTextColor = isError ? '#E74C3C' : (isDarkMode ? '#81D4FA' : '#2980B9');
              
              return (
                <View key={place.id} style={{ flexDirection: 'row' }}>
                  <View style={{ width: 45, alignItems: 'center' }}>
                    <View style={[styles.numberPin, { backgroundColor: dayColor, marginTop: 5 }]}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>{index + 1}</Text></View>
                    {!isLast ? (
                      <View style={{ flex: 1, alignItems: 'center', width: '100%', paddingVertical: 0 }}>
                        <View style={{ width: 2, flex: 1, backgroundColor: themeColors.border }} />
                        <TouchableOpacity onPress={() => setEditingTransitId(place.id)} style={[styles.miniTransitBadge, {backgroundColor: isDarkMode ? '#333' : '#FFF', borderColor: isError ? '#E74C3C' : themeColors.border}]}>
                           <Text style={{fontSize: 14}}>{place.transitMode.substring(0,2)}</Text>
                           {place.transitTime && place.transitTime !== '' && place.transitTime !== '估算中...' ? (
                             <Text style={{fontSize: 10, color: transitTextColor, fontWeight: 'bold', marginTop: 1, textAlign: 'center'}}>
                               {isError ? place.transitTime : place.transitTime.replace('分鐘', 'm').replace('小時', 'h')}
                             </Text>
                           ) : (
                             <Text style={{fontSize: 9, color: themeColors.subText, marginTop: 1}}>計算中</Text>
                           )}
                        </TouchableOpacity>
                        <View style={{ width: 2, flex: 1, backgroundColor: themeColors.border }} />
                      </View>
                    ) : null}
                  </View>
                  
                  <View style={{ flex: 1, paddingBottom: 10, paddingRight: 10 }}>
                    <View style={[styles.placeCard, {backgroundColor: themeColors.card, flexDirection: 'column', position: 'relative'}]}>
                      
                      <View style={styles.topRightActions}>
                        <TouchableOpacity onPress={() => {setEditingStayId(place.id); setStayTimeInfo(String(place.stayTime || 60));}} style={styles.miniIconBtn}><Text style={{fontSize:12}}>⏱️</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => movePlace(place.id, 'up')} disabled={index === 0} style={[styles.miniIconBtn, {opacity: index === 0 ? 0.3 : 1}]}><Text style={{fontSize:12}}>🔼</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => movePlace(place.id, 'down')} disabled={isLast} style={[styles.miniIconBtn, {opacity: isLast ? 0.3 : 1}]}><Text style={{fontSize:12}}>🔽</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setPlaces(places.filter(p => p.id !== place.id))} style={styles.miniIconBtn}><Text style={{fontSize:12}}>❌</Text></TouchableOpacity>
                      </View>

                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 2}}>
                        <View style={{flex: 1, paddingRight: 5}}>
                          <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text, marginBottom: 2, width: '75%' }} numberOfLines={1}>{place.name}</Text>
                          <Text style={{fontSize: 11, fontWeight: 'bold', marginBottom: 6}}>
                             <Text style={{color: '#E67E22'}}>{place.arrivalTime} - {place.departureTime}</Text>
                             <Text style={{color: '#9B59B6'}}> (停留 {place.stayTime || 60}m)</Text>
                          </Text>
                          <View style={{flexDirection: 'row'}}>
                            <TouchableOpacity onPress={() => openInGoogleMaps(place)} style={[styles.actionBadge, {backgroundColor: isDarkMode ? '#2A2A2A' : '#F0F3F7', marginRight: 6}]}><Text style={{fontSize: 11, color: themeColors.text}}>📍 地圖</Text></TouchableOpacity>
                            {!isLast && (
                              <TouchableOpacity onPress={() => openRouteInGoogleMaps(place.name, cascadedPlaces[index+1].name, place.transitMode)} style={[styles.actionBadge, {backgroundColor: '#E8F8F5', borderColor: '#1ABC9C', borderWidth: 1}]}>
                                <Text style={{fontSize: 11, color: '#16A085', fontWeight: 'bold'}}>🧭 路線導航</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                    
                    {editingStayId === place.id && (
                      <View style={{ marginTop: 4, marginLeft: 5 }}>
                        <View style={[styles.transitEditRow, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                          <Text style={{color: themeColors.text, fontSize: 11, marginRight: 10}}>修改停留時間 (分鐘):</Text>
                          <TextInput style={[styles.transitInput, {backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border}]} keyboardType="numeric" value={stayTimeInfo} onChangeText={setStayTimeInfo} />
                          <TouchableOpacity onPress={() => { setPlaces(places.map(p => p.id === place.id ? { ...p, stayTime: parseInt(stayTimeInfo) || 60 } : p)); setEditingStayId(null); }} style={{ backgroundColor: '#F39C12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}><Text style={{color:'#FFF', fontSize: 10}}>確認</Text></TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {editingTransitId === place.id && !isLast && (
                      <View style={{ marginTop: 4, marginLeft: 5 }}>
                        <View style={[styles.transitEditRow, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                          <View style={{flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginRight: 5}}>
                            {TRANSIT_MODES.map(mode => (
                              <TouchableOpacity key={mode} onPress={() => { 
                                setEditingTransitId(null); 
                                setPlaces(places.map(p => p.id === place.id ? {...p, transitMode: mode, transitTime: '⏳ 估算中...'} : p)); 
                                fetchTransitTime(place, cascadedPlaces[index + 1], mode, currentTrip.name).then(result => { 
                                  setPlaces(curr => curr.map(p => p.id === place.id ? {...p, transitTime: result.time, transitMode: result.mode} : p)); 
                                }); 
                              }} style={[styles.transitChip, {backgroundColor: place.transitMode.includes(mode.substring(2)) ? '#3498DB' : themeColors.card, borderColor: themeColors.border, marginBottom: 5}]}>
                                <Text style={{fontSize: 10, color: place.transitMode.includes(mode.substring(2)) ? '#FFF' : themeColors.text}}>{mode}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          
                          <TouchableOpacity onPress={() => {
                            setEditingTransitId(null);
                            setPlaces(places.map(p => p.id === place.id ? {...p, transitTime: '⏳ 估算中...'} : p));
                            fetchTransitTime(place, cascadedPlaces[index + 1], place.transitMode || '🚆 地鐵', currentTrip.name).then(result => {
                              setPlaces(curr => curr.map(p => p.id === place.id ? {...p, transitTime: result.time, transitMode: result.mode} : p));
                            });
                          }} style={{ backgroundColor: '#3498DB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginRight: 5 }}>
                            <Text style={{color:'#FFF', fontSize: 10}}>🔄 重算</Text>
                          </TouchableOpacity>

                          <TextInput style={[styles.transitInput, {backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border}]} placeholder="手動" value={transitTimeInfo} onChangeText={setTransitTimeInfo} placeholderTextColor={themeColors.subText} />
                          <TouchableOpacity onPress={() => { setPlaces(places.map(p => p.id === place.id ? { ...p, transitTime: transitTimeInfo } : p)); setEditingTransitId(null); }} style={{ backgroundColor: '#27AE60', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}><Text style={{color:'#FFF', fontSize: 10}}>儲存</Text></TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            }) : null}
          </View>
        )})}
        {currentTripPlaces.length > 0 ? <View style={{height: 50}} /> : null}
      </ScrollView>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: Platform.OS === 'web' ? 20 : 35, paddingBottom: 10 },
  headerText: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  syncBtnContainer: { flexDirection: 'row', alignItems: 'center' },
  syncBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 15 },
  mapContainer: { height: 220, borderBottomWidth: 1, borderColor: '#CCC' },
  customPin: { padding: 4, borderRadius: 15, borderWidth: 2, borderColor: '#FFF', elevation: 3, alignItems: 'center', justifyContent: 'center' },
  mapFilterStrip: { position: 'absolute', bottom: 5, left: 10, right: 10, flexDirection: 'row', padding: 5, borderRadius: 10 },
  filterBtn: { padding: 5, marginRight: 5, borderRadius: 5, justifyContent: 'center' },
  dayFilterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginRight: 5, justifyContent: 'center' },
  inputCard: { padding: 12, elevation: 3, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  daySelector: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 4 },
  dayBtn: { padding: 8 }, timeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginRight: 6 }, 
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, marginRight: 8 }, addBtn: { paddingHorizontal: 12, borderRadius: 8, justifyContent: 'center', height: 40 },
  timelineArea: { flex: 1, paddingHorizontal: 15, paddingTop: 10 }, 
  dayHeader: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8, elevation: 1 }, 
  placeCard: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, elevation: 1 }, 
  numberPin: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  miniTransitBadge: { padding: 3, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 10, minWidth: 36 },
  actionBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }, modalContent: { width: '100%', borderRadius: 15, padding: 20, elevation: 5 }, bulkInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, height: 150, padding: 10, fontSize: 14 }, bulkBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  transitEditRow: { flexDirection: 'row', alignItems: 'center', padding: 6, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  transitInput: { flex: 1, height: 26, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, marginRight: 8 },
  transitChip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginRight: 4 },
  topRightActions: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', zIndex: 10 },
  miniIconBtn: { width: 24, height: 24, backgroundColor: '#F0F3F7', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 4, elevation: 1 }
});