import React, { useState } from 'react';
import { ethers } from 'ethers';
import jsQR from 'jsqr';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS; // 🔥 REPLACE THIS

const CONTRACT_ABI = [
  {
    "inputs": [{"internalType": "string", "name": "_id", "type": "string"}],
    "name": "verifyDocument",
    "outputs": [{
      "components": [
        {"internalType": "bytes32", "name": "docHash", "type": "bytes32"},
        {"internalType": "string", "name": "docType", "type": "string"},
        {"internalType": "string", "name": "issuer", "type": "string"},
        {"internalType": "string", "name": "subject", "type": "string"},
        {"internalType": "string", "name": "metadataURI", "type": "string"},
        {"internalType": "uint64", "name": "issuedAt", "type": "uint64"},
        {"internalType": "uint64", "name": "validUntil", "type": "uint64"},
        {"internalType": "bool", "name": "revoked", "type": "bool"},
        {"internalType": "string", "name": "title", "type": "string"},
        {"internalType": "string", "name": "roleOrProgram", "type": "string"},
        {"internalType": "string", "name": "idNumber", "type": "string"}
      ],
      "internalType": "struct EnhancedDocumentVerifier.Document",
      "name": "",
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  }
];

function BulkVerifier() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({ valid: [], invalid: [] });
  const [progress, setProgress] = useState(0);

  const handleBulkUpload = (e) => {
    const files = Array.from(e.target.files);
    const imageFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    setUploadedFiles(imageFiles);
    setResults({ valid: [], invalid: [] });
  };

  const extractQRFromImage = async (file) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (qrCode) {
          // Extract document ID from QR URL
          try {
            const url = new URL(qrCode.data);
            const docId = url.searchParams.get('id');
            resolve(docId);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  };

  const verifyDocumentOnChain = async (docId) => {
    try {
      const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology/');
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      const doc = await contract.verifyDocument(docId);
      
      if (doc.docHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return { status: 'not_found', data: null };
      } else if (doc.revoked) {
        return { status: 'revoked', data: doc };
      } else if (doc.validUntil > 0 && Date.now() / 1000 > doc.validUntil) {
        return { status: 'expired', data: doc };
      } else {
        return { status: 'valid', data: doc };
      }
    } catch (error) {
      return { status: 'error', data: null };
    }
  };

  const processBulkVerification = async () => {
    if (uploadedFiles.length === 0) {
      alert('Please upload files first');
      return;
    }

    setProcessing(true);
    setProgress(0);
    
    const validDocs = [];
    const invalidDocs = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      setProgress(Math.round(((i + 1) / uploadedFiles.length) * 100));

      try {
        // Extract QR code
        const docId = await extractQRFromImage(file);
        
        if (!docId) {
          invalidDocs.push({
            file: file.name,
            reason: 'No QR code found',
            status: 'no_qr'
          });
          continue;
        }

        // Verify on blockchain
        const verification = await verifyDocumentOnChain(docId);
        
        if (verification.status === 'valid') {
          validDocs.push({
            file: file.name,
            docId,
            data: verification.data,
            status: 'valid'
          });
        } else {
          invalidDocs.push({
            file: file.name,
            docId,
            reason: verification.status === 'not_found' ? 'Document not found on blockchain' :
                   verification.status === 'revoked' ? 'Document has been revoked' :
                   verification.status === 'expired' ? 'Document has expired' :
                   'Verification error',
            status: verification.status,
            data: verification.data
          });
        }
        
      } catch (error) {
        invalidDocs.push({
          file: file.name,
          reason: 'Processing error',
          status: 'error'
        });
      }
    }

    setResults({ valid: validDocs, invalid: invalidDocs });
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Bulk Document Verification</h1>
          <p className="text-gray-600">Upload multiple files for batch verification</p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.pdf"
              onChange={handleBulkUpload}
              className="hidden"
              id="bulk-upload"
            />
            <label htmlFor="bulk-upload" className="cursor-pointer">
              <div className="text-4xl mb-4">📁</div>
              <p className="text-gray-600 mb-2">
                Upload multiple documents for verification
              </p>
              <p className="text-sm text-gray-400">
                Supports PNG, JPG, PDF with QR codes
              </p>
            </label>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="mt-6">
              <p className="text-gray-700 mb-4">
                <strong>{uploadedFiles.length}</strong> files uploaded
              </p>
              
              {processing && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Processing...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <button
                onClick={processBulkVerification}
                disabled={processing}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Verify All Documents'}
              </button>
            </div>
          )}
        </div>

        {/* Results Section */}
        {(results.valid.length > 0 || results.invalid.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Valid Documents */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-green-800 mb-4 flex items-center">
                <span className="text-2xl mr-2">✅</span>
                Valid Documents ({results.valid.length})
              </h2>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {results.valid.map((doc, index) => (
                  <div key={index} className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="font-semibold text-green-800">{doc.file}</p>
                    <p className="text-sm text-green-700">ID: {doc.docId}</p>
                    <p className="text-sm text-green-600">
                      {doc.data.docType} • {doc.data.issuer} • {doc.data.subject}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Invalid Documents */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-red-800 mb-4 flex items-center">
                <span className="text-2xl mr-2">❌</span>
                Issues Found ({results.invalid.length})
              </h2>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {results.invalid.map((doc, index) => (
                  <div key={index} className={`p-4 rounded-lg border ${
                    doc.status === 'expired' ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <p className="font-semibold text-gray-800">{doc.file}</p>
                    <p className="text-sm text-red-700">{doc.reason}</p>
                    {doc.docId && (
                      <p className="text-xs text-gray-500">ID: {doc.docId}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BulkVerifier;