// 檔案路徑: D:\TravelApp\app\(tabs)\packing.tsx
// 版本紀錄: v1.2.0 (加入完整函式註解、強化天氣快取讀取的防呆機制)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

// 根據平台決定是否使用鍵盤避免視圖，防止 Web 端報錯
const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

// 行李清單分類常數
const CATEGORIES = ['🛂 證件財務', '🔌 3C 電子', '👕 衣物穿搭', '💊 洗漱藥品', '🎒 隨身實用', '✏️ 自訂項目'];

// 預設行李清單項目
const DEFAULT_ITEMS = [ 
  { id: '1', text: '護照 (確認效期>6個月)', category: '🛂 證件財務', checked: false }, 
  { id: '2', text: '簽證 / 數位入境卡 (VJW)', category: '🛂 證件財務', checked: false }, 
  { id: '3', text: '外幣現鈔 & 零錢包', category: '🛂 證件財務', checked: false }, 
  { id: '5', text: '網卡 / eSIM / WiFi機', category: '🔌 3C 電子', checked: false }, 
  { id: '6', text: '行動電源 (不可托運)', category: '🔌 3C 電子', checked: false }, 
  { id: '9', text: '換洗衣物 & 內衣褲', category: '👕 衣物穿搭', checked: false }, 
  { id: '13', text: '個人常備藥 (感冒/腸胃/止痛)', category: '💊 洗漱藥品', checked: false }, 
  { id: '17', text: '摺疊雨傘', category: '🎒 隨身實用', checked: false } 
];

