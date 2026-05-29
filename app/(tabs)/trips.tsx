// 檔案路徑: D:\TravelApp\app\(tabs)\trips.tsx
// 版本紀錄: v2.1.0 (AI版面優化升級：新增出發/目的地 + 移除登機門 + 欄位視覺放大)

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (e) {}
}

const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

// 🛡️ 終極日期防護罩
const getSafeDate = (dateStr: any) => {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; 
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? new Date() : date;
  }
  return new Date();
};

const formatToStrictYMD = (dateStr: any) => {
  const d = getSafeDate(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 🚀 智慧型輸入框
const SmartInput = ({ value, onUpdate, placeholder, style, keyboardType = 'default' }: any) => {
  const [localVal, setLocalVal] = useState(value || '');
  
  useEffect(() => {
    setLocalVal(value || '');
  }, [value]);

  const handleSave = () => {
    if (localVal !== value) onUpdate(localVal);
  };

  return (
    <TextInput
      style={style}
      value={localVal}
      onChangeText={setLocalVal}
      onBlur={handleSave}
      onEndEditing={handleSave}
      placeholder={placeholder}
      placeholderTextColor="#AAA"
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
  
  const [isScanning, setIsScanning] = useState(false);

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

  const updateTripData = (targetTripId: string, field: string, value: any) => {
    setTrips(prev => prev.map(t => (t.id === targetTripId ? { ...t, [field]: value } : t)));
  };

  const handleCreateTrip = () => {
    if (!newTripName.trim()) return;
    const newTrip = { 
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9), 
      name: newTripName, startDate: '2026-06-13', budget: '50000', flights: [], hotels: [] 
    };
    setTrips(prev => [...prev, newTrip]); 
    setCurrentTripId(newTrip.id); 
    setNewTripName(''); 
    setIsAdding(false);
  };

  const handleDeleteTrip = () => {
    const targetIdToDelete = currentTripId; 
    const confirmDelete = () => {
      setTrips(prev => {
        const n = prev.filter(t => t.id !== targetIdToDelete);
        if (n.length > 0) {
          setCurrentTripId(n[0].id); 
          return n;
        } else {
          const defaultTrip = { id: Date.now().toString() + Math.random().toString(36).substring(2, 9), name: '新行程', startDate: '2026-06-13', budget: '0', flights: [], hotels: [] };
          setCurrentTripId(defaultTrip.id);
          return [defaultTrip];
        }
      });
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
    const tripId = currentTrip?.id;
    if (!tripId) return;
    setTrips(prev => prev.map(t => {
      if (t.id === tripId) {
        return { 
          ...t, 
          // 新增 depLocation, arrLocation，移除 gate
          flights: [...(t.flights || []), { id: Date.now().toString() + Math.random().toString(36).substring(2, 9), date: '', airline: '', flightNo: '', depLocation: '', arrLocation: '', depTime: '', arrTime: '', terminal: '', seat: '' }] 
        };
      }
      return t;
    }));
  };
  
  const handleUpdateFlight = (tripId: string, flightId: string, field: string, value: string) => {
    setTrips(prev => prev.map(t => {
      if (t.id === tripId) {
        return { ...t, flights: (t.flights || []).map((f: any) => f.id === flightId ? { ...f, [field]: value } : f) };
      }
      return t;
    }));
  };

  const handleRemoveFlight = (tripId: string, flightId: string) => {
    setTrips(prev => prev.map(t => 
      t.id === tripId ? { ...t, flights: (t.flights || []).filter((f: any) => f.id !== flightId) } : t
    ));
  };

  const hotels = currentTrip?.hotels || [];
  
  const handleAddHotel = () => {
    const tripId = currentTrip?.id;
    if (!tripId) return;
    setTrips(prev => prev.map(t => {
      if (t.id === tripId) {
        return { 
          ...t, 
          hotels: [...(t.hotels || []), { id: Date.now().toString() + Math.random().toString(36).substring(2, 9), hotelName: '', checkInDate: '', checkOutDate: '', checkInTime: '15:00', confCode: '', phone: '', notes: '' }] 
        };
      }
      return t;
    }));
  };

  const handleUpdateHotel = (tripId: string, hotelId: string, field: string, value: string) => {
    setTrips(prev => prev.map(t => {
      if (t.id === tripId) {
        return { ...t, hotels: (t.hotels || []).map((h: any) => h.id === hotelId ? { ...h, [field]: value } : h) };
      }
      return t;
    }));
  };

  const handleRemoveHotel = (tripId: string, hotelId: string) => {
    setTrips(prev => prev.map(t => 
      t.id === tripId ? { ...t, hotels: (t.hotels || []).filter((h: any) => h.id !== hotelId) } : t
    ));
  };

  // 🤖 整合 AI 憑證掃描功能 
  const handleAIReceiptScan = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.5,
        base64: true
      });
      if (result.canceled || !result.assets || !result.assets[0].base64) return;

      const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!API_KEY) {
        Alert.alert('錯誤', '找不到 Gemini API 金鑰');
        return;
      }

      setIsScanning(true);
      // 更新 Prompt：加入 出發地/目的地，移除登機門
      const prompt = `你是一個專業助理。請分析這張預訂憑證(機票或住宿)。
請回傳一個 JSON 陣列 (Array)。
若是機票，陣列內請放入物件: {"type": "flight", "date": "YYYY-MM-DD", "airline": "航空公司", "flightNo": "航班號", "depLocation": "出發地(如:台北/TPE)", "arrLocation": "目的地(如:上海/PVG)", "depTime": "HH:MM", "arrTime": "HH:MM", "terminal": "航廈", "seat": "座位"}。
若是住宿，陣列內請放入物件: {"type": "hotel", "hotelName": "飯店名稱與地址", "checkInDate": "YYYY-MM-DD", "checkOutDate": "YYYY-MM-DD", "checkInTime": "HH:MM", "confCode": "確認代碼", "phone": "電話", "notes": "備註"}。
如果圖片內有「多段航程(例如轉機或來回票)」或「多間房間/多個住宿」，請全部擷取出來，並作為獨立的物件放入陣列中。
找不到的欄位請留空字串。嚴格只輸出一個 JSON 陣列格式，不要包含其他說明文字或標籤。`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: result.assets[0].base64 } }] }]
          })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      let textResponse = data.candidates[0].content.parts[0].text;
      textResponse = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const jsonMatch = textResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('AI 回傳格式錯誤或遺失 JSON 陣列');

      const parsedArray = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsedArray)) throw new Error('AI 回傳的不是陣列格式');

      const newFlights: any[] = [];
      const newHotels: any[] = [];

      parsedArray.forEach(parsed => {
        if (parsed.type === 'flight') {
          newFlights.push({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            date: parsed.date || '',
            airline: parsed.airline || '',
            flightNo: parsed.flightNo || '',
            depLocation: parsed.depLocation || '', // 接收出發地
            arrLocation: parsed.arrLocation || '', // 接收目的地
            depTime: parsed.depTime || '',
            arrTime: parsed.arrTime || '',
            terminal: parsed.terminal || '',
            seat: parsed.seat || '' // 登機門移除
          });
        } else if (parsed.type === 'hotel') {
          newHotels.push({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
            hotelName: parsed.hotelName || '',
            checkInDate: parsed.checkInDate || '',
            checkOutDate: parsed.checkOutDate || '',
            checkInTime: parsed.checkInTime || '15:00',
            confCode: parsed.confCode || '',
            phone: parsed.phone || '',
            notes: parsed.notes || ''
          });
        }
      });

      if (newFlights.length > 0 || newHotels.length > 0) {
        const tripId = currentTrip?.id;
        if (tripId) {
          setTrips(prev => prev.map(t => {
            if (t.id === tripId) {
              return {
                ...t,
                flights: [...(t.flights || []), ...newFlights],
                hotels: [...(t.hotels || []), ...newHotels]
              };
            }
            return t;
          }));
        }

        const msg = `已自動新增 ${newFlights.length} 筆航班，${newHotels.length} 筆住宿！`;
        if (Platform.OS !== 'web') Alert.alert('✅ 掃描成功', msg);
        else alert(`✅ 掃描成功！${msg}`);
      } else {
        throw new Error('未辨識到任何航班或住宿資訊。');
      }

    } catch (err: any) {
      if (Platform.OS !== 'web') Alert.alert('❌ 掃描失敗', err.message);
      else alert(`❌ 掃描失敗: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
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
            if (selectedDate && currentTrip) {
              const y = selectedDate.getFullYear();
              const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const d = String(selectedDate.getDate()).padStart(2, '0');
              updateTripData(currentTrip.id, 'startDate', `${y}-${m}-${d}`);
            }
          }}
        />
      )}

      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <Text style={styles.headerTitle}>✈️ 旅遊指揮中心 (防彈解析升級版)</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tripSelector}>
            {trips.map(trip => (
              <TouchableOpacity 
                key={trip.id} 
                onPress={() => {
                  Keyboard.dismiss(); 
                  setTimeout(() => setCurrentTripId(trip.id), 50); 
                }} 
                style={[styles.tripTab, { backgroundColor: currentTripId === trip.id ? themeColors.primary : themeColors.card, borderColor: themeColors.border }]}
              >
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
              <SmartInput style={{ flex: 1, fontSize: 15, fontWeight: 'bold', color: themeColors.text }} value={currentTrip.name} onUpdate={(val: string) => updateTripData(currentTrip.id, 'name', val)} />
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
              onChange={e => { if (currentTrip) updateTripData(currentTrip.id, 'startDate', e.target.value); }} 
              style={{ border: `1px solid ${themeColors.border}`, borderRadius: '6px', padding: '8px', fontSize: '13px', backgroundColor: themeColors.card, color: themeColors.text, width: '100%', boxSizing: 'border-box' }} 
            />
          ) : (
            <TouchableOpacity onPress={() => setShowTripDatePicker(true)} style={[styles.textInput, { borderColor: themeColors.border, backgroundColor: themeColors.card, justifyContent:'center' }]}><Text style={{ color: themeColors.text }}>{currentTrip?.startDate || '選擇日期'}</Text></TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={handleAIReceiptScan} style={[styles.aiScanBtn, { backgroundColor: isScanning ? '#E67E22' : '#3498DB', borderColor: themeColors.border }]} disabled={isScanning}>
          {isScanning ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>正在讀取並分析憑證...</Text>
            </View>
          ) : (
            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>🤖 AI 智能掃描憑證 (機票/住宿)</Text>
          )}
        </TouchableOpacity>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border, borderLeftColor: themeColors.primary }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>🛫 航班與重要接駁資訊</Text>
          {flights.map((flight: any, index: number) => (
            <View key={flight.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.boxTag}>航班/接駁 {index + 1}</Text>
                <TouchableOpacity onPress={() => { if(currentTrip) handleRemoveFlight(currentTrip.id, flight.id); }}><Text style={{ color: '#E74C3C', fontSize: 12 }}>🗑️ 移除</Text></TouchableOpacity>
              </View>
              
              {/* Row 1: 航班基本資訊 */}
              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>航班日期</Text><SmartInput style={styles.cInput} placeholder="YYYY-MM-DD" value={flight.date} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'date', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>航空公司</Text><SmartInput style={styles.cInput} placeholder="長榮航空" value={flight.airline} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'airline', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>航班號碼</Text><SmartInput style={styles.cInput} placeholder="BR87" value={flight.flightNo} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'flightNo', v); }} /></View>
              </View>

              {/* Row 2: 出發資訊 (地點佔2，時間佔1，寬度更舒適) */}
              <View style={styles.compactRow}>
                <View style={[styles.col, { flex: 2 }]}><Text style={styles.cLabel}>出發地</Text><SmartInput style={[styles.cInput, { color: '#2980B9', fontWeight: 'bold' }]} placeholder="台北 (TPE)" value={flight.depLocation} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'depLocation', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>出發時間</Text><SmartInput style={styles.cInput} placeholder="23:40" value={flight.depTime} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'depTime', v); }} /></View>
              </View>

              {/* Row 3: 抵達資訊 */}
              <View style={styles.compactRow}>
                <View style={[styles.col, { flex: 2 }]}><Text style={styles.cLabel}>目的地</Text><SmartInput style={[styles.cInput, { color: '#D35400', fontWeight: 'bold' }]} placeholder="巴黎 (CDG)" value={flight.arrLocation} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'arrLocation', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>抵達時間</Text><SmartInput style={styles.cInput} placeholder="07:15" value={flight.arrTime} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'arrTime', v); }} /></View>
              </View>

              {/* Row 4: 航廈與座位 */}
              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>航廈</Text><SmartInput style={styles.cInput} placeholder="T2" value={flight.terminal} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'terminal', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>座位號碼</Text><SmartInput style={styles.cInput} placeholder="22K" value={flight.seat} onUpdate={(v: string) => { if(currentTrip) handleUpdateFlight(currentTrip.id, flight.id, 'seat', v); }} /></View>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={handleAddFlight} style={[styles.addBtn, { borderColor: themeColors.primary }]}><Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 12 }}>+ 手動新增航班資訊</Text></TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border, borderLeftColor: '#1ABC9C' }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>🏨 住宿預訂與入住憑證</Text>
          {hotels.map((hotel: any, index: number) => (
            <View key={hotel.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.boxTag, {color:'#1ABC9C'}]}>住宿飯店 {index + 1}</Text>
                <TouchableOpacity onPress={() => { if(currentTrip) handleRemoveHotel(currentTrip.id, hotel.id); }}><Text style={{ color: '#E74C3C', fontSize: 12 }}>🗑️ 移除</Text></TouchableOpacity>
              </View>

              <View style={{ marginBottom: 8, paddingHorizontal: 4 }}><Text style={styles.cLabel}>飯店名稱 / 地址座標</Text><SmartInput style={styles.cInput} placeholder="飯店名稱與地址" value={hotel.hotelName} onUpdate={(v: string) => { if(currentTrip) handleUpdateHotel(currentTrip.id, hotel.id, 'hotelName', v); }} /></View>

              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>入住日期</Text><SmartInput style={styles.cInput} placeholder="YYYY-MM-DD" value={hotel.checkInDate} onUpdate={(v: string) => { if(currentTrip) handleUpdateHotel(currentTrip.id, hotel.id, 'checkInDate', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>退房日期</Text><SmartInput style={styles.cInput} placeholder="YYYY-MM-DD" value={hotel.checkOutDate} onUpdate={(v: string) => { if(currentTrip) handleUpdateHotel(currentTrip.id, hotel.id, 'checkOutDate', v); }} /></View>
              </View>

              <View style={styles.compactRow}>
                <View style={styles.col}><Text style={styles.cLabel}>入住時間 / 確認代碼</Text><SmartInput style={styles.cInput} placeholder="代碼: #8472910" value={hotel.confCode} onUpdate={(v: string) => { if(currentTrip) handleUpdateHotel(currentTrip.id, hotel.id, 'confCode', v); }} /></View>
                <View style={styles.col}><Text style={styles.cLabel}>飯店連絡電話</Text><SmartInput style={styles.cInput} placeholder="+44 20 7123 4567" value={hotel.phone} onUpdate={(v: string) => { if(currentTrip) handleUpdateHotel(currentTrip.id, hotel.id, 'phone', v); }} /></View>
              </View>

              <View style={{ marginTop: 8, paddingHorizontal: 4 }}><Text style={styles.cLabel}>入住備註 (如：可先寄放行李、附早餐)</Text><SmartInput style={styles.cInput} placeholder="注意事項備註..." value={hotel.notes} onUpdate={(v: string) => { if(currentTrip) handleUpdateHotel(currentTrip.id, hotel.id, 'notes', v); }} /></View>
            </View>
          ))}
          <TouchableOpacity onPress={handleAddHotel} style={[styles.addBtn, { borderColor: '#1ABC9C' }]}><Text style={{ color: '#1ABC9C', fontWeight: 'bold', fontSize: 12 }}>+ 手動新增住宿資訊</Text></TouchableOpacity>
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
  headerTitle: { fontSize: 16, fontWeight: 'bold', textAlign:'center', color: '#FFF' },
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
  
  // 優化排版與文字大小的區塊
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  col: { flex: 1, marginHorizontal: 4 },
  cLabel: { fontSize: 11, fontWeight: 'bold', color: '#888', marginBottom: 4 }, // 標籤字體加大
  cInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 6, paddingHorizontal: 8, height: 32, fontSize: 13, backgroundColor: '#FFF' }, // 輸入框加高、字體加大
  
  itemBox: { padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  boxTag: { fontSize: 12, fontWeight: 'bold', color: '#F78FB3' },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  weatherCard: { padding: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  aiScanBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12, borderWidth: 1, elevation: 2 }
});