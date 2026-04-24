// 檔案路徑: D:\TravelApp\app\(tabs)\trips.tsx
// 版本紀錄: v1.0.0 (全新旅遊指揮中心：行程切換、航班飯店資訊、天氣預報)

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

// 在檔案最上方 import 的地方，補上這個日期選擇器載入邏輯：
let DateTimePicker: any; 
if (Platform.OS !== 'web') { DateTimePicker = require('@react-native-community/datetimepicker').default; }
// 並新增一個狀態 const [showDatePicker, setShowDatePicker] = useState(false); 到元件內

// 避免 Web 端鍵盤視圖報錯
const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

export default function TripsScreen() {
  const { trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();
  
  // 新增行程的狀態
  const [isAdding, setIsAdding] = useState(false);
  const [newTripName, setNewTripName] = useState('');

  // 取得當前選擇的行程
  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];

  // 更新當前行程的特定欄位
  const updateCurrentTrip = (field: string, value: string) => {
    setTrips(trips.map(t => t.id === currentTripId ? { ...t, [field]: value } : t));
  };

  // 建立新行程
  const handleCreateTrip = () => {
    if (!newTripName.trim()) return;
    const newTrip = { 
      id: Date.now().toString(), 
      name: newTripName, 
      startDate: '2026-06-13', 
      budget: '50000',
      flightInfo: '',
      hotelInfo: ''
    };
    setTrips([...trips, newTrip]);
    setCurrentTripId(newTrip.id);
    setNewTripName('');
    setIsAdding(false);
  };

  // 刪除行程
  const handleDeleteTrip = (id: string) => {
    if (trips.length <= 1) {
      alert('這是最後一個行程了，無法刪除喔！');
      return;
    }
    const updatedTrips = trips.filter(t => t.id !== id);
    setTrips(updatedTrips);
    if (currentTripId === id) {
      setCurrentTripId(updatedTrips[0].id);
    }
  };

  return (
    <KeyboardWrapper style={[styles.container, {backgroundColor: themeColors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      
      {/* 頂部標題與快速切換區 */}
      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <Text style={styles.headerTitle}>✈️ 旅遊指揮中心</Text>
        <Text style={styles.headerSub}>管理您的所有美好旅程</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* 1. 行程切換列 */}
        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>切換旅程</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripSelector}>
            {trips.map(trip => (
              <TouchableOpacity 
                key={trip.id} 
                onPress={() => setCurrentTripId(trip.id)}
                style={[
                  styles.tripTab, 
                  { 
                    backgroundColor: currentTripId === trip.id ? themeColors.primary : themeColors.card,
                    borderColor: currentTripId === trip.id ? themeColors.primary : themeColors.border 
                  }
                ]}
              >
                <Text style={{ 
                  color: currentTripId === trip.id ? '#FFF' : themeColors.text, 
                  fontWeight: currentTripId === trip.id ? 'bold' : 'normal' 
                }}>
                  {trip.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setIsAdding(!isAdding)} style={[styles.tripTab, { backgroundColor: '#27AE60', borderColor: '#27AE60' }]}>
              <Text style={{ color: '#FFF', fontWeight: 'bold' }}>➕ 新增</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* 新增行程輸入框 */}
          {isAdding && (
            <View style={[styles.addTripBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <TextInput 
                style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]} 
                placeholder="輸入新行程名稱 (如: 日本跨年)" 
                placeholderTextColor={themeColors.subText}
                value={newTripName} 
                onChangeText={setNewTripName} 
              />
              <TouchableOpacity onPress={handleCreateTrip} style={[styles.saveBtn, { backgroundColor: '#27AE60' }]}>
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>建立</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 2. 當前行程核心設定卡片 */}

            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={[styles.label, { color: themeColors.subText }]}>出發日期</Text>
              
              {Platform.OS === 'web' ? (
                // 🌟 Web 版原生日期選擇器
                <input 
                  type="date" 
                  value={currentTrip?.startDate || ''} 
                  onChange={(e) => updateCurrentTrip('startDate', e.target.value)} 
                  style={{ 
                    border: `1px solid ${themeColors.border}`, borderRadius: '8px', padding: '10px', 
                    fontSize: '15px', backgroundColor: 'transparent', color: themeColors.text, 
                    width: '100%', boxSizing: 'border-box', colorScheme: isDarkMode ? 'dark' : 'light' 
                  }} 
                />
              ) : (
                // 🌟 手機版原生日期選擇器
                <>
                  <TouchableOpacity 
                    onPress={() => setShowDatePicker(true)} 
                    style={[styles.textInput, { justifyContent: 'center', borderColor: themeColors.border }]}
                  >
                    <Text style={{ color: themeColors.text, fontSize: 15 }}>
                      {currentTrip?.startDate || '選擇日期'}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && DateTimePicker && (
                    <DateTimePicker 
                      value={new Date(currentTrip?.startDate || Date.now())} 
                      mode="date" 
                      display="default" 
                      onChange={(event: any, selectedDate: Date) => { 
                        setShowDatePicker(false); 
                        if (selectedDate) {
                          const formatted = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
                          updateCurrentTrip('startDate', formatted);
                        }
                      }} 
                    />
                  )}
                </>
              )}
            </View>

        {/* 3. 航班與飯店資訊卡片 */}
        <View style={[styles.card, { backgroundColor: themeColors.card }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 15 }]}>🏠 交通與住宿</Text>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.subText }]}>🛫 飛機航班資訊</Text>
            <TextInput 
              style={[styles.textArea, { color: themeColors.text, borderColor: themeColors.border }]} 
              multiline={true} 
              numberOfLines={3}
              placeholder="例: BR87 去程 09:00 第一航廈..." 
              placeholderTextColor={themeColors.subText}
              value={currentTrip?.flightInfo} 
              onChangeText={(val) => updateCurrentTrip('flightInfo', val)} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.subText }]}>🏨 飯店名稱與地址</Text>
            <TextInput 
              style={[styles.textArea, { color: themeColors.text, borderColor: themeColors.border }]} 
              multiline={true} 
              numberOfLines={3}
              placeholder="例: 倫敦大飯店 (London Hotel)&#10;地址: 123 Baker St..." 
              placeholderTextColor={themeColors.subText}
              value={currentTrip?.hotelInfo} 
              onChangeText={(val) => updateCurrentTrip('hotelInfo', val)} 
            />
          </View>
        </View>

        {/* 4. 氣象與穿搭建議 (專屬視覺卡片) */}
        <View style={[styles.weatherCard, { backgroundColor: isDarkMode ? '#1A252C' : '#EAF2F8', borderColor: '#3498DB' }]}>
          <View style={styles.weatherHeader}>
            <Text style={{ fontSize: 40 }}>⛅</Text>
            <View style={{ marginLeft: 15 }}>
              <Text style={[styles.weatherTitle, { color: isDarkMode ? '#AED6F1' : '#2980B9' }]}>當地氣象概況</Text>
              <Text style={[styles.weatherTemp, { color: isDarkMode ? '#FFF' : '#2C3E50' }]}>氣溫 10 ~ 23°C</Text>
            </View>
          </View>
          <View style={styles.weatherDivider} />
          <View style={styles.weatherDetails}>
            <Text style={{ fontSize: 14, color: isDarkMode ? '#D6EAF8' : '#34495E', marginBottom: 5 }}>☔ 降雨機率：<Text style={{ fontWeight: 'bold' }}>0%</Text></Text>
            <Text style={{ fontSize: 14, color: isDarkMode ? '#D6EAF8' : '#34495E', lineHeight: 20 }}>💡 <Text style={{ fontWeight: 'bold' }}>穿搭建議：</Text>氣溫舒適，早晚偏涼，帶件薄外套即可完美應對！</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 25, paddingTop: Platform.OS === 'web' ? 30 : 60, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 5 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 5 },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  content: { flex: 1, padding: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, paddingLeft: 5 },
  
  tripSelector: { flexDirection: 'row', marginBottom: 10 },
  tripTab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, marginRight: 10, justifyContent: 'center' },
  addTripBox: { flexDirection: 'row', padding: 10, borderRadius: 12, borderWidth: 1, marginTop: 5 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 40, marginRight: 10 },
  saveBtn: { paddingHorizontal: 15, justifyContent: 'center', borderRadius: 8 },
  
  card: { padding: 20, borderRadius: 15, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  textInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 45, fontSize: 15 },
  textArea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingTop: 12, fontSize: 15, textAlignVertical: 'top', minHeight: 80 },

  weatherCard: { padding: 20, borderRadius: 15, borderWidth: 1, marginBottom: 20 },
  weatherHeader: { flexDirection: 'row', alignItems: 'center' },
  weatherTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  weatherTemp: { fontSize: 22, fontWeight: 'bold' },
  weatherDivider: { height: 1, backgroundColor: 'rgba(52, 152, 219, 0.2)', marginVertical: 15 },
  weatherDetails: {}
});