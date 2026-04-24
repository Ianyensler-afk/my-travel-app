// 檔案路徑: D:\TravelApp\app\(tabs)\index.tsx
// 版本紀錄: v1.4.1 (完整保留原版所有功能：天氣、備份還原、批次匯入，並融合羅盤與卡片優化)

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
const TRANSIT_MODES = ['🚶 步行', '🚆 地鐵', '🚕 計程車', '🚌 公車', '✈️ 飛機', '⛴️ 渡輪'];
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const TOKYO_REGION = { latitude: 35.6895, longitude: 139.6917, latitudeDelta: 0.1, longitudeDelta: 0.1 };

const getTimeColor = (time: string) => {
  switch(time) { case '早上': return '#FF9FF3'; case '中午': return '#FECA57'; case '下午': return '#48DBFB'; case '晚上': return '#5F27CD'; default: return '#8395A7'; }
};

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 6000) => {
  const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout);
  try { const response = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); return response; } catch (error) { clearTimeout(id); throw error; }
};

const timeToMins = (timeStr: string) => { const [h, m] = timeStr.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const minsToTime = (mins: number) => { const h = Math.floor(mins / 60) % 24; const m = mins % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const parseTransitTime = (timeStr: string) => {
  if (!timeStr || timeStr.includes('無法估算') || timeStr.includes('手動輸入') || timeStr.includes('估算中')) return 0;
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false); const [bulkText, setBulkText] = useState('');

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

  useEffect(() => {
    const processMissingTransits = async () => {
      if (isCalculatingRef.current) return; 
      const currentTripPlaces = places.filter(p => p.tripId === currentTripId);
      const activeDaysList = [...new Set(currentTripPlaces.map(p => p.day))];
      let target: IPlace | null = null; let nextPlace: IPlace | null = null;

      for (const day of activeDaysList) {
        const dayPlaces = currentTripPlaces.filter(p => p.day === day).sort((a, b) => { const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot]; return timeDiff !== 0 ? timeDiff : a.orderIndex - b.orderIndex; });
        for (let i = 0; i < dayPlaces.length - 1; i++) { if (dayPlaces[i].transitTime === '') { target = dayPlaces[i]; nextPlace = dayPlaces[i+1]; break; } }
        if (target) break;
      }
      if (target && nextPlace) {
        isCalculatingRef.current = true; 
        setPlaces(prev => prev.map(p => p.id === target!.id ? { ...p, transitTime: '⏳ 估算中...' } : p));
        const res = await fetchTransitTime(target, nextPlace, target.transitMode || '🚆 地鐵');
        setPlaces(prev => prev.map(p => p.id === target!.id ? { ...p, transitTime: res.time, transitMode: res.mode } : p));
        setTimeout(() => { isCalculatingRef.current = false; }, 1000);
      }
    };
    if (places.some(p => p.tripId === currentTripId && p.transitTime === '')) processMissingTransits();
  }, [places, currentTripId]);

  useEffect(() => {
    if (mapRef.current && places.length > 0 && Platform.OS !== 'web') {
      const visiblePlaces = places.filter(p => mapVisibleDays.includes(p.day) && p.coords && p.tripId === currentTripId);
      const coords = visiblePlaces.map(p => ({ latitude: p.coords!.lat, longitude: p.coords!.lng }));
      if (coords.length > 0) mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
    }
  }, [places, mapVisibleDays, currentTripId]);

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

  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];
  const currentTripPlaces = useMemo(() => places.filter(p => p.tripId === currentTripId), [places, currentTripId]);
  const activeDays = useMemo(() => {
    const days = [...new Set(currentTripPlaces.map(p => p.day))].sort((a, b) => a - b);
    return days.length === 0 ? [1] : days;
  }, [currentTripPlaces]);

  // 🌟 恢復日期更新功能
  const handleUpdateStartDate = async (newDate: Date) => {
    if (isNaN(newDate.getTime())) return;
    const formatted = `${newDate.getFullYear()}-${String(newDate.getMonth()+1).padStart(2,'0')}-${String(newDate.getDate()).padStart(2,'0')}`;
    setTrips(trips.map(t => t.id === currentTripId ? { ...t, startDate: formatted } : t));
  };

  const getDateForDay = useCallback((dayNum: number) => {
    const startDateStr = currentTrip?.startDate || '2026-06-13';
    const [y, m, d] = startDateStr.split('-');
    if (!y || !m || !d) return '日期錯誤';
    const start = new Date(Number(y), Number(m) - 1, Number(d)); 
    const target = new Date(start); target.setDate(start.getDate() + (dayNum - 1));
    return `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}`;
  }, [currentTrip?.startDate]);

  // 🌟 恢復天氣 API 功能
  const fetchWeather = async (dayNum: number, placesList = places) => {
    try {
      const dayPlaces = placesList.filter(p => p.tripId === currentTripId && p.day === dayNum && p.coords);
      const lat = dayPlaces[0]?.coords?.lat || 48.8566; const lng = dayPlaces[0]?.coords?.lng || 2.3522;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
      const data = await res.json();
      const tempMax = Math.round(data.daily.temperature_2m_max[0]); const tempMin = Math.round(data.daily.temperature_2m_min[0]);
      const pop = data.daily.precipitation_probability_max[0]; const code = data.daily.weathercode[0];
      let icon = '☀️'; if (code > 0) icon = '⛅'; if (code >= 51) icon = '🌧️';
      const displayStr = `${icon} ${tempMin}~${tempMax}°C (☔${pop}%)`;
      setWeatherData((prev: any) => ({ ...prev, [dayNum]: displayStr }));
      await AsyncStorage.setItem('@travel_db_weather', JSON.stringify({ ...weatherData, [dayNum]: { tempMax, tempMin, pop, icon, code } }));
    } catch (e) {}
  };

  // 🌟 恢復匯出資料功能
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

  // 🌟 恢復匯入資料功能
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
    Linking.openURL(`https://maps.google.com/maps?q=${encodeURIComponent(query)}`);
  };

  // 🌟 保留羅盤功能的 URL 開啟邏輯
  const openRouteInGoogleMaps = (origin: string, dest: string, modeLabel: string) => {
    let travelMode = 'transit'; if (modeLabel.includes('步行')) travelMode = 'walking'; if (modeLabel.includes('開車') || modeLabel.includes('計程車')) travelMode = 'driving';
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&travelmode=${travelMode}`);
  };

  const fetchTransitTime = async (originPlace: any, destPlace: any, modeLabel: string) => {
    if (!originPlace || !destPlace) return { time: '無法估算', mode: modeLabel };
    if (modeLabel.includes('飛機') || modeLabel.includes('渡輪')) return { time: '手動輸入', mode: modeLabel };
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.includes('請輸入')) return { time: '缺金鑰', mode: modeLabel };

    const originStr = originPlace.coords ? `${originPlace.coords.lat},${originPlace.coords.lng}` : originPlace.name;
    const destStr = destPlace.coords ? `${destPlace.coords.lat},${destPlace.coords.lng}` : destPlace.name;
    try {
      let apiMode = 'transit'; if (modeLabel.includes('步行')) apiMode = 'walking'; if (modeLabel.includes('計程車') || modeLabel.includes('開車')) apiMode = 'driving';
      let targetUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&mode=${apiMode}&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
      if (apiMode === 'transit' || apiMode === 'driving') targetUrl += '&departure_time=now';
      const finalUrl = Platform.OS === 'web' ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;
      const res = await fetchWithTimeout(finalUrl, {}, 6000); const data = await res.json();
      if (data.status === 'OK' && data.routes.length > 0) {
        let finalMode = modeLabel; const leg = data.routes[0].legs[0];
        const timeText = leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text;
        if (apiMode === 'transit') { const hasTransit = leg.steps.some((step: any) => step.travel_mode === 'TRANSIT'); if (!hasTransit) finalMode = '🚶 步行'; }
        return { time: timeText, mode: finalMode };
      } else return { time: '無路線', mode: modeLabel }; 
    } catch (e) { return { time: '無法估算', mode: modeLabel }; }
  };

  const fetchCoordinates = async (placeName: string) => {
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.includes('請輸入')) return null;
    try {
      const res = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(placeName)}&key=${GOOGLE_MAPS_API_KEY}`, {}, 5000);
      const data = await res.json(); if (data.status === 'OK' && data.results.length > 0) return data.results[0].geometry.location;
    } catch (e) {} return null;
  };

  const addPlace = async () => {
    if (!newPlace) return; const currentName = newPlace; setNewPlace(''); 
    const coords = await fetchCoordinates(currentName);
    const placeObj: IPlace = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, tripId: currentTripId, day: selectedDay, timeSlot: selectedTime, name: currentName, transitMode: '🚆 地鐵', transitTime: '', coords: coords, orderIndex: Date.now(), stayTime: 60 };
    setPlaces(prev => [...prev, placeObj]); if(!mapVisibleDays.includes(selectedDay)) setMapVisibleDays([...mapVisibleDays, selectedDay]);
  };

  // 🌟 恢復批次匯入功能
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
      for(const p of newPlaces) { const coords = await fetchCoordinates(p.name); setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, coords } : item)); await new Promise(r => setTimeout(r, 600)); }
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
      {/* 🌟 恢復批次匯入 Modal */}
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

      {/* 🌟 恢復完整版 Header (包含還原與備份按鈕) */}
      {/* 🌟 解法 1：拔除下拉切換，只顯示被全域鎖定的行程名稱 */}
      <View style={[styles.header, { backgroundColor: HEADER_COLOR }]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 15}}>
          <View style={{flex: 1}}>
            <Text style={styles.headerText}>🗺️ {currentTrip?.name} 行程地圖</Text>
            <Text style={{color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4}}>{currentTrip?.startDate} 出發</Text>
          </View>
          <View style={{flexDirection: 'row'}}>
            <TouchableOpacity onPress={handleImportData} style={styles.syncBtn}><Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📥 還原</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleExportData} style={[styles.syncBtn, {marginLeft: 8}]}><Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📤 備份</Text></TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 地圖區域 (保留 v1.4.0 的最佳化縮放邏輯) */}
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          (() => {
            const visiblePlaces = places.filter(p => mapVisibleDays.includes(p.day) && p.tripId === currentTripId).sort((a,b)=> (a.orderIndex || 0) - (b.orderIndex || 0));
            // 🌟 解法 4：改用 place 模式，只標示地點，不畫路線
            let webMapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(currentTrip?.name || 'London')}`;
            
            // 如果有景點，就將地圖中心標示在該天的第一個景點上
            if (GOOGLE_MAPS_API_KEY && visiblePlaces.length > 0) {
              webMapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(visiblePlaces[0].name)}`;
            } else if (GOOGLE_MAPS_API_KEY && visiblePlaces.length === 1) {
              webMapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(visiblePlaces[0].name)}`;
            }
            return <iframe width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy" src={webMapUrl}></iframe>;
          })()
        ) : (
          <MapView ref={mapRef} style={{width: '100%', height: '100%'}} initialRegion={TOKYO_REGION}>
            {places.filter(p => mapVisibleDays.includes(p.day) && p.coords && p.tripId === currentTripId).map((p) => {
              const seqNum = currentTripPlaces.filter(dp => dp.day === p.day).sort((a,b)=>a.orderIndex - b.orderIndex).findIndex(dp => dp.id === p.id) + 1;
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

      {/* 輸入區塊 */}
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

      {/* 瀑布流時間軸 */}
      <ScrollView style={styles.timelineArea} keyboardShouldPersistTaps="handled">
        {activeDays.filter(day => mapVisibleDays.includes(day)).map(day => {
          const isCollapsed = collapsedDays.includes(day); const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length]; 
          const cascadedPlaces = getCascadedPlacesForDay(day);
          
          return (
          <View key={`day-${day}`} style={{ marginBottom: 20 }}>
            <View style={[styles.dayHeader, { backgroundColor: dayColor }]}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setCollapsedDays(isCollapsed ? collapsedDays.filter(d => d !== day) : [...collapsedDays, day])}>
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>{isCollapsed ? '▶️' : '▼'} 第 {day} 天 ({getDateForDay(day)})</Text>
              </TouchableOpacity>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                {Platform.OS === 'web' ? (
                  <input type="time" value={dayStartTimes[day] || '09:00'} onChange={(e) => setDayStartTimes({...dayStartTimes, [day]: e.target.value})} onClick={(e) => e.stopPropagation()} style={{backgroundColor: 'rgba(255,255,255,0.9)', color: '#333', fontWeight: 'bold', padding: '4px 8px', borderRadius: '5px', marginRight: '8px', border: 'none', outline: 'none', fontSize: '14px'}} />
                ) : (
                  <>
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); setShowTimePickerDay(day); }} style={{backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, marginRight: 8}}>
                      <Text style={{color: '#FFF', fontWeight: 'bold'}}>{dayStartTimes[day] || '09:00'} ✏️</Text>
                    </TouchableOpacity>
                    {showTimePickerDay === day && DateTimePicker && (
                      <DateTimePicker value={new Date(`2026-01-01T${dayStartTimes[day] || '09:00'}:00`)} mode="time" is24Hour={true} onChange={(event: any, selectedDate: Date) => { setShowTimePickerDay(null); if (selectedDate) { const h = String(selectedDate.getHours()).padStart(2, '0'); const m = String(selectedDate.getMinutes()).padStart(2, '0'); setDayStartTimes({...dayStartTimes, [day]: `${h}:${m}`}); } }} />
                    )}
                  </>
                )}
                {/* 🌟 恢復天氣顯示 */}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 }}><Text style={{ color: '#FFF', fontSize: 12 }}>{weatherData[day] || '☁️ 預報'}</Text></View>
              </View>
            </View>

            {!isCollapsed ? cascadedPlaces.map((place: any, index) => {
              const isLast = index === cascadedPlaces.length - 1; 
              return (
                <View key={place.id} style={{ flexDirection: 'row' }}>
                  <View style={{ width: 50, alignItems: 'center' }}>
                    <View style={[styles.numberPin, { backgroundColor: dayColor, marginTop: 5 }]}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>{index + 1}</Text></View>
                    {!isLast ? (
                      <View style={{ flex: 1, alignItems: 'center', width: '100%', paddingVertical: 2 }}>
                        <View style={{ width: 2, flex: 1, backgroundColor: themeColors.border }} />
                        <TouchableOpacity onPress={() => setEditingTransitId(place.id)} style={[styles.miniTransitBadge, {backgroundColor: isDarkMode ? '#333' : '#FFF', borderColor: themeColors.border}]}>
                           <Text style={{fontSize: 16}}>{place.transitMode.substring(0,2)}</Text>
                           {place.transitTime && place.transitTime !== '無法估算' ? (
                             <Text style={{fontSize: 11, color: isDarkMode ? '#81D4FA' : '#2980B9', fontWeight: 'bold', marginTop: 2, textAlign: 'center'}}>{place.transitTime.replace('分鐘', 'm').replace('小時', 'h')}</Text>
                           ) : null}
                        </TouchableOpacity>
                        <View style={{ width: 2, flex: 1, backgroundColor: themeColors.border }} />
                      </View>
                    ) : null}
                  </View>
                  
                  <View style={{ flex: 1, paddingBottom: 15, paddingRight: 10 }}>
                    <View style={[styles.placeCard, {backgroundColor: themeColors.card, flexDirection: 'column', position: 'relative'}]}>
                      
                      {/* 🌟 v1.4.0 新增：右上角按鈕組 */}
                      <View style={styles.topRightActions}>
                        <TouchableOpacity onPress={() => {setEditingStayId(place.id); setStayTimeInfo(String(place.stayTime || 60));}} style={styles.miniIconBtn}><Text>⏱️</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => movePlace(place.id, 'up')} disabled={index === 0} style={[styles.miniIconBtn, {opacity: index === 0 ? 0.3 : 1}]}><Text>🔼</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => movePlace(place.id, 'down')} disabled={isLast} style={[styles.miniIconBtn, {opacity: isLast ? 0.3 : 1}]}><Text>🔽</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setPlaces(places.filter(p => p.id !== place.id))} style={styles.miniIconBtn}><Text>❌</Text></TouchableOpacity>
                      </View>

                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 5}}>
                        <View style={{flex: 1, paddingRight: 5}}>
                          <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text, marginBottom: 4, width: '75%' }} numberOfLines={2}>{place.name}</Text>
                          <Text style={{fontSize: 12, fontWeight: 'bold', marginBottom: 8}}>
                             <Text style={{color: '#E67E22'}}>{place.arrivalTime} - {place.departureTime}</Text>
                             <Text style={{color: '#9B59B6'}}> (停留 {place.stayTime || 60}m)</Text>
                          </Text>
                          <View style={{flexDirection: 'row'}}>
                            <TouchableOpacity onPress={() => openInGoogleMaps(place)} style={[styles.actionBadge, {backgroundColor: isDarkMode ? '#2A2A2A' : '#F0F3F7', marginRight: 8}]}><Text style={{fontSize: 12, color: themeColors.text}}>📍 地圖</Text></TouchableOpacity>
                            {/* 🌟 v1.4.0 新增：羅盤導航按鈕 */}
                            {!isLast && (
                              <TouchableOpacity onPress={() => openRouteInGoogleMaps(place.name, cascadedPlaces[index+1].name, place.transitMode)} style={[styles.actionBadge, {backgroundColor: '#E8F8F5', borderColor: '#1ABC9C', borderWidth: 1}]}>
                                <Text style={{fontSize: 12, color: '#16A085', fontWeight: 'bold'}}>🧭 路線導航</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                    
                    {/* 編輯停留時間與交通時間的彈出面板 */}
                    {editingStayId === place.id && (
                      <View style={{ marginTop: 6, marginLeft: 5 }}>
                        <View style={[styles.transitEditRow, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                          <Text style={{color: themeColors.text, fontSize: 12, marginRight: 10}}>修改停留時間 (分鐘):</Text>
                          <TextInput style={[styles.transitInput, {backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border}]} keyboardType="numeric" value={stayTimeInfo} onChangeText={setStayTimeInfo} />
                          <TouchableOpacity onPress={() => { setPlaces(places.map(p => p.id === place.id ? { ...p, stayTime: parseInt(stayTimeInfo) || 60 } : p)); setEditingStayId(null); }} style={{ backgroundColor: '#F39C12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}><Text style={{color:'#FFF', fontSize: 10}}>確認</Text></TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {editingTransitId === place.id && !isLast && (
                      <View style={{ marginTop: 6, marginLeft: 5 }}>
                        <View style={[styles.transitEditRow, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                          <View style={{flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginRight: 5}}>
                            {TRANSIT_MODES.map(mode => (
                              <TouchableOpacity key={mode} onPress={() => { setEditingTransitId(null); setPlaces(places.map(p => p.id === place.id ? {...p, transitMode: mode, transitTime: '⏳ 估算中...'} : p)); fetchTransitTime(place, cascadedPlaces[index + 1], mode).then(result => { setPlaces(curr => curr.map(p => p.id === place.id ? {...p, transitTime: result.time, transitMode: result.mode} : p)); }); }} style={[styles.transitChip, {backgroundColor: place.transitMode.includes(mode.substring(2)) ? '#3498DB' : themeColors.card, borderColor: themeColors.border, marginBottom: 5}]}><Text style={{fontSize: 10, color: place.transitMode.includes(mode.substring(2)) ? '#FFF' : themeColors.text}}>{mode}</Text></TouchableOpacity>
                            ))}
                          </View>
                          <TextInput style={[styles.transitInput, {backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border}]} placeholder="手動輸入" value={transitTimeInfo} onChangeText={setTransitTimeInfo} placeholderTextColor={themeColors.subText} />
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
  mapContainer: { height: 250, borderBottomWidth: 1, borderColor: '#CCC' },
  customPin: { padding: 6, borderRadius: 20, borderWidth: 2, borderColor: '#FFF', elevation: 3, alignItems: 'center', justifyContent: 'center' },
  mapFilterStrip: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', padding: 5, borderRadius: 10 },
  filterBtn: { padding: 5, marginRight: 5, borderRadius: 5, justifyContent: 'center' },
  dayFilterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginRight: 5, justifyContent: 'center' },
  inputCard: { padding: 15, elevation: 3, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  daySelector: { flexDirection: 'row', alignItems: 'center', borderRadius: 15, borderWidth: 1, paddingHorizontal: 5 },
  dayBtn: { padding: 10 }, timeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, marginRight: 8 }, 
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 12, marginRight: 10 }, addBtn: { paddingHorizontal: 15, borderRadius: 8, justifyContent: 'center', height: 45 },
  timelineArea: { flex: 1, padding: 15 }, 
  dayHeader: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, marginBottom: 15, elevation: 2 }, 
  placeCard: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, elevation: 1 }, 
  numberPin: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  miniTransitBadge: { padding: 4, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 10, minWidth: 36, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }, modalContent: { width: '100%', borderRadius: 15, padding: 20, elevation: 5 }, bulkInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, height: 150, padding: 10, fontSize: 14 }, bulkBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  transitEditRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1, marginTop: 5 },
  transitInput: { flex: 1, height: 30, borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, marginRight: 10 },
  transitChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, marginRight: 5 },
  // 🌟 v1.4.1 新增樣式：右上角操作區塊與迷你按鈕
  topRightActions: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', zIndex: 10 },
  miniIconBtn: { width: 28, height: 28, backgroundColor: '#F0F3F7', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginLeft: 6, elevation: 1, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 1 }
});