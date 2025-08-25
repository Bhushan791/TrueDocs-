import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import DocumentUploader from './components/DocumentUploader';
import SingleVerifier from './components/SingleVerifier';
import BulkVerifier from './components/BulkVerifier';

function Navigation() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Issue Documents', icon: '📝' },
    { path: '/verify', label: 'Verify Single', icon: '🔍' },
    { path: '/bulk-verify', label: 'Bulk Verify', icon: '📊' }
  ];

  return (
    <nav className="bg-white shadow-lg border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              🔐 DocVerify Pro
            </h1>
          </div>
          
          <div className="flex space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                  location.pathname === item.path
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        
        <Routes>
          <Route path="/" element={<DocumentUploader />} />
          <Route path="/verify" element={<SingleVerifier />} />
          <Route path="/bulk-verify" element={<BulkVerifier />} />
        </Routes>
        
        <footer className="bg-gray-800 text-white py-6 mt-12">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-gray-400">
              Powered by Polygon Amoy • No Backend • Instant Verification
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;