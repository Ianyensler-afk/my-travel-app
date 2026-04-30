// 檔案路徑: D:\TravelApp\app\(tabs)\trips.tsx
// 版本紀錄: v1.6.0 (指揮中心大升級：支援多筆航班/住宿新增、高質感 UI、原生日期選擇器)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

// 動態載入日期選擇器
let DateTimePicker: any; 
if (Platform.OS !== 'web') { DateTimePicker = require('@react-native-community/datetimepicker').default; }

const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

export default function TripsScreen() {
  const { trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();
  
  const [isAdding, setIsAdding] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  
  // 🌟 Trip 的出發日選擇器
  const [showTripDatePicker, setShowTripDatePicker] = useState(false);
  
  // 🌟 Hotel 的日期選擇器狀態 (記錄目前正在編輯哪一個飯店的哪一個欄位)
  const [hotelDateTarget, setHotelDateTarget] = useState<{id: string, field: 'checkInDate' | 'checkOutDate', currentDate: string} | null>(null);

  const [todayWeather, setTodayWeather] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    const loadWeather = async () => {
      try {
        const weatherCache = await AsyncStorage.getItem(`@travel_db_weather_${String(currentTripId)}`);
        if (weatherCache) {
          const weatherData = JSON.parse(weatherCache);
          if (weatherData["1"] && typeof weatherData["1"] === 'object') {
            setTodayWeather(weatherData["1"]);
          } else {
            setTodayWeather(null);
          }
        } else {
          setTodayWeather(null);
        }
      } catch (e) { console.warn("首頁天氣讀取失敗", e); }
    };
    loadWeather();
  }, [currentTripId]));

  const getWeatherSuggestion = () => {
    if (!todayWeather) return "尚無天氣資料，請先至「行程地圖」排定景點產生預報！";
    let tip = "";
    if (todayWeather.tempMin < 15) tip += "氣溫偏低，建議備妥保暖外套與衣物！";
    else if (todayWeather.tempMax > 28) tip += "天氣炎熱，記得準備短袖與防曬用品！";
    else tip += "氣溫舒適，帶件薄外套即可完美應對！";
    if (todayWeather.pop > 40) tip += " 降雨機率較高，出門別忘了帶把傘喔 ☔！";
    return tip;
  };

  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];

  const updateCurrentTrip = (field: string, value: any) => {
    setTrips(trips.map(t => t.id === currentTripId ? { ...t, [field]: value } : t));
  };

  const handleCreateTrip = () => {
    if (!newTripName.trim()) return;
    const newTrip = { 
      id: Date.now().toString(), name: newTripName, startDate: '2026-06-13', budget: '50000',
      flights: [], hotels: [] // 初始化空陣列
    };
    setTrips([...trips, newTrip]);
    setCurrentTripId(newTrip.id);
    setNewTripName(''); setIsAdding(false);
  };

  // ================= 🌟 航班陣列管理邏輯 =================
  const flights = currentTrip?.flights || [];
  const handleAddFlight = () => {
    updateCurrentTrip('flights', [...flights, { id: Date.now().toString(), flightNo: '', terminal: '' }]);
  };
  const handleUpdateFlight = (id: string, field: string, value: string) => {
    updateCurrentTrip('flights', flights.map((f: any) => f.id === id ? { ...f, [field]: value } : f));
  };
  const handleRemoveFlight = (id: string) => {
    updateCurrentTrip('flights', flights.filter((f: any) => f.id !== id));
  };

  // ================= 🌟 住宿陣列管理邏輯 =================
  const hotels = currentTrip?.hotels || [];
  const handleAddHotel = () => {
    updateCurrentTrip('hotels', [...hotels, { id: Date.now().toString(), hotelName: '', checkInDate: '', checkOutDate: '' }]);
  };
  const handleUpdateHotel = (id: string, field: string, value: string) => {
    updateCurrentTrip('hotels', hotels.map((h: any) => h.id === id ? { ...h, [field]: value } : h));
  };
  const handleRemoveHotel = (id: string) => {
    updateCurrentTrip('hotels', hotels.filter((h: any) => h.id !== id));
  };

  return (
    <KeyboardWrapper style={[styles.container, {backgroundColor: themeColors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {/* 頂部標題 */}
      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <Text style={styles.headerTitle}>✈️ 旅遊指揮中心</Text>
        <Text style={styles.headerSub}>管理您的所有美好旅程</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* 1. 行程切換列 */}
        <View style={{ marginBottom: 20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripSelector}>
            {trips.map(trip => (
              <TouchableOpacity key={trip.id} onPress={() => setCurrentTripId(trip.id)}
                style={[styles.tripTab, { backgroundColor: currentTripId === trip.id ? themeColors.primary : themeColors.card, borderColor: currentTripId === trip.id ? themeColors.primary : themeColors.border }]}
              >
                <Text style={{ color: currentTripId === trip.id ? '#FFF' : themeColors.text, fontWeight: currentTripId === trip.id ? 'bold' : 'normal' }}>
                  {trip.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setIsAdding(!isAdding)} style={[styles.tripTab, { backgroundColor: '#27AE60', borderColor: '#27AE60' }]}>
              <Text style={{ color: '#FFF', fontWeight: 'bold' }}>➕ 新增</Text>
            </TouchableOpacity>
          </ScrollView>

          {isAdding && (
            <View style={[styles.addTripBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <TextInput style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]} placeholder="輸入新行程名稱" placeholderTextColor={themeColors.subText} value={newTripName} onChangeText={setNewTripName} />
              <TouchableOpacity onPress={handleCreateTrip} style={[styles.saveBtn, { backgroundColor: '#27AE60' }]}><Text style={{ color: '#FFF', fontWeight: 'bold' }}>建立</Text></TouchableOpacity>
            </View>
          )}
          {/* 🌟 新增：當前行程專屬管理面板 (重新命名與刪除) */}
          {!isAdding && currentTrip && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: themeColors.card, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: themeColors.border }}>
              <TextInput
                style={{ flex: 1, fontSize: 16, fontWeight: 'bold', color: themeColors.text, paddingHorizontal: 5 }}
                value={currentTrip.name}
                onChangeText={(val) => updateCurrentTrip('name', val)}
                placeholder="點擊修改行程名稱..."
                placeholderTextColor={themeColors.subText}
              />
              {/* 防呆機制：至少保留一個行程，不能全刪 */}
              {trips.length > 1 && (
                <TouchableOpacity
                  onPress={() => {
                    if(confirm("確定要刪除整個行程嗎？資料無法找回喔！")) {
                      const newTrips = trips.filter(t => t.id !== currentTripId);
                      setTrips(newTrips);
                      setCurrentTripId(newTrips[0].id);
                    }
                  }} 
                  style={{ backgroundColor: '#FADBD8', padding: 8, borderRadius: 10 }}
                >
                  <Text style={{ color: '#E74C3C', fontWeight: 'bold', fontSize: 12 }}>🗑️ 刪除</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
        </View>

        {/* 2. 出發日期 */}
        <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={[styles.label, { color: themeColors.subText }]}>出發日期</Text>
          {Platform.OS === 'web' ? (
            <input type="date" value={currentTrip?.startDate || ''} onChange={(e) => updateCurrentTrip('startDate', e.target.value)} style={{ border: `1px solid ${themeColors.border}`, borderRadius: '8px', padding: '10px', fontSize: '15px', backgroundColor: themeColors.card, color: themeColors.text, width: '100%', boxSizing: 'border-box' }} />
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowTripDatePicker(true)} style={[styles.textInput, { justifyContent: 'center', borderColor: themeColors.border, backgroundColor: themeColors.card }]}>
                <Text style={{ color: themeColors.text, fontSize: 15 }}>{currentTrip?.startDate || '選擇日期'}</Text>
              </TouchableOpacity>
              {showTripDatePicker && DateTimePicker && (
                <DateTimePicker value={new Date(currentTrip?.startDate || Date.now())} mode="date" display="default" onChange={(e: any, d: Date) => { setShowTripDatePicker(false); if (d) { const fmt = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; updateCurrentTrip('startDate', fmt); } }} />
              )}
            </>
          )}
        </View>

        {/* ================= 3. 航班與接駁 (多筆支援) ================= */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderLeftWidth: 4, borderLeftColor: '#3498DB' }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 15 }]}>🛫 航班 & 接駁資訊</Text>
          
          {flights.map((flight: any, index: number) => (
            <View key={flight.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                <Text style={{fontSize: 12, fontWeight: 'bold', color: '#3498DB'}}>接駁 {index + 1}</Text>
                <TouchableOpacity onPress={() => handleRemoveFlight(flight.id)}><Text style={{color: '#E74C3C', fontSize: 16}}>🗑️</Text></TouchableOpacity>
              </View>
              
              <View style={styles.compactRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>航班/車次號碼</Text>
                  <TextInput style={[styles.compactInputBox, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.card }]} placeholder="例: BR87" placeholderTextColor={themeColors.subText} value={flight.flightNo} onChangeText={(val) => handleUpdateFlight(flight.id, 'flightNo', val)} />
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>航廈 / 登機口</Text>
                  <TextInput style={[styles.compactInputBox, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.card }]} placeholder="例: T2" placeholderTextColor={themeColors.subText} value={flight.terminal} onChangeText={(val) => handleUpdateFlight(flight.id, 'terminal', val)} />
                </View>
              </View>
            </View>
          ))}
          
          <TouchableOpacity onPress={handleAddFlight} style={[styles.addBtnOutline, { borderColor: '#3498DB' }]}>
            <Text style={{ color: '#3498DB', fontWeight: 'bold' }}>+ 新增航班/接駁</Text>
          </TouchableOpacity>
        </View>

        {/* ================= 4. 住宿預訂 (多筆支援 + 原生日曆) ================= */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderLeftWidth: 4, borderLeftColor: '#1ABC9C' }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 15 }]}>🏨 住宿預訂清單</Text>
          
          {hotels.map((hotel: any, index: number) => (
            <View key={hotel.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                <Text style={{fontSize: 12, fontWeight: 'bold', color: '#1ABC9C'}}>住宿 {index + 1}</Text>
                <TouchableOpacity onPress={() => handleRemoveHotel(hotel.id)}><Text style={{color: '#E74C3C', fontSize: 16}}>🗑️</Text></TouchableOpacity>
              </View>

              <View style={{marginBottom: 10}}>
                <Text style={styles.compactLabel}>住宿名稱/地址</Text>
                <TextInput style={[styles.compactInputBox, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.card }]} placeholder="飯店名稱或 Airbnb" placeholderTextColor={themeColors.subText} value={hotel.hotelName} onChangeText={(val) => handleUpdateHotel(hotel.id, 'hotelName', val)} />
              </View>

              <View style={styles.compactRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>入住 (Check-in)</Text>
                  {Platform.OS === 'web' ? (
                    <input type="date" value={hotel.checkInDate || ''} onChange={(e) => handleUpdateHotel(hotel.id, 'checkInDate', e.target.value)} style={{ border: `1px solid ${themeColors.border}`, borderRadius: '8px', padding: '8px', fontSize: '13px', backgroundColor: themeColors.card, color: themeColors.text, width: '100%', boxSizing: 'border-box' }} />
                  ) : (
                    <TouchableOpacity onPress={() => setHotelDateTarget({id: hotel.id, field: 'checkInDate', currentDate: hotel.checkInDate})} style={[styles.compactInputBox, {justifyContent: 'center', backgroundColor: themeColors.card, borderColor: themeColors.border}]}>
                      <Text style={{color: hotel.checkInDate ? themeColors.text : themeColors.subText, fontSize: 13}}>{hotel.checkInDate || '選擇日期'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>退房 (Check-out)</Text>
                  {Platform.OS === 'web' ? (
                    <input type="date" value={hotel.checkOutDate || ''} onChange={(e) => handleUpdateHotel(hotel.id, 'checkOutDate', e.target.value)} style={{ border: `1px solid ${themeColors.border}`, borderRadius: '8px', padding: '8px', fontSize: '13px', backgroundColor: themeColors.card, color: themeColors.text, width: '100%', boxSizing: 'border-box' }} />
                  ) : (
                    <TouchableOpacity onPress={() => setHotelDateTarget({id: hotel.id, field: 'checkOutDate', currentDate: hotel.checkOutDate})} style={[styles.compactInputBox, {justifyContent: 'center', backgroundColor: themeColors.card, borderColor: themeColors.border}]}>
                      <Text style={{color: hotel.checkOutDate ? themeColors.text : themeColors.subText, fontSize: 13}}>{hotel.checkOutDate || '選擇日期'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={handleAddHotel} style={[styles.addBtnOutline, { borderColor: '#1ABC9C' }]}>
            <Text style={{ color: '#1ABC9C', fontWeight: 'bold' }}>+ 新增住宿預訂</Text>
          </TouchableOpacity>
        </View>

        {/* 5. 氣象與穿搭建議 */}
        <View style={[styles.weatherCard, { backgroundColor: isDarkMode ? '#1A252C' : '#EAF2F8', borderColor: '#3498DB' }]}>
          <View style={styles.weatherHeader}>
            <Text style={{ fontSize: 40 }}>{todayWeather ? todayWeather.icon : '☁️'}</Text>
            <View style={{ marginLeft: 15 }}>
              <Text style={[styles.weatherTitle, { color: isDarkMode ? '#AED6F1' : '#2980B9' }]}>當地氣象概況 (首日)</Text>
              <Text style={[styles.weatherTemp, { color: isDarkMode ? '#FFF' : '#2C3E50' }]}>
                {todayWeather ? `氣溫 ${todayWeather.tempMin} ~ ${todayWeather.tempMax}°C` : '氣溫估算中...'}
              </Text>
            </View>
          </View>
          <View style={styles.weatherDivider} />
          <View style={styles.weatherDetails}>
            <Text style={{ fontSize: 14, color: isDarkMode ? '#D6EAF8' : '#34495E', marginBottom: 5 }}>☔ 降雨機率：<Text style={{ fontWeight: 'bold' }}>{todayWeather ? `${todayWeather.pop}%` : '--%'}</Text></Text>
            <Text style={{ fontSize: 14, color: isDarkMode ? '#D6EAF8' : '#34495E', lineHeight: 20 }}>💡 <Text style={{ fontWeight: 'bold' }}>穿搭建議：</Text>{getWeatherSuggestion()}</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 🌟 手機端共用的飯店 DatePicker */}
      {hotelDateTarget && DateTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker 
          value={hotelDateTarget.currentDate ? new Date(hotelDateTarget.currentDate) : new Date()} 
          mode="date" display="default" 
          onChange={(event: any, selectedDate: Date) => { 
            // 選擇完畢或取消都先關閉 picker
            setHotelDateTarget(null); 
            if (event.type === 'set' && selectedDate) {
              const formatted = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
              handleUpdateHotel(hotelDateTarget.id, hotelDateTarget.field, formatted);
            }
          }} 
        />
      )}

    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 25, paddingTop: Platform.OS === 'web' ? 30 : 60, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 5 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 5 },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  content: { flex: 1, padding: 15 },
  
  tripSelector: { flexDirection: 'row', marginBottom: 10 },
  tripTab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, marginRight: 10, justifyContent: 'center' },
  addTripBox: { flexDirection: 'row', padding: 10, borderRadius: 12, borderWidth: 1, marginTop: 5 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 40, marginRight: 10 },
  saveBtn: { paddingHorizontal: 15, justifyContent: 'center', borderRadius: 8 },
  
  card: { padding: 20, borderRadius: 15, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  textInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 45, fontSize: 15 },
  
  // 🌟 修正左右並排的關鍵樣式
  compactRow: { flexDirection: 'row', justifyContent: 'space-between' },
  halfCol: { flex: 1, marginHorizontal: 4 },
  compactLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4, color: '#888' },
  compactInputBox: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 13 },
  
  // 🌟 清單項目的卡片樣式
  itemBox: { padding: 15, borderRadius: 10, marginBottom: 12, borderWidth: 1 },
  addBtnOutline: { borderWidth: 1, borderStyle: 'dashed', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 5 },

  weatherCard: { padding: 20, borderRadius: 15, borderWidth: 1, marginBottom: 20 },
  weatherHeader: { flexDirection: 'row', alignItems: 'center' },
  weatherTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  weatherTemp: { fontSize: 22, fontWeight: 'bold' },
  weatherDivider: { height: 1, backgroundColor: 'rgba(52, 152, 219, 0.2)', marginVertical: 15 },
  weatherDetails: {}
});