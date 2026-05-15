// 檔案路徑: D:\TravelApp\app\(tabs)\explore.tsx
// 版本紀錄: v1.8.12 (防彈終極版：資料源頭淨化，阻擋舊備份 NaN 導致的手機 Safari 致命白畫面，100% 完整無刪減)

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTravelContext } from '../../context/TravelContext';

let DateTimePicker: any;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const KeyboardWrapper: any = Platform.OS === 'web' ? View : KeyboardAvoidingView;

const EXPENSE_CATEGORIES = {
  '🍔 飲食': ['早餐', '午餐', '晚餐', '點心', '飲料', '咖啡廳', '酒吧', '便利商店', '超市', '生鮮'],
  '🚆 交通': ['大眾運輸', '計程車', '包車', '機票', '租車', '加油', '停車'],
  '🏠 住宿': ['飯店', '民宿', '青旅', '稅金', '服務費'],
  '🛍️ 購物': ['服飾', '配件', '藥妝', '保養', '伴手禮', '免稅品', '3C', '電器'],
  '🎫 娛樂': ['景點門票', '體驗活動', '展覽', '表演', '樂園', '夜生活'],
  '🛡️ 其他': ['簽證', '保險', '網路', '網卡', '小費', '手續費', '醫療', '急救']
};

const CATEGORY_COLORS = {
  '🍔 飲食': '#FF9F43',
  '🚆 交通': '#54A0FF',
  '🏠 住宿': '#10AC84',
  '🛍️ 購物': '#EE5253',
  '🎫 娛樂': '#9B59B6',
  '🛡️ 其他': '#95A5A6'
};

const formatDate = (dateObj: any) => {
  if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
};

const formatForWebDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function ExpenseScreen() {
  const { trips, setTrips, currentTripId, setCurrentTripId, isDarkMode, themeColors } = useTravelContext();

  const [currencyRates, setCurrencyRates] = useState({ 'EUR': 34.2, 'GBP': 40.5, 'JPY': 0.215, 'TWD': 1.0, 'USD': 32.0, 'THB': 0.88, 'KRW': 0.023 });
  
  const safeTrips = Array.isArray(trips) && trips.length > 0 ? trips : [{ id: 'default', name: '我的行程', budget: '50000' }];
  const currentTrip = safeTrips.find(t => t.id === currentTripId) || safeTrips[0];
  const [expenseCurrency, setExpenseCurrency] = useState('TWD');

  useEffect(() => {
    const fetchLiveRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/TWD');
        const data = await res.json();
        if (data && data.rates) {
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
      } catch (e) {}
    };
    fetchLiveRates();
  }, []);

  useEffect(() => {
    const detectCurrency = (tripName: string) => {
      if (!tripName) return 'TWD';
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

  const [expenseDateObj, setExpenseDateObj] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const date = formatDate(expenseDateObj);
  const [statDate, setStatDate] = useState(date);

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isAA, setIsAA] = useState(false);
  const [mainCategory, setMainCategory] = useState('🍔 飲食');
  const [subCategory, setSubCategory] = useState('早餐');

  const [expenses, setExpenses] = useState<any[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [statsMode, setStatsMode] = useState('daily');
  const [isStatDateDropdownOpen, setIsStatDateDropdownOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const saveTimeoutRef = useRef<any>(null);
  const titleInputRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      const loadLocalData = async () => {
        try {
          const savedExpenses = await AsyncStorage.getItem('@travel_db_expenses');
          if (savedExpenses) {
            try {
              const parsedExp = JSON.parse(savedExpenses);
              if (parsedExp && Array.isArray(parsedExp)) {
                // 🌟 終極防彈淨化器：確保舊備份金額絕對是數字，杜絕 NaN 崩潰
                const cleanExp = parsedExp.map((e: any) => ({
                  ...e,
                  localAmount: Number(e.localAmount) || 0,
                  foreignAmount: Number(e.foreignAmount) || 0,
                  date: String(e.date || ''),
                  title: String(e.title || '未命名項目'),
                  mainCategory: String(e.mainCategory || '🍔 飲食'),
                  subCategory: String(e.subCategory || '其他'),
                }));
                setExpenses(cleanExp);
              }
            } catch(e) {}
          }
        } catch (e) {
          AsyncStorage.removeItem('@travel_db_expenses');
        } finally {
          setIsDataLoaded(true);
        }
      };
      loadLocalData();
    }, [])
  );

  useEffect(() => {
    if (isDataLoaded) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        AsyncStorage.setItem('@travel_db_expenses', JSON.stringify(expenses)).catch(() => {});
      }, 500);
    }
  }, [expenses, isDataLoaded]);

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.1,
        maxWidth: 1024,
        maxHeight: 1024,
        base64: true
      });
      if (!result.canceled) {
        setReceiptImage(
          result.assets[0].base64
            ? `data:image/jpeg;base64,${result.assets[0].base64}`
            : result.assets[0].uri
        );
      }
    } catch (e) {}
  };

  const handleAIReceiptScan = async () => {
    if (!receiptImage) return;
    const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!API_KEY) return;

    setIsScanning(true);
    setExpenseTitle('🤖 影像分析中...');

    try {
      let base64Data = '';
      if (receiptImage.includes('base64,')) {
        base64Data = receiptImage.split('base64,')[1];
      } else {
        setIsScanning(false);
        setExpenseTitle('');
        return;
      }

      const prompt = `分析收據：1.辨識店家(title)、總額(amount純數字)、幣別(currency)。2.翻譯店名為中文。3.歸類mainCategory(🍔 飲食, 🚆 交通, 🏠 住宿, 🛍️ 購物, 🎫 娛樂, 🛡️ 其他)與subCategory。嚴格輸出JSON。`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error();

      const cleanJson = data.candidates[0].content.parts[0].text
        .replace(/\`\`\`json/g, '')
        .replace(/\`\`\`/g, '')
        .trim();
      const result = JSON.parse(cleanJson);

      setExpenseTitle(result.title || '');
      setExpenseAmount(String(result.amount || ''));
      if (result.currency) setExpenseCurrency(result.currency.toUpperCase());

      if (
        result.mainCategory &&
        Object.keys(EXPENSE_CATEGORIES).includes(result.mainCategory)
      ) {
        setMainCategory(result.mainCategory);
        setSubCategory(
          result.subCategory ||
            (EXPENSE_CATEGORIES as any)[result.mainCategory][0]
        );
      }
    } catch (e) {
      setExpenseTitle('');
    } finally {
      setIsScanning(false);
    }
  };

  const startVoiceInput = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (Platform.OS === 'web' && SpeechRecognition) {
        if (isListening) return;
        setIsListening(true);
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-TW';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          if (event.results && event.results[0] && event.results[0][0]) {
            setExpenseTitle(event.results[0][0].transcript);
          }
          setIsListening(false);
        };
        recognition.onerror = (e: any) => {
          console.error('Speech recognition error', e);
          setIsListening(false);
          alert('語音辨識失敗或尚未授權麥克風，請手動輸入。');
        };
        recognition.onend = () => {
          setIsListening(false);
        };
        recognition.start();
      } else {
        alert('您的裝置或瀏覽器不支援此語音輸入功能，請手動輸入。');
        titleInputRef.current?.focus();
      }
    } catch (error) {
      setIsListening(false);
      alert('語音啟動失敗，這可能是因為您使用了無痕模式或不支援的瀏覽器。');
      titleInputRef.current?.focus();
    }
  };

  const getConvertedAmount = (val: string) => {
    const num = parseFloat(val) || 0;
    const rate = (currencyRates as any)[expenseCurrency] || 1;
    return parseFloat((num * rate).toFixed(2));
  };

  const addExpense = () => {
    if (!expenseTitle || !expenseAmount) return;

    let finalLocalAmount = getConvertedAmount(expenseAmount);
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

  const safeExpenses = useMemo(() => (Array.isArray(expenses) ? expenses : []), [expenses]);
  const currentTripExpenses = useMemo(() => safeExpenses.filter(e => e.tripId === currentTripId), [safeExpenses, currentTripId]);
  const filteredExpenses = useMemo(
    () => currentTripExpenses.filter(item => (statsMode === 'daily' ? item.date === statDate : true)),
    [currentTripExpenses, statsMode, statDate]
  );

  const sortedFilteredExpenses = useMemo(
    () =>
      [...filteredExpenses].sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateA > dateB ? -1 : 1; 
        return (a.id || '') > (b.id || '') ? -1 : 1;
      }),
    [filteredExpenses]
  );

  const totalLocal = useMemo(() => filteredExpenses.reduce((sum, item) => sum + (Number(item.localAmount) || 0), 0), [filteredExpenses]);
  const categoryStats = useMemo(
    () =>
      filteredExpenses.reduce((acc: any, item) => {
        acc[item.mainCategory] = (acc[item.mainCategory] || 0) + (Number(item.localAmount) || 0);
        return acc;
      }, {}),
    [filteredExpenses]
  );

  const allTimeTotal = useMemo(() => currentTripExpenses.reduce((sum, item) => sum + (Number(item.localAmount) || 0), 0), [currentTripExpenses]);

  const budgetNum = parseFloat(currentTrip?.budget) || 1;
  const budgetPct = Math.min((allTimeTotal / budgetNum) * 100, 100).toFixed(1);
  const uniqueDays = new Set(currentTripExpenses.map(e => e.date).filter(Boolean)).size || 1;
  const avgDailySpend = allTimeTotal / uniqueDays;
  const remainingBudget = Math.max(budgetNum - allTimeTotal, 0);

  return (
    <KeyboardWrapper style={[styles.container, { backgroundColor: themeColors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {viewingImage && (
        <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setViewingImage(null)}>
          <View style={styles.modalBackground}>
            <TouchableOpacity style={styles.modalCloseArea} onPress={() => setViewingImage(null)} />
            <View style={styles.modalContent}>
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setViewingImage(null)}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>✖ 關閉</Text>
              </TouchableOpacity>
              <Image source={{ uri: viewingImage }} style={styles.fullScreenImage} resizeMode="contain" />
            </View>
          </View>
        </Modal>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { backgroundColor: themeColors.primary }]}>
          <View style={styles.tripSelector}>
            <Text style={styles.tripSelectorText}>📊 {currentTrip?.name || '未命名行程'} 記帳本</Text>
          </View>
        </View>

        <View style={[styles.card, styles.budgetCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.budgetHeader}>
            <Text style={[styles.budgetTitle, { color: themeColors.text }]}>總預算控制</Text>
            <TextInput
              style={[styles.budgetInput, { color: themeColors.primary, borderBottomColor: themeColors.border }]}
              keyboardType="numeric"
              value={String(currentTrip?.budget || '0')}
              onChangeText={(val) => setTrips(safeTrips.map(t => (t.id === currentTripId ? { ...t, budget: val } : t)))}
            />
          </View>
          <View style={[styles.budgetBarBg, { backgroundColor: isDarkMode ? '#333' : '#E0E0E0' }]}>
            <View
              style={[
                styles.budgetBarFill,
                {
                  width: `${budgetPct}%`,
                  backgroundColor: allTimeTotal >= budgetNum ? '#E74C3C' : allTimeTotal > budgetNum * 0.8 ? '#F39C12' : '#27AE60'
                }
              ]}
            />
          </View>
          <View style={styles.forecasterGrid}>
            <View style={styles.forecasterBox}>
              <Text style={styles.forecasterLabel}>總消耗</Text>
              <Text style={[styles.forecasterVal, { color: themeColors.text }]}>${(allTimeTotal || 0).toFixed(0)}</Text>
            </View>
            <View style={styles.forecasterBox}>
              <Text style={styles.forecasterLabel}>平均日消耗</Text>
              <Text style={[styles.forecasterVal, { color: '#F39C12' }]}>${(avgDailySpend || 0).toFixed(0)}/天</Text>
            </View>
            <View style={styles.forecasterBox}>
              <Text style={styles.forecasterLabel}>安全水位</Text>
              <Text style={[styles.forecasterVal, { color: remainingBudget > 0 ? '#27AE60' : '#E74C3C' }]}>${(remainingBudget || 0).toFixed(0)}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.inputCard}>
            {receiptImage && (
              <View style={[styles.previewImageContainer, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                <Image source={{ uri: receiptImage }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeImageBtn} onPress={() => setReceiptImage(null)}>
                  <Text style={{ color: '#FFF', fontSize: 10 }}>✖ 移除</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ marginBottom: 10 }}>
              <Text style={styles.compactLabel}>📅 日期</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={formatForWebDateInput(expenseDateObj)}
                  onChange={e => {
                    if (!e.target.value) return;
                    const [y, m, d] = e.target.value.split('-');
                    const localDate = new Date(Number(y), Number(m) - 1, Number(d));
                    if (!isNaN(localDate.getTime())) {
                      setExpenseDateObj(localDate);
                      setStatDate(formatDate(localDate));
                    }
                  }}
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    border: `1px solid ${themeColors.border}`,
                    fontSize: '14px',
                    backgroundColor: themeColors.background,
                    color: themeColors.text,
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.compactInputBox, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                    <Text style={{ fontSize: 14, color: themeColors.text }}>{formatDate(expenseDateObj)}</Text>
                  </TouchableOpacity>
                  {showDatePicker && DateTimePicker ? (
                    <DateTimePicker
                      value={expenseDateObj}
                      mode="date"
                      display="default"
                      themeVariant={isDarkMode ? 'dark' : 'light'}
                      onChange={(event: any, selectedDate: Date | undefined) => {
                        setShowDatePicker(false);
                        if (selectedDate) {
                          setExpenseDateObj(selectedDate);
                          setStatDate(formatDate(selectedDate));
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.compactLabel, { marginBottom: 0 }]}>💱 幣別</Text>
                {expenseCurrency !== 'TWD' && (currencyRates as any)[expenseCurrency] ? (
                  <Text style={{ fontSize: 10, color: themeColors.primary, marginLeft: 8, fontWeight: 'bold' }}>
                    (1 {expenseCurrency} ≈ {((currencyRates as any)[expenseCurrency]).toFixed(2)} TWD)
                  </Text>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
                {['EUR', 'GBP', 'JPY', 'KRW', 'THB', 'TWD', 'USD'].map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setExpenseCurrency(c)}
                    style={[
                      expenseCurrency === c ? styles.currencyChipActive : styles.currencyChipInactive,
                      { backgroundColor: expenseCurrency === c ? themeColors.primary : themeColors.background, borderColor: themeColors.border }
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: expenseCurrency === c ? 'bold' : 'normal', color: expenseCurrency === c ? '#FFF' : themeColors.subText }}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.compactRow}>
              <View style={styles.halfCol}>
                <Text style={styles.compactLabel}>🏷️ 項目</Text>
                <View style={[styles.compactInputWrapper, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                  <TextInput
                    ref={titleInputRef}
                    style={[styles.compactInput, { color: themeColors.text }]}
                    placeholderTextColor={themeColors.subText}
                    placeholder={isListening ? "聽取中..." : "輸入項目"}
                    value={expenseTitle}
                    onChangeText={setExpenseTitle}
                  />
                  <TouchableOpacity 
                    onPress={startVoiceInput} 
                    style={{ paddingHorizontal: 6, height: '100%', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 16 }}>{isListening ? '🔴' : '🎤'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.halfCol}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 }}>
                  <Text style={[styles.compactLabel, { marginBottom: 0 }]}>💰 金額</Text>
                  {expenseCurrency !== 'TWD' && expenseAmount ? (
                    <Text style={{ fontSize: 10, color: themeColors.primary, fontWeight: 'bold' }}>
                      ≈ {getConvertedAmount(expenseAmount)} TWD
                    </Text>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.compactInputBox, { backgroundColor: themeColors.background, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholderTextColor={themeColors.subText}
                  keyboardType="numeric"
                  placeholder="0"
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                />
              </View>
            </View>

            <View style={styles.actionBtnGrid}>
              <TouchableOpacity
                onPress={() => setIsAA(!isAA)}
                style={[
                  styles.actionBtnGridItem,
                  isAA ? { borderColor: themeColors.primary, backgroundColor: isDarkMode ? '#1a365d' : '#EBF5FB' } : { borderColor: themeColors.border, backgroundColor: themeColors.background }
                ]}
              >
                <Text style={{ color: isAA ? themeColors.primary : themeColors.text, fontWeight: 'bold', fontSize: 11 }}>👥 AA 制</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickImage} style={[styles.actionBtnGridItem, { borderColor: themeColors.border, backgroundColor: themeColors.background }]}>
                <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 11 }}>📸 拍收據</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAIReceiptScan}
                style={[styles.actionBtnGridItem, { borderColor: '#F39C12', backgroundColor: isScanning ? '#F39C12' : themeColors.background }]}
                disabled={isScanning}
              >
                <Text style={{ color: isScanning ? '#FFF' : '#F39C12', fontWeight: 'bold', fontSize: 11 }}>
                  {isScanning ? '⏳ 辨識中' : '🤖 AI 掃描'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              {Object.keys(EXPENSE_CATEGORIES).map(cat => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => {
                    setMainCategory(cat);
                    setSubCategory((EXPENSE_CATEGORIES as any)[cat][0]);
                  }}
                  style={[styles.mainCatBtn, { backgroundColor: mainCategory === cat ? themeColors.primary : themeColors.background, borderColor: mainCategory === cat ? themeColors.primary : themeColors.border }]}
                >
                  <Text style={{ fontSize: 12, color: mainCategory === cat ? '#FFF' : themeColors.subText, fontWeight: 'bold' }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {(EXPENSE_CATEGORIES as any)[mainCategory].map((sub: string) => (
                <TouchableOpacity
                  key={sub}
                  onPress={() => {
                    setSubCategory(sub);
                    setExpenseTitle(sub);
                  }}
                  style={[styles.subCatBtn, { backgroundColor: subCategory === sub ? themeColors.secondary : 'transparent', borderColor: themeColors.border }]}
                >
                  <Text style={{ fontSize: 11, color: subCategory === sub ? '#FFF' : themeColors.subText }}>{sub}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={addExpense} style={[styles.addBtn, { backgroundColor: themeColors.primary }]}>
              <Text style={styles.addBtnText}>➕ 新增這筆花費</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.statHeader}>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>📊 比例分析</Text>
            <View style={[styles.toggleRow, { backgroundColor: themeColors.background }]}>
              <TouchableOpacity onPress={() => setStatsMode('daily')} style={[styles.toggleBtn, statsMode === 'daily' ? { backgroundColor: themeColors.primary } : null]}>
                <Text style={[styles.toggleText, statsMode === 'daily' ? { color: '#FFF' } : { color: themeColors.subText }]}>單日</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStatsMode('range')} style={[styles.toggleBtn, statsMode === 'range' ? { backgroundColor: themeColors.primary } : null]}>
                <Text style={[styles.toggleText, statsMode === 'range' ? { color: '#FFF' } : { color: themeColors.subText }]}>全部</Text>
              </TouchableOpacity>
            </View>
          </View>

          {statsMode === 'daily' && (
            <View style={{ marginBottom: 8, zIndex: 10 }}>
              <TouchableOpacity style={styles.statDateTrigger} onPress={() => setIsStatDateDropdownOpen(!isStatDateDropdownOpen)}>
                <Text style={{ color: themeColors.primary, fontWeight: 'bold', fontSize: 13 }}>📅 選擇統計日: {statDate} ▼</Text>
              </TouchableOpacity>

              {isStatDateDropdownOpen && (
                <View style={[{ position: 'absolute', top: 25, left: 10, right: 10, borderRadius: 6, borderWidth: 1, elevation: 5, zIndex: 100, maxHeight: 120 }, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  <ScrollView nestedScrollEnabled={true}>
                    {[...new Set(currentTripExpenses.map(e => e.date).filter(Boolean))]
                      .sort((a, b) => (a > b ? -1 : 1))
                      .map(d => (
                      <TouchableOpacity
                        key={d}
                        style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border }}
                        onPress={() => {
                          setStatDate(d);
                          setIsStatDateDropdownOpen(false);
                        }}
                      >
                        <Text style={{ fontSize: 12, color: statDate === d ? themeColors.primary : themeColors.text, fontWeight: statDate === d ? 'bold' : 'normal' }}>
                          {d}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {[...new Set(currentTripExpenses.map(e => e.date))].length === 0 && (
                      <Text style={{ padding: 10, fontSize: 12, color: themeColors.subText }}>尚無紀錄</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {totalLocal > 0 ? (
            <View>
              <Text style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: themeColors.text }}>
                {statsMode === 'daily' ? '📅 單日總計' : '💰 全部總計'}: ${(totalLocal || 0).toFixed(0)} TWD
              </Text>

              <View style={styles.chartContainer}>
                {Platform.OS === 'web' ? (
                  <View
                    style={[
                      styles.donutBase,
                      {
                        backgroundColor: themeColors.background,
                        backgroundImage: `conic-gradient(${Object.keys(categoryStats)
                          .filter(cat => categoryStats[cat] > 0)
                          .reduce((acc, cat, idx, arr) => {
                            const pct = (categoryStats[cat] / totalLocal) * 100;
                            const prevPct = acc.total;
                            acc.total += pct;
                            acc.str += `${(CATEGORY_COLORS as any)[cat] || '#CCC'} ${prevPct}% ${acc.total}%${idx < arr.length - 1 ? ', ' : ''}`;
                            return acc;
                          }, { str: '', total: 0 }).str})`
                      } as any
                    ]}
                  >
                    <View style={[styles.donutInner, { backgroundColor: themeColors.card }]}>
                      <Text style={[styles.donutTotal, { color: themeColors.text }]}>${(totalLocal || 0).toFixed(0)}</Text>
                      <Text style={styles.donutSub}>總計</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.donutBase, { backgroundColor: themeColors.background }]}>
                    {Object.keys(categoryStats).map((cat, index) => {
                      const val = categoryStats[cat];
                      const pct = val / totalLocal;
                      if (pct === 0) return null;
                      return (
                        <View
                          key={`ring-${index}`}
                          style={[
                            styles.donutSegment,
                            { backgroundColor: (CATEGORY_COLORS as any)[cat] || '#CCC', transform: [{ rotate: `${index * 45}deg` }], opacity: 0.8 + (pct * 0.2) }
                          ]}
                        />
                      );
                    })}
                    <View style={[styles.donutInner, { backgroundColor: themeColors.card }]}>
                      <Text style={[styles.donutTotal, { color: themeColors.text }]}>${(totalLocal || 0).toFixed(0)}</Text>
                      <Text style={styles.donutSub}>總計</Text>
                    </View>
                  </View>
                )}

                <View style={styles.legendContainer}>
                  {Object.keys(categoryStats)
                    .filter(cat => categoryStats[cat] > 0)
                    .sort((a, b) => categoryStats[b] - categoryStats[a])
                    .map(cat => (
                      <View key={`leg-${cat}`} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: (CATEGORY_COLORS as any)[cat] || '#CCC' }]} />
                        <Text style={[styles.legendText, { color: themeColors.text }]}>
                          {cat.substring(0, 2)} ${(categoryStats[cat] || 0).toFixed(0)} ({((categoryStats[cat] / totalLocal) * 100).toFixed(0)}%)
                        </Text>
                      </View>
                    ))}
                </View>
              </View>
            </View>
          ) : (
            <Text style={[styles.statSub, { textAlign: 'center', marginTop: 5, color: themeColors.subText }]}>此區間尚無花費</Text>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text, fontSize: 14, marginBottom: 10 }]}>📝 行程明細 ({statsMode === 'daily' ? statDate : '全部'})</Text>
          {sortedFilteredExpenses.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 12, color: themeColors.subText, marginVertical: 15 }}>無明細紀錄</Text>
          ) : (
            sortedFilteredExpenses.map(item => (
              <View key={item.id} style={[styles.expenseItem, { borderTopColor: themeColors.border }]}>
                {item.image && (
                  <TouchableOpacity onPress={() => setViewingImage(item.image)}>
                    <Image source={{ uri: item.image }} style={styles.tinyThumb} />
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1, marginLeft: item.image ? 8 : 0 }}>
                  <Text style={[styles.expenseTitle, { color: themeColors.text }]}>
                    {item.title || ''} {item.isAA && <Text style={{ color: '#E67E22', fontSize: 10 }}> [AA]</Text>}
                  </Text>
                  <Text style={[styles.expenseDate, { color: themeColors.subText }]}>{item.date || ''} • {item.subCategory || ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.expenseAmount, { color: (CATEGORY_COLORS as any)[item.mainCategory] || '#888' }]}>
                    {Number(item.foreignAmount) || 0} {item.currency || 'TWD'}
                  </Text>
                  <Text style={[styles.localAmountHint, { color: themeColors.subText }]}>實付: {(Number(item.localAmount) || 0).toFixed(0)} TWD</Text>
                </View>
                <TouchableOpacity onPress={() => setExpenses(expenses.filter(e => e.id !== item.id))} style={{ marginLeft: 10 }}>
                  <Text style={{ fontSize: 14 }}>🗑️</Text>
                </TouchableOpacity>
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
  scrollContent: { paddingBottom: 20 },
  header: { paddingTop: Platform.OS === 'web' ? 20 : 40, paddingBottom: 15, alignItems: 'center', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, elevation: 5 },
  card: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, borderWidth: 1, elevation: 1 },
  inputCard: { padding: 12 },
  actionBtnGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  actionBtnGridItem: { flex: 1, paddingVertical: 6, borderWidth: 1, borderRadius: 6, alignItems: 'center', marginHorizontal: 3, flexDirection: 'row', justifyContent: 'center' },
  mainCatBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, marginRight: 6 },
  subCatBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, marginRight: 6 },
  addBtn: { padding: 10, borderRadius: 8, alignItems: 'center' },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  halfCol: { flex: 1, marginHorizontal: 3 },
  compactLabel: { fontSize: 11, fontWeight: 'bold', color: '#888', marginBottom: 3 },
  compactInputBox: { borderWidth: 1, paddingHorizontal: 8, borderRadius: 6, fontSize: 13, height: 36 },
  compactInputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 4, height: 36 },
  compactInput: { flex: 1, paddingVertical: 0, paddingHorizontal: 4, fontSize: 13, height: '100%' },
  
  currencyChipActive: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, marginHorizontal: 3 },
  currencyChipInactive: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, marginHorizontal: 2, borderWidth: 1 },
  tripSelector: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  tripSelectorText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  budgetCard: { padding: 12 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetTitle: { fontSize: 13, fontWeight: 'bold' },
  budgetInput: { borderBottomWidth: 1, width: 80, textAlign: 'right', fontWeight: 'bold', fontSize: 13, padding: 0 },
  budgetBarBg: { height: 6, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  budgetBarFill: { height: '100%', borderRadius: 3 },
  forecasterGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 8 },
  forecasterBox: { alignItems: 'center' },
  forecasterLabel: { fontSize: 10, color: '#888', marginBottom: 2 },
  forecasterVal: { fontSize: 13, fontWeight: 'bold' },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, paddingBottom: 0 },
  cardTitle: { fontWeight: 'bold' },
  toggleRow: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  toggleText: { fontSize: 11, fontWeight: 'bold' },
  statSub: { fontSize: 12, fontWeight: 'bold', marginBottom: 10, paddingHorizontal: 10 },
  statDateTrigger: { paddingHorizontal: 10 },
  expenseItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1 },
  tinyThumb: { width: 30, height: 30, borderRadius: 4 },
  expenseTitle: { fontSize: 13, fontWeight: 'bold' },
  expenseDate: { fontSize: 10, marginTop: 2 },
  expenseAmount: { fontSize: 13, fontWeight: 'bold' },
  localAmountHint: { fontSize: 9, marginTop: 2 },
  previewImageContainer: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1 },
  previewImage: { width: 40, height: 40, borderRadius: 4, marginRight: 10 },
  removeImageBtn: { backgroundColor: '#E74C3C', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '90%', height: '80%', backgroundColor: '#000', borderRadius: 8, overflow: 'hidden', justifyContent: 'center' },
  fullScreenImage: { width: '100%', height: '100%' },
  closeModalBtn: { position: 'absolute', top: 10, right: 10, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 6 },
  chartContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: 10, paddingHorizontal: 10 },
  donutBase: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  donutInner: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 3, zIndex: 10 },
  donutTotal: { fontSize: 13, fontWeight: 'bold' },
  donutSub: { fontSize: 8, marginTop: 1 },
  donutSegment: { position: 'absolute', width: '100%', height: '100%', left: '50%' },
  legendContainer: { flex: 1, marginLeft: 15 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 10, fontWeight: '500' }
});