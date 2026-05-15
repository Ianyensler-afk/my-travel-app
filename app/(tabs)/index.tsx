// 檔案路徑: D:\TravelApp\app\(tabs)\index.tsx
// 版本紀錄: v1.9.18 (UI 緊湊版：縮小上下留白與操作按鈕、放大停留時間字體)

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

interface IPlace {
  id: string;
  tripId: string;
  day: number;
  timeSlot: string;
  name: string;
  transitMode: string;
  transitTime: string;
  coords: { lat: number; lng: number } | null;
  orderIndex: number;
  stayTime?: number;
  isAlarmOpen?: boolean;
  arrivalTime?: string;
  departureTime?: string;
}

let MapView: any = View;
let Marker: any = View;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
}

const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

const DAY_COLORS = ['#FF7675', '#74B9FF', '#55E6C1', '#FDCB6E', '#A29BFE', '#E17055', '#00CEC9', '#2D3436'];
const TIME_SLOTS = ['早上', '中午', '下午', '晚上'];
const TIME_WEIGHT = { '早上': 1, '中午': 2, '下午': 3, '晚上': 4 };
const TRANSIT_MODES = ['🚶 步行', '🚇 地鐵', '🚄 火車', '🚌 公車', '🚕 計程車', '✈️ 飛機', '🚢 輪船'];
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const IS_COORD_REGEX = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

const getCleanSearchQuery = (placeName: string, tripName: string) => {
  if (!placeName) return '';
  const cleanName = placeName.trim();
  if (IS_COORD_REGEX.test(cleanName)) return cleanName;
  
  let cleanTrip = (tripName || '').replace(/(行程|旅行|之旅|旅遊|蜜月|預設|我的|新行程|自由行)/g, '').trim();
  if (!cleanTrip || cleanName.includes(cleanTrip)) return cleanName;
  
  const hasAddressKeywords = /[,，號路段街]|(St|Ave|Blvd|Pl\.|Rd|Lane|Chome|丁目)/i.test(cleanName);
  if (cleanName.length > 12 || hasAddressKeywords) {
     return `${cleanName}, ${cleanTrip}`;
  }
  
  return `${cleanTrip} ${cleanName}`.trim();
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 8000) => {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('網路阻擋');
  }
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

const timeToMins = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minsToTime = (mins: number) => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const parseTransitTime = (timeStr: string) => {
  if (!timeStr || ['無法估算', '手動確認', '無路線', '估算中', '金鑰遭拒', '網路阻擋', '距離太遠'].some(s => timeStr.includes(s))) return 0;
  let mins = 0;
  const hMatch = timeStr.match(/(\d+)\s*[h小時]/);
  const mMatch = timeStr.match(/(\d+)\s*[m分]/);
  if (hMatch) mins += parseInt(hMatch[1], 10) * 60;
  if (mMatch) mins += parseInt(mMatch[1], 10);
  return mins;
};

