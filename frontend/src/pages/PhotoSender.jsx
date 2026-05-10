import React, { useState, useRef, useEffect } from 'react';
import { ImagePlus, Play, Pause, RotateCcw, AlertTriangle, Send, RefreshCw, User, Clock, Calendar, Square, Save, Trash2, Download, Eye, FileOutput, Zap, CheckCircle, X, Shield } from 'lucide-react';
import axios from 'axios';
import { db, auth, rtdb } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, addDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

export default function PhotoSender() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [senderId, setSenderId] = useState('auto');
  const [ goldenKey, setGoldenKey ] = useState(null);
  const [ students, setStudents ] = useState([]);
  const [allStatuses, setAllStatuses] = useState({});

  useEffect(() => {
    // Cache students globally for matching JIDs in PhotoSender
    const unsub = onSnapshot(collection(db, 'students'), (snap) => {
      const sData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(sData);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
        const emps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(e => e.role !== 'solver');
        setEmployees(emps);
      });

      // Background Self-Healing Sync
      const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : (import.meta.env.VITE_API_BASE_URL || 'https://yz-almotakamel-backend.onrender.com');
      const sync = async () => {
        try {
          const res = await axios.get(`${BASE_URL}/api/whatsapp/status-all`);
          const statusMap = {};
          res.data.forEach(s => { statusMap[s.id] = s; });
          setAllStatuses(prev => ({ ...prev, ...statusMap }));
        } catch (e) {}
      };
      sync();
      const interval = setInterval(sync, 30000);
      
      return () => { 
        unsub(); 
        clearInterval(interval); 
      };
    }
  }, [isAdmin]);

  // Listen to individual statuses to bypass Firebase root-read restrictions
  useEffect(() => {
    const idsToListen = new Set(employees.map(e => e.id));
    if (goldenKey) idsToListen.add(goldenKey);
    
    if (idsToListen.size === 0) return;
    
    const unsubs = Array.from(idsToListen).map(id => {
      const empRef = ref(rtdb, `wa_status/${id}`);
      return onValue(empRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setAllStatuses(prev => ({ ...prev, [id]: data }));
        }
      });
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [employees, goldenKey]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        const id = user.uid;
        setGoldenKey(id);
        
        let adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        
        try {
          const userDoc = await getDoc(doc(db, 'employees', id));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.role === 'admin' || data.type === 'admin') adminStatus = true;
          }
        } catch (e) { console.error(e); }
        
        setIsAdmin(adminStatus);
        setSenderId('auto');
      } else {
        setIsAdmin(false);
        setSenderId('auto');
      }
      setCheckingAdmin(false);
    });
    return () => unsub();
  }, []);
  const [mode, setMode] = useState('folder'); // 'folder' or 'manual'
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('مرحباً بك، نرسل لك صورة الحضور الخاصة بك. شكراً لحضورك!');
  const [rawNumbers, setRawNumbers] = useState('');
  const [rawNames, setRawNames] = useState('');
  const [manualFile, setManualFile] = useState(null);
  
  const [filesQueue, setFilesQueue] = useState([]);
  const [manualQueue, setManualQueue] = useState([]);
  const [manualNamesQueue, setManualNamesQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [logs, setLogs] = useState([]);
  
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  
  // Custom Variables Management
  const [greetings, setGreetings] = useState(() => JSON.parse(localStorage.getItem('wa_greetings')) || ['مرحباً', 'أهلاً بك', 'السلام عليكم', 'تحية طيبة']);
  const [closings, setClosings] = useState(() => JSON.parse(localStorage.getItem('wa_closings')) || ['شكراً لك', 'بالتوفيق', 'مع تمنياتنا لك بالنجاح', 'فريق دبلومالاين']);
  const [showVarManager, setShowVarManager] = useState(false);
  
  // Presets
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [autoIncludedAccounts, setAutoIncludedAccounts] = useState([]);
  const [autoMessagesPerSwitch, setAutoMessagesPerSwitch] = useState(5);
  
  const [isSafeMode, setIsSafeMode] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(150);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  // Derived state for auto routing
  const activeAutoStatus = {
    isConnected: Object.values(allStatuses || {}).some(s => s && s.isConnected),
    isAuto: true,
    count: Object.values(allStatuses || {}).filter(s => s && s.isConnected).length
  };
  const currentSenderStatus = senderId === 'auto' ? activeAutoStatus : (allStatuses[senderId] || { isConnected: false });
  
  // Real stats
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, pending: 0 });
  const fileInputRef = useRef(null);

  // When paused or unpaused, a ref helps async loops know to stop immediately
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isRunningRef.current = isRunning;
    isPausedRef.current = isPaused;
  }, [isRunning, isPaused]);

  useEffect(() => {
    const connected = Object.keys(allStatuses || {}).filter(key => allStatuses[key]?.isConnected && key !== 'emp1');
    if (autoIncludedAccounts.length === 0 && connected.length > 0) {
      setAutoIncludedAccounts(connected);
    }
  }, [allStatuses]);

  const calculateSafetyScore = () => {
    let score = 0;
    if (isSafeMode) score += 40;
    const hasVariables = /\{greeting\}|\{name\}|\{university\}|\{major\}|\{closing\}/.test(messageTemplate);
    const hasSpintax = /\{[^}]+\|[^}]+\}/.test(messageTemplate);
    if (hasVariables) score += 20;
    if (hasSpintax) score += 20;
    if (messageTemplate.length > 30) score += 10;
    if (dailyLimit <= 150) score += 10;
    return score;
  };

  const getSafetyColor = (score) => {
    if (score >= 80) return '#10b981'; // Success
    if (score >= 50) return '#f59e0b'; // Warning
    return '#ef4444'; // Danger
  };


  const handleFolderSelection = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const validImages = rawFiles.filter(f => f.type.startsWith('image/'));
    
    if (validImages.length === 0) {
      alert('لم يتم العثور على أي صور في هذا المجلد.');
      return;
    }

    // Sort images alphabetically (Ascending) based on filename
    const sortedImages = validImages.sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    setFilesQueue(sortedImages);
    setStats({ total: validImages.length, sent: 0, failed: 0, pending: validImages.length });
    setCurrentIndex(0);
    setLogs([]);
    setIsRunning(false);
    setIsPaused(false);
  };

  const fetchAllStatuses = async () => {
    const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : (import.meta.env.VITE_API_BASE_URL || 'https://yz-almotakamel-backend.onrender.com');
    try {
      const res = await axios.get(`${BASE_URL}/api/whatsapp/status-all`);
      const statusMap = {};
      res.data.forEach(s => { statusMap[s.id] = s; });
      setAllStatuses(prev => ({ ...prev, ...statusMap }));
      console.log('Status synchronization complete');
    } catch (err) {
      console.error('Status sync failed:', err);
    }
  };

  const getPureNumber = (raw) => {
    if (!raw) return "";
    
    // 1. If it's a JID format (e.g. 966...@s.whatsapp.net), take the part before @
    let d = String(raw).split('@')[0];
    
    // 2. Remove all non-digits (handles spaces, symbols, and letters in filenames)
    d = d.replace(/\D/g, '');
    
    // 3. Normalize common regional formats
    // Case 1: Saudi number starting with 05 (e.g. 0501234567 -> 966501234567)
    if (/^05\d{8}$/.test(d)) {
        d = '966' + d.substring(1);
    }
    // Case 2: Yemeni number starting with 07 (e.g. 0771234567 -> 967771234567)
    else if (/^07\d{8}$/.test(d)) {
        d = '967' + d.substring(1);
    }
    // Case 3: Saudi 9-digit (5xxxxxxxx -> 9665xxxxxxxx)
    else if (/^5\d{8}$/.test(d)) {
        d = '966' + d;
    }
    // Case 4: Yemeni 9-digit (7xxxxxxxx -> 9677xxxxxxxx)
    else if (/^7\d{8}$/.test(d)) {
        d = '967' + d;
    }
    // Case 5: International starting with 00 (00966... -> 966...)
    if (d.startsWith('00')) {
        d = d.substring(2);
    }

    return d;
  };

  const parseSpintax = (text) => {
    if (!text) return "";
    return text.replace(/\{([^{}]+)\}/g, (match, options) => {
      // If it contains variables we know, skip spintax parsing for them here
      const vars = ['name', 'greeting', 'university', 'major', 'closing'];
      if (vars.includes(options.toLowerCase())) return match;

      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  };

  const parseTemplate = (tpl, phoneNumber, index = -1) => {
    let result = tpl;
    
    // 1. Spintax parsing
    result = parseSpintax(result);
    
    // 2. Custom Variable {list_name} from manual names list
    if (index !== -1 && mode === 'manual' && manualNamesQueue[index]) {
        result = result.replace(/{list_name}/g, manualNamesQueue[index]);
    } else {
        result = result.replace(/{list_name}/g, '');
    }

    // 3. Variable lookup from students database
    const cleanTarget = getPureNumber(phoneNumber);
    const student = students.find(s => getPureNumber(s.phone) === cleanTarget);
    
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)] || '';
    const randomClosing = closings[Math.floor(Math.random() * closings.length)] || '';
    
    result = result.replace(/{greeting}/g, randomGreeting);
    result = result.replace(/{closing}/g, randomClosing);
    
    if (student) {
      result = result.replace(/{name}/g, student.name || '');
      result = result.replace(/{university}/g, student.university || '');
      result = result.replace(/{major}/g, student.major || student.specialization || '');
    } else {
      // Fallback if student not found
      result = result.replace(/{name}/g, 'عزيزي الطالب');
      result = result.replace(/{university}/g, '');
      result = result.replace(/{major}/g, '');
    }
    
    return result;
  };

  useEffect(() => {
    localStorage.setItem('wa_greetings', JSON.stringify(greetings));
  }, [greetings]);

  useEffect(() => {
    localStorage.setItem('wa_closings', JSON.stringify(closings));
  }, [closings]);

  useEffect(() => {
    // 1. Listen to Students
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      const sData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(sData);
    });

    // 2. Listen to Presets
    const unsubPresets = onSnapshot(collection(db, 'sender_presets'), (snap) => {
      setPresets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubStudents(); unsubPresets(); };
  }, []);

  useEffect(() => {
    // Listen to All WhatsApp Statuses continuously
    const allStatusRef = ref(rtdb, 'wa_status');
    const unsubAllStatus = onValue(allStatusRef, (snap) => {
      const data = snap.val() || {};
      setAllStatuses(data);
    });

    return () => unsubAllStatus();
  }, []);

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      alert('يرجى إدخال اسم للقالب أولاً.');
      return;
    }
    try {
      await addDoc(collection(db, 'sender_presets'), {
        name: presetName,
        template: messageTemplate,
        sender: senderId,
        greetings: greetings,
        closings: closings,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid || 'system'
      });
      setPresetName('');
      alert('تم حفظ القالب في قاعدة البيانات بنجاح!');
    } catch (err) {
      alert('فشل حفظ القالب: ' + err.message);
    }
  };

  const handleLoadPreset = (preset) => {
    if (window.confirm(`هل تريد تحميل القالب "${preset.name}"؟ سيؤدي ذلك لاستبدال النص الحالي.`)) {
      setMessageTemplate(preset.template);
      setSenderId(preset.sender);
      if (preset.greetings) setGreetings(preset.greetings);
      if (preset.closings) setClosings(preset.closings);
    }
  };

  const handleDeletePreset = async (id) => {
    if (window.confirm('هل أنت متأكد من حذف هذا القالب نهائياً؟')) {
      try {
        await deleteDoc(doc(db, 'sender_presets', id));
      } catch (err) {
        alert('فشل الحذف');
      }
    }
  };

  const handlePreview = () => {
    const activeQueue = mode === 'folder' ? filesQueue : manualQueue;
    if (activeQueue.length === 0) {
      alert('يجب تحديد مجلد أو أرقام أولاً لمعاينة النتيجة.');
      return;
    }
    const firstNum = mode === 'folder' ? getPureNumber(activeQueue[0].name) : activeQueue[0];
    const content = parseTemplate(messageTemplate, firstNum, 0);
    setPreviewContent(content);
    setShowPreview(true);
  };

  const handleExportLogs = () => {
    if (logs.length === 0) return;
    const content = logs.map(l => `[${l.time}] ${l.num}: ${l.msg}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };

  const processQueue = async (startIndex) => {
    let current = startIndex;
    const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : (import.meta.env.VITE_API_BASE_URL || 'https://yz-almotakamel-backend.onrender.com');
    const activeQueue = mode === 'folder' ? filesQueue : manualQueue;

    let currentAutoIndex = 0;
    let messagesSentOnCurrentAuto = 0;

    while (current < activeQueue.length) {
      if (!isRunningRef.current || isPausedRef.current) return;

      let targetNumber = '';
      let fileToUpload = null;
      let triedAccountsForThisMessage = new Set(); // Reset for each message

      const item = activeQueue[current];

      if (mode === 'folder') {
        targetNumber = getPureNumber(item.name);
        fileToUpload = item;
      } else {
        targetNumber = item;
        fileToUpload = manualFile;
      }

      if (!targetNumber || targetNumber.length < 9) {
        setLogs(prev => [{ 
          type: 'error', 
          num: mode === 'folder' ? item.name : targetNumber, 
          msg: 'رقم هاتف غير صالح (يجب أن يكون 9 أرقام على الأقل).', 
          time: new Date().toLocaleTimeString('ar-SA') 
        }, ...prev]);
        setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
      } else {
        const b64 = fileToUpload ? await getBase64(fileToUpload) : null;
          
          // Apply Spintax and Unique Noise to evade hash-based detection
          let finalMessage = parseTemplate(messageTemplate, targetNumber, current);
          const noise = " ".repeat(Math.floor(Math.random() * 5)) + (Math.random() > 0.5 ? "\u200B" : "");
          if (finalMessage) finalMessage += noise;

          const student = students.find(s => getPureNumber(s.phone) === targetNumber);
          const studentJid = student?.fullJid || '';

          let finalSenderId = senderId;
          
          // --- SMART AUTO-ROUTING LOGIC ---
          const findActiveAutoSender = () => {
            if (autoIncludedAccounts.length === 0) return null;
            
            // Try to find a connected account starting from currentAutoIndex
            for (let i = 0; i < autoIncludedAccounts.length; i++) {
              const idx = (currentAutoIndex + i) % autoIncludedAccounts.length;
              const id = autoIncludedAccounts[idx];
              if (allStatuses[id]?.isConnected && !triedAccountsForThisMessage.has(id)) {
                if (idx !== currentAutoIndex) {
                   // Account changed because original was offline
                   currentAutoIndex = idx;
                   messagesSentOnCurrentAuto = 0;
                }
                return id;
              }
            }
            return null;
          };

          if (senderId === 'auto') {
            finalSenderId = findActiveAutoSender();
            if (!finalSenderId) {
              if (triedAccountsForThisMessage.size > 0) {
                 // We tried some accounts and all failed for this message
                 setLogs(prev => [{ type: 'error', num: targetNumber, msg: 'تم استنزاف كافة الحسابات المتاحة لهذا الرقم دون نجاح.', time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
              } else {
                 setLogs(prev => [{ type: 'error', num: targetNumber, msg: 'لا توجد حسابات متصلة حالياً للإرسال التلقائي.', time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
              }
              setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
              current++;
              setCurrentIndex(current);
              continue;
            }
          } else {
            // Manual selection: check if still connected
            if (!allStatuses[finalSenderId]?.isConnected) {
              const errorMsg = `الحساب المختار (${finalSenderId}) غير متصل حالياً.`;
              setLogs(prev => [{ type: 'error', num: targetNumber, msg: errorMsg, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
              setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
              current++;
              setCurrentIndex(current);
              continue; 
            }
          }

          try {
            const sendData = {
              employeeId: finalSenderId,
              phoneNumber: targetNumber,
              fullJid: studentJid,
              senderName: auth.currentUser?.displayName || 'المرسل القوي',
              senderId: auth.currentUser?.uid || 'system'
            };

            if (b64) {
              sendData.base64Image = b64;
              sendData.caption = finalMessage;
              await axios.post(`${BASE_URL}/api/whatsapp/send-image`, sendData);
            } else {
              sendData.message = finalMessage;
              await axios.post(`${BASE_URL}/api/whatsapp/send`, sendData);
            }
            
            if (senderId === 'auto') {
              messagesSentOnCurrentAuto++;
              if (messagesSentOnCurrentAuto >= autoMessagesPerSwitch) {
                messagesSentOnCurrentAuto = 0;
                currentAutoIndex = (currentAutoIndex + 1) % autoIncludedAccounts.length;
              }
            }
            
            setLogs(prev => [{ type: 'success', num: targetNumber, msg: 'تم إرسال المحتوى بنجاح', time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
            setStats(prev => ({ ...prev, sent: prev.sent + 1, pending: prev.pending - 1 }));
            setConsecutiveFailures(0); // Reset failures on success
          } catch (err) {
            console.error(err);
            const errorMsg = err.response?.data?.error || err.message || 'فشل غير معروف';
            
            // Detect if the error is due to session disconnection/block
            const isConnectionError = errorMsg.includes('غير متصلة') || errorMsg.includes('not init') || errorMsg.includes('logged out') || errorMsg.includes('Connection Closed') || err.response?.status === 401;
            
            if (isConnectionError && senderId === 'auto') {
              setLogs(prev => [{ type: 'warning', num: 'System', msg: `فشل الحساب ${finalSenderId} (قد يكون محظوراً أو مفصولاً). محاولة التبديل...`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
              
              // Mark this account as failed for this specific message
              triedAccountsForThisMessage.add(finalSenderId);
              
              // Increment index to skip this failed account for the next attempt
              currentAutoIndex = (currentAutoIndex + 1) % autoIncludedAccounts.length;
              messagesSentOnCurrentAuto = 0;
              
              // Add a small delay before retrying with next account to prevent tight loops
              await new Promise(r => setTimeout(r, 3000));

              // We don't increment 'current' here, so the same message will be retried with the next account in the next iteration
              continue; 
            }

            setLogs(prev => [{ type: 'error', num: targetNumber, msg: `فشل الإرسال (${errorMsg})`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
            setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
            
            const newFailures = consecutiveFailures + 1;
            setConsecutiveFailures(newFailures);
            
            if (newFailures >= 5) {
              alert('⚠️ تم رصد 5 حالات فشل متتالية! تم إيقاف الإرسال تلقائياً لحماية حساباتك من الحظر.');
              setIsRunning(false);
              setIsPaused(false);
              return;
            }
          }
        }

      current++;
      setCurrentIndex(current);

      // --- PROFESSIONAL ANTI-BAN DELAYS ---
      if (current < activeQueue.length && isRunningRef.current && !isPausedRef.current) {
        // 1. Box-Muller transform for Gaussian Distribution
        const gaussianRandom = () => {
          let uOffset = 0, vOffset = 0;
          while(uOffset === 0) uOffset = Math.random();
          while(vOffset === 0) vOffset = Math.random();
          return Math.sqrt(-2.0 * Math.log(uOffset)) * Math.cos(2.0 * Math.PI * vOffset);
        };

        // Delay Strategy:
        // Safe Mode: Mean 25s, Std Dev 10s (Range ~15s to 45s)
        // Standard Mode: Mean 8s, Std Dev 4s (Range ~4s to 15s)
        const mean = isSafeMode ? 25000 : 8000;
        const stdDev = isSafeMode ? 10000 : 4000;
        let delay = Math.max(isSafeMode ? 15000 : 4000, (mean + gaussianRandom() * stdDev));

        // 2. Irregular "Activity Cycles"
        // Every 5-12 messages (randomized), simulate a "Human Rest" period (30-90 seconds)
        const cycleLength = 5 + Math.floor(Math.random() * 8);
        if (current % cycleLength === 0 && current % 50 !== 0) {
          const restPeriod = 30000 + (Math.random() * 60000);
          setLogs(prev => [{ type: 'info', num: 'System', msg: `☕ محاكاة استراحة بشرية لمدة ${Math.round(restPeriod/1000)} ثانية...`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
          await new Promise(r => setTimeout(r, restPeriod));
        } else if (current % 50 === 0) {
          // BATCH REST: Every 50 messages, take a long break (10-15 minutes in Safe Mode)
          const longRestMean = isSafeMode ? 600000 : 300000;
          const longRest = longRestMean + (Math.random() * 300000);
          const minutes = Math.round(longRest / 60000);
          setLogs(prev => [{ type: 'info', num: 'System', msg: `🛑 إيقاف مؤقت طويل لتجنب الحظر: ${minutes} دقائق...`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
          await new Promise(r => setTimeout(r, longRest));
        } else {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    if (current >= (mode === 'folder' ? filesQueue.length : manualQueue.length)) {
      alert('اكتملت المهمة الجماعية!');
      setIsRunning(false);
      setIsPaused(false);
    }
  };

  const handleStart = () => {
    // Connection Check for Auto-routing
    if (senderId === 'auto' && !currentSenderStatus.isConnected) {
      alert('⚠️ لا يوجد أي موظف متصل حالياً للقيام بالإرسال التلقائي.\nيرجى التأكد من ربط حساب واحد على الأقل من صفحة الإعدادات.');
      return;
    }

    if (mode === 'folder') {
      if (filesQueue.length === 0) { alert('يجب تحديد المجلد أولاً.'); return; }
    } else {
      const numbersArr = rawNumbers.split(/[\n,;]/).map(n => getPureNumber(n)).filter(n => n.length >= 9);
      const namesArr = rawNames.split('\n').map(n => n.trim());
      
      if (numbersArr.length === 0) { alert('يجب إدخال أرقام صحيحة أولاً.'); return; }
      
      // If names are provided, we don't sort to maintain the mapping order
      let finalNumbers = [];
      let finalNames = [];
      
      if (namesArr.length > 0 && namesArr.some(n => n !== "")) {
          // Use the order as provided in the textareas
          finalNumbers = numbersArr;
          finalNames = namesArr;
      } else {
          // No names provided, standard behavior with deduplication and sorting
          finalNumbers = [...new Set(numbersArr)].sort();
          finalNames = [];
      }

      setManualQueue(finalNumbers);
      setManualNamesQueue(finalNames);
      setStats({ total: finalNumbers.length, sent: 0, failed: 0, pending: finalNumbers.length });
    }

    if (currentIndex >= (mode === 'folder' ? filesQueue.length : manualQueue.length)) { 
      setCurrentIndex(0); 
    }
    
    setIsRunning(true);
    setIsPaused(false);
    isRunningRef.current = true;
    isPausedRef.current = false;

    if (isScheduled) {
      handleBulkSchedule();
    } else {
      processQueue(currentIndex);
    }
  };

  const handleBulkSchedule = async () => {
    const BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : (import.meta.env.VITE_API_BASE_URL || 'https://yz-almotakamel-backend.onrender.com');
    const activeQueue = mode === 'folder' ? filesQueue : manualQueue;
    
    if (!scheduledTime) {
      alert('يجب تحديد وقت الجدولة أولاً.');
      setIsRunning(false);
      isRunningRef.current = false;
      return;
    }

    const scheduledTimestamp = new Date(scheduledTime).getTime();
    if (scheduledTimestamp <= Date.now()) {
      alert('يجب اختيار وقت في المستقبل.');
      setIsRunning(false);
      isRunningRef.current = false;
      return;
    }

    if (!window.confirm(`هل أنت متأكد من جدولة ${activeQueue.length} رسالة لوقت ${new Date(scheduledTime).toLocaleString('ar-SA')}؟`)) {
      setIsRunning(false);
      isRunningRef.current = false;
      return;
    }

    setLogs([{ type: 'info', num: 'System', msg: 'جاري تحضير الرسائل للجدولة...', time: new Date().toLocaleTimeString('ar-SA') }]);

    try {
      const messagesToSchedule = [];
      let currentAutoIndex = 0;
      let messagesSentOnCurrentAuto = 0;
      
      // Optimization: Only convert to base64 once if it's the same file for everyone
      let sharedMediaB64 = null;
      if (mode === 'manual' && manualFile) {
        sharedMediaB64 = await getBase64(manualFile);
      }
      
      for (let i = 0; i < activeQueue.length; i++) {
        const item = activeQueue[i];
        let targetNumber = '';
        let fileToUpload = null;

        if (mode === 'folder') {
          targetNumber = getPureNumber(item.name);
          fileToUpload = item;
        } else {
          targetNumber = item;
        }

        if (!targetNumber || targetNumber.length < 9) continue;

        // If folder mode, each image is unique. If manual mode, we use sharedMediaB64
        const b64 = (mode === 'folder' && fileToUpload) ? await getBase64(fileToUpload) : null;
        let finalMessage = parseTemplate(messageTemplate, targetNumber, i);
        
        const student = students.find(s => getPureNumber(s.phone) === targetNumber);
        const studentJid = student?.fullJid || '';

        // Add a staggered delay (e.g. 30s apart) to avoid ban
        const staggeredTime = scheduledTimestamp + (i * 30000);

        let finalSenderId = senderId;
        if (senderId === 'auto') {
          if (autoIncludedAccounts.length === 0) {
            throw new Error('لا توجد حسابات محددة للتوجيه التلقائي!');
          }
          finalSenderId = autoIncludedAccounts[currentAutoIndex];
          messagesSentOnCurrentAuto++;
          if (messagesSentOnCurrentAuto >= autoMessagesPerSwitch) {
            messagesSentOnCurrentAuto = 0;
            currentAutoIndex = (currentAutoIndex + 1) % autoIncludedAccounts.length;
          }
        }

        messagesToSchedule.push({
          employeeId: finalSenderId,
          phoneNumber: targetNumber,
          fullJid: studentJid,
          message: finalMessage,
          base64Image: b64, // Only set if unique (folder mode)
          type: (b64 || sharedMediaB64) ? 'image' : 'text',
          scheduledAt: staggeredTime,
          senderName: auth.currentUser?.displayName || 'المرسل القوي',
          senderId: auth.currentUser?.uid || 'system'
        });

        // Periodic log for long preparation
        if (i > 0 && i % 100 === 0) {
          setLogs(prev => [{ type: 'info', num: 'System', msg: `تم تحضير ${i} رسالة...`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
        }
      }

      // Split into chunks for API calls. 
      // If we have shared media, we can use larger chunks because payload is small.
      // If it's unique images, we MUST use very small chunks.
      const chunkSize = sharedMediaB64 ? 500 : 20; 
      
      for (let i = 0; i < messagesToSchedule.length; i += chunkSize) {
        const chunk = messagesToSchedule.slice(i, i + chunkSize);
        await axios.post(`${BASE_URL}/api/schedule/bulk`, { 
            messages: chunk,
            sharedMedia: sharedMediaB64,
            sharedType: 'image'
        });
        setLogs(prev => [{ type: 'success', num: 'System', msg: `تمت جدولة الدفعة ${Math.floor(i/chunkSize) + 1} بنجاح`, time: new Date().toLocaleTimeString('ar-SA') }, ...prev]);
      }

      alert('تمت جدولة جميع الرسائل بنجاح! يمكنك متابعتها من صفحة "الرسائل المجدولة".');
      setStats(prev => ({ ...prev, pending: 0, sent: activeQueue.length }));
    } catch (err) {
      console.error(err);
      alert('فشل في جدولة الرسائل: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const handlePause = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const handleResume = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    processQueue(currentIndex);
  };

  const handleReset = () => {
    if (window.confirm('هل أنت متأكد من تصفير وإلغاء العملية بالكامل؟')) {
      setIsRunning(false);
      setIsPaused(false);
      isRunningRef.current = false;
      isPausedRef.current = false;
      setFilesQueue([]);
      setLogs([]);
      setCurrentIndex(0);
      setStats({ total: 0, sent: 0, failed: 0, pending: 0 });
    }
  };

  if (checkingAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff' }}>
        <RefreshCw size={40} className="animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '40px', borderRadius: '24px', maxWidth: '500px', margin: '0 auto', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertTriangle size={60} color="var(--danger)" style={{ marginBottom: '20px' }} />
          <h2 style={{ color: '#fff', marginBottom: '10px' }}>عذراً، غير مسموح بالدخول</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>هذه الأداة مخصصة للمسؤولين فقط لإرسال صور الحضور الجماعية.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>المُرسل الجماعي الذكي (WhatsApp)</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        أداة احترافية لإرسال صور الحضور أو الرسائل الجماعية لأرقام محددة بضغطة زر.
      </p>

      {/* Mode Switches */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '5px', borderRadius: '15px' }}>
            <button 
                onClick={() => !isRunning && setMode('folder')}
                style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: mode === 'folder' ? 'var(--brand-primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: '0.3s' }}
            >
            مجلد صور
            </button>
            <button 
                onClick={() => !isRunning && setMode('manual')}
                style={{ padding: '10px 20px', borderRadius: '12px', border: 'none', background: mode === 'manual' ? 'var(--brand-primary)' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, transition: '0.3s' }}
            >
            أرقام محددة
            </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
                <input 
                    type="text" 
                    placeholder="اسم القالب لحفظ الإعدادات..." 
                    className="input-base" 
                    style={{ padding: '8px 12px', fontSize: '0.8rem', width: '200px' }}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                />
            </div>
            <button className="btn-primary" style={{ padding: '8px 15px', fontSize: '0.8rem' }} onClick={handleSavePreset}>
                <Save size={16} /> حفظ كقالب
            </button>
        </div>
      </div>

      {presets.length > 0 && (
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '15px', background: 'rgba(59,130,246,0.05)', borderRadius: '15px', border: '1px solid rgba(59,130,246,0.1)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6', width: '100%', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Download size={14} /> القوالب المحفوظة:
              </span>
              {presets.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '5px 12px', borderRadius: '10px', gap: '10px', border: '1px solid var(--glass-border)' }}>
                      <span 
                        style={{ fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }} 
                        onClick={() => handleLoadPreset(p)}
                        title="تحميل الإعدادات"
                      >
                          {p.name}
                      </span>
                      <X 
                        size={14} 
                        style={{ cursor: 'pointer', opacity: 0.5, color: 'var(--danger)' }} 
                        onClick={() => handleDeletePreset(p.id)} 
                        title="حذف"
                      />
                  </div>
              ))}
          </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '2rem', flex: 1 }}>
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--brand-secondary)' }}>إعدادات الإرسال</h3>

          <div>
            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>حساب المرسل (الموظف)</span>
              {currentSenderStatus.isConnected && (
                <span className="badge-success" style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px' }}>
                  {currentSenderStatus.isAuto ? 'توجيه نشط' : 'متصل'}
                </span>
              )}
            </label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Specialized Auto Option Card */}
              <div 
                onClick={() => !isRunning && setSenderId('auto')}
                style={{ 
                  padding: '12px 15px', borderRadius: '16px', cursor: isRunning ? 'default' : 'pointer',
                  background: senderId === 'auto' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)' : 'rgba(255,255,255,0.03)',
                  border: senderId === 'auto' ? '2px solid var(--brand-primary)' : '2px solid transparent',
                  transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  boxShadow: senderId === 'auto' ? '0 10px 25px -5px rgba(59, 130, 246, 0.3)' : 'none'
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <Zap size={20} fill={senderId === 'auto' ? '#fff' : 'none'} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: senderId === 'auto' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    توجيه ذكي تلقائي 🌟
                    {senderId === 'auto' && (
                      <span style={{ fontSize: '0.6rem', marginLeft: '8px', color: currentSenderStatus.isConnected ? 'var(--success)' : 'var(--danger)' }}>
                        ({currentSenderStatus.isConnected ? `جاهز (${currentSenderStatus.count} متصل)` : 'غير متوفر - لا يوجد اتصال'})
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>اختيار الحساب المتصل والأقل ضغطاً آلياً</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); fetchAllStatuses(); }} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '0.65rem', padding: 0, fontWeight: 700, textDecoration: 'underline' }}
                    >
                      مزامنة الحالة
                    </button>
                  </div>
                </div>
                {senderId === 'auto' && <CheckCircle size={18} color="var(--brand-primary)" />}
              </div>

              {senderId === 'auto' && (
                <div className="animate-fade-in-up" style={{ padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--brand-primary)' }}>⚙️ إعدادات التوجيه الذكي:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>التبديل إلى الحساب التالي بعد إرسال:</span>
                    <input 
                      type="number" 
                      min="1" 
                      value={autoMessagesPerSwitch} 
                      onChange={e => setAutoMessagesPerSwitch(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff', textAlign: 'center' }}
                      disabled={isRunning}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>رسائل</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '5px' }}>تحديد الحسابات المشاركة في التوجيه:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {employees.filter(e => e.id !== 'emp1').map(emp => {
                      const isConnected = allStatuses[emp.id]?.isConnected;
                      if (!isConnected) return null;
                      const isSelected = autoIncludedAccounts.includes(emp.id);
                      return (
                        <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '8px', cursor: isRunning ? 'default' : 'pointer', border: `1px solid ${isSelected ? 'var(--success)' : 'transparent'}`, opacity: isRunning ? 0.7 : 1 }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            disabled={isRunning}
                            onChange={(e) => {
                              if (e.target.checked) setAutoIncludedAccounts([...autoIncludedAccounts, emp.id]);
                              else setAutoIncludedAccounts(autoIncludedAccounts.filter(id => id !== emp.id));
                            }}
                            style={{ display: 'none' }}
                          />
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSelected ? 'var(--success)' : 'transparent', border: isSelected ? 'none' : '1px solid var(--glass-border)' }}></div>
                          <span style={{ fontSize: '0.75rem', color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)' }}>{emp.name}</span>
                        </label>
                      );
                    })}
                    {Object.values(allStatuses || {}).filter(s => s && s.isConnected).length === 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>لا يوجد أي حساب متصل حالياً.</span>
                    )}
                  </div>
                </div>
              )}

              {/* Individual Account List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '5px' }} className="custom-scrollbar">
                {(() => {
                  const currentUserEmp = employees.find(e => e.id === goldenKey);
                  const currentUserName = currentUserEmp ? `${currentUserEmp.name} (أنا)` : 'حسابي الشخصي (أنا)';
                  
                  return [
                    ...(goldenKey ? [{ id: goldenKey, name: currentUserName }] : []),
                    ...employees.filter(e => e.id !== 'emp1' && e.id !== goldenKey)
                  ].map(emp => {
                    const status = allStatuses[emp.id] || {};
                    const isSelected = senderId === emp.id;
                    return (
                      <div 
                        key={emp.id}
                        onClick={() => !isRunning && setSenderId(emp.id)}
                        style={{ 
                          padding: '10px 15px', borderRadius: '12px', cursor: isRunning ? 'default' : 'pointer',
                          background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--glass-border)',
                          display: 'flex', alignItems: 'center', gap: '10px',
                          transition: '0.2s'
                        }}
                      >
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status.isConnected ? 'var(--success)' : 'var(--danger)' }} />
                        <div style={{ flex: 1 }}>
                           <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? '#fff' : 'rgba(255,255,255,0.6)' }}>{emp.name}</div>
                           {status.phoneNumber && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>{status.phoneNumber.split(':')[0]}</div>}
                        </div>
                        {isSelected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--brand-primary)' }} />}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {mode === 'folder' ? (
            <div>
              <label className="input-label">تحديد مجلد الصور محلياً</label>
              <input 
                 type="file" 
                 ref={fileInputRef} 
                 style={{ display: 'none' }} 
                 webkitdirectory="true" 
                 directory="true" 
                 multiple 
                 onChange={handleFolderSelection} 
              />
              <div 
                style={{ 
                  border: '2px dashed var(--glass-border)', padding: '2rem', borderRadius: '12px',
                  textAlign: 'center', cursor: 'pointer',
                  background: filesQueue.length > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  borderColor: filesQueue.length > 0 ? 'var(--success)' : 'var(--glass-border)'
                }}
                onClick={() => { if (!isRunning) fileInputRef.current?.click() }}
              >
                <ImagePlus size={32} color={filesQueue.length > 0 ? 'var(--success)' : 'var(--text-secondary)'} style={{ margin: '0 auto 1rem' }} />
                {filesQueue.length > 0 ? (
                  <>
                    <p style={{ color: 'var(--success)', margin: 0, fontWeight: 600 }}>تم تحديد المجلد بنجاح</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>عُثر على {filesQueue.length} صورة.</p>
                  </>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>اضغط لتحديد المجلد من حاسوبك</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label className="input-label">أدخل الأرقام (كل رقم في سطر)</label>
                  <textarea 
                    className="input-base custom-scrollbar" 
                    rows="8" 
                    placeholder="96650...&#10;96777...&#10;551234567"
                    value={rawNumbers}
                    onChange={(e) => setRawNumbers(e.target.value)}
                    disabled={isRunning}
                    style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                  ></textarea>
                </div>
                <div>
                  <label className="input-label">أدخل الأسماء (اختياري - كل اسم في سطر)</label>
                  <textarea 
                    className="input-base custom-scrollbar" 
                    rows="8" 
                    placeholder="الاسم الأول...&#10;الاسم الثاني...&#10;الاسم الثالث..."
                    value={rawNames}
                    onChange={(e) => setRawNames(e.target.value)}
                    disabled={isRunning}
                    style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                  ></textarea>
                </div>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--brand-primary)', marginTop: '5px', fontWeight: 700 }}>
                💡 سيتم ربط الرقم الأول بالاسم الأول، والرقم الثاني بالاسم الثاني وهكذا. استخدم المتغير {'{list_name}'} في نص الرسالة.
              </p>

              <div>
                <label className="input-label">أرفق صورة واحدة لجميع الأرقام (اختياري)</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setManualFile(e.target.files[0])}
                  disabled={isRunning}
                  style={{ color: '#94a3b8', fontSize: '0.8rem' }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="input-label">نص الرسالة المصاحب للصور</label>
                <button 
                    className="btn-secondary" 
                    style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                    onClick={() => setShowVarManager(!showVarManager)}
                >
                    {showVarManager ? 'إخفاء مدير المتغيرات' : 'إدارة المتغيرات (ترحيب/وداع)'}
                </button>
            </div>

            {showVarManager && (
                <div className="animate-fade-in-up" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>نصوص الترحيب المتغيرة {'{greeting}'}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {greetings.map((g, i) => (
                                <span key={i} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {g} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setGreetings(greetings.filter((_, idx) => idx !== i))} />
                                </span>
                            ))}
                            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => {
                                const val = prompt('أدخل نص ترحيبي جديد:');
                                if (val) setGreetings([...greetings, val]);
                            }}>+ إضافة</button>
                        </div>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>نصوص الوداع المتغيرة {'{closing}'}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {closings.map((c, i) => (
                                <span key={i} style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    {c} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setClosings(closings.filter((_, idx) => idx !== i))} />
                                </span>
                            ))}
                            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => {
                                const val = prompt('أدخل نص وداع جديد:');
                                if (val) setClosings([...closings, val]);
                            }}>+ إضافة</button>
                        </div>
                    </div>
                </div>
            )}

            <textarea 
              className="input-base" 
              rows={4} 
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="اكتب رسالتك هنا..."
              style={{ fontSize: '0.9rem', lineHeight: '1.5' }}
            />

            <div style={{ padding: '10px', background: 'rgba(59,130,246,0.1)', borderRadius: '10px', fontSize: '0.75rem', color: '#3b82f6', marginTop: '10px' }}>
                <strong>🚀 المتغيرات المتاحة:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                    <span><code>{`{greeting}`}</code></span>
                    <span><code>{`{name}`}</code></span>
                    <span><code>{`{list_name}`}</code></span>
                    <span><code>{`{university}`}</code></span>
                    <span><code>{`{major}`}</code></span>
                    <span><code>{`{closing}`}</code></span>
                </div>
            </div>

            
            <div style={{ 
                marginTop: '1rem', padding: '1rem', borderRadius: '12px', 
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Shield size={20} color={getSafetyColor(calculateSafetyScore())} />
                    <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>مؤشر أمان الإرسال: {calculateSafetyScore()}%</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                            {calculateSafetyScore() >= 80 ? 'إعداداتك آمنة جداً ومحاكاة ممتازة للبشر.' : 
                             calculateSafetyScore() >= 50 ? 'إعدادات متوسطة، يفضل إضافة متغيرات {greeting} أو {closing}.' : 
                             'تحذير: إعداداتك خطيرة وقد تعرض حسابك للحظر السريع!'}
                        </div>
                    </div>
                </div>
                <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${calculateSafetyScore()}%`, height: '100%', background: getSafetyColor(calculateSafetyScore()), transition: 'all 0.5s' }}></div>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>المتغيرات المتاحة:</span>
                {['{name}', '{greeting}', '{university}', '{major}', '{closing}', '{option1|option2}'].map(v => (
                    <code 
                        key={v} 
                        style={{ fontSize: '0.7rem', color: 'var(--brand-secondary)', cursor: 'pointer', background: 'rgba(0,0,0,0.2)', padding: '2px 5px', borderRadius: '4px' }}
                        onClick={() => setMessageTemplate(prev => prev + ' ' + v)}
                    >
                        {v}
                    </code>
                ))}
            </div>
          </div>

          {/* Anti-Ban Protection Suite */}
          <div className="glass-panel" style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '15px', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Zap size={18} color="var(--brand-primary)" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>نظام الحماية من الحظر (Anti-Ban)</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: isSafeMode ? 'var(--brand-primary)' : 'var(--text-secondary)' }}>
                  {isSafeMode ? 'وضع الحماية القصوى نشط' : 'الوضع العادي'}
                </span>
                <input 
                  type="checkbox" 
                  checked={isSafeMode} 
                  onChange={(e) => setIsSafeMode(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
               <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>الحد اليومي لكل حساب</div>
                  <input 
                    type="number" 
                    value={dailyLimit} 
                    onChange={e => setDailyLimit(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 700, width: '100%' }}
                  />
               </div>
               <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>متوسط التأخير (ثانية)</div>
                  <div style={{ color: 'var(--brand-secondary)', fontSize: '1rem', fontWeight: 700 }}>{isSafeMode ? '25 - 45' : '8 - 15'}</div>
               </div>
            </div>

            <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              * يتم الآن تعديل بيانات الصور (Binary Jitter) برمجياً عند كل إرسال لتبدو كصور فريدة تماماً.
              <br/>
              * محاكاة "يكتب الآن..." مفعلة تلقائياً.
            </p>
          </div>

          {/* Scheduling Section */}
          <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '15px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={isScheduled} 
                onChange={(e) => setIsScheduled(e.target.checked)}
                disabled={isRunning}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 700, color: isScheduled ? 'var(--brand-secondary)' : 'var(--text-primary)' }}>
                جدولة الإرسال لوقت لاحق 🗓️
              </span>
            </label>
            
            {isScheduled && (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label className="input-label" style={{ marginBottom: 0 }}>تاريخ ووقت البدء</label>
                <div style={{ position: 'relative' }}>
                  <Clock size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                  <input 
                    type="datetime-local" 
                    className="input-base" 
                    style={{ paddingRight: '2.8rem' }}
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--warning)', marginTop: '2px' }}>
                  * سيتم توزيع الرسائل تلقائياً بفاصل 30 ثانية لتجنب الحظر.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!isRunning ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-primary" onClick={handleStart} style={{ flex: 1, padding: '1rem', fontSize: '1.1rem' }}>
                    {isScheduled ? <Calendar size={20} /> : <Play size={20} fill="#fff" />} 
                    {isScheduled ? 'جدولة المهمة الجماعية' : 'البدء بالإرسال المباشر'}
                </button>
                <button className="btn-secondary" onClick={handlePreview} style={{ padding: '0 1.2rem' }} title="معاينة نموذج من الرسالة">
                    <Eye size={22} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '1rem' }}>
                {isPaused ? (
                  <button className="btn-primary" onClick={handleResume} style={{ flex: 1, background: 'linear-gradient(135deg, var(--success), #059669)' }}>
                    <Play size={20} fill="#fff" /> استئناف
                  </button>
                ) : (
                  <button className="btn-primary" onClick={handlePause} style={{ flex: 1, background: 'linear-gradient(135deg, var(--warning), #d97706)' }}>
                    <Pause size={20} fill="#fff" /> إيقاف مؤقت
                  </button>
                )}
                <button 
                    onClick={handleReset} 
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', padding: '0 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                    title="إيقاف نهائي وتصفير"
                >
                  <Square size={20} fill="currentColor" /> <span style={{ fontWeight: 700 }}>توقف</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>الإجمالي</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--text-primary)' }}>{stats.total}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>تم الإرسال</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--success)' }}>{stats.sent}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>فشل</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--danger)' }}>{stats.failed}</h2>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
               <p style={{ margin: 0, color: 'var(--text-secondary)' }}>الانتظار</p>
               <h2 style={{ margin: '0.5rem 0 0', color: 'var(--warning)' }}>{stats.pending}</h2>
            </div>
          </div>

          {stats.total > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>نسبة الإنجاز</span>
                <span style={{ fontWeight: 'bold', color: 'var(--brand-secondary)' }}>
                  {Math.round(((stats.sent + stats.failed) / stats.total) * 100)}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${((stats.sent + stats.failed) / stats.total) * 100}%`, 
                  background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-secondary))',
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>السجل الحي للعمليات</h3>
                <button 
                    className="btn-secondary" 
                    style={{ fontSize: '0.75rem', padding: '5px 12px', opacity: logs.length > 0 ? 1 : 0.5 }}
                    onClick={handleExportLogs}
                    disabled={logs.length === 0}
                >
                    <FileOutput size={16} /> تصدير السجل
                </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
               {logs.length > 0 ? logs.map((log, i) => (
                 <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', marginBottom: '0.5rem', background: log.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', borderLeft: `3px solid ${log.type === 'error' ? 'var(--danger)' : 'var(--success)'}` }}>
                    {log.type === 'error' ? <AlertTriangle size={18} color="var(--danger)" /> : <Send size={18} color="var(--success)" />}
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, color: log.type === 'error' ? 'var(--danger)' : 'var(--text-primary)' }}>{log.num}</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{log.time} - {log.msg}</p>
                    </div>
                 </div>
               )) : (
                 <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column' }}>
                   <Send size={40} opacity={0.3} style={{ marginBottom: '1rem' }} />
                   <p>لم تبدأ أي عملية إرسال فعلية حتى الآن</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowPreview(false)}>
              <div className="glass-panel animate-scale-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Eye /> معاينة الرسالة</h3>
                      <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', color: '#fff' }}><X size={24} /></button>
                  </div>
                  <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '15px', border: '1px solid var(--glass-border)', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '-10px', right: '20px', background: '#25d366', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '5px' }}>WhatsApp Preview</div>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6, fontSize: '0.95rem' }}>{previewContent || 'لا يوجد محتوى للمعاينة'}</p>
                      {manualFile && (
                          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', textAlign: 'center' }}>
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>[سيتم إرفاق الصورة المختارة]</p>
                          </div>
                      )}
                  </div>
                  <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      * هذه معاينة لنموذج واحد فقط، المتغيرات ستختلف لكل طالب.
                  </p>
                  <button className="btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setShowPreview(false)}>إغلاق المعاينة</button>
              </div>
          </div>
      )}
    </div>
  );
}
