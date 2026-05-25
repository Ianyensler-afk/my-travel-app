// 檔案路徑: D:\TravelApp\app\(tabs)\trips.tsx
// 版本紀錄: v1.8.3 (QE防彈升級版：輸入效能最佳化 + 邊界崩潰防禦)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (e) {}
}

const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

// 🛡️ 終極日期防護罩：確保 Web 版 input[type="date"] 絕對不會因為格式錯誤罷工
const getSafeDate = (dateStr: any) => {
  if (!dateStr) return new Date();
  const d = new Date(String(dateStr));
  return isNaN(d.getTime()) ? new Date() : d;
};

const formatToStrictYMD = (dateStr: any) => {
  const d = getSafeDate(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 🚀 效能核彈拆除：智慧型輸入框 (打字不卡頓，失焦才寫入全域)
const SmartInput = ({ value, onUpdate, placeholder, style, keyboardType = 'default' }: any) => {
  const [localVal, setLocalVal] = useState(value);
  
  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  return (
    <TextInput
      style={style}
      value={localVal}
      onChangeText={setLocalVal}
      onEndEditing={() => {
        if (localVal !== value) onUpdate(localVal);
      }}
      placeholder={placeholder}
      placeholderTextColor="#888"
      keyboardType={keyboardType}
    />
  );
};

export default function TripsScreen() {
  const { trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();

  const [isAdding, setIsAdding] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [showTripDatePicker, setShowTripDatePicker] = useState(false);
  const [todayWeather, setTodayWeather] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      const loadWeather = async () => {
        try {
          const weatherCache = await AsyncStorage.getItem(`@travel_db_weather_${String(currentTripId)}`);
          if (weatherCache) {
            try {
              const weatherData = JSON.parse(weatherCache);
              if (weatherData && weatherData['1']) setTodayWeather(weatherData['1']);
              else setTodayWeather(null);
            } catch(e) { setTodayWeather(null); }
          } else { setTodayWeather(null); }
        } catch (e) {}
      };
      loadWeather();
    }, [currentTripId])
  );

  const getWeatherSuggestion = () => {
    if (!todayWeather || todayWeather.tempMax === '--') return '尚無氣象資料。';
    let tip = '';
    if (todayWeather.tempMin < 15) tip += '氣溫偏低，記得保暖！';
    else if (todayWeather.tempMax > 28) tip += '天氣炎熱，防曬注意！';
    else tip += '氣溫舒適！';
    if (todayWeather.pop > 40) tip += ' 記得帶傘 ☔';
    return tip;
  };

  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];

  const updateCurrentTrip = (field: string, value: any) => {
    setTrips(trips.map(t => (t.id === currentTripId ? { ...t, [field]: value } : t)));
  };

  const handleCreateTrip = () => {
    if (!newTripName.trim()) return;
    const newTrip = { id: Date.now().toString(), name: newTripName, startDate: '2026-06-13', budget: '50000', flights: [], hotels: [] };
    setTrips([...trips, newTrip]); 
    setCurrentTripId(newTrip.id); 
    setNewTripName(''); 
    setIsAdding(false);
  };

  const handleDeleteTrip = () => {
    const confirmDelete = () => {
      const n = trips.filter(t => t.id !== currentTripId);
      // 🛡️ 崩潰邊界防禦：即使陣列為空也能安然度過
      if (n.length > 0) {
        setTrips(n);
        setCurrentTripId(n[0].id);
      } else {
        const defaultTrip = { id: Date.now().toString(), name: '新行程', startDate: '2026-06-13', budget: '0', flights: [], hotels: [] };
        setTrips([defaultTrip]);
        setCurrentTripId(defaultTrip.id);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('確定刪除此整個行程嗎？')) confirmDelete();
    } else {
      Alert.alert('刪除行程', '確定刪除此整個行程嗎？這將無法復原。', [
        { text: '取消', style: 'cancel' },
        { text: '確定刪除', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const flights = currentTrip?.flights || [];
  const handleAddFlight = () => {
    updateCurrentTrip('flights', [...flights, { id: Date.now().toString(), airline: '', flightNo: '', depTime: '', arrTime: '', terminal: '', gate: '', seat: '' }]);
  };
  const handleUpdateFlight = (id: string, field: string, value: string) => {
    updateCurrentTrip('flights', flights.map((f: any) => (f.id === id ? { ...f, [field]: value } : f)));
  };

  const hotels = currentTrip?.hotels || [];
  const handleAddHotel = () => {
    updateCurrentTrip('hotels', [...hotels, { id: Date.now().toString(), hotelName: '', checkInDate: '', checkOutDate: '', checkInTime: '15:00', confCode: '', phone: '', notes: '' }]);
  };
  const handleUpdateHotel = (id: string, field: string, value: string) => {
    updateCurrentTrip('hotels', hotels.map((h: any) => (h.id === id ? { ...h, [field]: value } : h)));
  };

  return (
    <KeyboardWrapper style={[styles.container, { backgroundColor: themeColors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {showTripDatePicker && DateTimePicker && (
        <DateTimePicker
          value={getSafeDate(currentTrip?.startDate || '2026-06-13')}
          mode="date"
          display="default"
          themeVariant={isDarkMode ? 'dark' : 'light'}
          onChange={(event: any, selectedDate: Date | undefined) => {
            setShowTripDatePicker(false);
            if (selectedDate) {
              const y = selectedDate.getFullYear();
              const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const d = String(selectedDate.getDate()).padStart(2, '0');
              updateCurrentTrip('startDate', `${y}-${m}-${d}`);
            }
          }}
        />
      )}

      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <Text style={styles.headerTitle}>✈️ 旅遊指揮中心 (後勤戰略升級版)</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripSelector}>
            {trips.map(trip => (
              <TouchableOpacity key={trip.id} onPress={() => setCurrentTripId(trip.id)} style={[styles.tripTab, { backgroundColor: currentTripId === trip.id ? themeColors.primary : themeColors.card, borderColor: themeColors.border }]}>
                <Text style={{ fontSize: 13, color: currentTripId === trip.id ? '#FFF' : themeColors.text, fontWeight: currentTripId === trip.id ? 'bold' : 'normal' }}>{trip.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setIsAdding(!isAdding)} style={[styles.tripTab, { backgroundColor: '#27AE60', borderColor: '#27AE60' }]}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>➕ 新增</Text></TouchableOpacity>
          </ScrollView>

          {isAdding && (
            <View style={[styles.addTripBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <TextInput style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]} placeholder="新行程名稱" placeholderTextColor={themeColors.subText} value={newTripName} onChangeText={setNewTripName} />
              <TouchableOpacity onPress={handleCreateTrip} style={[styles.saveBtn, { backgroundColor: '#27AE60' }]}><Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>建立</Text></TouchableOpacity>
            </View>
          )}

          {!isAdding && currentTrip && (
            <View style={[styles.tripEditRow, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <SmartInput style={{ flex: 1, fontSize: 15, fontWeight: 'bold', color: themeColors.text }} value={currentTrip.name} onUpdate={(val: string) => updateCurrentTrip('name', val)} />
              {trips.length > 1 && (
                <TouchableOpacity onPress={handleDeleteTrip} style={styles.delBtn}><Text style={{ color: '#E74C3C', fontSize: 11, fontWeight: 'bold' }}>🗑️ 刪除</Text></TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.subText }]}>出發日期</Text>
          {Platform.OS === 'web' ? (
            <input 
              type="date" 
              value={formatToStrictYMD(currentTrip?.startDate)} 
              onChange={e => updateCurrentTrip('startDate', e.target.value)} 
              style={{ border: `1px solid ${themeColors.border}`, borderRadius: '6px', padding: '8px', fontSize: '13px', backgroundColor: themeColors.card, color: themeColors.text, width: '100%', boxSizing: 'border-box' }} 
            />
          ) : (
            <TouchableOpacity onPress={() => setShowTripDatePicker(true)} style={[styles.textInput, { borderColor: themeColors.border, backgroundColor: themeColors.card, justifyContent:'center' }]}><Text style={{ color: themeColors.text }}>{currentTrip?.startDate || '選擇日期'}</Text></TouchableOpacity>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border, borderLeftColor: themeColors.primary }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>🛫 航班與重要接駁資訊</Text>
          {flights.map((flight: any, index: number) => (
            <View key={flight.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.boxTag}>航班/接駁 {index + 1}</Text>
                <TouchableOpacity onPress={() => updateCurrentTrip('flights', flights.filter((f: any) => f.id !== flight.id))}><Text style={{ color: '#E74C3C', fontSize: 12 }}>🗑️ 移除</Text></TouchableOpacity>
              </View>
              
              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>航空公司</Text><SmartInput style={styles.cInput} placeholder="長榮航空" value={flight.airline} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'airline', v)} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>航班號碼</Text><SmartInput style={styles.cInput} placeholder="BR87" value={flight.flightNo} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'flightNo', v)} /></View>
              </View>

              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>出發時間</Text><SmartInput style={styles.cInput} placeholder="23:40" value={flight.depTime} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'depTime', v)} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>抵達時間</Text><SmartInput style={styles.cInput} placeholder="07:15" value={flight.arrTime} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'arrTime', v)} /></View>
              </View>

              <View style={styles.compactRow}>
                <View style={styles.thirdCol}><Text style={styles.cLabel}>航廈</Text><SmartInput style={styles.cInput} placeholder="T2" value={flight.terminal} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'terminal', v)} /></View>
                <View style={styles.thirdCol}><Text style={styles.cLabel}>登機門</Text><SmartInput style={styles.cInput} placeholder="B5" value={flight.gate} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'gate', v)} /></View>
                <View style={styles.thirdCol}><Text style={styles.cLabel}>座位號碼</Text><SmartInput style={styles.cInput} placeholder="22K" value={flight.seat} onUpdate={(v: string) => handleUpdateFlight(flight.id, 'seat', v)} /></View>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={handleAddFlight} style={[styles.addBtn, { borderColor: themeColors.primary }]}><Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 12 }}>+ 新增深度航班資訊</Text></TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border, borderLeftColor: '#1ABC9C' }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>🏨 住宿預訂與入住憑證</Text>
          {hotels.map((hotel: any, index: number) => (
            <View key={hotel.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.boxTag, {color:'#1ABC9C'}]}>住宿飯店 {index + 1}</Text>
                <TouchableOpacity onPress={() => updateCurrentTrip('hotels', hotels.filter((h: any) => h.id !== hotel.id))}><Text style={{ color: '#E74C3C', fontSize: 12 }}>🗑️ 移除</Text></TouchableOpacity>
              </View>

              <View style={{ marginBottom: 6 }}><Text style={styles.cLabel}>飯店名稱 / 地址座標</Text><SmartInput style={styles.cInput} placeholder="飯店名稱與地址" value={hotel.hotelName} onUpdate={(v: string) => handleUpdateHotel(hotel.id, 'hotelName', v)} /></View>

              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>入住日期</Text><SmartInput style={styles.cInput} placeholder="YYYY-MM-DD" value={hotel.checkInDate} onUpdate={(v: string) => handleUpdateHotel(hotel.id, 'checkInDate', v)} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>退房日期</Text><SmartInput style={styles.cInput} placeholder="YYYY-MM-DD" value={hotel.checkOutDate} onUpdate={(v: string) => handleUpdateHotel(hotel.id, 'checkOutDate', v)} /></View>
              </View>

              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>入住時間 / 訂房確認代碼</Text><SmartInput style={styles.cInput} placeholder="代碼: #8472910" value={hotel.confCode} onUpdate={(v: string) => handleUpdateHotel(hotel.id, 'confCode', v)} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>飯店連絡電話</Text><SmartInput style={styles.cInput} placeholder="+44 20 7123 4567" value={hotel.phone} onUpdate={(v: string) => handleUpdateHotel(hotel.id, 'phone', v)} /></View>
              </View>

              <View style={{ marginTop: 2 }}><Text style={styles.cLabel}>入住備註 (如：可先寄放行李、附早餐)</Text><SmartInput style={styles.cInput} placeholder="注意事項備註..." value={hotel.notes} onUpdate={(v: string) => handleUpdateHotel(hotel.id, 'notes', v)} /></View>
            </View>
          ))}
          <TouchableOpacity onPress={handleAddHotel} style={[styles.addBtn, { borderColor: '#1ABC9C' }]}><Text style={{ color: '#1ABC9C', fontWeight: 'bold', fontSize: 12 }}>+ 新增豪華住宿資訊</Text></TouchableOpacity>
        </View>

        <View style={[styles.weatherCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={{ fontSize: 26 }}>{todayWeather ? todayWeather.icon : '☁️'}</Text>
          <View style={{ marginLeft: 10, flex:1 }}>
            <Text style={{ fontSize: 12, color: themeColors.subText, fontWeight:'bold' }}>首日氣象建議</Text>
            <Text style={{ fontSize: 14, color: themeColors.text, fontWeight:'bold', marginTop:2 }}>{todayWeather && todayWeather.tempMax !== '--' ? `${todayWeather.tempMin} ~ ${todayWeather.tempMax}°C (降雨 ${todayWeather.pop}%)` : '尚無天氣預報'}</Text>
            <Text style={{ fontSize: 11, color: themeColors.text, marginTop:4, lineHeight:15 }}>💡 {getWeatherSuggestion()}</Text>
          </View>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 15, paddingTop: Platform.OS === 'web' ? 15 : 40, borderBottomWidth:1, borderColor: '#EEE' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', textAlign:'center' },
  content: { flex: 1, padding: 10 },
  tripSelector: { flexDirection: 'row', marginBottom: 6 },
  tripTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, marginRight: 6, justifyContent: 'center' },
  addTripBox: { flexDirection: 'row', padding: 6, borderRadius: 8, borderWidth: 1, marginTop: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, height: 32, fontSize: 13 },
  saveBtn: { paddingHorizontal: 12, justifyContent: 'center', borderRadius: 6, marginLeft: 6 },
  tripEditRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, padding: 6, borderRadius: 8, borderWidth: 1 },
  delBtn: { backgroundColor: 'rgba(231, 76, 60, 0.1)', padding: 5, borderRadius: 6 },
  card: { padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderLeftWidth: 4 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  textInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, height: 36 },
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  col: { flex: 1, marginHorizontal: 2 },
  thirdCol: { width: '32%', marginHorizontal: 1 },
  cLabel: { fontSize: 9, fontWeight: 'bold', color: '#999', marginBottom: 2 },
  cInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 4, paddingHorizontal: 6, height: 26, fontSize: 11, backgroundColor: '#FFF' },
  itemBox: { padding: 8, borderRadius: 8, marginBottom: 8, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  boxTag: { fontSize: 11, fontWeight: 'bold', color: '#F78FB3' },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', padding: 8, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  weatherCard: { padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' }
});