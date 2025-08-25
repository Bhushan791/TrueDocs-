import React, { useState } from 'react'
import CreateCertificate from './components/CreateCertificate'
import VerifyCertificate from './components/VerifyCertificate'

function App() {
  const [currentPage, setCurrentPage] = useState('create')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-lg border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  🎓 CertVerify
                </h1>
              </div>
            </div>
            
            {/* Navigation buttons */}
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage('create')}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'create'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                Create Certificate
              </button>
              <button
                onClick={() => setCurrentPage('verify')}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'verify'
                    ? 'bg-green-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-green-600 hover:bg-green-50'
                }`}
              >
                Verify Certificate
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main>
        {currentPage === 'create' ? <CreateCertificate /> : <VerifyCertificate />}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">
            Powered by Polygon Blockchain • Secure • Immutable • Verifiable
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App