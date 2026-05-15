// 檔案路徑: D:\TravelApp\app\(tabs)\trips.tsx
// 版本紀錄: v1.7.4 (修復重複宣告錯誤，防彈天氣解析，100%完整無刪減版)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

export default function TripsScreen() {
  const { trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();

  const [isAdding, setIsAdding] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  const [showTripDatePicker, setShowTripDatePicker] = useState(false);
  const [hotelDateTarget, setHotelDateTarget] = useState<{ id: string; field: 'checkInDate' | 'checkOutDate'; currentDate: string } | null>(null);
  const [todayWeather, setTodayWeather] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      const loadWeather = async () => {
        try {
          const weatherCache = await AsyncStorage.getItem(`@travel_db_weather_${String(currentTripId)}`);
          if (weatherCache) {
            try {
              const weatherData = JSON.parse(weatherCache);
              // 🌟 防彈機制：確保 weatherData 是有效的物件！
              if (weatherData && typeof weatherData === 'object' && weatherData['1']) {
                setTodayWeather(weatherData['1']);
              } else {
                setTodayWeather(null);
              }
            } catch(e) { setTodayWeather(null); }
          } else {
            setTodayWeather(null);
          }
        } catch (e) {}
      };
      loadWeather();
    }, [currentTripId])
  );

  const getWeatherSuggestion = () => {
    // 🌟 修復：如果抓不到資料或日期過遠，直接給予明確提示，不再卡死
    if (!todayWeather || todayWeather.tempMax === '--') return '尚無氣象資料，請確認日期是否過遠！';
    let tip = '';
    if (todayWeather.tempMin < 15) tip += '氣溫偏低，保暖衣物！';
    else if (todayWeather.tempMax > 28) tip += '天氣炎熱，防曬注意！';
    else tip += '氣溫舒適！';
    if (todayWeather.pop > 40) tip += ' 帶傘 ☔';
    return tip;
  };

  const currentTrip = (trips && trips.length > 0) ? (trips.find(t => t.id === currentTripId) || trips[0]) : null;

  const updateCurrentTrip = (field: string, value: any) => {
    setTrips(trips.map(t => (t.id === currentTripId ? { ...t, [field]: value } : t)));
  };

  const handleCreateTrip = () => {
    if (!newTripName.trim()) return;
    const newTrip = {
      id: Date.now().toString(),
      name: newTripName,
      startDate: '2026-06-13',
      budget: '50000',
      flights: [],
      hotels: []
    };
    setTrips([...trips, newTrip]);
    setCurrentTripId(newTrip.id);
    setNewTripName('');
    setIsAdding(false);
  };

  const flights = currentTrip?.flights || [];
  const handleAddFlight = () => {
    updateCurrentTrip('flights', [...flights, { id: Date.now().toString(), flightNo: '', terminal: '' }]);
  };
  const handleUpdateFlight = (id: string, field: string, value: string) => {
    updateCurrentTrip('flights', flights.map((f: any) => (f.id === id ? { ...f, [field]: value } : f)));
  };
  const handleRemoveFlight = (id: string) => {
    updateCurrentTrip('flights', flights.filter((f: any) => f.id !== id));
  };

  const hotels = currentTrip?.hotels || [];
  const handleAddHotel = () => {
    updateCurrentTrip('hotels', [...hotels, { id: Date.now().toString(), hotelName: '', checkInDate: '', checkOutDate: '' }]);
  };
  const handleUpdateHotel = (id: string, field: string, value: string) => {
    updateCurrentTrip('hotels', hotels.map((h: any) => (h.id === id ? { ...h, [field]: value } : h)));
  };
  const handleRemoveHotel = (id: string) => {
    updateCurrentTrip('hotels', hotels.filter((h: any) => h.id !== id));
  };

  return (
    <KeyboardWrapper style={[styles.container, { backgroundColor: themeColors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <Text style={styles.headerTitle}>✈️ 旅遊指揮中心</Text>
        <Text style={styles.headerSub}>管理您的所有美好旅程</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 15 }}>
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
                <Text style={{ fontSize: 13, color: currentTripId === trip.id ? '#FFF' : themeColors.text, fontWeight: currentTripId === trip.id ? 'bold' : 'normal' }}>
                  {trip.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setIsAdding(!isAdding)} style={[styles.tripTab, { backgroundColor: '#27AE60', borderColor: '#27AE60' }]}>
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>➕ 新增</Text>
            </TouchableOpacity>
          </ScrollView>

          {isAdding && (
            <View style={[styles.addTripBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <TextInput
                style={[styles.input, { color: themeColors.text, borderColor: themeColors.border }]}
                placeholder="新行程名稱"
                placeholderTextColor={themeColors.subText}
                value={newTripName}
                onChangeText={setNewTripName}
              />
              <TouchableOpacity onPress={handleCreateTrip} style={[styles.saveBtn, { backgroundColor: '#27AE60' }]}>
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>建立</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isAdding && currentTrip && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: themeColors.card, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border }}>
              <TextInput
                style={{ flex: 1, fontSize: 15, fontWeight: 'bold', color: themeColors.text, paddingHorizontal: 5 }}
                value={currentTrip.name}
                onChangeText={val => updateCurrentTrip('name', val)}
                placeholder="點擊修改..."
                placeholderTextColor={themeColors.subText}
              />
              {trips.length > 1 && (
                <TouchableOpacity
                  onPress={() => {
                    if (confirm('確定刪除整個行程嗎？')) {
                      const newTrips = trips.filter(t => t.id !== currentTripId);
                      setTrips(newTrips);
                      setCurrentTripId(newTrips[0].id);
                    }
                  }}
                  style={{ backgroundColor: 'rgba(231, 76, 60, 0.1)', padding: 6, borderRadius: 6 }}
                >
                  <Text style={{ color: '#E74C3C', fontWeight: 'bold', fontSize: 11 }}>🗑️ 刪除</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={[styles.inputGroup, { flex: 1, marginBottom: 15 }]}>
          <Text style={[styles.label, { color: themeColors.subText }]}>出發日期</Text>
          {Platform.OS === 'web' ? (
            <input
              type="date"
              value={currentTrip?.startDate || ''}
              onChange={e => updateCurrentTrip('startDate', e.target.value)}
              style={{
                border: `1px solid ${themeColors.border}`,
                borderRadius: '6px',
                padding: '8px',
                fontSize: '13px',
                backgroundColor: themeColors.card,
                color: themeColors.text,
                width: '100%',
                boxSizing: 'border-box'
              }}
            />
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setShowTripDatePicker(true)}
                style={[styles.textInput, { justifyContent: 'center', borderColor: themeColors.border, backgroundColor: themeColors.card }]}
              >
                <Text style={{ color: themeColors.text, fontSize: 13 }}>{currentTrip?.startDate || '選擇日期'}</Text>
              </TouchableOpacity>
              {showTripDatePicker && DateTimePicker && (
                <DateTimePicker
                  value={new Date(currentTrip?.startDate || Date.now())}
                  mode="date"
                  display="default"
                  onChange={(e: any, d: Date) => {
                    setShowTripDatePicker(false);
                    if (d) {
                      const fmt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      updateCurrentTrip('startDate', fmt);
                    }
                  }}
                />
              )}
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border, borderLeftWidth: 3, borderLeftColor: themeColors.primary }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 10 }]}>🛫 航班 & 接駁</Text>
          {flights.map((flight: any, index: number) => (
            <View key={flight.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: themeColors.primary }}>接駁 {index + 1}</Text>
                <TouchableOpacity onPress={() => handleRemoveFlight(flight.id)}>
                  <Text style={{ color: '#E74C3C', fontSize: 13 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.compactRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>號碼</Text>
                  <TextInput
                    style={[styles.compactInputBox, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.card }]}
                    placeholder="BR87"
                    placeholderTextColor={themeColors.subText}
                    value={flight.flightNo}
                    onChangeText={val => handleUpdateFlight(flight.id, 'flightNo', val)}
                  />
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>航廈</Text>
                  <TextInput
                    style={[styles.compactInputBox, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.card }]}
                    placeholder="T2"
                    placeholderTextColor={themeColors.subText}
                    value={flight.terminal}
                    onChangeText={val => handleUpdateFlight(flight.id, 'terminal', val)}
                  />
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={handleAddFlight} style={[styles.addBtnOutline, { borderColor: themeColors.primary }]}>
            <Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 12 }}>+ 新增航班/接駁</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border, borderLeftWidth: 3, borderLeftColor: '#1ABC9C' }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text, marginBottom: 10 }]}>🏨 住宿預訂</Text>
          {hotels.map((hotel: any, index: number) => (
            <View key={hotel.id} style={[styles.itemBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1ABC9C' }}>住宿 {index + 1}</Text>
                <TouchableOpacity onPress={() => handleRemoveHotel(hotel.id)}>
                  <Text style={{ color: '#E74C3C', fontSize: 13 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.compactLabel}>名稱/地址</Text>
                <TextInput
                  style={[styles.compactInputBox, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.card }]}
                  placeholder="飯店名稱"
                  placeholderTextColor={themeColors.subText}
                  value={hotel.hotelName}
                  onChangeText={val => handleUpdateHotel(hotel.id, 'hotelName', val)}
                />
              </View>
              <View style={styles.compactRow}>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>入住</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={hotel.checkInDate || ''}
                      onChange={e => handleUpdateHotel(hotel.id, 'checkInDate', e.target.value)}
                      style={{
                        border: `1px solid ${themeColors.border}`,
                        borderRadius: '6px',
                        padding: '6px',
                        fontSize: '11px',
                        backgroundColor: themeColors.card,
                        color: themeColors.text,
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setHotelDateTarget({ id: hotel.id, field: 'checkInDate', currentDate: hotel.checkInDate })}
                      style={[styles.compactInputBox, { justifyContent: 'center', backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                    >
                      <Text style={{ color: hotel.checkInDate ? themeColors.text : themeColors.subText, fontSize: 11 }}>
                        {hotel.checkInDate || '選擇'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.compactLabel}>退房</Text>
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={hotel.checkOutDate || ''}
                      onChange={e => handleUpdateHotel(hotel.id, 'checkOutDate', e.target.value)}
                      style={{
                        border: `1px solid ${themeColors.border}`,
                        borderRadius: '6px',
                        padding: '6px',
                        fontSize: '11px',
                        backgroundColor: themeColors.card,
                        color: themeColors.text,
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setHotelDateTarget({ id: hotel.id, field: 'checkOutDate', currentDate: hotel.checkOutDate })}
                      style={[styles.compactInputBox, { justifyContent: 'center', backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                    >
                      <Text style={{ color: hotel.checkOutDate ? themeColors.text : themeColors.subText, fontSize: 11 }}>
                        {hotel.checkOutDate || '選擇'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={handleAddHotel} style={[styles.addBtnOutline, { borderColor: '#1ABC9C' }]}>
            <Text style={{ color: '#1ABC9C', fontWeight: 'bold', fontSize: 12 }}>+ 新增住宿預訂</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.weatherCard, { backgroundColor: isDarkMode ? '#1A252C' : themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.weatherHeader}>
            <Text style={{ fontSize: 32 }}>{todayWeather ? todayWeather.icon : '☁️'}</Text>
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.weatherTitle, { color: themeColors.subText }]}>當地氣象 (首日)</Text>
              
              <Text style={[styles.weatherTemp, { color: themeColors.text }]}>
                {todayWeather && todayWeather.tempMax !== '--' ? `${todayWeather.tempMin} ~ ${todayWeather.tempMax}°C` : '尚無氣象資料'}
              </Text>
            </View>
          </View>
          <View style={[styles.weatherDivider, { backgroundColor: themeColors.border }]} />
          <View>
            <Text style={{ fontSize: 12, color: themeColors.text, marginBottom: 3 }}>
              ☔ 降雨率：<Text style={{ fontWeight: 'bold' }}>{todayWeather && todayWeather.pop !== '--' ? `${todayWeather.pop}%` : '--%'}</Text>
            </Text>
            <Text style={{ fontSize: 12, color: themeColors.text, lineHeight: 18 }}>
              💡 <Text style={{ fontWeight: 'bold' }}>建議：</Text>
              {getWeatherSuggestion()}
            </Text>
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {hotelDateTarget && DateTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={hotelDateTarget.currentDate ? new Date(hotelDateTarget.currentDate) : new Date()}
          mode="date"
          display="default"
          onChange={(event: any, selectedDate: Date) => {
            setHotelDateTarget(null);
            if (event.type === 'set' && selectedDate) {
              const formatted = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
              handleUpdateHotel(hotelDateTarget.id, hotelDateTarget.field, formatted);
            }
          }}
        />
      )}
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  header: { 
    padding: 20, 
    paddingTop: Platform.OS === 'web' ? 25 : 45, 
    borderBottomLeftRadius: 15, 
    borderBottomRightRadius: 15, 
    elevation: 3 
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: '#FFF', 
    marginBottom: 2 
  },
  headerSub: { 
    fontSize: 12, 
    color: 'rgba(255,255,255,0.8)' 
  },
  content: { 
    flex: 1, 
    padding: 12 
  },
  tripSelector: { 
    flexDirection: 'row', 
    marginBottom: 8 
  },
  tripTab: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 15, 
    borderWidth: 1, 
    marginRight: 8, 
    justifyContent: 'center' 
  },
  addTripBox: { 
    flexDirection: 'row', 
    padding: 8, 
    borderRadius: 8, 
    borderWidth: 1, 
    marginTop: 4 
  },
  input: { 
    flex: 1, 
    borderWidth: 1, 
    borderRadius: 6, 
    paddingHorizontal: 10, 
    height: 36, 
    marginRight: 8, 
    fontSize: 13 
  },
  saveBtn: { 
    paddingHorizontal: 12, 
    justifyContent: 'center', 
    borderRadius: 6 
  },
  card: { 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 15, 
    borderWidth: 1, 
    elevation: 1 
  },
  cardTitle: { 
    fontSize: 15, 
    fontWeight: 'bold' 
  },
  inputGroup: { 
    marginBottom: 10 
  },
  label: { 
    fontSize: 11, 
    fontWeight: 'bold', 
    marginBottom: 4 
  },
  textInput: { 
    borderWidth: 1, 
    borderRadius: 6, 
    paddingHorizontal: 10, 
    height: 38 
  },
  compactRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between' 
  },
  halfCol: { 
    flex: 1, 
    marginHorizontal: 3 
  },
  compactLabel: { 
    fontSize: 10, 
    fontWeight: 'bold', 
    marginBottom: 3, 
    color: '#888' 
  },
  compactInputBox: { 
    borderWidth: 1, 
    borderRadius: 6, 
    paddingHorizontal: 8, 
    height: 34, 
    fontSize: 12 
  },
  itemBox: { 
    padding: 10, 
    borderRadius: 8, 
    marginBottom: 8, 
    borderWidth: 1 
  },
  addBtnOutline: { 
    borderWidth: 1, 
    borderStyle: 'dashed', 
    padding: 10, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginTop: 4 
  },
  weatherCard: { 
    padding: 15, 
    borderRadius: 12, 
    borderWidth: 1, 
    marginBottom: 15 
  },
  weatherHeader: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  weatherTitle: { 
    fontSize: 11, 
    fontWeight: 'bold', 
    marginBottom: 2 
  },
  weatherTemp: { 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  weatherDivider: { 
    height: 1, 
    marginVertical: 10 
  }
});