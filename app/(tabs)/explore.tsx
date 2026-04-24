// 檔案路徑: D:\TravelApp\app\(tabs)\explore.tsx
// 版本紀錄: v1.3.2 (加入完整函式註解、強化 AI 視覺辨識防呆與各平台相容性標示)

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

// 動態引入 DateTimePicker (避免 Web 端發生編譯錯誤)
let DateTimePicker: any; 
if (Platform.OS !== 'web') { 
  DateTimePicker = require('@react-native-community/datetimepicker').default; 
}
const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

// 定義花費主分類與子分類清單
const EXPENSE_CATEGORIES = { 
  '🍔 飲食': ['早餐', '午餐', '晚餐', '點心', '飲料', '咖啡廳', '酒吧', '便利商店', '超市', '生鮮'], 
  '🚆 交通': ['大眾運輸', '計程車', '包車', '機票', '租車', '加油', '停車'], 
  '🏠 住宿': ['飯店', '民宿', '青旅', '稅金', '服務費'], 
  '🛍️ 購物': ['服飾', '配件', '藥妝', '保養', '伴手禮', '免稅品', '3C', '電器'], 
  '🎫 娛樂': ['景點門票', '體驗活動', '展覽', '表演', '樂園', '夜生活'], 
  '🛡️ 其他': ['簽證', '保險', '網路', '網卡', '小費', '手續費', '醫療', '急救'] 
};

// 定義分類代表顏色 (用於圓餅圖與標籤)
const CATEGORY_COLORS = { 
  '🍔 飲食': '#FF9F43', 
  '🚆 交通': '#54A0FF', 
  '🏠 住宿': '#10AC84', 
  '🛍️ 購物': '#EE5253', 
  '🎫 娛樂': '#9B59B6', 
  '🛡️ 其他': '#95A5A6' 
};

/**
 * 日期格式化工具 (YYYY/MM/DD)
 * 包含防呆處理，確保無效日期能退回至當前系統時間
 */
const formatDate = (dateObj: any) => {
  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) { 
    const now = new Date(); 
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`; 
  }
  return `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
};

