import React, { useState } from 'react';
import { ethers } from 'ethers';
import jsPDF from 'jspdf';

//contact address
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

const CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "_certificateId", "type": "string"},
      {"internalType": "string", "name": "_studentName", "type": "string"},
      {"internalType": "string", "name": "_courseName", "type": "string"},
      {"internalType": "string", "name": "_issueDate", "type": "string"}
    ],
    "name": "issueCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

function CreateCertificate() {
  const [studentName, setStudentName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastCertId, setLastCertId] = useState('');

  const checkMetaMask = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask!');
      return false;
    }
    return true;
  };

  const generateCertificate = async () => {
    if (!studentName || !courseName) {
      alert('Please fill all fields');
      return;
    }

    if (!(await checkMetaMask())) return;

    setLoading(true);

    try {
      // Generate unique ID
      const certificateId = 'CERT' + Date.now();
      const issueDate = new Date().toLocaleDateString();

      // Connect to MetaMask
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      // Connect to smart contract
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      // Issue certificate on blockchain
      console.log('Issuing certificate on blockchain...');
      const tx = await contract.issueCertificate(certificateId, studentName, courseName, issueDate);
      console.log('Transaction sent:', tx.hash);
      
      await tx.wait();
      console.log('Transaction confirmed!');

      // Generate PDF
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(24);
      doc.setTextColor(0, 100, 200);
      doc.text('CERTIFICATE OF COMPLETION', 105, 40, { align: 'center' });
      
      // Border
      doc.setLineWidth(2);
      doc.setDrawColor(0, 100, 200);
      doc.rect(20, 20, 170, 240);
      
      // Content
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.text('This is to certify that', 105, 80, { align: 'center' });
      
      doc.setFontSize(20);
      doc.setTextColor(200, 0, 0);
      doc.text(studentName, 105, 100, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.text('has successfully completed', 105, 120, { align: 'center' });
      
      doc.setFontSize(18);
      doc.setTextColor(0, 150, 0);
      doc.text(courseName, 105, 140, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text(`Issue Date: ${issueDate}`, 105, 180, { align: 'center' });
      doc.text(`Certificate ID: ${certificateId}`, 105, 190, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text('Verified on Blockchain - This certificate is tamper-proof', 105, 210, { align: 'center' });
      doc.text('Verify at: yourapp.com/verify', 105, 220, { align: 'center' });

      // Save PDF
      doc.save(`${studentName.replace(/\s+/g, '_')}_Certificate.pdf`);

      setLastCertId(certificateId);
      alert(`Certificate created successfully!\nCertificate ID: ${certificateId}`);
      
      // Clear form
      setStudentName('');
      setCourseName('');

    } catch (error) {
      console.error('Error creating certificate:', error);
      if (error.code === 4001) {
        alert('Transaction rejected by user');
      } else if (error.code === -32603) {
        alert('Make sure you have enough MATIC tokens and are connected to Polygon Mumbai');
      } else {
        alert('Error creating certificate: ' + error.message);
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Create Certificate</h2>
            <p className="text-gray-600">Issue blockchain-verified certificates</p>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Student Name
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter student name"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Course Name
              </label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter course name"
                disabled={loading}
              />
            </div>
            
            <button
              onClick={generateCertificate}
              disabled={loading || !studentName || !courseName}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Certificate...
                </>
              ) : (
                'Create Certificate'
              )}
            </button>
          </div>
          
          {lastCertId && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-sm font-semibold text-green-800 mb-1">Last Created Certificate</h3>
              <p className="text-sm text-green-700 break-all">ID: {lastCertId}</p>
            </div>
          )}
        </div>
        
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Requirements</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• MetaMask wallet installed</li>
            <li>• Connected to Polygon Mumbai testnet</li>
            <li>• Have test MATIC tokens</li>
            <li>• Contract address configured</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default CreateCertificate;