export default function PackingScreen() {
  const { trips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();
  
  // 狀態管理
  const [isTripDropdownOpen, setIsTripDropdownOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState(''); 
  const [selectedCat, setSelectedCat] = useState('✏️ 自訂項目');
  const [smartTip, setSmartTip] = useState<string | null>(null);

  // 當畫面獲得焦點時，載入清單與天氣提示
  useFocusEffect(useCallback(() => {
    const loadData = async () => {
      try {
        await loadPackingListForTrip(currentTripId);
        // 🌟 QE 修復 1：讀取特定行程的專屬天氣
        const weatherCache = await AsyncStorage.getItem(`@travel_db_weather_${currentTripId}`);
        
        if (weatherCache) {
          try {
            const weather = JSON.parse(weatherCache); 
            const firstDayWeather = weather["1"]; 
            
            if (firstDayWeather && firstDayWeather.tempMin !== undefined) {
              let tip = `今日氣溫 ${firstDayWeather.tempMin}~${firstDayWeather.tempMax}°C，☔${firstDayWeather.pop}%。\n`;
              
              // 🌟 QE 修復 2：更嚴謹的穿搭生活邏輯
              if (firstDayWeather.tempMin < 15) {
                tip += "🥶 早晚偏冷，強烈建議備妥保暖外套或發熱衣！"; 
              } else if (firstDayWeather.tempMax > 28) {
                tip += "🥵 天氣炎熱，記得帶防曬乳、太陽眼鏡與短袖！"; 
              } else {
                tip += "⛅ 氣溫舒適，帶件長袖或薄外套即可完美應對。";
              }
              
              if (firstDayWeather.pop > 40) tip += " 🌧️ 降雨機率高，別忘了把折疊傘放進包包！";
              setSmartTip(tip);
            } else {
              setSmartTip("⛅ 尚未抓取天氣，請先至「行程地圖」排定景點！");
            }
          } catch (parseError) {
            setSmartTip("⛅ 天氣資料解析失敗，請重新整理。");
          }
        } else {
          // 處理完全沒資料的情況
          setSmartTip("⛅ 尚無氣象資料，請先至「行程地圖」排定景點產生預報！");
        }        
      } catch (e) { 
        console.error(e); 
      }
    };
    loadData();
  }, [currentTripId]));

  /**
   * 根據當前行程 ID 載入對應的行李清單
   */
  const loadPackingListForTrip = async (tripId: string) => {
    try {
      const savedItems = await AsyncStorage.getItem(`@travel_db_packing_${tripId}`);
      if (savedItems) { 
        const parsed = JSON.parse(savedItems); 
        if (Array.isArray(parsed) && parsed.length > 0) { 
          setItems(parsed); 
          return; 
        } 
      }
      // 若無存檔或存檔為空，載入預設清單
      setItems(DEFAULT_ITEMS); 
    } catch(e) {}
  };

  /**
   * 儲存清單狀態並寫入 AsyncStorage
   */
  const saveItems = async (newItems: any[]) => { 
    setItems(newItems); 
    try { 
      await AsyncStorage.setItem(`@travel_db_packing_${currentTripId}`, JSON.stringify(newItems)); 
    } catch(e) {} 
  };

  // 項目操作函式
  const toggleItem = useCallback((id: string) => saveItems(items.map(item => item.id === id ? { ...item, checked: !item.checked } : item)), [items]);
  const deleteItem = useCallback((id: string) => saveItems(items.filter(i => i.id !== id)), [items]);
  
  // 新增自訂項目
  const addItem = () => { 
    if (!newItem) return; 
    saveItems([...items, { id: Date.now().toString(), text: newItem, category: selectedCat, checked: false }]); 
    setNewItem(''); 
  };
  
  // 取消全選 (歸零)
  const uncheckAll = () => saveItems(items.map(i => ({ ...i, checked: false })));

  // 重設為系統預設清單 (帶有跨平台防呆確認)
  const resetToDefault = () => {
    const confirmAction = () => saveItems(DEFAULT_ITEMS);
    if (Platform.OS === 'web') { 
      if (window.confirm('確定要清除所有自訂項目，並載入預設清單嗎？')) confirmAction(); 
    } else { 
      Alert.alert('重設清單', '確定要還原預設清單嗎？', [{ text: '取消', style: 'cancel' }, { text: '確定', onPress: confirmAction }]); 
    }
  };

  // 🌟 V1.1 優化：效能防護，避免陣列重複計算
  const safeItems = useMemo(() => Array.isArray(items) ? items : [], [items]);
  const checkedCount = useMemo(() => safeItems.filter(i => i.checked).length, [safeItems]);
  // 🌟 取代原本的 .toFixed(0)，改用 Math.round 確保 progress 是純數字 (number)
  const progress = useMemo(() => safeItems.length > 0 ? Math.round((checkedCount / safeItems.length) * 100) : 0, [checkedCount, safeItems.length]);
  const currentTrip = useMemo(() => trips.find(t => t.id === currentTripId) || trips[0], [trips, currentTripId]);

  // 🌟 改用活潑清爽的夏日晴空藍 (Sky Blue)，提升高級感并減輕視覺壓力
  const HEADER_BG_COLOR = isDarkMode ? '#2D3436' : '#74FFCF';

  return (
    <KeyboardWrapper style={[styles.container, {backgroundColor: themeColors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 🌟 V1.1 優化：大幅縮減 padding，解決「上面太厚重」的問題 */}
      <View style={[styles.header, {backgroundColor: HEADER_BG_COLOR}]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <View style={styles.tripSelector}>
            <Text style={styles.tripSelectorText}>🧳 {currentTrip?.name} 行李清單</Text>
          </View>
          {/* 🌟 V1.1 優化：將歸零按鈕移至上方同一列，節省垂直空間 */}
          <View style={{flexDirection: 'row'}}>
            <TouchableOpacity onPress={uncheckAll} style={[styles.headerBtn, {marginRight: 8}]}><Text style={styles.headerBtnText}>✨ 歸零</Text></TouchableOpacity>
            <TouchableOpacity onPress={resetToDefault} style={styles.headerBtn}><Text style={styles.headerBtnText}>🔄 重設</Text></TouchableOpacity>
          </View>
        </View>
        
        {/* 行程下拉選單 */}
        
        {/* 智慧天氣提示 */}
        {smartTip && (
          <View style={[styles.smartTipBox, {backgroundColor: isDarkMode ? '#3D3811' : 'rgba(255,255,255,0.95)'}]}>
            <Text style={styles.smartTipText}>🤖 {smartTip}</Text>
          </View>
        )}

        {/* 動態打包進度條 */}
        <View style={styles.progressContainer}>
          {/* 🌟 在 width 後面加上 as any 來消除型別警告 */}
          <View style={[styles.progressBar, { width: `${progress}%` as any, backgroundColor: progress === 100 ? '#F1C40F' : '#FFF' }]} />
          <Text style={[styles.progressText, {color: progress > 50 ? (isDarkMode ? '#FFF' : '#333') : '#FFF'}]}>打包進度: {checkedCount} / {safeItems.length} ({progress}%)</Text>
        </View>

      {/* 清單列表區塊 */}
      <ScrollView style={{ flex: 1, padding: 15 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {CATEGORIES.map(cat => {
          const catItems = safeItems.filter(i => i.category === cat); 
          if (catItems.length === 0) return null;
          return (
            <View key={cat} style={styles.catGroup}>
              {/* 分類標題與數量統計 */}
              <View style={styles.catTitleRow}>
                <Text style={[styles.catTitle, {color: themeColors.text}]}>{cat}</Text>
                <Text style={[styles.catCount, {color: themeColors.subText}]}>{catItems.filter(i=>i.checked).length}/{catItems.length}</Text>
              </View>
              {/* 該分類下的項目 */}
              {catItems.map(item => (
                <TouchableOpacity key={item.id} style={[styles.itemCard, {backgroundColor: item.checked ? themeColors.background : themeColors.card, elevation: item.checked ? 0 : 1}]} onPress={() => toggleItem(item.id)}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.checkbox, item.checked ? styles.checkboxChecked : {borderColor: themeColors.border}]}>{item.checked ? <Text style={{fontSize:12, color:'#FFF'}}>✓</Text> : null}</View>
                    <Text style={[styles.itemText, {color: item.checked ? themeColors.subText : themeColors.text}, item.checked ? styles.itemTextChecked : null]}>{item.text}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteItem(item.id)} style={{padding: 5}}><Text style={{ opacity: 0.5 }}>🗑️</Text></TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
        <View style={{height: 50}} />
      </ScrollView>

      {/* 底部新增項目輸入區 */}
      <View style={[styles.inputArea, {backgroundColor: themeColors.card, borderColor: themeColors.border}]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
          {CATEGORIES.map(cat => (
             <TouchableOpacity key={cat} onPress={() => setSelectedCat(cat)} style={[styles.catTag, {backgroundColor: selectedCat === cat ? '#00CEC9' : themeColors.background}]}>
               <Text style={[styles.catTagText, {color: selectedCat === cat ? '#FFF' : themeColors.subText}]}>{cat.substring(0, 2)}</Text>
             </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, {backgroundColor: themeColors.background, color: themeColors.text}]} placeholderTextColor={themeColors.subText} placeholder={`新增至 [${selectedCat}]...`} value={newItem} onChangeText={setNewItem} onSubmitEditing={addItem} />
          <TouchableOpacity style={[styles.addBtn, {backgroundColor: HEADER_BG_COLOR}]} onPress={addItem}><Text style={{color:'#FFF', fontWeight:'bold'}}>新增</Text></TouchableOpacity>
        </View>
      </View>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // 🌟 V1.1 優化：大幅減少頂部 padding，解決厚重感
  header: { paddingTop: Platform.OS === 'web' ? 20 : 35, paddingBottom: 15, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 5, zIndex: 10 },
  tripSelector: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15 },
  tripSelectorText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  tripMenu: { position: 'absolute', top: 80, left: 20, right: 20, borderRadius: 10, elevation: 10, padding: 10, zIndex: 20 }, 
  tripItem: { padding: 12, borderBottomWidth: 1 },
  // 🌟 V1.1 優化：讓天氣提醒變得更緊湊精緻
  smartTipBox: { padding: 8, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' }, 
  smartTipText: { color: '#D35400', fontWeight: 'bold', fontSize: 12, textAlign: 'left', lineHeight: 18 },
  headerBtn: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }, 
  headerBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  // 🌟 V1.1 優化：進度條變得更細緻，顏色對比調整
  progressContainer: { marginTop: 12, height: 24, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, overflow: 'hidden', justifyContent: 'center' }, 
  progressBar: { height: '100%' }, 
  progressText: { position: 'absolute', alignSelf: 'center', fontSize: 11, fontWeight: 'bold' },
  catGroup: { marginBottom: 20 }, 
  catTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10, paddingHorizontal: 5 }, 
  catTitle: { fontSize: 18, fontWeight: 'bold' }, 
  catCount: { fontSize: 12, fontWeight: 'bold' },
  itemCard: { flexDirection: 'row', padding: 15, borderRadius: 12, marginBottom: 8, alignItems: 'center', justifyContent: 'space-between' },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 }, 
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginRight: 12, justifyContent: 'center', alignItems: 'center' }, 
  checkboxChecked: { backgroundColor: '#00CEC9', borderColor: '#00CEC9' },
  itemText: { fontSize: 16, fontWeight: '500', flex: 1 }, 
  itemTextChecked: { textDecorationLine: 'line-through' },
  inputArea: { padding: 15, borderTopWidth: 1, elevation: 10 }, 
  catTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginRight: 8 }, 
  catTagText: { fontSize: 12, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row' }, 
  input: { flex: 1, borderRadius: 8, paddingHorizontal: 15, height: 45, fontSize: 16 }, 
  addBtn: { paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8, marginLeft: 10 }
});