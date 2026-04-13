import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

const WhatsAppContext = createContext();

export const WhatsAppProvider = ({ children }) => {
  const [employeeId, setEmployeeId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [students, setStudents] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [majors, setMajors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [viewingEmployeeId, setViewingEmployeeId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setEmployeeId(user.uid);
        const adminStatus = user.email === 'yazans95@gmail.com' || user.email === 'zyrozyro98@gmail.com';
        setIsAdmin(adminStatus);
        if (!viewingEmployeeId) setViewingEmployeeId(user.uid);
      } else {
        setEmployeeId(null);
        setIsAdmin(false);
      }
    });
    return () => unsubAuth();
  }, [viewingEmployeeId]);

  // Global Listeners (Background Sync)
  useEffect(() => {
    if (!employeeId) return;

    // 1. Listen to Students (Firestore)
    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      setStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 2. Listen to Universities
    const unsubUnivs = onSnapshot(collection(db, 'universities'), (snap) => {
      setUniversities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 3. Listen to Majors
    const unsubMajors = onSnapshot(collection(db, 'majors'), (snap) => {
      setMajors(snap.docs.map(doc => doc.data().name || doc.data().label).filter(Boolean));
    });

    // 4. Listen to Employees (if Admin)
    let unsubEmps = () => {};
    if (isAdmin) {
      unsubEmps = onSnapshot(collection(db, 'employees'), (snap) => {
        setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }

    return () => { unsubStudents(); unsubUnivs(); unsubMajors(); unsubEmps(); };
  }, [employeeId, isAdmin]);

  const [allActiveChats, setAllActiveChats] = useState(() => {
    try {
      const saved = localStorage.getItem('yz_chats_cache');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  // Persist cache to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('yz_chats_cache', JSON.stringify(allActiveChats));
  }, [allActiveChats]);

  // Active Chats Listener (Enhanced for Admin Caching)
  useEffect(() => {
    if (!employeeId) return;

    // Helper to start a listener for a specific employee
    const startListening = (targetId) => {
      const activeRef = ref(rtdb, `chat_list/${targetId}`);
      return onValue(activeRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        const list = Object.entries(data).map(([id, val]) => ({ phone: id, ...val }));
        setAllActiveChats(prev => ({ ...prev, [targetId]: list }));
        setIsLoading(false);
      });
    };

    const listeners = [];
    if (isAdmin && employees.length > 0) {
      employees.forEach(emp => { listeners.push(startListening(emp.id)); });
      listeners.push(startListening(employeeId));
    } else if (employeeId) {
      listeners.push(startListening(employeeId));
    }

    return () => listeners.forEach(unsub => unsub());
  }, [employeeId, isAdmin, employees.length]); // Use .length to avoid loop re-renders

  // Derived activeChats based on current selection - Optimized with useMemo
  const activeChats = React.useMemo(() => {
    const targetId = isAdmin ? (viewingEmployeeId || employeeId) : employeeId;
    return allActiveChats[targetId] || [];
  }, [allActiveChats, viewingEmployeeId, employeeId, isAdmin]);

  const value = {
    employeeId, isAdmin, activeChats, students, universities, majors, employees, 
    viewingEmployeeId, setViewingEmployeeId, isLoading
  };

  return (
    <WhatsAppContext.Provider value={value}>
      {children}
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = () => useContext(WhatsAppContext);
