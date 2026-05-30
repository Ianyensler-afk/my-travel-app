import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// 🚨 【網頁版開發模式防護罩】🚨
// 因為 Web 瀏覽器沒有內建地圖引擎，Metro 打包器會直接報錯崩潰。
// 在公司用網頁版測試時，我們直接宣告兩個「假元件」來騙過系統！
// 👉 等您回家用手機 Expo Go 掃描時，請把這兩行刪掉，並換成：import MapView, { Marker } from 'react-native-maps';
//const MapView: any = View;
//const Marker: any = View;
import MapView, { Marker } from 'react-native-maps';

// 🌟 全域色彩管理
const THEME = {
  primary: '#E74C3C', secondary: '#2C3E50', background: '#F0F3F7', white: '#FFFFFF', success: '#27AE60'
};
const DAY_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F', '#9B59B6', '#E67E22', '#1ABC9C', '#34495E'];

const TIME_SLOTS = ['早上', '中午', '下午', '晚上'];
const TIME_WEIGHT = { '早上': 1, '中午': 2, '下午': 3, '晚上': 4 };
const TRANSIT_MODES = ['🚶 步行', '🚆 地鐵', '🚕 計程車', '🚌 公車'];

// 🔑 請貼上您的 API Key
const GOOGLE_MAPS_API_KEY = 'AIzaSyDRoRYoDVWMtIOcuqtS6Oc-5HKseA3Pmic';
const TOKYO_REGION = { latitude: 35.6895, longitude: 139.6917, latitudeDelta: 0.1, longitudeDelta: 0.1 };