export default function ExpenseScreen() {
  const { trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();
  
  // 行程下拉選單狀態
  const [isTripDropdownOpen, setIsTripDropdownOpen] = useState(false);
  const [newTripName, setNewTripName] = useState('');
  
  // 匯率狀態 (預設值，後續由 API 更新)
  const [currencyRates, setCurrencyRates] = useState({ 'EUR': 34.2, 'GBP': 40.5, 'JPY': 0.215, 'TWD': 1.0, 'USD': 32.0, 'THB': 0.88, 'KRW': 0.023 });
  
  const safeTrips = Array.isArray(trips) && trips.length > 0 ? trips : [{ id: 'default', name: '我的行程', budget: '50000' }];
  const currentTrip = safeTrips.find(t => t.id === currentTripId) || safeTrips[0];
  const [expenseCurrency, setExpenseCurrency] = useState('TWD');

  /**
   * 取得即時匯率 (以 TWD 為基準)
   * 來源: open.er-api.com
   */
  useEffect(() => {
    const fetchLiveRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/TWD'); 
        const data = await res.json();
        if (data && data.rates) {
          // 將 API 的匯率倒數轉換為我們習慣的格式 (外幣兌換台幣的值)
          setCurrencyRates({ 
            'EUR': 1 / data.rates.EUR, 
            'GBP': 1 / data.rates.GBP, 
            'JPY': 1 / data.rates.JPY, 
            'KRW': 1 / data.rates.KRW, 
            'THB': 1 / data.rates.THB, 
            'TWD': 1.0, 
            'USD': 1 / data.rates.USD 
          });
        }
      } catch (e) {
        console.warn("無法取得即時匯率，將使用預設匯率", e);
      }
    };
    fetchLiveRates();
  }, []);

  /**
   * 根據行程名稱自動偵測推薦使用的貨幣
   */
  useEffect(() => {
    const detectCurrency = (tripName: string) => {
      if (/日本|東京|大阪|京都|北海道|沖繩/.test(tripName)) return 'JPY';
      if (/英國|倫敦/.test(tripName)) return 'GBP';
      if (/法國|巴黎|歐洲|義大利|德國|瑞士/.test(tripName)) return 'EUR';
      if (/泰國|曼谷|清邁/.test(tripName)) return 'THB';
      if (/韓國|首爾|釜山/.test(tripName)) return 'KRW';
      if (/美國|紐約|夏威夷/.test(tripName)) return 'USD';
      return 'TWD';
    };
    if (currentTrip && currentTrip.name) {
      setExpenseCurrency(detectCurrency(currentTrip.name));
    }
  }, [currentTripId, currentTrip?.name]);

  // 表單輸入狀態
  const [expenseDateObj, setExpenseDateObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const date = formatDate(expenseDateObj); 
  const [statDate, setStatDate] = useState(date);
  
  const [expenseTitle, setExpenseTitle] = useState(''); 
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isAA, setIsAA] = useState(false); 
  const [mainCategory, setMainCategory] = useState('🍔 飲食'); 
  const [subCategory, setSubCategory] = useState('早餐');
  
  // 花費資料庫狀態
  const [expenses, setExpenses] = useState<any[]>([]); 
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isListening, setIsListening] = useState(false); 
  
  // 收據影像處理狀態
  const [receiptImage, setReceiptImage] = useState<string | null>(null); 
  const [statsMode, setStatsMode] = useState('daily'); 
  const [isStatDateDropdownOpen, setIsStatDateDropdownOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null); 
  const [isScanning, setIsScanning] = useState(false);
  
  const saveTimeoutRef = useRef<any>(null); 
  const titleInputRef = useRef<any>(null);

  // 畫面載入時讀取本地端資料庫
  useFocusEffect(useCallback(() => {
    const loadLocalData = async () => {
      try {
        const savedExpenses = await AsyncStorage.getItem('@travel_db_expenses');
        if (savedExpenses) { 
          const parsedExp = JSON.parse(savedExpenses); 
          if (Array.isArray(parsedExp)) setExpenses(parsedExp); 
        }
      } catch (e) { 
        AsyncStorage.removeItem('@travel_db_expenses'); 
      } finally { 
        setIsDataLoaded(true); 
      }
    };
    loadLocalData();
  }, []));

  // 自動儲存機制
  useEffect(() => {
    if (isDataLoaded) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => { 
        AsyncStorage.setItem('@travel_db_expenses', JSON.stringify(expenses)); 
      }, 500);
    }
  }, [expenses, isDataLoaded]);

  // 建立新行程
  const createNewTrip = () => {
    if(!newTripName) return;
    const newTrip = { id: Date.now().toString(), name: newTripName, budget: '50000', startDate: formatDate(new Date()) };
    setTrips([...safeTrips, newTrip]); 
    setCurrentTripId(newTrip.id); 
    setNewTripName(''); 
    setIsTripDropdownOpen(false);
  };

  // 開啟相機膠卷選擇收據
  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true, 
        aspect: [4, 3], 
        quality: 0.2, 
        base64: true 
      });
      if (!result.canceled) { 
        // 將 Base64 轉換為可直接顯示的 Data URI 格式
        setReceiptImage(result.assets[0].base64 ? `data:image/jpeg;base64,${result.assets[0].base64}` : result.assets[0].uri); 
      }
    } catch(e){}
  };

  /**
   * 🌟 V1.3 終極進化：Gemini API 視覺辨識引擎
   * 透過 Google Gemini Flash 模型，分析圖片內的收據資訊，並直接結構化輸出 JSON
   */
  const handleAIReceiptScan = async () => {
    if (!receiptImage) { alert('📸 請先拍收據，上傳圖片後才能呼叫 AI 辨識喔！'); return; }
    
    const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!API_KEY) { alert('🔑 找不到 Gemini API 金鑰，請確認 .env 設定檔。'); return; }

    setIsScanning(true);
    setExpenseTitle('🤖 影像分析中...');
    
    try {
      // 提取 base64 字串本體
      const base64Data = receiptImage.split(',')[1];
      
      const prompt = `
        你是一個專業的旅遊記帳助手。請分析這張收據圖片。
        要求：
        1. 識別店家名稱(title)、總金額(amount)、幣別代碼(currency)。
        2. 若收據有多個語言，請優先翻譯店家名稱為中文。若無法翻譯則保留原文。
        3. 根據內容判斷分類mainCategory：🍔 飲食, 🚆 交通, 🏠 住宿, 🛍️ 購物, 🎫 娛樂, 🛡️ 其他。
        4. 根據內容判斷subCategory (例如: 午餐, 咖啡廳, 服飾, 藥妝)。
        5. 嚴格只能輸出合法 JSON 格式，不要任何前後引言或 Markdown 標籤。
        範例格式：{"title": "一蘭拉麵", "amount": 2950, "currency": "JPY", "mainCategory": "🍔 飲食", "subCategory": "晚餐"}
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      // 取得模型回傳的純文字並清除可能的 Markdown 區塊標記
      const rawText = data.candidates[0].content.parts[0].text;
      const cleanJson = rawText.replace(/```json|```/g, '').trim(); 
      const result = JSON.parse(cleanJson);

      // 自動填入表單狀態
      setExpenseTitle(result.title || '');
      setExpenseAmount(String(result.amount || ''));
      if(result.currency) setExpenseCurrency(result.currency.toUpperCase());
      if(result.mainCategory && Object.keys(EXPENSE_CATEGORIES).includes(result.mainCategory)) {
        setMainCategory(result.mainCategory);
        setSubCategory(result.subCategory || EXPENSE_CATEGORIES[result.mainCategory as keyof typeof EXPENSE_CATEGORIES][0]);
      }
      alert('🎉 AI 辨識成功！請確認明細後點擊「新增這筆花費」。');

    } catch (e) {
      console.error(e);
      alert('❌ 辨識失敗，請確認圖片是否清晰，或網路連線是否正常。');
      setExpenseTitle('');
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Web 端的語音輸入處理 (WebKit Speech Recognition API)
   */
  const startVoiceInput = () => {
    if (Platform.OS === 'web' && 'webkitSpeechRecognition' in window) {
      setIsListening(true); 
      const recognition = new (window as any).webkitSpeechRecognition(); 
      recognition.lang = 'zh-TW';
      recognition.onresult = (event: any) => { 
        setExpenseTitle(event.results[0][0].transcript); 
        setIsListening(false); 
      };
      recognition.onerror = () => setIsListening(false); 
      recognition.onend = () => setIsListening(false); 
      recognition.start();
    } else { 
      // 手機端若無法啟動語音，將焦點放回輸入框
      titleInputRef.current?.focus(); 
    }
  };

  // 取得轉換後的台幣金額
  const getConvertedAmount = (val: string) => { 
    const num = parseFloat(val) || 0; 
    const rate = (currencyRates as any)[expenseCurrency] || 1; 
    return parseFloat((num * rate).toFixed(2)); 
  };

  // 新增花費至本地端狀態
  const addExpense = () => {
    if (!expenseTitle || !expenseAmount) { alert('請填寫完整資訊喔！'); return; }
    
    let finalLocalAmount = getConvertedAmount(expenseAmount); 
    // 若為 AA 制，自動將台幣總額除以 2
    if (isAA) finalLocalAmount = parseFloat((finalLocalAmount / 2).toFixed(2)); 
    
    const newExpense = { 
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, 
      tripId: currentTripId, 
      date, 
      title: expenseTitle, 
      foreignAmount: parseFloat(parseFloat(expenseAmount).toFixed(2)), 
      localAmount: finalLocalAmount, 
      currency: expenseCurrency, 
      mainCategory, 
      subCategory, 
      isAA, 
      image: receiptImage 
    };
    
    setExpenses([newExpense, ...expenses]); 
    setExpenseAmount(''); 
    setExpenseTitle(''); 
    setIsAA(false); 
    setReceiptImage(null); 
  };

  // Memoized 運算區：提升渲染效能
  const safeExpenses = useMemo(() => Array.isArray(expenses) ? expenses : [], [expenses]);
  const currentTripExpenses = useMemo(() => safeExpenses.filter(e => e.tripId === currentTripId), [safeExpenses, currentTripId]);
  const filteredExpenses = useMemo(() => currentTripExpenses.filter(item => statsMode === 'daily' ? item.date === statDate : true), [currentTripExpenses, statsMode, statDate]);
  
  // 依日期排序
  const sortedFilteredExpenses = useMemo(() => [...filteredExpenses].sort((a, b) => { 
    if (a.date !== b.date) return new Date(b.date).getTime() - new Date(a.date).getTime(); 
    return a.id > b.id ? -1 : 1; 
  }), [filteredExpenses]);
  
  // 計算總計與分類加總
  const totalLocal = useMemo(() => filteredExpenses.reduce((sum, item) => sum + (item.localAmount || 0), 0), [filteredExpenses]);
  const categoryStats = useMemo(() => filteredExpenses.reduce((acc: any, item) => { 
    acc[item.mainCategory] = (acc[item.mainCategory] || 0) + (item.localAmount || 0); 
    return acc; 
  }, {}), [filteredExpenses]);
  const allTimeTotal = useMemo(() => currentTripExpenses.reduce((sum, item) => sum + (item.localAmount || 0), 0), [currentTripExpenses]);
  
  // 計算預算進度
  const budgetNum = parseFloat(currentTrip.budget) || 1; 
  const budgetPct = Math.min((allTimeTotal / budgetNum) * 100, 100).toFixed(1);

  return (
    <KeyboardWrapper style={[styles.container, {backgroundColor: themeColors.background}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 滿版圖片檢視 Modal */}
      {viewingImage && (
        <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setViewingImage(null)}>
          <View style={styles.modalBackground}>
            <TouchableOpacity style={styles.modalCloseArea} onPress={() => setViewingImage(null)} />
            <View style={styles.modalContent}>
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setViewingImage(null)}><Text style={{color: '#FFF', fontSize: 18, fontWeight: 'bold'}}>✖ 關閉</Text></TouchableOpacity>
              <Image source={{ uri: viewingImage }} style={styles.fullScreenImage} resizeMode="contain" />
            </View>
          </View>
        </Modal>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* 頂部行程切換器與匯率提示 */}
        <View style={styles.header}>
          <View style={styles.tripSelector}>
            <Text style={styles.tripSelectorText}>📊 {currentTrip?.name} 記帳本</Text>
          </View>
        </View>

        

        {/* 總預算進度條區塊 */}
        <View style={[styles.card, styles.budgetCard, isDarkMode ? {backgroundColor: '#3D3811', borderColor: '#F1C40F'} : null]}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>總預算控制</Text>
            <TextInput style={[styles.budgetInput, isDarkMode ? {color: '#FFF'} : null]} keyboardType="numeric" value={currentTrip.budget} onChangeText={(val) => setTrips(safeTrips.map(t => t.id === currentTripId ? { ...t, budget: val } : t))} />
          </View>
          <View style={[styles.budgetBarBg, isDarkMode ? {backgroundColor: '#222'} : null]}>
            <View style={[styles.budgetBarFill, { width: `${budgetPct}%`, backgroundColor: allTimeTotal >= budgetNum ? '#E74C3C' : allTimeTotal > budgetNum * 0.8 ? '#F39C12' : '#27AE60' }]} />
          </View>
          <Text style={styles.budgetHint}>總花費: ${allTimeTotal.toFixed(2)} • 剩餘: ${Math.max(budgetNum - allTimeTotal, 0).toFixed(2)}</Text>
        </View>

        {/* 花費輸入卡片 */}
        <View style={[styles.card, {backgroundColor: themeColors.card}]}>
          <View style={styles.inputCard}>
            {/* 上傳圖片預覽 */}
            {receiptImage && (
              <View style={[styles.previewImageContainer, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                <Image source={{uri: receiptImage}} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeImageBtn} onPress={() => setReceiptImage(null)}><Text style={{color:'#FFF', fontSize:12}}>✖ 移除</Text></TouchableOpacity>
              </View>
            )}

            {/* 日期選擇區 */}
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.compactLabel}>📅 日期</Text>
              {Platform.OS === 'web' ? (
                <input type="date" value={expenseDateObj.toISOString().split('T')[0]} onChange={(e) => {
                    if (!e.target.value) return; 
                    const [y, m, d] = e.target.value.split('-'); 
                    const localDate = new Date(Number(y), Number(m) - 1, Number(d));
                    if (!isNaN(localDate.getTime())) { setExpenseDateObj(localDate); setStatDate(formatDate(localDate)); }
                  }} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, fontSize: '16px', backgroundColor: themeColors.background, color: themeColors.text, width: '100%', boxSizing: 'border-box', colorScheme: isDarkMode ? 'dark' : 'light' }}
                />
              ) : (
                <>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.compactInputBox, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}><Text style={{ fontSize: 16, color: themeColors.text }}>{formatDate(expenseDateObj)}</Text></TouchableOpacity>
                  {showDatePicker && DateTimePicker ? (<DateTimePicker value={expenseDateObj} mode="date" display="default" themeVariant={isDarkMode ? "dark" : "light"} onChange={(event: any, selectedDate: Date) => { setShowDatePicker(false); if (selectedDate) { setExpenseDateObj(selectedDate); setStatDate(formatDate(selectedDate)); } }} />) : null}
                </>
              )}
            </View>

            {/* 幣別選擇列 */}
            <View style={{ marginBottom: 15 }}>
              <Text style={styles.compactLabel}>💱 幣別</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                {['EUR', 'GBP', 'JPY', 'KRW', 'THB', 'TWD', 'USD'].map(c => (
                  <TouchableOpacity key={c} onPress={() => setExpenseCurrency(c)} style={[expenseCurrency === c ? styles.currencyChipActive : styles.currencyChipInactive, !isDarkMode && expenseCurrency !== c ? null : {backgroundColor: expenseCurrency === c ? '#F39C12' : themeColors.border}]}>
                    <Text style={[expenseCurrency === c ? styles.currencyTextActive : styles.currencyTextInactive, {color: expenseCurrency === c ? '#FFF' : themeColors.subText}]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 項目名稱與金額輸入 */}
            <View style={styles.compactRow}>
              <View style={styles.halfCol}>
                <Text style={styles.compactLabel}>🏷️ 項目</Text>
                <View style={[styles.compactInputWrapper, {backgroundColor: themeColors.background, borderColor: themeColors.border}]}>
                  <TextInput ref={titleInputRef} style={[styles.compactInput, {color: themeColors.text}]} placeholderTextColor={themeColors.subText} placeholder="輸入項目" value={expenseTitle} onChangeText={setExpenseTitle} />
                  <TouchableOpacity onPress={startVoiceInput}><Text>🎤</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.compactLabel}>💰 金額</Text>
                <TextInput style={[styles.compactInput, styles.compactInputBox, {backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border}]} placeholderTextColor={themeColors.subText} keyboardType="numeric" placeholder="0" value={expenseAmount} onChangeText={setExpenseAmount} />
              </View>
            </View>

            {/* 快速動作面板 (AA制 / 拍照 / AI) */}
            <View style={styles.actionBtnGrid}>
              <TouchableOpacity onPress={() => setIsAA(!isAA)} style={[styles.actionBtnGridItem, isAA ? {borderColor: themeColors.primary, backgroundColor: isDarkMode ? '#4A2323' : '#EBF5FB'} : {borderColor: themeColors.border}]}><Text style={{color: isAA ? themeColors.primary : themeColors.subText, fontWeight:'bold', fontSize: 12}}>👥 AA 制</Text></TouchableOpacity>
              <TouchableOpacity onPress={pickImage} style={[styles.actionBtnGridItem, {borderColor: '#9B59B6'}]}><Text style={{color: '#9B59B6', fontWeight:'bold', fontSize: 12}}>📸 拍收據</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleAIReceiptScan} style={[styles.actionBtnGridItem, {borderColor: '#F39C12', backgroundColor: isScanning ? (isDarkMode ? '#5C4000' : '#FCF3CF') : 'transparent'}]} disabled={isScanning}>
                <Text style={{color: '#F39C12', fontWeight:'bold', fontSize: 12}}>{isScanning ? '⏳ 辨識中' : '🤖 AI 掃描'}</Text>
              </TouchableOpacity>
            </View>

            {/* 分類選擇列 (主分類與子分類) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {Object.keys(EXPENSE_CATEGORIES).map(cat => (
                <TouchableOpacity key={cat} onPress={() => { setMainCategory(cat); setSubCategory((EXPENSE_CATEGORIES as any)[cat][0]); }} style={[styles.mainCatBtn, {backgroundColor: mainCategory === cat ? themeColors.primary : themeColors.background, borderColor: mainCategory === cat ? themeColors.primary : themeColors.border}]}><Text style={{color: mainCategory === cat ? '#FFF' : themeColors.subText, fontWeight: 'bold'}}>{cat}</Text></TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
              {(EXPENSE_CATEGORIES as any)[mainCategory].map((sub: string) => (
                <TouchableOpacity key={sub} onPress={() => { setSubCategory(sub); setExpenseTitle(sub); }} style={[styles.subCatBtn, {backgroundColor: subCategory === sub ? themeColors.secondary : 'transparent', borderColor: themeColors.border}]}><Text style={{color: subCategory === sub ? '#FFF' : themeColors.subText}}>{sub}</Text></TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={addExpense} style={styles.addBtn}><Text style={styles.addBtnText}>➕ 新增這筆花費</Text></TouchableOpacity>
          </View> 
        </View>

        {/* 統計與圓餅圖分析卡片 */}
        <View style={[styles.card, {backgroundColor: themeColors.card}]}>
          <View style={styles.statHeader}>
            <Text style={[styles.cardTitle, {color: themeColors.text}]}>📊 比例分析</Text>
            <View style={[styles.toggleRow, {backgroundColor: themeColors.background}]}>
              <TouchableOpacity onPress={() => setStatsMode('daily')} style={[styles.toggleBtn, statsMode === 'daily' ? styles.toggleBtnActive : null]}><Text style={[styles.toggleText, statsMode === 'daily' ? {color:'#FFF'} : {color: themeColors.subText}]}>單日</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setStatsMode('range')} style={[styles.toggleBtn, statsMode === 'range' ? styles.toggleBtnActive : null]}><Text style={[styles.toggleText, statsMode === 'range' ? {color:'#FFF'} : {color: themeColors.subText}]}>全部</Text></TouchableOpacity>
            </View>
          </View>
          {statsMode === 'daily' && (
            <View style={{marginBottom: 10, zIndex: 10}}>
               <TouchableOpacity 
                 style={styles.statDateTrigger} 
                 onPress={() => setIsStatDateDropdownOpen(!isStatDateDropdownOpen)}
               >
                 <Text style={{color: themeColors.secondary, fontWeight: 'bold'}}>
                   📅 選擇統計日: {statDate} ▼
                 </Text>
               </TouchableOpacity>
               
               {/* 🌟 修正 Bug 5：實作真實的下拉日期選單 */}
               {isStatDateDropdownOpen && (
                 <View style={[
                   { position: 'absolute', top: 30, left: 15, right: 15, borderRadius: 8, borderWidth: 1, elevation: 5, zIndex: 100, maxHeight: 150 }, 
                   { backgroundColor: themeColors.card, borderColor: themeColors.border }
                 ]}>
                   <ScrollView nestedScrollEnabled={true}>
                     {/* 抓取不重複的日期清單 */}
                     {[...new Set(currentTripExpenses.map(e => e.date))]
                       .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                       .map(d => (
                         <TouchableOpacity 
                           key={d} 
                           style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: themeColors.border }} 
                           onPress={() => { setStatDate(d); setIsStatDateDropdownOpen(false); }}
                         >
                           <Text style={{ color: statDate === d ? themeColors.primary : themeColors.text, fontWeight: statDate === d ? 'bold' : 'normal' }}>
                             {d}
                           </Text>
                         </TouchableOpacity>
                     ))}
                     {[...new Set(currentTripExpenses.map(e => e.date))].length === 0 && (
                       <Text style={{ padding: 12, color: themeColors.subText }}>尚無花費紀錄</Text>
                     )}
                   </ScrollView>
                 </View>
               )}
            </View>
          )}

          {totalLocal > 0 ? (
            <View>
              <Text style={{fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 15, color: themeColors.text}}>
                {statsMode === 'daily' ? '📅 單日總計' : '💰 全部總計'}: ${totalLocal.toFixed(0)} TWD
              </Text>
              
              <View style={styles.chartContainer}>
                {Platform.OS === 'web' ? (
                  /* Web 端透過 CSS conic-gradient 渲染圓餅圖 */
                  <View style={[styles.donutBase, { backgroundColor: themeColors.background, backgroundImage: `conic-gradient(${Object.keys(categoryStats).filter(cat => categoryStats[cat] > 0).reduce((acc, cat, idx, arr) => { const pct = (categoryStats[cat] / totalLocal) * 100; const prevPct = acc.total; acc.total += pct; acc.str += `${(CATEGORY_COLORS as any)[cat]} ${prevPct}% ${acc.total}%${idx < arr.length - 1 ? ', ' : ''}`; return acc; }, { str: '', total: 0 }).str})` } as any]}>
                    <View style={[styles.donutInner, {backgroundColor: themeColors.card}]}><Text style={[styles.donutTotal, {color: themeColors.text}]}>${totalLocal.toFixed(0)}</Text><Text style={styles.donutSub}>總計</Text></View>
                  </View>
                ) : (
                  /* Native 端疊加圓環片段渲染圓餅圖 */
                  <View style={[styles.donutBase, {backgroundColor: themeColors.background}]}>
                    {Object.keys(categoryStats).map((cat, index) => { 
                      const val = categoryStats[cat]; 
                      const pct = val / totalLocal; 
                      if (pct === 0) return null; 
                      return (<View key={`ring-${index}`} style={[styles.donutSegment, { backgroundColor: (CATEGORY_COLORS as any)[cat], transform: [{ rotate: `${(index * 45)}deg` }], opacity: 0.8 + (pct * 0.2) }]} />); 
                    })}
                    <View style={[styles.donutInner, {backgroundColor: themeColors.card}]}><Text style={[styles.donutTotal, {color: themeColors.text}]}>${totalLocal.toFixed(0)}</Text><Text style={styles.donutSub}>總計</Text></View>
                  </View>
                )}
                
                <View style={styles.legendContainer}>
                  {Object.keys(categoryStats).filter(cat => categoryStats[cat] > 0).sort((a,b) => categoryStats[b] - categoryStats[a]).map(cat => (
                    <View key={`leg-${cat}`} style={styles.legendItem}>
                      <View style={[styles.legendDot, {backgroundColor: (CATEGORY_COLORS as any)[cat]}]} />
                      <Text style={[styles.legendText, {color: themeColors.subText}]}>
                        {cat} ${categoryStats[cat].toFixed(0)} ({((categoryStats[cat]/totalLocal)*100).toFixed(0)}%)
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : (<Text style={[styles.statSub, {textAlign:'center', marginTop: 10}]}>此區間尚無花費</Text>)}
        </View>

        {/* 下方明細列表區塊 */}
        <View style={[styles.card, {backgroundColor: themeColors.card}]}>
          <Text style={[styles.cardTitle, {color: themeColors.text}]}>📝 行程明細 ({statsMode === 'daily' ? statDate : '全部'})</Text>
          {sortedFilteredExpenses.length === 0 ? (<Text style={{textAlign: 'center', color: themeColors.subText, marginVertical: 20}}>此區間尚無花費</Text>) : (
            sortedFilteredExpenses.map((item) => (
              <View key={item.id} style={[styles.expenseItem, {borderTopColor: themeColors.border}]}>
                {item.image && (<TouchableOpacity onPress={() => setViewingImage(item.image)}><Image source={{ uri: item.image }} style={styles.tinyThumb} /></TouchableOpacity>)}
                <View style={{flex: 1, marginLeft: item.image ? 10 : 0}}>
                  <Text style={[styles.expenseTitle, {color: themeColors.text}]}>{item.title} {item.isAA && <Text style={{color: '#E67E22', fontSize: 12}}> [AA]</Text>}</Text>
                  <Text style={styles.expenseDate}>{item.date} • {item.subCategory}</Text>
                </View>
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={[styles.expenseAmount, { color: (CATEGORY_COLORS as any)[item.mainCategory] }]}>{item.foreignAmount} {item.currency}</Text>
                  <Text style={styles.localAmountHint}>實付: {item.localAmount.toFixed(2)} TWD</Text>
                </View>
                <TouchableOpacity onPress={() => setExpenses(expenses.filter(e => e.id !== item.id))} style={{marginLeft: 15}}><Text style={{fontSize: 18}}>🗑️</Text></TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, 
  scrollContent: { paddingBottom: 30 }, 
  header: { backgroundColor: '#3498DB', padding: 20, paddingTop: Platform.OS === 'web' ? 20 : 40, alignItems: 'center' },
  card: { marginHorizontal: 15, marginTop: 15, borderRadius: 15, elevation: 3, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 5 }, 
  inputCard: { padding: 15, borderRadius: 15 },
  actionBtnGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }, 
  actionBtnGridItem: { flex: 1, paddingVertical: 10, borderWidth: 1, borderRadius: 8, alignItems: 'center', marginHorizontal: 4, flexDirection: 'row', justifyContent: 'center' },
  mainCatBtn: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, marginRight: 10 }, 
  subCatBtn: { paddingVertical: 6, paddingHorizontal: 15, borderRadius: 15, borderWidth: 1, marginRight: 8 },
  addBtn: { backgroundColor: '#2ECC71', padding: 15, borderRadius: 10, alignItems: 'center' }, 
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }, 
  halfCol: { flex: 1, marginHorizontal: 4 }, 
  compactLabel: { fontSize: 12, color: '#888', marginBottom: 4, fontWeight: 'bold' }, 
  compactInputBox: { borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 }, 
  compactInputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 }, 
  compactInput: { flex: 1, paddingVertical: 10, fontSize: 16 },
  currencyChipActive: { backgroundColor: '#F39C12', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginHorizontal: 4 }, 
  currencyChipInactive: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 15, marginHorizontal: 2, borderWidth: 1 }, 
  currencyTextActive: { fontSize: 16, fontWeight: 'bold' }, 
  currencyTextInactive: { fontSize: 12 },
  tripSelector: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 }, 
  tripSelectorText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }, 
  rateTagText: { color: '#FFF', fontSize: 12, marginRight: 10 },
  tripMenu: { marginHorizontal: 20, marginTop: -10, borderRadius: 10, elevation: 5, padding: 10, zIndex: 9 }, 
  tripItem: { padding: 12, borderBottomWidth: 1 }, 
  newTripRow: { flexDirection: 'row', marginTop: 10 }, 
  newTripInput: { flex: 1, borderWidth: 1, borderRadius: 5, paddingHorizontal: 10, height: 40 }, 
  newTripBtn: { justifyContent: 'center', paddingHorizontal: 15, borderRadius: 5, marginLeft: 5 },
  budgetCard: { padding: 15, borderWidth: 1 }, 
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, 
  budgetTitle: { fontWeight: 'bold', color: '#D35400' }, 
  budgetInput: { borderBottomWidth: 1, borderBottomColor: '#D35400', width: 80, textAlign: 'right', fontWeight: 'bold' }, 
  budgetBarBg: { height: 10, borderRadius: 5, marginTop: 10, overflow: 'hidden' }, 
  budgetBarFill: { height: '100%', borderRadius: 5 }, 
  budgetHint: { textAlign: 'right', fontSize: 12, color: '#7F8C8D', marginTop: 5 },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: 15, paddingBottom: 0 }, 
  cardTitle: { fontSize: 16, fontWeight: 'bold', padding: 15, paddingBottom: 0 }, 
  toggleRow: { flexDirection: 'row', borderRadius: 20, overflow: 'hidden' }, 
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6 }, 
  toggleBtnActive: { backgroundColor: '#3498DB' }, 
  toggleText: { fontSize: 12, fontWeight: 'bold' }, 
  statSub: { fontSize: 14, color: '#E74C3C', fontWeight: 'bold', marginBottom: 15, paddingHorizontal: 15 }, 
  statDateTrigger: { paddingHorizontal: 15 },
  expenseItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, borderTopWidth: 1 }, 
  tinyThumb: { width: 40, height: 40, borderRadius: 5 }, 
  expenseTitle: { fontSize: 15, fontWeight: 'bold' }, 
  expenseDate: { fontSize: 12, color: '#95A5A6', marginTop: 2 }, 
  expenseAmount: { fontSize: 15, fontWeight: 'bold' }, 
  localAmountHint: { fontSize: 10, color: '#999', marginTop: 2 },
  previewImageContainer: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 15, borderWidth: 1 }, 
  previewImage: { width: 60, height: 60, borderRadius: 8, marginRight: 15 }, 
  removeImageBtn: { backgroundColor: '#E74C3C', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }, 
  modalCloseArea: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, 
  modalContent: { width: '90%', height: '80%', backgroundColor: '#000', borderRadius: 10, overflow: 'hidden', justifyContent: 'center' }, 
  fullScreenImage: { width: '100%', height: '100%' }, 
  closeModalBtn: { position: 'absolute', top: 15, right: 15, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8 },
  chartContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: 15, paddingHorizontal: 15 }, 
  donutBase: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }, 
  donutInner: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 10 }, 
  donutTotal: { fontSize: 16, fontWeight: 'bold' }, 
  donutSub: { fontSize: 9, color: '#95A5A6', marginTop: 2 }, 
  donutSegment: { position: 'absolute', width: '100%', height: '100%', left: '50%' }, 
  legendContainer: { flex: 1, marginLeft: 20 }, 
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, 
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 }, 
  legendText: { fontSize: 12, fontWeight: '500' }
});