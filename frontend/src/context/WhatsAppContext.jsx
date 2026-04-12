import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, rtdb, db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

const WhatsAppContext = createContext();

export const WhatsAppProvider = ({ children }) => {
  const [employeeId, setEmployeeId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeChats, setActiveChats] = useState([]);
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

  // Active Chats Listener (The one that delays UI)
  useEffect(() => {
    const targetId = isAdmin ? (viewingEmployeeId || employeeId) : employeeId;
    if (!targetId) return;

    const activeRef = ref(rtdb, `chats/${targetId}`);
    const unsubActive = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setActiveChats(Object.entries(data).map(([id, val]) => ({ phone: id, ...val })));
      else setActiveChats([]);
      setIsLoading(false);
    });

    return () => unsubActive();
  }, [employeeId, viewingEmployeeId, isAdmin]);

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
