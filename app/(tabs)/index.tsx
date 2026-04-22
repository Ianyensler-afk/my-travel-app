import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any;
if (Platform.OS !== 'web') { DateTimePicker = require('@react-native-community/datetimepicker').default; }

interface IPlace { id: string; tripId: string; day: number; timeSlot: string; name: string; transitMode: string; transitTime: string; coords: { lat: number; lng: number } | null; orderIndex: number; }

let MapView: any = View; let Marker: any = View;
if (Platform.OS !== 'web') { const Maps = require('react-native-maps'); MapView = Maps.default; Marker = Maps.Marker; }
const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

const DAY_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E'];
const TIME_SLOTS = ['早上', '中午', '下午', '晚上'];
const TIME_WEIGHT = { '早上': 1, '中午': 2, '下午': 3, '晚上': 4 };
const TRANSIT_MODES = ['🚶 步行', '🚆 地鐵', '🚕 計程車', '🚌 公車'];
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const TOKYO_REGION = { latitude: 35.6895, longitude: 139.6917, latitudeDelta: 0.1, longitudeDelta: 0.1 };

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 6000) => {
  const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout);
  try { const response = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); return response; } catch (error) { clearTimeout(id); throw error; }
};

export default function HomeScreen() {
  const { trips, setTrips, currentTripId, themeColors, isDarkMode } = useTravelContext();
  const [places, setPlaces] = useState<IPlace[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [newPlace, setNewPlace] = useState(''); const [selectedDay, setSelectedDay] = useState(1); const [selectedTime, setSelectedTime] = useState('早上');
  const [editingTransitId, setEditingTransitId] = useState<string | null>(null); const [transitTimeInfo, setTransitTimeInfo] = useState('');
  const [collapsedDays, setCollapsedDays] = useState<number[]>([]); const [mapVisibleDays, setMapVisibleDays] = useState<number[]>([1]); 
  const mapRef = useRef<any>(null); const [weatherData, setWeatherData] = useState<any>({});
  const saveTimeoutRef = useRef<any>(null); const isCalculatingRef = useRef(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false); const [bulkText, setBulkText] = useState('');

  useFocusEffect(useCallback(() => {
    const loadLocalData = async () => {
      try {
        const savedPlaces = await AsyncStorage.getItem('@travel_db_timeline');
        if (savedPlaces) {
          const parsedPlaces = JSON.parse(savedPlaces);
          if (Array.isArray(parsedPlaces)) {
            const cleanPlaces = parsedPlaces.map((p: any) => ({ ...p, orderIndex: p.orderIndex || 0, transitTime: p.transitTime?.includes('估算中') ? '' : p.transitTime }));
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
      const activeDays = [...new Set(currentTripPlaces.map(p => p.day))];
      let target: IPlace | null = null; let nextPlace: IPlace | null = null;

      for (const day of activeDays) {
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
      }, 500);
    }
  }, [places, isDataLoaded]);

  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];
  const currentTripPlaces = places.filter(p => p.tripId === currentTripId);
  const activeDays = [...new Set(currentTripPlaces.map(p => p.day))].sort((a, b) => a - b);
  if (activeDays.length === 0) activeDays.push(1);

  const handleUpdateStartDate = async (newDate: Date) => {
    if (isNaN(newDate.getTime())) return;
    const formatted = `${newDate.getFullYear()}-${String(newDate.getMonth()+1).padStart(2,'0')}-${String(newDate.getDate()).padStart(2,'0')}`;
    setTrips(trips.map(t => t.id === currentTripId ? { ...t, startDate: formatted } : t));
  };

  const getDateForDay = (dayNum: number) => {
    const start = new Date(currentTrip?.startDate || '2026-06-13'); if (isNaN(start.getTime())) return '日期錯誤'; 
    const target = new Date(start); target.setDate(start.getDate() + (dayNum - 1));
    const m = String(target.getMonth() + 1).padStart(2, '0'); const d = String(target.getDate()).padStart(2, '0');
    return `${m}/${d}`;
  };

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

  // 🌟 修復的備份與還原功能 (融合 AsyncStorage)
  const handleExportData = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys(); const allData = await AsyncStorage.multiGet(allKeys);
      const exportObj: any = {}; allData.forEach(([key, value]) => { exportObj[key] = JSON.parse(value || '{}'); });
      const exportStr = JSON.stringify(exportObj);
      if (Platform.OS === 'web') {
        const blob = new Blob([exportStr], { type: "application/json" }); const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "TravelApp_Backup.json"; a.click(); URL.revokeObjectURL(url);
        alert("🎉 備份檔案已下載！\n回家後可用記事本打開全選複製。");
      } else { alert("請複製以下資料：\n\n" + exportStr); }
    } catch (e) { alert("匯出失敗"); }
  };

  const handleImportData = async () => {
    let jsonStr = '';
    if (Platform.OS === 'web') { jsonStr = window.prompt("📥 請貼上您的備份代碼 (JSON)：") || ''; } 
    else { alert("手機版匯入功能開發中，目前請於網頁版使用！"); }
    if (!jsonStr) return;
    try {
      const parsedData = JSON.parse(jsonStr);
      const kvPairs = Object.keys(parsedData).map(key => [key, JSON.stringify(parsedData[key])]);
      await AsyncStorage.multiSet(kvPairs as any); alert("🎉 資料還原成功！請重新整理頁面。");
    } catch (e) { alert("格式錯誤，還原失敗！"); }
  };

  const openInGoogleMaps = (place: IPlace) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
    if (Platform.OS === 'web') window.location.href = url; else Linking.openURL(url);
  };

  const openRouteInGoogleMaps = (origin: IPlace, dest: IPlace, modeLabel: string) => {
    let travelMode = 'transit'; if (modeLabel.includes('步行')) travelMode = 'walking'; if (modeLabel.includes('開車') || modeLabel.includes('計程車')) travelMode = 'driving';
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.name)}&destination=${encodeURIComponent(dest.name)}&travelmode=${travelMode}`;
    if (Platform.OS === 'web') window.location.href = url; else Linking.openURL(url);
  };

  const fetchTransitTime = async (originPlace: any, destPlace: any, modeLabel: string) => {
    if (!originPlace || !destPlace) return { time: '無法估算', mode: modeLabel };
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
    const placeObj: IPlace = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, tripId: currentTripId, day: selectedDay, timeSlot: selectedTime, name: currentName, transitMode: '🚆 地鐵', transitTime: '', coords: coords, orderIndex: Date.now() };
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
      newPlaces.push({ id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, tripId: currentTripId, day: targetDay, timeSlot: targetTime, name: cleanName, transitMode: '🚆 地鐵', transitTime: '', coords: null, orderIndex: baseOrder++ });
    }
    if(newPlaces.length > 0) {
      setPlaces(prev => [...prev, ...newPlaces]); setIsBulkModalOpen(false); setBulkText('');
      for(const p of newPlaces) { const coords = await fetchCoordinates(p.name); setPlaces(prev => prev.map(item => item.id === p.id ? { ...item, coords } : item)); await new Promise(r => setTimeout(r, 600)); }
    }
  };

  const getSortedPlacesForDay = (day: number) => { return places.filter(p => p.day === day && p.tripId === currentTripId).sort((a, b) => { const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot]; if (timeDiff !== 0) return timeDiff; return (a.orderIndex || 0) - (b.orderIndex || 0); }); };

  const movePlace = (placeId: string, direction: string) => {
    const placeToMove = places.find(p => p.id === placeId); if (!placeToMove) return;
    const dayPlaces = getSortedPlacesForDay(placeToMove.day); const index = dayPlaces.findIndex(p => p.id === placeId);
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
                <TouchableOpacity onPress={handleBulkImport} style={[styles.bulkBtn, {backgroundColor: themeColors.primary}]}><Text style={{color:'#FFF', fontWeight:'bold'}}>開始匯入</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={styles.headerText}>🗺️ {currentTrip?.name || '請新增行程'}</Text>
          <View style={{marginLeft: 15, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 5, paddingHorizontal: 5}}>
            {Platform.OS === 'web' ? (
              <input type="date" value={currentTrip?.startDate || ''} onChange={(e) => handleUpdateStartDate(new Date(e.target.value))} style={{ background: 'transparent', color: '#FFF', border: 'none', fontSize: '12px', padding: '5px', outline: 'none', colorScheme: isDarkMode ? 'dark' : 'light' }} />
            ) : (
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{padding: 5}}><Text style={{color: '#FFF', fontSize: 12}}>📅 {currentTrip?.startDate}</Text></TouchableOpacity>
            )}
            {showDatePicker && DateTimePicker && Platform.OS !== 'web' && (
              <DateTimePicker value={new Date(currentTrip?.startDate || Date.now())} mode="date" display="default" onChange={(event: any, selectedDate: Date) => { setShowDatePicker(false); if(selectedDate) handleUpdateStartDate(selectedDate); }} />
            )}
          </View>
        </View>
        {/* 🌟 補回的備份與還原按鈕 */}
        <View style={styles.syncBtnContainer}>
          <TouchableOpacity onPress={handleImportData} style={styles.syncBtn}><Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📥 還原</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleExportData} style={[styles.syncBtn, {marginLeft: 8}]}><Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📤 備份</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <iframe width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy" src={`https://maps.google.com/maps?q=${encodeURIComponent(places.filter(p => mapVisibleDays.includes(p.day) && p.tripId === currentTripId)[0]?.name || currentTrip?.name || '巴黎')}&t=&z=13&ie=UTF8&iwloc=&output=embed`}></iframe>
        ) : (
          <MapView ref={mapRef} style={{width: '100%', height: '100%'}} initialRegion={TOKYO_REGION}>
            {places.filter(p => mapVisibleDays.includes(p.day) && p.coords && p.tripId === currentTripId).map((p) => {
              const seqNum = getSortedPlacesForDay(p.day).findIndex(dp => dp.id === p.id) + 1;
              return (
                <Marker key={p.id} coordinate={{latitude: p.coords!.lat, longitude: p.coords!.lng}} title={p.name}>
                  <View style={[styles.customPin, { backgroundColor: DAY_COLORS[(p.day - 1) % DAY_COLORS.length] }]}><Text style={{fontSize: 12, color: '#FFF', fontWeight: 'bold'}}>{seqNum}</Text></View>
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
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: themeColors.primary }]} onPress={addPlace}><Text style={{color: 'white', fontWeight: 'bold'}}>新增</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.timelineArea} keyboardShouldPersistTaps="handled">
        {activeDays.filter(day => mapVisibleDays.includes(day)).map(day => {
          const isCollapsed = collapsedDays.includes(day); const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length]; const dayPlaces = getSortedPlacesForDay(day);
          return (
          <View key={`day-${day}`} style={{ marginBottom: 20 }}>
            <TouchableOpacity style={[styles.dayHeader, { backgroundColor: dayColor }]} onPress={() => { setCollapsedDays(isCollapsed ? collapsedDays.filter(d => d !== day) : [...collapsedDays, day]); fetchWeather(day, places); }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', flex: 1, alignItems: 'center' }}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>{isCollapsed ? '▶️' : '▼'} 第 {day} 天 ({getDateForDay(day)})</Text><View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 }}><Text style={{ color: '#FFF', fontSize: 12 }}>{weatherData[day] || '☁️ 點擊預報'}</Text></View></View>
            </TouchableOpacity>
            {!isCollapsed ? dayPlaces.map((place, index) => {
              const isLast = index === dayPlaces.length - 1; const prevPlace = index > 0 ? dayPlaces[index - 1] : null;
              return (
                <View key={place.id} style={{ flexDirection: 'row' }}>
                  <View style={{ width: 30, alignItems: 'center' }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, zIndex: 2, marginTop: 15, borderWidth: 2, borderColor: themeColors.background, backgroundColor: dayColor }} />
                    {!isLast ? <View style={{ width: 2, flex: 1, backgroundColor: themeColors.border, marginTop: -5, marginBottom: -15 }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 20 }}>
                    <View style={[styles.placeCard, {backgroundColor: themeColors.card}]}>
                      <View style={[styles.numberPin, { backgroundColor: dayColor }]}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>{index + 1}</Text></View>
                      <View style={{flex: 1}}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: dayColor }}>{place.timeSlot}</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <Text style={{ fontSize: 16, fontWeight: 'bold', color: themeColors.text }}>{place.name}</Text>
                          <View style={{flexDirection: 'row', marginLeft: 10}}>
                            <TouchableOpacity onPress={() => openInGoogleMaps(place)} style={{marginHorizontal: 4}}><Text style={{fontSize: 16}}>🗺️</Text></TouchableOpacity>
                            {prevPlace ? (<TouchableOpacity onPress={() => openRouteInGoogleMaps(prevPlace, place, place.transitMode)} style={{marginHorizontal: 4}}><Text style={{fontSize: 16}}>🧭</Text></TouchableOpacity>) : null}
                          </View>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{flexDirection: 'row', marginRight: 10}}>
                          <TouchableOpacity onPress={() => movePlace(place.id, 'up')} disabled={index === 0} style={{opacity: index === 0 ? 0.3 : 1, padding: 5}}><Text style={{fontSize: 16}}>🔼</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => movePlace(place.id, 'down')} disabled={isLast} style={{opacity: isLast ? 0.3 : 1, padding: 5}}><Text style={{fontSize: 16}}>🔽</Text></TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => setPlaces(places.filter(p => p.id !== place.id))}><Text style={{fontSize: 18}}>🗑️</Text></TouchableOpacity>
                      </View>
                    </View>
                    {!isLast ? (
                      <View style={{ marginTop: 8, marginLeft: 10 }}>
                        {editingTransitId === place.id ? (
                          <View style={[styles.transitEditRow, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                            <View style={{flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginRight: 5}}>
                              {TRANSIT_MODES.map(mode => (
                                <TouchableOpacity key={mode} onPress={() => { setEditingTransitId(null); setPlaces(places.map(p => p.id === place.id ? {...p, transitMode: mode, transitTime: '⏳ 估算中...'} : p)); fetchTransitTime(place, dayPlaces[index + 1], mode).then(result => { setPlaces(curr => curr.map(p => p.id === place.id ? {...p, transitTime: result.time, transitMode: result.mode} : p)); }); }} style={[styles.transitChip, {backgroundColor: place.transitMode.includes(mode.substring(2)) ? '#3498DB' : themeColors.card, borderColor: themeColors.border, marginBottom: 5}]}><Text style={{fontSize: 10, color: place.transitMode.includes(mode.substring(2)) ? '#FFF' : themeColors.text}}>{mode}</Text></TouchableOpacity>
                              ))}
                            </View>
                            <TextInput style={[styles.transitInput, {backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border}]} placeholder="手動輸入" value={transitTimeInfo} onChangeText={setTransitTimeInfo} placeholderTextColor={themeColors.subText} />
                            <TouchableOpacity onPress={() => { setPlaces(places.map(p => p.id === place.id ? { ...p, transitTime: transitTimeInfo } : p)); setEditingTransitId(null); }} style={{ backgroundColor: '#27AE60', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}><Text style={{color:'#FFF', fontSize: 10}}>儲存</Text></TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => { setEditingTransitId(place.id); setTransitTimeInfo(place.transitTime === '估算中...' || place.transitTime.includes('刷新') ? '' : place.transitTime || ''); }} style={{ backgroundColor: isDarkMode ? '#1A3B4C' : '#E8F4F8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 11, color: isDarkMode ? '#5DADE2' : '#2980B9' }}>{place.transitTime && place.transitTime !== '無法估算' && place.transitTime !== '無路線' && place.transitTime !== '缺金鑰' ? (place.transitTime.includes('中') ? `⏳ ${place.transitTime}` : `⬇️ ${place.transitMode} ${place.transitTime}`) : `➕ ${place.transitTime || '新增交通時間'} (點此手動輸入)`}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : null}
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
  header: { paddingTop: 50, paddingBottom: 15, alignItems: 'center', position: 'relative' },
  headerText: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  syncBtnContainer: { position: 'absolute', right: 15, top: 50, flexDirection: 'row' },
  syncBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 15 },
  mapContainer: { height: 250, borderBottomWidth: 1, borderColor: '#CCC' },
  customPin: { padding: 6, borderRadius: 20, borderWidth: 2, borderColor: '#FFF', elevation: 3, minWidth: 24, alignItems: 'center' },
  mapFilterStrip: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', padding: 5, borderRadius: 10 },
  filterBtn: { padding: 5, marginRight: 5, borderRadius: 5, justifyContent: 'center' },
  dayFilterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginRight: 5, justifyContent: 'center' },
  inputCard: { padding: 15, elevation: 3, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  daySelector: { flexDirection: 'row', alignItems: 'center', borderRadius: 15, borderWidth: 1, paddingHorizontal: 5 },
  dayBtn: { padding: 10 }, 
  timeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, marginRight: 8 }, 
  input: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 12, marginRight: 10 },
  addBtn: { paddingHorizontal: 15, borderRadius: 8, justifyContent: 'center', height: 45 },
  timelineArea: { flex: 1, padding: 15 }, 
  dayHeader: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, marginBottom: 15, elevation: 2 }, 
  placeCard: { flexDirection: 'row', padding: 12, borderRadius: 10, elevation: 1, alignItems: 'center' }, 
  numberPin: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12, elevation: 2 },
  transitEditRow: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 1 }, transitChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginRight: 4 }, transitInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 80, fontSize: 12, marginRight: 5 }, 
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 15, padding: 20, elevation: 5 },
  bulkInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, height: 150, padding: 10, fontSize: 14 },
  bulkBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginLeft: 10 }
});