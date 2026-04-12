import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PhotoSenderProvider } from './context/PhotoSenderContext';
import { WhatsAppProvider } from './context/WhatsAppContext';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase'; // Ensure auth is exported from firebase.js
import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import Students from './pages/Students';
import Orders from './pages/Orders';
import WhatsAppChat from './pages/WhatsAppChat';
import Receipts from './pages/Receipts';
import PhotoSender from './pages/PhotoSender';
import Universities from './pages/Universities';
import Reports from './pages/Reports';
import WhatsAppConfig from './pages/WhatsAppConfig';
import Employees from './pages/Employees';
import LiveMonitoring from './pages/LiveMonitoring';
import './index.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>جاري التحميل...</div>;
  }

  const ProtectedRoute = ({ children }) => {
    return currentUser ? children : <Navigate to="/login" />;
  };

  return (
    <PhotoSenderProvider>
      <WhatsAppProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={currentUser ? <Navigate to="/dashboard" /> : <Login />} />
          
          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardHome />} />
            <Route path="students" element={<Students />} />
            <Route path="universities" element={<Universities />} />
            <Route path="orders" element={<Orders />} />
            <Route path="chat" element={<WhatsAppChat />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="photosender" element={<PhotoSender />} />
            <Route path="reports" element={<Reports />} />
            <Route path="whatsapp-config" element={<WhatsAppConfig />} />
            <Route path="live-monitoring" element={<LiveMonitoring />} />
            <Route path="employees" element={<Employees />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WhatsAppProvider>
  </PhotoSenderProvider>
);
}

export default App;
