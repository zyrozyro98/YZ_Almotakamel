import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { auth, rtdb, db } from '../firebase';
import localforage from 'localforage';
import { onValue, ref } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

// Define the global index DB store
localforage.config({
  name: 'AlmotakamelDB',
  storeName: 'photo_sender_queue'
});

export const PhotoSenderContext = createContext();

export const usePhotoSender = () => useContext(PhotoSenderContext);

export const PhotoSenderProvider = ({ children }) => {
  const [filesQueue, setFilesQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [senderId, setSenderId] = useState('emp1');
  const [messageTemplate, setMessageTemplate] = useState('مرحباً {name}\nنرفق لكم صورة الحضور الخاصة بكم.');
  
  const [stats, setStats] = useState({ success: 0, failed: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [goldenKey, setGoldenKey] = useState(null);

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  // Refs for background process loop matching React state
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);

  // Initialize from Local Storage & IndexedDB
  useEffect(() => {
    const initData = async () => {
      try {
        const storedQueue = await localforage.getItem('filesQueue');
        if (storedQueue) {
          // Recreate blob previews since they expire on page reload
          const restoredQueue = storedQueue.map(item => {
            if (item.file) {
              return { ...item, preview: URL.createObjectURL(item.file) };
            }
            return item;
          });
          setFilesQueue(restoredQueue);
        }

        const lsIndex = localStorage.getItem('ps_currentIndex');
        if (lsIndex) setCurrentIndex(parseInt(lsIndex));
        
        const lsRunning = localStorage.getItem('ps_isRunning') === 'true';
        const lsPaused = localStorage.getItem('ps_isPaused') === 'true';
        
        setIsRunning(lsRunning);
        isRunningRef.current = lsRunning;
        
        setIsPaused(lsPaused);
        isPausedRef.current = lsPaused;
        
        const lsStats = localStorage.getItem('ps_stats');
        if (lsStats) setStats(JSON.parse(lsStats));

        const lsTemplate = localStorage.getItem('ps_template');
        if (lsTemplate) setMessageTemplate(lsTemplate);

        const lsSenderId = localStorage.getItem('ps_senderId');
        if (lsSenderId) setSenderId(lsSenderId);
        
        // If it was running and not paused, resume processing!
        if (lsRunning && !lsPaused && storedQueue && parseInt(lsIndex) < storedQueue.length) {
          setTimeout(() => {
            processQueueSync();
          }, 2000); // 2 second delay to let auth initialize
        } else if (lsRunning && storedQueue && parseInt(lsIndex) >= storedQueue.length) {
           // Queue already finished but was left in running state
           setIsRunning(false);
           isRunningRef.current = false;
           localStorage.setItem('ps_isRunning', 'false');
        }
      } catch (err) {
        console.error('Failed to load PhotoSender state', err);
      }
    };
    initData();
  }, []);

  // Auth & Emp Listeners
  useEffect(() => {
    if (isAdmin) {
      const unsub = onSnapshot(collection(db, 'employees'), (snap) => {
        const emps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setEmployees(emps);
      });
      return () => unsub();
    }
  }, [isAdmin]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      if (user) {
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
        setGoldenKey(user.uid);
        if (!localStorage.getItem('ps_senderId')) {
          setSenderId(user.uid);
        }
      } else {
        setIsAdmin(false);
        setSenderId('emp1');
      }
    });
    return () => unsub();
  }, []);

  // Sync state to local storage when it changes
  useEffect(() => {
    localStorage.setItem('ps_currentIndex', currentIndex.toString());
    localStorage.setItem('ps_isRunning', isRunning.toString());
    localStorage.setItem('ps_isPaused', isPaused.toString());
    localStorage.setItem('ps_stats', JSON.stringify(stats));
    localStorage.setItem('ps_template', messageTemplate);
    localStorage.setItem('ps_senderId', senderId);
  }, [currentIndex, isRunning, isPaused, stats, messageTemplate, senderId]);

  // Helper to parse Spintax like {Hello|Hi|Hey}
  const parseSpintax = (text) => {
    return text.replace(/\{([^{}]+)\}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
  };

  // Main background process function
  const processQueueSync = async () => {
    let currentIdx = parseInt(localStorage.getItem('ps_currentIndex') || '0');
    let queueObj = await localforage.getItem('filesQueue') || [];
    let sessionCount = 0;
    
    while (currentIdx < queueObj.length) {
      if (!isRunningRef.current || isPausedRef.current) break;

      const item = queueObj[currentIdx];
      if (item.status === 'success') {
        currentIdx++;
        continue;
      }

      await sendSingleFile(item, currentIdx, queueObj);
      
      currentIdx++;
      sessionCount++;

      // 1. Human-like Gaussian Delay between messages (Mean 10s, Std 4s)
      const nextDelay = getGaussianDelay(10000, 4000);
      
      // 2. Periodic Long Breaks (Every 12-18 messages, wait 3-7 minutes)
      if (sessionCount >= Math.floor(Math.random() * 6 + 12)) {
        const breakDuration = Math.floor(Math.random() * 240000 + 180000); 
        console.log(`Taking a human break for ${breakDuration / 1000} seconds...`);
        sessionCount = 0;
        await new Promise(res => setTimeout(res, breakDuration));
      } else {
        await new Promise(res => setTimeout(res, nextDelay));
      }
    }

    if (currentIdx >= queueObj.length) {
      setIsRunning(false);
      isRunningRef.current = false;
      localStorage.setItem('ps_isRunning', 'false');
    }
  };

  // Helper to generate Gaussian (Normal) Distribution random numbers
  const getGaussianDelay = (mean, stdev) => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    num = num * stdev + mean;
    return Math.max(3000, num); // Never less than 3s
  };

  const sendSingleFile = async (item, idx, currentQueueObj) => {
    const updatedQueue = [...currentQueueObj];
    updatedQueue[idx] = { ...updatedQueue[idx], status: 'sending', error: null };
    setFilesQueue(updatedQueue); // Update UI optimistic

    try {
      // 3. Human Thinking Time: Delay before starting the send process
      const thinkingTime = Math.random() * 4000 + 2000;
      await new Promise(res => setTimeout(res, thinkingTime));

      const b64 = await toBase64(updatedQueue[idx].file);
      const targetNumber = updatedQueue[idx].name.split('.')[0];
      
      let captionText = localStorage.getItem('ps_template') || messageTemplate;
      // APPLY SPINTAX (Randomize greetings/emojis)
      captionText = parseSpintax(captionText);

      // 4. Typing simulation: Delay relative to text length (approx 10 chars per second)
      const typingTime = Math.min(captionText.length * 80, 6000); 
      await new Promise(res => setTimeout(res, typingTime));

      const payloadSender = localStorage.getItem('ps_senderId') || 'emp1';

      await axios.post(`${BASE_URL}/api/whatsapp/send-image`, {
        employeeId: payloadSender,
        phoneNumber: targetNumber,
        base64Image: b64,
        caption: localStorage.getItem('ps_template') || messageTemplate,
        senderName: auth.currentUser?.displayName || 'المرسل الآلي',
        senderId: auth.currentUser?.uid || 'system'
      });

      updatedQueue[idx] = { ...updatedQueue[idx], status: 'success' };
      setStats(prev => ({ ...prev, success: prev.success + 1 }));
      setFilesQueue(updatedQueue);
      await localforage.setItem('filesQueue', updatedQueue);
      
      setCurrentIndex(idx + 1);

    } catch (err) {
      console.error(`Error sending ${item.name}:`, err);
      const actualError = err.response?.data?.error || err.message;
      let userFriendlyError = 'فشل مجهول';
      if (actualError.includes('Session not init')) userFriendlyError = 'واجهة الواتساب غير متصلة';
      else if (actualError.includes('Firebase')) userFriendlyError = 'خطأ في الربط بقاعدة البيانات';
      else if (actualError.includes('timeout')) userFriendlyError = 'نفذ الوقت (Timeout)';
      else userFriendlyError = actualError;

      updatedQueue[idx] = { ...updatedQueue[idx], status: 'failed', error: userFriendlyError };
      setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
      setFilesQueue(updatedQueue);
      await localforage.setItem('filesQueue', updatedQueue);
      setCurrentIndex(idx + 1);
    }
  };

  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });

  const handleStart = async () => {
    if (filesQueue.length === 0) return alert('أضف ملفات أولاً');
    setIsRunning(true);
    isRunningRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    processQueueSync();
  };

  const handlePause = () => {
    setIsPaused(true);
    isPausedRef.current = true;
  };

  const handleResume = () => {
    setIsPaused(false);
    isPausedRef.current = false;
    processQueueSync();
  };

  const handleStop = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setCurrentIndex(0);
    setStats({ success: 0, failed: 0 });
    
    // Reset statuses but keep files
    const resQ = filesQueue.map(f => ({ ...f, status: 'pending', error: null }));
    setFilesQueue(resQ);
    localforage.setItem('filesQueue', resQ);
  };

  const clearQueue = () => {
    setFilesQueue([]);
    localforage.removeItem('filesQueue');
    setCurrentIndex(0);
    setStats({ success: 0, failed: 0 });
    setIsRunning(false);
    isRunningRef.current = false;
  };

  const addFilesToQueue = async (newFiles) => {
    const updated = [...filesQueue, ...newFiles];
    setFilesQueue(updated);
    await localforage.setItem('filesQueue', updated);
  };

  const removeFileFromQueue = async (idx) => {
    const q = [...filesQueue];
    q.splice(idx, 1);
    setFilesQueue(q);
    await localforage.setItem('filesQueue', q);
    if (currentIndex > idx) setCurrentIndex(prev => prev - 1);
  };

  const addBroadcastToQueue = async (numbersString, imageFile) => {
    if (!numbersString || !imageFile) return;
    
    // 1. Split and Clean Numbers
    const lines = numbersString.split(/[\n,;]/);
    const cleanedSet = new Set();
    
    lines.forEach(line => {
      let num = line.trim().replace(/[^0-9]/g, '');
      if (!num) return;

      // Handle common prefix issues
      if (num.startsWith('00')) num = num.substring(2);
      if (num.startsWith('0') && num.length > 5) num = num.substring(1);
      
      // Default to Yemen if 9 digits and no country code
      if (num.length === 9 && (num.startsWith('77') || num.startsWith('73') || num.startsWith('71') || num.startsWith('70'))) {
        num = '967' + num;
      }
      // Default to Saudi if 9 digits starting with 5
      else if (num.length === 9 && num.startsWith('5')) {
        num = '966' + num;
      }

      if (num.length >= 9) cleanedSet.add(num);
    });

    const sortedNumbers = Array.from(cleanedSet).sort();
    const preview = URL.createObjectURL(imageFile);

    const newEntries = sortedNumbers.map(num => ({
      file: imageFile,
      name: `${num}.jpg`,
      preview: preview,
      status: 'pending',
      error: null
    }));

    const updated = [...filesQueue, ...newEntries];
    setFilesQueue(updated);
    await localforage.setItem('filesQueue', updated);
  };

  return (
    <PhotoSenderContext.Provider value={{
      filesQueue, currentIndex, isRunning, isPaused, stats,
      senderId, setSenderId,
      messageTemplate, setMessageTemplate,
      isAdmin, employees, goldenKey,
      handleStart, handlePause, handleResume, handleStop, clearQueue,
      addFilesToQueue, removeFileFromQueue, addBroadcastToQueue
    }}>
      {children}
    </PhotoSenderContext.Provider>
  );
};