export default function HomeScreen() {
  const { trips, setTrips, currentTripId, themeColors, isDarkMode, forceUpdateTick } = useTravelContext();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString());
  
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalContent, setAiModalContent] = useState('');
  const [activeAiCategory, setActiveAiCategory] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [places, setPlaces] = useState<IPlace[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [newPlace, setNewPlace] = useState('');
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedTime, setSelectedTime] = useState('早上');
  const [dayStartTimes, setDayStartTimes] = useState<Record<number, string>>({});
  
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [editPlaceName, setEditPlaceName] = useState('');
  
  const [editingStayId, setEditingStayId] = useState<string | null>(null);
  const [stayTimeInfo, setStayTimeInfo] = useState('');
  const [showTimePickerDay, setShowTimePickerDay] = useState<number | null>(null);
  const [editingTransitId, setEditingTransitId] = useState<string | null>(null);
  const [transitTimeInfo, setTransitTimeInfo] = useState('');
  const [collapsedDays, setCollapsedDays] = useState<number[]>([]);
  const [mapVisibleDays, setMapVisibleDays] = useState<number[]>([]);
  const mapRef = useRef<any>(null);
  const [weatherData, setWeatherData] = useState<any>({});
  const saveTimeoutRef = useRef<any>(null);
  const isCalculatingRef = useRef(false);
  
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreText, setRestoreText] = useState('');

  const [isCalculating, setIsCalculating] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const placesRef = useRef(places);
  const currentTrip = trips.find(t => t.id === currentTripId) || trips[0];

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window === 'undefined') return;
    let watcher: any;
    const startGPS = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 200 },
          (loc: any) => {
            const { latitude, longitude } = loc.coords;
            places.filter(p => p.tripId === currentTripId && p.isAlarmOpen && p.coords).forEach(place => {
              if (getDistance(latitude, longitude, place.coords!.lat, place.coords!.lng) < 2) {
                alert(`🔔 快抵達 ${place.name} 了！`);
                setPlaces(prev => {
                  const updated = prev.map(p => (p.id === place.id ? { ...p, isAlarmOpen: false } : p));
                  AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                  return updated;
                });
              }
            });
          }
        );
      } catch (err) {}
    };
    startGPS();
    return () => watcher?.remove?.();
  }, [places, currentTripId]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    const loadLocalData = async () => {
      try {
        const savedPlaces = await AsyncStorage.getItem('@travel_db_timeline');
        const savedStartTimes = await AsyncStorage.getItem('@travel_db_start_times');
        if (savedStartTimes) setDayStartTimes(JSON.parse(savedStartTimes));
        if (savedPlaces) {
          const parsedPlaces = JSON.parse(savedPlaces);
          if (Array.isArray(parsedPlaces)) {
            const cleanPlaces = parsedPlaces.map((p: any) => ({
              ...p,
              orderIndex: p.orderIndex || 0,
              stayTime: p.stayTime !== undefined ? p.stayTime : 60,
              transitTime: p.transitTime?.includes('估算中') ? '' : p.transitTime
            }));
            setPlaces(cleanPlaces);
            const days = [...new Set(cleanPlaces.map((p: any) => p.day))] as number[];
            if (days.length > 0) setMapVisibleDays(days);
            fetchWeather(1, cleanPlaces.filter(p => p.tripId === currentTripId));
          }
        }
      } catch (e) {}
      setIsDataLoaded(true);
    };
    loadLocalData();
    return () => {
      isCalculatingRef.current = false;
    };
  }, [currentTripId, forceUpdateTick]);

  const fetchTransitTime = async (originPlace: any, destPlace: any, modeLabel: string, tripName: string) => {
    if (!originPlace || !destPlace) return { time: '無法估算', mode: modeLabel };
    if (!GOOGLE_MAPS_API_KEY) return { time: '缺金鑰', mode: modeLabel };
    
    const originStr = getCleanSearchQuery(originPlace.name, tripName);
    const destStr = getCleanSearchQuery(destPlace.name, tripName);

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
      let data: any = null;
      let finalMode = modeLabel;

      if (modeLabel.includes('地鐵') || modeLabel.includes('公車') || modeLabel.includes('火車') || modeLabel.includes('大眾運輸')) {
        const transitData = await fetchFromGoogle('transit');
        const walkingData = await fetchFromGoogle('walking');

        let useWalk = false;
        if (walkingData.status === 'OK') {
          const walkSecs = walkingData.routes[0].legs[0].duration.value;
          if (transitData.status === 'OK') {
            const transitSecs = transitData.routes[0].legs[0].duration.value;
            if (walkSecs < transitSecs || walkSecs <= 15 * 60) useWalk = true;
          } else {
            if (walkSecs <= 20 * 60) useWalk = true;
          }
        }

        if (useWalk) {
          data = walkingData;
          finalMode = '🚶 步行';
        } else if (transitData.status === 'OK') {
          data = transitData;
        } else {
          const drivingData = await fetchFromGoogle('driving');
          if (drivingData.status === 'OK') {
            data = drivingData;
            finalMode = '🚕 計程車';
          } else if (walkingData.status === 'OK') {
            data = walkingData;
            finalMode = '🚶 步行';
          } else {
            data = transitData;
          }
        }
      } else if (modeLabel.includes('步行')) {
        data = await fetchFromGoogle('walking');
        finalMode = '🚶 步行';
      } else if (modeLabel.includes('計程車') || modeLabel.includes('開車')) {
        data = await fetchFromGoogle('driving');
        finalMode = '🚕 計程車';
      } else {
        return { time: '需手動確認', mode: modeLabel };
      }

      if (data && data.status === 'OK' && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        if (finalMode.includes('地鐵') || finalMode.includes('公車') || finalMode.includes('大眾運輸')) {
          const transitStep = leg.steps?.find((s: any) => s.travel_mode === 'TRANSIT');
          if (transitStep && transitStep.transit_details?.line?.vehicle?.type) {
            const vType = transitStep.transit_details.line.vehicle.type;
            if (['BUS', 'INTERCITY_BUS', 'TROLLEYBUS'].includes(vType)) finalMode = '🚌 公車';
            else if (['SUBWAY', 'TRAM', 'METRO_RAIL'].includes(vType)) finalMode = '🚇 地鐵';
            else if (['TRAIN', 'HEAVY_RAIL', 'COMMUTER_TRAIN', 'HIGH_SPEED_TRAIN'].includes(vType)) finalMode = '🚆 火車';
            else if (['FERRY'].includes(vType)) finalMode = '🚢 輪船';
            else finalMode = '🚆 大眾運輸'; 
          }
        }

        const timeText = leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text;
        return { time: timeText, mode: finalMode };
      } else if (data && data.status === 'ZERO_RESULTS') {
        return { time: '距離太遠', mode: modeLabel };
      } else {
        return { time: '無路線', mode: modeLabel };
      }
    } catch (e) {
      return { time: '網路阻擋', mode: modeLabel };
    }
  };

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
                nextPlace = dayPlaces[i + 1];
                break;
              }
            }
            if (target) break;
          }
          if (!target || !nextPlace) break;
          
          setPlaces(prev => prev.map(p => (p.id === target!.id ? { ...p, transitTime: '⏳ 估算中...' } : p)));
          const res = await fetchTransitTime(target, nextPlace, target.transitMode || '🚆 地鐵', currentTrip.name);
          setPlaces(prev => {
            const updated = prev.map(p => (p.id === target!.id ? { ...p, transitTime: res.time, transitMode: res.mode } : p));
            AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
            return updated;
          });
          await new Promise(r => setTimeout(r, 2000));
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
        const safePlacesToSave = places.map(p => (p.transitTime.includes('估算中') ? { ...p, transitTime: '' } : p));
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(safePlacesToSave)).catch(()=>{});
        AsyncStorage.setItem('@travel_db_start_times', JSON.stringify(dayStartTimes)).catch(()=>{});
      }, 300);
    }
  }, [places, dayStartTimes, isDataLoaded]);

  const currentTripPlaces = useMemo(() => places.filter(p => p.tripId === currentTripId), [places, currentTripId]);
  const activeDays = useMemo(() => {
    const days = [...new Set(currentTripPlaces.map(p => p.day))].sort((a, b) => a - b);
    return days.length === 0 ? [1] : days;
  }, [currentTripPlaces]);

  const getDateForDay = useCallback(
    (dayNum: number) => {
      const startDateStr = currentTrip?.startDate || '2026-06-13';
      const [y, m, d] = startDateStr.split('-');
      if (!y || !m || !d) return '日期錯誤';
      const start = new Date(Number(y), Number(m) - 1, Number(d));
      const target = new Date(start);
      target.setDate(start.getDate() + (dayNum - 1));
      return `${String(target.getMonth() + 1).padStart(2, '0')}/${String(target.getDate()).padStart(2, '0')}`;
    },
    [currentTrip?.startDate]
  );

  const fetchWeather = async (dayNum: number, placesList = places) => {
    const cacheKey = `@travel_db_weather_${String(currentTripId)}`;
    try {
      const currentTripPlaces = placesList.filter(p => String(p.tripId) === String(currentTripId));
      let targetPlace = currentTripPlaces.find(p => p.day === dayNum && p.coords) || currentTripPlaces.find(p => p.coords);
      
      let lat, lng;
      if (targetPlace && targetPlace.coords) {
        lat = targetPlace.coords.lat;
        lng = targetPlace.coords.lng;
      } else {
        const fallbackCoords = await fetchCoordinates(currentTrip.name);
        if (fallbackCoords) {
          lat = fallbackCoords.lat;
          lng = fallbackCoords.lng;
        } else {
          throw new Error('無法取得備援座標');
        }
      }

      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
      const data = await res.json();
      
      if (!data || data.error || !data.daily) throw new Error('API無效');

      const tempMax = Math.round(data.daily.temperature_2m_max[0]);
      const tempMin = Math.round(data.daily.temperature_2m_min[0]);
      const pop = data.daily.precipitation_probability_max[0] || 0;
      const code = data.daily.weathercode[0];

      let icon = '☀️';
      if (code > 0) icon = '⛅';
      if (code >= 51) icon = '☔';
      setWeatherData((prev: any) => ({ ...prev, [dayNum]: `${icon} ${tempMin}~${tempMax}°C (☔${pop}%)` }));
      
      const existingCache = await AsyncStorage.getItem(cacheKey);
      const weatherObj = existingCache ? JSON.parse(existingCache) : {};
      weatherObj[dayNum] = { tempMax, tempMin, pop, icon, code };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(weatherObj));
      
    } catch (e) {
      setWeatherData((prev: any) => ({ ...prev, [dayNum]: `☁️ 未知氣象` }));
      const existingCache = await AsyncStorage.getItem(cacheKey);
      const weatherObj = existingCache ? JSON.parse(existingCache) : {};
      weatherObj[dayNum] = { tempMax: '--', tempMin: '--', pop: '--', icon: '☁️', code: 0 };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(weatherObj)).catch(()=>{});
    }
  };

  const tripPlacesSequence = places.filter(p => String(p.tripId) === String(currentTripId)).map(p => `${p.id}-${p.name}-${p.coords ? 'hasCoords' : 'noCoords'}`).join(',');
  useEffect(() => {
    if (tripPlacesSequence) {
      fetchWeather(1, places);
    }
  }, [tripPlacesSequence, currentTripId]);

  const calculateRoutes = async () => {
    if (isCalculating) return;
    setIsCalculating(true);
    
    setPlaces(prev => {
      const marked = prev.map(p => p.tripId === currentTripId ? { ...p, transitTime: '' } : p);
      AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(marked)).catch(()=>{});
      return marked;
    });

    setIsCalculating(false);
  };

  const openAiHub = (placeName: string) => {
    setAiModalTitle(placeName);
    setAiModalContent('');
    setActiveAiCategory('');
    setAiModalVisible(true);
  };

  const fetchAiRecommendation = async (categoryLabel: string) => {
    setIsAiLoading(true);
    setAiModalContent('');
    setActiveAiCategory(categoryLabel);
    try {
      const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!API_KEY) throw new Error('找不到金鑰');
      const actualCity = currentTrip.name;
      let focus = '';
      if (categoryLabel.includes('咖啡')) focus = '評價極高的特色咖啡廳或網美甜點店';
      else if (categoryLabel.includes('麵包')) focus = '在地人強推的烘焙坊或手工麵包店';
      else if (categoryLabel.includes('早餐')) focus = '最具當地特色的必吃早餐或早午餐';
      else if (categoryLabel.includes('正餐')) focus = 'Google 評價 4.2 顆星以上的熱門正餐餐廳';
      else focus = '隱藏版在地特色小吃';
      
      const prompt = `你現在是住在 ${actualCity} 的在地美食導遊。針對「${aiModalTitle}」附近，找出 2~3 個【${focus}】。
請「嚴格限制」推薦地點必須在「步行 10 分鐘（約 800 公尺）」以內！絕對不要推薦需要搭車或距離過遠的地方。若附近真的無合適選擇，請直接告知「附近無合適推薦」。
請列出原文名稱並簡單翻譯與說明必點特色。請絕對不要使用任何 markdown 星號或井字號來排版，請用單純的換行與空白來讓文章好讀。`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message.includes('high demand') ? 'AI 導遊大塞車！請稍後' : data.error.message);
      let cleanText = data.candidates[0].content.parts[0].text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/###/g, '').replace(/##/g, '');
      setAiModalContent(cleanText);
    } catch (e: any) {
      setAiModalContent(e.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSmartSort = async (dayNum: number) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
      alert('⚡ 目前處於離線狀態！');
      return;
    }
    const dayPlaces = places.filter(p => p.day === dayNum && p.tripId === currentTripId).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0));
    if (dayPlaces.length <= 3) {
      alert('中間景點不足 2 個，不需要 AI 排序啦 😉');
      return;
    }

    const firstPlace = dayPlaces[0];
    const lastPlace = dayPlaces[dayPlaces.length - 1];
    const middlePlaces = dayPlaces.slice(1, -1);

    setAiModalTitle(`第 ${dayNum} 天最佳化`);
    setAiModalContent('AI 分析最佳路徑中 ⏱️\n(首尾地點將保持不變)');
    setAiModalVisible(true);
    setIsAiLoading(true);
    try {
      const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!API_KEY) throw new Error('找不到金鑰');
      const placesListStr = middlePlaces.map(p => `ID: ${p.id} | 名稱: ${p.name}`).join('\n');
      const prompt = `你是一個專業旅行規劃師。這是一天的行程。\n起點：${firstPlace.name}\n終點：${lastPlace.name}\n請幫我把以下【中間景點】找出最順路、最省交通時間的順序：\n${placesListStr}\n請「只」回傳一個合法的 JSON 陣列，包含排序後的 ID 字串，格式如：["id1", "id2"]。不要任何 Markdown 格式標籤。`;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      let cleanJson = data.candidates[0].content.parts[0].text
        .replace(/\`\`\`json/g, '')
        .replace(/\`\`\`/g, '')
        .trim();
      const sortedIds = JSON.parse(cleanJson);
      
      if (Array.isArray(sortedIds) && sortedIds.length === middlePlaces.length) {
        const newOrderIds = [firstPlace.id, ...sortedIds, lastPlace.id];
        setPlaces(prev => {
          const updated = prev.map(p => {
            if (p.day === dayNum && p.tripId === currentTripId) {
              const newIndex = newOrderIds.indexOf(p.id);
              return newIndex !== -1 ? { ...p, orderIndex: newIndex, transitTime: '' } : p;
            }
            return p;
          });
          AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
          return updated;
        });
        setAiModalVisible(false);
        alert('✨ AI 已為您規劃最完美路線！');
      } else {
        throw new Error('AI 回傳格式不符或數量遺漏');
      }
    } catch (e: any) {
      setAiModalContent(`❌ 失敗：\n${e.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const travelKeys = keys.filter(k => k.startsWith('@travel_db_'));
      const stores = await AsyncStorage.multiGet(travelKeys);
      const exportObj: any = {};
      stores.forEach(([key, val]) => {
        if (val) exportObj[key] = JSON.parse(val);
      });
      
      const dataStr = JSON.stringify(exportObj);
      if (Platform.OS === 'web') {
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TravelApp_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        alert('請使用網頁版進行備份下載！');
      }
    } catch (e) {
      alert('備份失敗！');
    }
  };

  const handleImportData = () => {
    setRestoreText('');
    setIsRestoreModalOpen(true);
  };

  const executeRestore = async () => {
    if (!restoreText.trim()) {
      alert('請貼上 JSON 內容！');
      return;
    }
    try {
      let cleanText = restoreText
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\u00A0/g, " ") 
        .replace(/[\u200B-\u200D\uFEFF]/g, '') 
        .trim();

      let data;
      try {
        data = JSON.parse(cleanText);
      } catch (err1) {
        try {
          if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
            const unescaped = cleanText.substring(1, cleanText.length - 1).replace(/""/g, '"').replace(/\\"/g, '"');
            data = JSON.parse(unescaped);
          } else {
            throw err1;
          }
        } catch (err2) {
          throw new Error('無法解析文字為 JSON');
        }
      }

      if (!data || typeof data !== 'object' || (!data['@travel_db_trips'] && !data['@travel_db_timeline'])) {
        throw new Error('找不到有效的備份標籤，請確認您複製的是「備份」輸出的完整內容！');
      }

      const pairs: [string, string][] = [];
      for (const key in data) {
        const valueToStore = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
        pairs.push([key, valueToStore]);
      }
      await AsyncStorage.multiSet(pairs);
      
      setIsRestoreModalOpen(false);
      setRestoreText('');

      if (Platform.OS === 'web') {
        alert('✅ 還原成功！網頁即將重新整理。');
        window.location.reload();
      } else {
        alert('✅ 還原成功！\n\n⚠️ 重要：請【完全滑掉關閉 App】並重新開啟，以載入最新還原的資料！');
      }
    } catch (err: any) {
      alert(`❌ 格式錯誤：\n${err.message}`);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      alert('請輸入行程內容！');
      return;
    }

    const lines = bulkText.split('\n');
    let currentDay = 1;
    let newPlaces: IPlace[] = [];
    let baseOrderIndex = Date.now();

    for (let line of lines) {
      const text = line.trim();
      if (!text) continue;

      const dayMatch = text.match(/第(\d+)天/);
      if (dayMatch) {
        currentDay = parseInt(dayMatch[1], 10);
        continue;
      }

      const timeMatch = text.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      let timeSlot = '早上';
      let placeName = text;

      if (timeMatch) {
        const timeStr = timeMatch[1];
        placeName = timeMatch[2];
        
        const hour = parseInt(timeStr.split(':')[0], 10);
        if (hour >= 12 && hour < 14) timeSlot = '中午';
        else if (hour >= 14 && hour < 18) timeSlot = '下午';
        else if (hour >= 18) timeSlot = '晚上';
      }

      newPlaces.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        tripId: currentTripId,
        day: currentDay,
        timeSlot: timeSlot,
        name: placeName,
        transitMode: '🚆 地鐵',
        transitTime: '',
        coords: null,
        orderIndex: baseOrderIndex++,
        stayTime: 60
      });
    }

    if (newPlaces.length > 0) {
      setPlaces(prev => {
        const updated = [...prev, ...newPlaces];
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
        return updated;
      });
      
      const newDays = [...new Set(newPlaces.map(p => p.day))];
      setMapVisibleDays(prev => [...new Set([...prev, ...newDays])]);
      
      setBulkText('');
      setIsBulkModalOpen(false);
      alert(`✅ 成功匯入 ${newPlaces.length} 個景點！\n(建議可點擊右上角「重算」更新路線時間)`);
    } else {
      alert('無法解析行程，請確認格式是否為「第X天」與景點名稱！');
    }
  };

  const openInGoogleMaps = (place: IPlace) => {
    const query = getCleanSearchQuery(place.name, currentTrip.name);
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const openRouteInGoogleMaps = (origin: string, dest: string, modeLabel: string) => {
    let travelMode = 'transit';
    if (modeLabel.includes('步行')) travelMode = 'walking';
    if (modeLabel.includes('開車') || modeLabel.includes('計程車')) travelMode = 'driving';
    
    const o = getCleanSearchQuery(origin, currentTrip.name);
    const d = getCleanSearchQuery(dest, currentTrip.name);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=${travelMode}`;
    
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const fetchCoordinates = async (placeName: string) => {
    if (!GOOGLE_MAPS_API_KEY) return null;
    try {
      const cleanName = placeName.trim();
      if (IS_COORD_REGEX.test(cleanName)) {
        const [latStr, lngStr] = cleanName.split(',');
        return { lat: parseFloat(latStr.trim()), lng: parseFloat(lngStr.trim()) };
      }

      const queryStr = getCleanSearchQuery(cleanName, currentTrip.name);
      const baseUrl = Platform.OS === 'web' ? '/api/maps' : 'https://maps.googleapis.com/maps/api';
      const targetUrl = `${baseUrl}/geocode/json?address=${encodeURIComponent(queryStr)}&language=zh-TW&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetchWithTimeout(targetUrl, {}, 5000);
      const data = await res.json();
      if (data.status === 'OK' && data.results.length > 0) return data.results[0].geometry.location;
      return null;
    } catch (e) {
      return null;
    }
  };

  const addPlace = async () => {
    if (!newPlace) return;
    const currentName = newPlace.trim();
    setNewPlace('');
    const coords = await fetchCoordinates(currentName);
    const placeObj: IPlace = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, tripId: currentTripId, day: selectedDay, timeSlot: selectedTime, name: currentName, transitMode: '🚆 地鐵', transitTime: '', coords: coords, orderIndex: Date.now(), stayTime: 60 };
    
    setPlaces(prev => {
      const updated = [...prev, placeObj];
      AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
      return updated;
    });
    if (!mapVisibleDays.includes(selectedDay)) setMapVisibleDays([...mapVisibleDays, selectedDay]);
  };

  const handleEditPlaceSubmit = async (placeId: string, newName: string) => {
    if (!newName.trim()) {
      setEditingPlaceId(null);
      return;
    }
    setEditingPlaceId(null);

    const placeToEdit = places.find(p => p.id === placeId);
    if (placeToEdit && placeToEdit.name !== newName) {
      const dayPlaces = places
        .filter(p => p.day === placeToEdit.day && p.tripId === currentTripId)
        .sort((a, b) => {
          const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot];
          return timeDiff !== 0 ? timeDiff : (a.orderIndex || 0) - (b.orderIndex || 0);
        });
      const currentIndex = dayPlaces.findIndex(p => p.id === placeId);
      const prevPlace = currentIndex > 0 ? dayPlaces[currentIndex - 1] : null;

      setPlaces(prev => {
        const updated = prev.map(p => {
          if (p.id === placeId) return { ...p, name: newName, transitTime: '', coords: null };
          if (prevPlace && p.id === prevPlace.id) return { ...p, transitTime: '' };
          return p;
        });
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
        return updated;
      });

      const coords = await fetchCoordinates(newName);
      if (coords) {
        setPlaces(prev => {
          const updated = prev.map(p => p.id === placeId ? { ...p, coords } : p);
          AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
          return updated;
        });
      }
    }
  };

  const getCascadedPlacesForDay = useCallback(
    (day: number) => {
      const dayPlaces = places
        .filter(p => p.day === day && p.tripId === currentTripId)
        .sort((a, b) => {
          const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot];
          if (timeDiff !== 0) return timeDiff;
          return (a.orderIndex || 0) - (b.orderIndex || 0);
        });
      let currentMins = timeToMins(dayStartTimes[day] || '09:00');
      return dayPlaces.map(p => {
        const arrMins = currentMins;
        const actualStayTime = p.stayTime !== undefined ? p.stayTime : 60;
        const depMins = currentMins + actualStayTime;
        currentMins = depMins + parseTransitTime(p.transitTime);
        return { ...p, arrivalTime: minsToTime(arrMins), departureTime: minsToTime(depMins) };
      });
    },
    [places, currentTripId, dayStartTimes]
  );

  const movePlace = (placeId: string, direction: string) => {
    const placeToMove = places.find(p => p.id === placeId);
    if (!placeToMove) return;
    const dayPlaces = places
      .filter(p => p.day === placeToMove.day && p.tripId === currentTripId)
      .sort((a, b) => {
        const timeDiff = (TIME_WEIGHT as any)[a.timeSlot] - (TIME_WEIGHT as any)[b.timeSlot];
        return timeDiff !== 0 ? timeDiff : (a.orderIndex || 0) - (b.orderIndex || 0);
      });
    const index = dayPlaces.findIndex(p => p.id === placeId);
    
    if (direction === 'up' && index > 0) {
      const swapTarget = dayPlaces[index - 1];
      setPlaces(prev => {
        const updated = prev.map(p => {
          if (p.id === placeId) return { ...p, timeSlot: swapTarget.timeSlot, orderIndex: swapTarget.orderIndex || 0 };
          if (p.id === swapTarget.id) return { ...p, timeSlot: placeToMove.timeSlot, orderIndex: placeToMove.orderIndex || 0 };
          return p;
        }).map(p => {
          if (p.day === placeToMove.day && p.tripId === currentTripId) return { ...p, transitTime: '' };
          return p;
        });
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
        return updated;
      });
    } else if (direction === 'down' && index < dayPlaces.length - 1) {
      const swapTarget = dayPlaces[index + 1];
      setPlaces(prev => {
        const updated = prev.map(p => {
          if (p.id === placeId) return { ...p, timeSlot: swapTarget.timeSlot, orderIndex: swapTarget.orderIndex || 0 };
          if (p.id === swapTarget.id) return { ...p, timeSlot: placeToMove.timeSlot, orderIndex: placeToMove.orderIndex || 0 };
          return p;
        }).map(p => {
          if (p.day === placeToMove.day && p.tripId === currentTripId) return { ...p, transitTime: '' };
          return p;
        });
        AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
        return updated;
      });
    }
  };

  return (
    <KeyboardWrapper style={[styles.container, { backgroundColor: themeColors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 模態視窗們保持不變 */}
      {isBulkModalOpen && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.modalBackground}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: themeColors.text }}>📝 智慧批次匯入</Text>
              <TextInput 
                style={[styles.bulkInput, { backgroundColor: themeColors.background, color: themeColors.text }]} 
                multiline={true} 
                value={bulkText} 
                onChangeText={setBulkText} 
                textAlignVertical="top" 
                placeholder="貼上您的行程...
第1天
09:00 台北出發
14:00 抵達東京"
                placeholderTextColor={themeColors.subText}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity onPress={() => setIsBulkModalOpen(false)} style={[styles.bulkBtn, { backgroundColor: '#95A5A6' }]}>
                  <Text style={{ color: '#FFF', fontSize: 12 }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBulkImport} style={[styles.bulkBtn, { backgroundColor: themeColors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>匯入</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {isRestoreModalOpen && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.modalBackground}>
            <View style={[styles.modalContent, { backgroundColor: themeColors.card }]}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: themeColors.text }}>📥 貼上還原資料 (JSON)</Text>
              <TextInput 
                style={[styles.bulkInput, { backgroundColor: themeColors.background, color: themeColors.text }]} 
                multiline={true} 
                value={restoreText} 
                onChangeText={setRestoreText} 
                textAlignVertical="top" 
                placeholder='請貼上備份輸出的 JSON 文字...'
                placeholderTextColor={themeColors.subText}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity onPress={() => setIsRestoreModalOpen(false)} style={[styles.bulkBtn, { backgroundColor: '#95A5A6' }]}>
                  <Text style={{ color: '#FFF', fontSize: 12 }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={executeRestore} style={[styles.bulkBtn, { backgroundColor: themeColors.primary }]}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>確認還原</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {aiModalVisible && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={styles.aiModalOverlay}>
            <View style={[styles.aiModalContainer, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={[styles.aiModalHeader, { backgroundColor: '#E67E22' }]}>
                <Text style={styles.aiModalTitle}>🤖 {aiModalTitle}</Text>
                <TouchableOpacity onPress={() => setAiModalVisible(false)} style={styles.aiModalCloseBtn}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={{ maxHeight: 400, padding: 20 }}>
                {!aiModalContent && !isAiLoading ? (
                  <View>
                    <Text style={{ textAlign: 'center', marginBottom: 12, fontSize: 13, color: themeColors.text, fontWeight: 'bold' }}>你想挖掘什麼在地情報呢？</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {['☕ 質感咖啡', '🥐 烘焙麵包', '🍳 在地早餐', '🍱 必吃正餐', '🕵️ 隱藏小吃'].map(cat => (
                        <TouchableOpacity key={cat} onPress={() => fetchAiRecommendation(cat)} style={[styles.aiHubBtn, { borderColor: themeColors.primary }]}>
                          <Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 12 }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : isAiLoading ? (
                  <View style={styles.aiLoadingContainer}>
                    <Text style={{ fontSize: 35, marginBottom: 10 }}>🕵️‍♂️</Text>
                    <Text style={[styles.aiLoadingText, { color: themeColors.text, fontSize: 13 }]}>正在尋找 {activeAiCategory}...</Text>
                  </View>
                ) : (
                  <>
                    <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 250 }}>
                      <Text style={[styles.aiContentText, { color: themeColors.text }]}>{aiModalContent}</Text>
                    </ScrollView>
                    <TouchableOpacity
                      onPress={() => {
                        setAiModalContent('');
                        setActiveAiCategory('');
                      }}
                      style={{ marginTop: 10, padding: 8, backgroundColor: themeColors.background, borderRadius: 6, alignItems: 'center' }}
                    >
                      <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 12 }}>🔍 其他情報</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 畫面主體開始 */}
      <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerText}>🗺️ {currentTrip?.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, marginTop: 2 }}>
              {isSyncing ? '☁️ 同步中' : `✅ 已存 ${lastSync}`} • {currentTrip?.startDate}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <TouchableOpacity onPress={calculateRoutes} style={[styles.syncBtn, { marginRight: 4, backgroundColor: 'rgba(0,0,0,0.2)' }]}>
              <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>{isCalculating ? '🔄 計算' : '🔄 重算'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleImportData} style={styles.syncBtn}>
              <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>📥 還原</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportData} style={[styles.syncBtn, { marginLeft: 4 }]}>
              <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>📤 備份</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <TouchableOpacity 
        onPress={() => setIsMapExpanded(!isMapExpanded)}
        style={[styles.mapToggleBtn, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}
      >
        <Text style={{ color: themeColors.subText, fontSize: 11, fontWeight: 'bold' }}>
          {isMapExpanded ? '🔼 收起地圖 (增加清單空間)' : '🗺️ 展開地圖'}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => setMapVisibleDays(activeDays)} style={[styles.filterBtn, { backgroundColor: themeColors.border }]}>
          <Text style={{ fontSize: 11, color: themeColors.text, fontWeight: 'bold' }}>✅ 全選</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMapVisibleDays([])} style={[styles.filterBtn, { backgroundColor: themeColors.border }]}>
          <Text style={{ fontSize: 11, color: themeColors.text, fontWeight: 'bold' }}>❌ 清除</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {activeDays.map(day => {
            const isVisible = mapVisibleDays.includes(day);
            const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length];
            return (
              <TouchableOpacity
                key={day}
                onPress={() => setMapVisibleDays(isVisible ? mapVisibleDays.filter(d => d !== day) : [...mapVisibleDays, day])}
                style={[styles.dayFilterChip, { backgroundColor: isVisible ? dayColor : themeColors.card, borderColor: isVisible ? dayColor : themeColors.border }]}
              >
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: isVisible ? '#FFF' : themeColors.subText }}>第{day}天</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isMapExpanded && (
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            (() => {
              const visiblePlaces = places
                .filter(p => mapVisibleDays.includes(p.day) && p.tripId === currentTripId && !p.transitMode.includes('飛機') && !p.name.includes('台北') && !p.name.includes('上海') && !p.name.includes('機場'))
                .sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0));
              if (visiblePlaces.length === 0) {
                return <iframe key="empty-map" width="100%" height="100%" style={{ border: 0 }} src={`https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(currentTrip.name)}&zoom=12`}></iframe>;
              }
              const getCleanQueryForMap = (p: any) => {
                let name = p.name.replace(/\(.*\)/g, '').replace(/（.*）/g, '').trim();
                return getCleanSearchQuery(name, currentTrip.name);
              };
              const origin = getCleanQueryForMap(visiblePlaces[0]);
              const dest = getCleanQueryForMap(visiblePlaces[visiblePlaces.length - 1]);
              const isCrossCity = mapVisibleDays.length > 5;
              let webMapUrl = '';
              if (GOOGLE_MAPS_API_KEY && visiblePlaces.length > 1 && !isCrossCity) {
                const originEnc = encodeURIComponent(origin);
                const destEnc = encodeURIComponent(dest);
                const waypoints = visiblePlaces
                  .slice(1, -1)
                  .map(p => encodeURIComponent(getCleanQueryForMap(p)))
                  .join('|');
                webMapUrl = `https://www.google.com/maps/embed/v1/directions?key=${GOOGLE_MAPS_API_KEY}&origin=${originEnc}&destination=${destEnc}&mode=transit`;
                if (waypoints) webMapUrl += `&waypoints=${waypoints}`;
              } else {
                const qEnc = encodeURIComponent(origin);
                webMapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${qEnc}&zoom=15`;
              }
              return <iframe key={`${currentTripId}-${mapVisibleDays.join(',')}`} width="100%" height="100%" style={{ border: 0 }} allowFullScreen={true} loading="lazy" src={webMapUrl}></iframe>;
            })()
          ) : (
            <MapView ref={mapRef} style={{ width: '100%', height: '100%' }} initialRegion={{ latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.1, longitudeDelta: 0.1 }}>
              {places.filter(p => mapVisibleDays.includes(p.day) && p.coords && p.tripId === currentTripId).map(p => {
                const seqNum = currentTripPlaces.filter(dp => dp.day === p.day).sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0)).findIndex(dp => dp.id === p.id) + 1;
                return (
                  <Marker key={p.id} coordinate={{ latitude: p.coords!.lat, longitude: p.coords!.lng }} title={p.name}>
                    <View style={[styles.customPin, { backgroundColor: DAY_COLORS[(p.day - 1) % DAY_COLORS.length], minWidth: 28 }]}>
                      <Text style={{ fontSize: 9, color: '#FFF', fontWeight: 'bold' }}>
                        D{p.day}-{seqNum}
                      </Text>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          )}
        </View>
      )}

      <View style={[styles.inputCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <View style={styles.row}>
          <View style={[styles.daySelector, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
            <TouchableOpacity onPress={() => setSelectedDay(Math.max(1, selectedDay - 1))} style={styles.dayBtn}>
              <Text style={{ fontSize: 12 }}>➖</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontWeight: 'bold', color: themeColors.text, fontSize: 12 }}>第 {selectedDay} 天</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedDay(selectedDay + 1)} style={styles.dayBtn}>
              <Text style={{ fontSize: 12 }}>➕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 8, flex: 1 }}>
            {TIME_SLOTS.map(time => (
              <TouchableOpacity key={time} style={[styles.timeChip, { backgroundColor: selectedTime === time ? themeColors.secondary : themeColors.background, borderColor: themeColors.border }]} onPress={() => setSelectedTime(time)}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: selectedTime === time ? '#FFF' : themeColors.subText }}>{time}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={[styles.row, { marginTop: 8 }]}>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
            placeholderTextColor={themeColors.subText}
            placeholder="景點名稱 (或經緯度)"
            value={newPlace}
            onChangeText={setNewPlace}
            onSubmitEditing={addPlace}
          />
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: themeColors.border, marginRight: 5 }]} onPress={() => setIsBulkModalOpen(true)}>
            <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 12 }}>📝</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: themeColors.primary }]} onPress={addPlace}>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>新增</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.timelineArea} bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
        {activeDays.filter(day => mapVisibleDays.includes(day)).map(day => {
          const isCollapsed = collapsedDays.includes(day);
          const dayColor = DAY_COLORS[(day - 1) % DAY_COLORS.length];
          const cascadedPlaces = getCascadedPlacesForDay(day);

          return (
            <View key={`day-${day}`} style={{ marginBottom: 12 }}>
              <View style={[styles.dayHeader, { backgroundColor: dayColor }]}>
                <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => setCollapsedDays(isCollapsed ? collapsedDays.filter(d => d !== day) : [...collapsedDays, day])}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>
                    {isCollapsed ? '▶' : '▼'} 第 {day} 天 <Text style={{ fontSize: 13, fontWeight: 'bold', color: 'rgba(255,255,255,0.9)' }}>({getDateForDay(day)})</Text>
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!isCollapsed && (
                    <TouchableOpacity onPress={() => handleSmartSort(day)} style={{ backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, marginRight: 4 }}>
                      <Text style={{ color: '#FFF', fontSize: 9, fontWeight: 'bold' }}>🤖 順路排</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 }}>
                    {Platform.OS === 'web' ? (
                      <input
                        type="time"
                        value={dayStartTimes[day] || '09:00'}
                        onChange={e => setDayStartTimes({ ...dayStartTimes, [day]: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        style={{ backgroundColor: 'transparent', color: '#333', fontWeight: 'bold', border: 'none', outline: 'none', fontSize: '11px' }}
                      />
                    ) : (
                      <TouchableOpacity onPress={e => { e.stopPropagation(); setShowTimePickerDay(day); }}>
                        <Text style={{ color: '#333', fontWeight: 'bold', fontSize: 11 }}>{dayStartTimes[day] || '09:00'} ✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 8, maxWidth: 80 }}>
                    <Text style={{ color: '#FFF', fontSize: 9 }} numberOfLines={1} adjustsFontSizeToFit>{weatherData[day] || '☁️'}</Text>
                  </View>
                </View>
              </View>

              {!isCollapsed
                ? cascadedPlaces.map((place: any, index) => {
                    const isLast = index === cascadedPlaces.length - 1;
                    const isError = ['無路線', '無法估算', '需確認', '金鑰拒', '阻擋', '太遠', '失敗'].some(s => place.transitTime.includes(s));
                    const transitTextColor = isError ? '#E74C3C' : themeColors.primary;

                    return (
                      <View key={place.id} style={{ flexDirection: 'row' }}>
                        <View style={{ width: 35, alignItems: 'center' }}>
                          <View style={[styles.numberPin, { backgroundColor: dayColor, marginTop: 2 }]}>
                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 10 }}>{index + 1}</Text>
                          </View>
                          {!isLast ? (
                            <View style={{ flex: 1, alignItems: 'center', width: '100%', paddingVertical: 0 }}>
                              <View style={{ width: 1.5, flex: 1, backgroundColor: themeColors.border }} />
                              <TouchableOpacity onPress={() => setEditingTransitId(place.id)} style={[styles.miniTransitBadge, { backgroundColor: themeColors.card, borderColor: isError ? '#E74C3C' : themeColors.border }]}>
                                <Text style={{ fontSize: 12 }}>{place.transitMode.split(' ')[0]}</Text>
                                {place.transitTime && place.transitTime !== '' && place.transitTime !== '估算中...' ? (
                                  <Text style={{ fontSize: 9, color: transitTextColor, fontWeight: 'bold', marginTop: 1, textAlign: 'center' }}>
                                    {isError ? place.transitTime : place.transitTime.replace('分鐘', 'm').replace('小時', 'h')}
                                  </Text>
                                ) : (
                                  <Text style={{ fontSize: 8, color: themeColors.subText, marginTop: 1 }}>計算中</Text>
                                )}
                              </TouchableOpacity>
                              <View style={{ width: 1.5, flex: 1, backgroundColor: themeColors.border }} />
                            </View>
                          ) : null}
                        </View>

                        <View style={{ flex: 1, paddingBottom: 8, paddingRight: 4 }}>
                          <View style={[styles.placeCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                            
                            {/* 第一行：標題 與 右側的進階按鈕群 */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                              {editingPlaceId === place.id ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                  <TextInput
                                    style={[styles.compactInputBox, { flex: 1, backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border, height: 28, fontSize: 13, marginRight: 6 }]}
                                    value={editPlaceName}
                                    onChangeText={setEditPlaceName}
                                    autoFocus
                                  />
                                  <TouchableOpacity onPress={() => handleEditPlaceSubmit(place.id, editPlaceName)} style={{ backgroundColor: themeColors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>儲存</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => setEditingPlaceId(null)} style={{ backgroundColor: '#95A5A6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginLeft: 4 }}>
                                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>取消</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <Text style={{ fontSize: 15, fontWeight: 'bold', color: themeColors.text, flex: 1, marginRight: 8, lineHeight: 20 }} numberOfLines={2}>{place.name}</Text>
                              )}

                              <View style={{ flexDirection: 'row', flexShrink: 0 }}>
                                {!isLast && (
                                  <TouchableOpacity onPress={() => { setEditingStayId(place.id); setStayTimeInfo(String(place.stayTime !== undefined ? place.stayTime : 60)); }} style={styles.actionCircleBtn}>
                                    <Text style={styles.actionBtnText}>⏲</Text>
                                  </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={() => { setEditingPlaceId(place.id); setEditPlaceName(place.name); }} style={styles.actionCircleBtn}>
                                  <Text style={styles.actionBtnText}>✎</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => movePlace(place.id, 'up')} disabled={index === 0} style={[styles.actionCircleBtn, { opacity: index === 0 ? 0.3 : 1 }]}>
                                  <Text style={styles.actionBtnText}>▲</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => movePlace(place.id, 'down')} disabled={isLast} style={[styles.actionCircleBtn, { opacity: isLast ? 0.3 : 1 }]}>
                                  <Text style={styles.actionBtnText}>▼</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setPlaces(prev => {
                                  const updated = prev.filter(p => p.id !== place.id);
                                  AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                                  return updated;
                                })} style={styles.actionCircleBtnDelete}>
                                  <Text style={styles.actionBtnTextDelete}>✖</Text>
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* 第二行：預計時間 與 四大快捷導航徽章 (同行並列) */}
                            {editingPlaceId !== place.id && (
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#E67E22', flexShrink: 1, marginRight: 6 }} numberOfLines={1}>
                                  {isLast ? `抵達: ${place.arrivalTime}` : `${place.arrivalTime}-${place.departureTime} (${place.stayTime ?? 60}m)`}
                                </Text>
                                <View style={{ flexDirection: 'row', flexShrink: 0 }}>
                                  <TouchableOpacity onPress={() => openInGoogleMaps(place)} style={[styles.microBadge, { backgroundColor: '#EBF5FB', borderColor: '#3498DB' }]}>
                                    <Text style={{ fontSize: 11 }}>📍</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => openAiHub(place.name)} style={[styles.microBadge, { backgroundColor: '#FEF5E7', borderColor: '#F39C12' }]}>
                                    <Text style={{ fontSize: 11 }}>🤖</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => {
                                    setPlaces(prev => {
                                      const updated = prev.map(p => (p.id === place.id ? { ...p, isAlarmOpen: !p.isAlarmOpen } : p));
                                      AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                                      return updated;
                                    });
                                  }} style={[styles.microBadge, place.isAlarmOpen ? { backgroundColor: '#FADBD8', borderColor: '#E74C3C' } : { backgroundColor: '#F2F4F4', borderColor: '#BDC3C7' }]}>
                                    <Text style={{ fontSize: 11 }}>{place.isAlarmOpen ? '🔔' : '🔕'}</Text>
                                  </TouchableOpacity>
                                  {!isLast && (
                                    <TouchableOpacity onPress={() => openRouteInGoogleMaps(place.name, cascadedPlaces[index + 1].name, place.transitMode)} style={[styles.microBadge, { backgroundColor: '#E8F8F5', borderColor: '#1ABC9C' }]}>
                                      <Text style={{ fontSize: 11 }}>🧭</Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            )}
                          </View>

                          {editingStayId === place.id && (
                            <View style={{ marginTop: 4, marginLeft: 5 }}>
                              <View style={[styles.transitEditRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <Text style={{ color: themeColors.text, fontSize: 10, marginRight: 8 }}>停留 (m):</Text>
                                <TextInput style={[styles.transitInput, { backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border }]} keyboardType="numeric" value={stayTimeInfo} onChangeText={setStayTimeInfo} />
                                <TouchableOpacity
                                  onPress={() => {
                                    const parsedStay = parseInt(stayTimeInfo);
                                    const finalStay = !isNaN(parsedStay) && parsedStay >= 0 ? parsedStay : 60;
                                    setPlaces(prev => {
                                      const updated = prev.map(p => (p.id === place.id ? { ...p, stayTime: finalStay } : p));
                                      AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                                      return updated;
                                    });
                                    setEditingStayId(null);
                                  }}
                                  style={{ backgroundColor: themeColors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                                >
                                  <Text style={{ color: '#FFF', fontSize: 10 }}>確認</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}

                          {editingTransitId === place.id && !isLast && (
                            <View style={{ marginTop: 4, marginLeft: 5 }}>
                              <View style={[styles.transitEditRow, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1, marginRight: 5 }}>
                                  {TRANSIT_MODES.map(mode => (
                                    <TouchableOpacity
                                      key={mode}
                                      onPress={() => {
                                        setEditingTransitId(null);
                                        setPlaces(prev => {
                                          const updated = prev.map(p => (p.id === place.id ? { ...p, transitMode: mode, transitTime: '' } : p));
                                          AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                                          return updated;
                                        });
                                      }}
                                      style={[styles.transitChip, { backgroundColor: place.transitMode.includes(mode.substring(2)) ? themeColors.primary : themeColors.card, borderColor: themeColors.border, marginBottom: 4 }]}
                                    >
                                      <Text style={{ fontSize: 9, color: place.transitMode.includes(mode.substring(2)) ? '#FFF' : themeColors.text }}>{mode}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                                <TouchableOpacity
                                  onPress={() => {
                                    setEditingTransitId(null);
                                    setPlaces(prev => {
                                      const updated = prev.map(p => (p.id === place.id ? { ...p, transitTime: '' } : p));
                                      AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                                      return updated;
                                    });
                                  }}
                                  style={{ backgroundColor: themeColors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginRight: 4 }}
                                >
                                  <Text style={{ color: '#FFF', fontSize: 9 }}>重算</Text>
                                </TouchableOpacity>
                                <TextInput
                                  style={[styles.transitInput, { backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border }]}
                                  placeholder="手動"
                                  value={transitTimeInfo}
                                  onChangeText={setTransitTimeInfo}
                                  placeholderTextColor={themeColors.subText}
                                />
                                <TouchableOpacity
                                  onPress={() => {
                                    setPlaces(prev => {
                                      const updated = prev.map(p => (p.id === place.id ? { ...p, transitTime: transitTimeInfo } : p));
                                      AsyncStorage.setItem('@travel_db_timeline', JSON.stringify(updated)).catch(()=>{});
                                      return updated;
                                    });
                                    setEditingTransitId(null);
                                  }}
                                  style={{ backgroundColor: '#27AE60', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}
                                >
                                  <Text style={{ color: '#FFF', fontSize: 9 }}>儲存</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })
                : null}
            </View>
          );
        })}
        {currentTripPlaces.length > 0 ? <View style={{ height: 40 }} /> : null}
      </ScrollView>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', overflow: 'hidden' },
  header: { paddingTop: Platform.OS === 'web' ? 20 : 35, paddingBottom: 10, paddingHorizontal: 12 },
  headerText: { fontSize: 18, fontWeight: 'bold', color: 'white', letterSpacing: 0.5 },
  syncBtn: { paddingHorizontal: 6, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  mapToggleBtn: { paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1 },
  mapContainer: { height: 200, borderBottomWidth: 1, borderColor: '#CCC' },
  customPin: { padding: 3, borderRadius: 10, borderWidth: 1.5, borderColor: '#FFF', elevation: 2, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { padding: 4, marginRight: 4, borderRadius: 4, justifyContent: 'center' },
  dayFilterChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, marginRight: 4, justifyContent: 'center' },
  inputCard: { padding: 8, elevation: 2, zIndex: 5, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  daySelector: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 3 },
  dayBtn: { padding: 6 },
  timeChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginRight: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 6, padding: 6, marginRight: 6, fontSize: 16 },
  bulkInput: { borderWidth: 1, borderRadius: 6, height: 120, padding: 8, fontSize: 16 },
  addBtn: { paddingHorizontal: 10, borderRadius: 6, justifyContent: 'center', height: 32 },
  timelineArea: { flex: 1, paddingHorizontal: 10, paddingTop: 10 },
  dayHeader: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, marginBottom: 8, elevation: 1 },
  placeCard: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, elevation: 1, borderWidth: 1 },
  
  actionCircleBtn: { width: 22, height: 22, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginLeft: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  actionCircleBtnDelete: { width: 22, height: 22, backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginLeft: 6, borderWidth: 1, borderColor: 'rgba(231,76,60,0.2)' },
  actionBtnText: { fontSize: 11, fontWeight: 'bold', color: '#555' },
  actionBtnTextDelete: { fontSize: 11, fontWeight: 'bold', color: '#E74C3C' },
  
  microBadge: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginLeft: 5, justifyContent: 'center', alignItems: 'center' },

  numberPin: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  miniTransitBadge: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 10, minWidth: 36 },
  aiHubBtn: { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 15, margin: 4 },
  aiModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 15 },
  aiModalContainer: { width: '92%', borderRadius: 16, overflow: 'hidden', borderWidth: 1, elevation: 10 },
  aiModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12 },
  aiModalTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  aiModalCloseBtn: { padding: 4 },
  aiLoadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 30 },
  aiLoadingText: { fontSize: 14, fontWeight: 'bold' },
  aiContentText: { fontSize: 13, lineHeight: 22 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', borderRadius: 12, padding: 15, elevation: 5 },
  bulkBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginLeft: 8 },
  transitEditRow: { flexDirection: 'row', alignItems: 'center', padding: 4, borderRadius: 6, borderWidth: 1, marginTop: 2 },
  transitInput: { flex: 1, height: 22, borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, marginRight: 4, fontSize: 10 },
  transitChip: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginRight: 3 },
  compactInputBox: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, height: 34, fontSize: 12 }
});