export default function HomeScreen() {
  const [trips, setTrips] = useState([{ id: 'default', name: '我的日本行', startDate: '2026-05-11' }]);
  const [currentTripId, setCurrentTripId] = useState('default');
  const [places, setPlaces] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [newPlace, setNewPlace] = useState('');
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedTime, setSelectedTime] = useState('早上');
  const [editingTransitId, setEditingTransitId] = useState(null);
  const [transitTimeInfo, setTransitTimeInfo] = useState('');

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempStartDate, setTempStartDate] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  
  const [packingItems, setPackingItems] = useState([
    { id: '1', text: '護照簽證', checked: false }, { id: '2', text: '日圓現鈔', checked: false },
    { id: '3', text: '網卡/WIFI機', checked: false }, { id: '4', text: '行動電源', checked: false }
  ]);

  const [collapsedDays, setCollapsedDays] = useState([]); 
  const [mapVisibleDays, setMapVisibleDays] = useState([1]); 

  const saveTimeoutRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      const loadAllData = async () => {
        try {
          const savedTrips = await AsyncStorage.getItem('@travel_db_trips');
          if (savedTrips) {
            const parsed = JSON.parse(savedTrips);
            if (parsed.trips) setTrips(parsed.trips);
            if (parsed.currentTripId) setCurrentTripId(parsed.currentTripId);
          }
          const savedPlaces = await AsyncStorage.getItem('@travel_db_timeline');
          if (savedPlaces) {
            const loadedPlaces = JSON.parse(savedPlaces);
            setPlaces(loadedPlaces);
            const days = [...new Set(loadedPlaces.map(p => p.day))];
            if(days.length > 0) setMapVisibleDays(days);
          }
        } catch (e) { console.error('載入失敗:', e); }
        setIsDataLoaded(true);
      };
      loadAllData();
    }, [])
  );

  useEffect(() => {
    if (isDataLoaded) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(places));
        AsyncStorage.setItem('@travel_db_trips', JSON.stringify({ trips, currentTripId }));
      }, 500);
    }
  }, [places, trips, currentTripId, isDataLoaded]);

  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];
  const currentTripPlaces = places.filter(p => p.tripId === currentTripId);
  const activeDays = [...new Set(currentTripPlaces.map(p => p.day))].sort((a, b) => a - b);
  if (activeDays.length === 0) activeDays.push(1);

  const getPlaceIcon = (name) => {
    const foodKeywords = ['餐廳', '麵', '飯', '壽司', '燒肉', '咖啡', '甜點', '食堂', '居酒屋', '屋'];
    return foodKeywords.some(k => name.includes(k)) ? '🍽️' : '📍';
  };

  const getDateForDay = (dayNum) => {
    const start = new Date(currentTrip.startDate || '2026-05-11');
    if (isNaN(start.getTime())) return '日期錯誤'; 
    const target = new Date(start); target.setDate(start.getDate() + (dayNum - 1));
    const m = String(target.getMonth() + 1).padStart(2, '0'); const d = String(target.getDate()).padStart(2, '0');
    return `${m}/${d}`;
  };

  const saveStartDate = () => {
    if (!tempStartDate.match(/^\d{4}-\d{2}-\d{2}$/)) { alert('請輸入 YYYY-MM-DD'); return; }
    setTrips(trips.map(t => t.id === currentTripId ? { ...t, startDate: tempStartDate } : t));
    setIsEditingDate(false);
  };

  // 🌟 [2026/04/02 終極優化] 匯出備份：網頁版直接下載實體 JSON 檔案
  const handleExportData = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const allData = await AsyncStorage.multiGet(allKeys);
      const exportObj = {};
      allData.forEach(([key, value]) => { exportObj[key] = JSON.parse(value); });
      const exportStr = JSON.stringify(exportObj);
      
      if (Platform.OS === 'web') {
        // 🌐 Web 專屬：產生實體檔案並觸發下載
        const blob = new Blob([exportStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "TravelApp_Backup.json"; // 下載的檔案名稱
        a.click();
        URL.revokeObjectURL(url);
        alert("🎉 備份檔案 (TravelApp_Backup.json) 已下載至您的電腦！\n回家後可用記事本打開它全選複製。");
      } else {
        // 📱 手機版：暫時維持 alert 顯示
        alert("請複製以下資料：\n\n" + exportStr);
      }
      console.log("導出成功！");
    } catch (e) { 
      alert("匯出失敗"); 
    }
  };

  // 🌟 [2026/04/02 新增] 一鍵還原資料
  const handleImportData = async () => {
    let jsonStr = '';
    if (Platform.OS === 'web') {
      jsonStr = window.prompt("📥 請貼上您的備份代碼 (JSON)：");
    } else {
      alert("手機版匯入功能開發中，目前請於網頁版使用！");
    }

    if (!jsonStr) return;

    try {
      const parsedData = JSON.parse(jsonStr);
      // 把物件轉回 AsyncStorage 看得懂的字串格式
      const kvPairs = Object.keys(parsedData).map(key => [key, JSON.stringify(parsedData[key])]);
      await AsyncStorage.multiSet(kvPairs);
      alert("🎉 資料還原成功！請按確定後，按鍵盤 F5 重新整理網頁。");
    } catch (e) { 
      alert("格式錯誤，還原失敗！請確定您複製了完整的代碼。"); 
    }
  };

  const openInGoogleMaps = (placeName) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}`;
    if (Platform.OS === 'web') window.open(url, '_blank'); else Linking.openURL(url);
  };

  const fetchTransitTime = async (origin, destination, modeLabel) => {
    if (!origin || !destination || GOOGLE_MAPS_API_KEY === '請在此貼上您的金鑰') return '';
    try {
      let apiMode = 'transit'; 
      if (modeLabel.includes('步行')) apiMode = 'walking';
      if (modeLabel.includes('計程車') || modeLabel.includes('開車')) apiMode = 'driving';
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=${apiMode}&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') return data.rows[0].elements[0].duration.text;
      return '';
    } catch (e) { return ''; }
  };

  const fetchCoordinates = async (placeName) => {
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === '請在此貼上您的金鑰') return null;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(placeName)}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.results.length > 0) return data.results[0].geometry.location;
    } catch (e) {}
    return null;
  };

  const addPlace = async () => {
    if (!newPlace) return;
    const placeId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const placeObj = {
      id: placeId, tripId: currentTripId, day: selectedDay, timeSlot: selectedTime, name: newPlace,
      transitMode: '🚆 地鐵', transitTime: '估算中...', coords: null 
    };

    const dayPlaces = places.filter(p => p.tripId === currentTripId && p.day === selectedDay).sort((a, b) => TIME_WEIGHT[a.timeSlot] - TIME_WEIGHT[b.timeSlot] || a.id.localeCompare(b.id));
    const lastPlace = dayPlaces.length > 0 ? dayPlaces[dayPlaces.length - 1] : null;

    setPlaces(prev => [...prev, placeObj]); setNewPlace(''); 
    
    const coords = await fetchCoordinates(placeObj.name);
    let timeStr = '';
    if (lastPlace) timeStr = await fetchTransitTime(lastPlace.name, placeObj.name, placeObj.transitMode);
    
    setPlaces(prev => prev.map(p => p.id === placeId ? { ...p, transitTime: timeStr, coords } : p));
    if(!mapVisibleDays.includes(selectedDay)) setMapVisibleDays([...mapVisibleDays, selectedDay]);
  };

  const getSortedPlacesForDay = (day) => {
    return currentTripPlaces.filter(p => p.day === day).sort((a, b) => TIME_WEIGHT[a.timeSlot] - TIME_WEIGHT[b.timeSlot] || a.id.localeCompare(b.id));
  };

  const toggleDayCollapse = (day) => {
    if (collapsedDays.includes(day)) setCollapsedDays(collapsedDays.filter(d => d !== day));
    else setCollapsedDays([...collapsedDays, day]);
  };

  return (
    <KeyboardAvoidingView style={[styles.container, {backgroundColor: THEME.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      <View style={[styles.header, { backgroundColor: THEME.primary }]}>
        <Text style={styles.headerText}>🗺️ {currentTrip.name}</Text>
        
        {/* 🌟 替換成這個：包含還原與備份的雙按鈕容器 */}
        <View style={styles.syncBtnContainer}>
          <TouchableOpacity onPress={handleImportData} style={styles.syncBtn}>
            <Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📥 還原</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExportData} style={[styles.syncBtn, {marginLeft: 8}]}>
            <Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>📤 備份</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <View style={styles.webMapPlaceholder}>
            <Text style={{fontSize: 40, marginBottom: 10}}>🗾</Text>
            <Text style={{color: '#555', fontWeight: 'bold'}}>互動地圖準備就緒</Text>
            <Text style={{color: '#888', fontSize: 12, marginTop: 5}}>(請於手機 Expo Go 檢視真實 Google Maps 與動態圖釘)</Text>
          </View>
        ) : (
          <MapView style={{width: '100%', height: '100%'}} initialRegion={TOKYO_REGION}>
            {places.filter(p => mapVisibleDays.includes(p.day) && p.coords).map(p => (
              <Marker key={p.id} coordinate={{latitude: p.coords.lat, longitude: p.coords.lng}} title={p.name}>
                <View style={[styles.customPin, { backgroundColor: DAY_COLORS[(p.day - 1) % DAY_COLORS.length] }]}>
                  <Text style={{fontSize: 12}}>{getPlaceIcon(p.name)}</Text>
                </View>
              </Marker>
            ))}
          </MapView>
        )}
        
        <View style={styles.mapFilterStrip}>
          <TouchableOpacity onPress={() => setMapVisibleDays(activeDays)} style={styles.filterBtn}><Text style={{fontSize: 10, color: '#333'}}>✅ 全選</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMapVisibleDays([])} style={styles.filterBtn}><Text style={{fontSize: 10, color: '#333'}}>❌ 全不選</Text></TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeDays.map(day => {
              const isVisible = mapVisibleDays.includes(day);
              const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length];
              return (
                <TouchableOpacity key={day} onPress={() => {
                  if(isVisible) setMapVisibleDays(mapVisibleDays.filter(d => d !== day));
                  else setMapVisibleDays([...mapVisibleDays, day]);
                }} style={[styles.dayFilterChip, isVisible && { backgroundColor: dayColor, borderColor: dayColor }]}>
                  <Text style={{fontSize: 12, fontWeight: 'bold', color: isVisible ? '#FFF' : '#555'}}>第{day}天</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <View style={styles.inputCard}>
        <View style={styles.row}>
          <View style={styles.daySelector}>
            <TouchableOpacity onPress={() => setSelectedDay(Math.max(1, selectedDay - 1))} style={styles.dayBtn}><Text>➖</Text></TouchableOpacity>
            <View style={{alignItems: 'center'}}><Text style={styles.dayText}>第 {selectedDay} 天</Text></View>
            <TouchableOpacity onPress={() => setSelectedDay(selectedDay + 1)} style={styles.dayBtn}><Text>➕</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
            {TIME_SLOTS.map(time => (
              <TouchableOpacity key={time} style={[styles.timeChip, selectedTime === time && { backgroundColor: THEME.secondary, borderColor: THEME.secondary }]} onPress={() => setSelectedTime(time)}>
                <Text style={[styles.timeChipText, selectedTime === time && {color: THEME.white}]}>{time}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={[styles.row, {marginTop: 10}]}>
          <TextInput style={styles.input} placeholder="輸入景點名稱，讓地圖自動標記..." value={newPlace} onChangeText={setNewPlace} />
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: THEME.primary }]} onPress={addPlace}><Text style={{color: 'white', fontWeight: 'bold'}}>新增</Text></TouchableOpacity>
        </View>
      </View>

      {/* 🌟 行程手風琴 (可收合時間軸) */}
      <ScrollView style={styles.timelineArea}>
        {/* 🌟 加上 .filter(day => mapVisibleDays.includes(day)) 讓清單與上方篩選器完美連動 */}
        {activeDays.filter(day => mapVisibleDays.includes(day)).map(day => {
          const isCollapsed = collapsedDays.includes(day);
          const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length]; 
          
          return (
          <View key={`day-${day}`} style={styles.dayBlock}>
            <TouchableOpacity style={[styles.dayHeader, { backgroundColor: dayColor }]} onPress={() => toggleDayCollapse(day)}>
              <Text style={styles.dayHeaderText}>{isCollapsed ? '▶️' : '▼'} 第 {day} 天 ({getDateForDay(day)})</Text>
            </TouchableOpacity>

            {!isCollapsed && getSortedPlacesForDay(day).map((place, index) => {
              const isLast = index === getSortedPlacesForDay(day).length - 1;
              return (
                <View key={place.id} style={styles.timelineRow}>
                  <View style={styles.timelineLineContainer}>
                    <View style={[styles.timelineDot, { backgroundColor: dayColor }]} />
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.placeCard}>
                      <Text style={{fontSize: 20, marginRight: 8}}>{getPlaceIcon(place.name)}</Text>
                      <View style={{flex: 1}}>
                        <Text style={[styles.timeLabel, { color: dayColor }]}>{place.timeSlot}</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <Text style={styles.placeName}>{place.name}</Text>
                          <TouchableOpacity onPress={() => openInGoogleMaps(place.name)} style={{marginLeft: 8}}><Text style={{fontSize: 16}}>📍</Text></TouchableOpacity>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => setPlaces(places.filter(p => p.id !== place.id))}><Text style={{fontSize: 18}}>🗑️</Text></TouchableOpacity>
                    </View>
                    
                    {!isLast && (
                      <View style={styles.transitArea}>
                        {editingTransitId === place.id ? (
                          <View style={styles.transitEditRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxWidth: 150, marginRight: 5}}>
                              {TRANSIT_MODES.map(mode => (
                                <TouchableOpacity key={mode} onPress={() => {
                                  setEditingTransitId(null);
                                  setPlaces(places.map(p => p.id === place.id ? {...p, transitMode: mode, transitTime: '估算中...'} : p));
                                  const dayPlaces = getSortedPlacesForDay(day);
                                  const pIndex = dayPlaces.findIndex(x => x.id === place.id);
                                  if(pIndex >= 0 && pIndex < dayPlaces.length - 1) {
                                    const nextP = dayPlaces[pIndex + 1];
                                    fetchTransitTime(place.name, nextP.name, mode).then(timeStr => {
                                      setPlaces(curr => curr.map(p => p.id === place.id ? {...p, transitTime: timeStr} : p));
                                    });
                                  }
                                }} style={[styles.transitChip, place.transitMode === mode && {backgroundColor: '#3498DB'}]}>
                                  <Text style={{fontSize: 10, color: place.transitMode === mode ? '#FFF' : '#555'}}>{mode}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <TextInput style={styles.transitInput} placeholder="手動(如: 15分鐘)" value={transitTimeInfo} onChangeText={setTransitTimeInfo} />
                            <TouchableOpacity onPress={() => { setPlaces(places.map(p => p.id === place.id ? { ...p, transitTime: transitTimeInfo } : p)); setEditingTransitId(null); }} style={styles.saveTransitBtn}><Text style={{color:'#FFF', fontSize: 10}}>儲存</Text></TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => { setEditingTransitId(place.id); setTransitTimeInfo(place.transitTime === '估算中...' ? '' : place.transitTime || ''); }} style={styles.transitDisplay}>
                            <Text style={styles.transitText}>
                              {place.transitTime ? (place.transitTime === '估算中...' ? `⏳ 估算中...` : `⬇️ ${place.transitMode} ${place.transitTime}`) : `➕ 新增交通時間`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )})}
        {currentTripPlaces.length > 0 && <View style={{height: 50}} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 50, paddingBottom: 15, alignItems: 'center', position: 'relative' },
  headerText: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  syncBtnContainer: { position: 'absolute', right: 15, top: 50, flexDirection: 'row' },
  syncBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 15 },
  mapContainer: { height: 250, backgroundColor: '#E0E0E0', borderBottomWidth: 1, borderColor: '#CCC' },
  webMapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ECF0F1' },
  customPin: { padding: 4, borderRadius: 20, borderWidth: 2, borderColor: '#FFF', elevation: 3 },
  mapFilterStrip: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.9)', padding: 5, borderRadius: 10 },
  filterBtn: { padding: 5, marginRight: 5, backgroundColor: '#F0F0F0', borderRadius: 5, justifyContent: 'center' },
  dayFilterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#DDD', marginRight: 5, backgroundColor: '#FFF', justifyContent: 'center' },
  inputCard: { backgroundColor: '#FFF', padding: 15, elevation: 3, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  daySelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 15, borderWidth: 1, borderColor: '#DDD', paddingHorizontal: 5 },
  dayBtn: { padding: 10 }, dayText: { fontWeight: 'bold', color: '#2C3E50', fontSize: 13 },
  timeScroll: { marginLeft: 10 }, timeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, borderColor: '#DDD', marginRight: 8, backgroundColor: '#FFF' }, timeChipText: { fontSize: 13, color: '#555', fontWeight: 'bold' },
  input: { flex: 1, borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, marginRight: 10, backgroundColor: '#FAFAFA' },
  addBtn: { paddingHorizontal: 15, borderRadius: 8, justifyContent: 'center', height: 45 },
  timelineArea: { flex: 1, padding: 15 }, dayBlock: { marginBottom: 20 },
  dayHeader: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, marginBottom: 15, elevation: 2 }, dayHeaderText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  timelineRow: { flexDirection: 'row' }, timelineLineContainer: { width: 30, alignItems: 'center' }, timelineDot: { width: 14, height: 14, borderRadius: 7, zIndex: 2, marginTop: 15, borderWidth: 2, borderColor: '#FFF' }, timelineLine: { width: 2, flex: 1, backgroundColor: '#BDC3C7', marginTop: -5, marginBottom: -15 },
  timelineContent: { flex: 1, paddingBottom: 20 }, placeCard: { flexDirection: 'row', backgroundColor: '#FFF', padding: 12, borderRadius: 10, elevation: 1, alignItems: 'center' }, timeLabel: { fontSize: 11, fontWeight: 'bold' }, placeName: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  transitArea: { marginTop: 8, marginLeft: 10 }, transitDisplay: { backgroundColor: '#E8F4F8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start' }, transitText: { fontSize: 11, color: '#2980B9' },
  transitEditRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#DDD' }, transitChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#EEE', marginRight: 4, backgroundColor: '#FFF' }, transitInput: { borderWidth: 1, borderColor: '#CCC', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 80, fontSize: 12, backgroundColor: '#FFF', marginRight: 5 }, saveTransitBtn: { backgroundColor: '#27AE60', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }
});