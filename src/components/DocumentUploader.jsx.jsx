import React, { useState } from 'react';
import { ethers } from 'ethers';
import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode.react';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

const CONTRACT_ADDRESS = "0xYOUR_CONTRACT_ADDRESS_HERE"; // 🔥 REPLACE THIS

const CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "_id", "type": "string"},
      {"internalType": "bytes32", "name": "_docHash", "type": "bytes32"},
      {"internalType": "string", "name": "_docType", "type": "string"},
      {"internalType": "string", "name": "_issuer", "type": "string"},
      {"internalType": "string", "name": "_subject", "type": "string"},
      {"internalType": "string", "name": "_metadataURI", "type": "string"},
      {"internalType": "uint64", "name": "_validUntil", "type": "uint64"},
      {"internalType": "string", "name": "_title", "type": "string"},
      {"internalType": "string", "name": "_roleOrProgram", "type": "string"},
      {"internalType": "string", "name": "_idNumber", "type": "string"}
    ],
    "name": "issueDocument",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const DOCUMENT_TYPES = {
  certificate: {
    name: 'Certificate',
    icon: '🎓',
    fields: ['title'],
    description: 'Course, skill, or exam certificates'
  },
  id_card: {
    name: 'Student ID Card',
    icon: '🆔',
    fields: ['roleOrProgram', 'idNumber'],
    description: 'Student identification cards'
  },
  employee_card: {
    name: 'Employee Card',
    icon: '👔',
    fields: ['roleOrProgram', 'idNumber'],
    description: 'Staff identification cards'
  }
};

function DocumentUploader() {
  const [selectedType, setSelectedType] = useState('certificate');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [formData, setFormData] = useState({
    issuer: '',
    subject: '',
    title: '',
    roleOrProgram: '',
    idNumber: '',
    metadataURI: '',
    validUntil: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [qrPosition, setQrPosition] = useState({ x: 80, y: 5 }); // Percentage
  const [generatedDoc, setGeneratedDoc] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) {
      setUploadedFile(file);
    } else {
      alert('Please upload PDF or PNG/JPG files only');
    }
  };

  const computeFileHash = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
    return CryptoJS.SHA3(wordArray, { outputLength: 256 }).toString();
  };

  const generateCanonicalJSON = (id, fileHash) => {
    const issueDate = new Date().toISOString().split('T')[0];
    const validUntilTimestamp = formData.validUntil ? 
      Math.floor(new Date(formData.validUntil).getTime() / 1000) : 0;
    
    const canonical = {
      id,
      fileKeccak: fileHash,
      docType: selectedType,
      issuer: formData.issuer,
      subject: formData.subject,
      issueDate,
      validUntil: validUntilTimestamp,
      metadataURI: formData.metadataURI || "",
      nonce: CryptoJS.lib.WordArray.random(32).toString()
    };
    
    return JSON.stringify(canonical, Object.keys(canonical).sort());
  };

  const addQRToPDF = async (file, qrData, docId) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    // Generate QR as data URL
    const canvas = document.createElement('canvas');
    const qr = QRCode.toCanvas(canvas, qrData, { width: 60, margin: 1 });
    const qrDataUrl = canvas.toDataURL();
    
    // Convert to PDF image
    const qrImage = await pdfDoc.embedPng(qrDataUrl);
    
    // Position QR (small, corner)
    const qrSize = 40;
    const x = (width * qrPosition.x) / 100;
    const y = height - (height * qrPosition.y) / 100 - qrSize;
    
    firstPage.drawImage(qrImage, {
      x,
      y,
      width: qrSize,
      height: qrSize,
    });
    
    // Add small text signature
    firstPage.drawText(`ID: ${docId}`, {
      x: x,
      y: y - 15,
      size: 8,
      color: rgb(0, 0, 0),
    });
    
    return await pdfDoc.save();
  };

  const addQRToImage = async (file, qrData, docId) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw original image
        ctx.drawImage(img, 0, 0);
        
        // Generate QR
        const qrCanvas = document.createElement('canvas');
        QRCode.toCanvas(qrCanvas, qrData, { width: 60, margin: 1 });
        
        // Position QR
        const qrSize = 60;
        const x = (canvas.width * qrPosition.x) / 100;
        const y = (canvas.height * qrPosition.y) / 100;
        
        // Draw QR
        ctx.drawImage(qrCanvas, x, y, qrSize, qrSize);
        
        // Add text
        ctx.font = '12px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText(`ID: ${docId}`, x, y + qrSize + 15);
        
        canvas.toBlob(resolve, 'image/png');
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const issueDocument = async () => {
    if (!uploadedFile || !formData.issuer || !formData.subject) {
      alert('Please fill required fields and upload a file');
      return;
    }

    setLoading(true);

    try {
      // Generate unique ID
      const docId = selectedType.toUpperCase() + '-' + Date.now();
      
      // Compute file hash
      const fileHash = await computeFileHash(uploadedFile);
      
      // Generate canonical JSON and document hash
      const canonicalJSON = generateCanonicalJSON(docId, fileHash);
      const docHash = CryptoJS.SHA3(canonicalJSON, { outputLength: 256 }).toString();
      
      // Create QR data
      const qrData = `${window.location.origin}/verify?chain=amoy&contract=${CONTRACT_ADDRESS}&id=${docId}`;
      
      // Add QR to file
      let processedFile;
      if (uploadedFile.type === 'application/pdf') {
        const pdfBytes = await addQRToPDF(uploadedFile, qrData, docId);
        processedFile = new Blob([pdfBytes], { type: 'application/pdf' });
      } else {
        processedFile = await addQRToImage(uploadedFile, qrData, docId);
      }
      
      // Connect to blockchain
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      // Issue on blockchain
      const validUntilTimestamp = formData.validUntil ? 
        Math.floor(new Date(formData.validUntil).getTime() / 1000) : 0;
      
      const tx = await contract.issueDocument(
        docId,
        '0x' + docHash,
        selectedType,
        formData.issuer,
        formData.subject,
        formData.metadataURI || "",
        validUntilTimestamp,
        formData.title || "",
        formData.roleOrProgram || "",
        formData.idNumber || ""
      );
      
      await tx.wait();
      
      // Download processed file
      const url = URL.createObjectURL(processedFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docId}_signed.${uploadedFile.type === 'application/pdf' ? 'pdf' : 'png'}`;
      a.click();
      
      setGeneratedDoc({ id: docId, type: selectedType, file: processedFile });
      alert(`Document issued successfully!\nDocument ID: ${docId}`);
      
    } catch (error) {
      console.error('Error:', error);
      alert('Error issuing document: ' + error.message);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">Issue Documents</h1>
          <p className="text-gray-600">Upload any design and make it blockchain-verifiable</p>
        </div>

        {/* Document Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {Object.entries(DOCUMENT_TYPES).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`p-6 rounded-xl border-2 transition-all ${
                selectedType === type
                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-4xl mb-2">{config.icon}</div>
              <h3 className="text-lg font-semibold text-gray-800">{config.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{config.description}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* File Upload Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Upload Design</h2>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-4xl mb-4">📄</div>
                <p className="text-gray-600 mb-2">
                  {uploadedFile ? uploadedFile.name : 'Drop PDF/PNG or click to upload'}
                </p>
                <p className="text-sm text-gray-400">
                  We'll add QR code + digital signature
                </p>
              </label>
            </div>

            {uploadedFile && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-green-800">File Ready:</h3>
                <p className="text-green-700">{uploadedFile.name}</p>
                <p className="text-sm text-green-600">Size: {(uploadedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            )}
          </div>

          {/* Form Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {DOCUMENT_TYPES[selectedType].name} Details
            </h2>
            
            <div className="space-y-4">
              {/* Common Fields */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Issuer Organization *
                </label>
                <input
                  type="text"
                  value={formData.issuer}
                  onChange={(e) => setFormData({...formData, issuer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Your organization name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Subject (Person Name) *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Person's name"
                />
              </div>

              {/* Dynamic Fields Based on Type */}
              {selectedType === 'certificate' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Certificate Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., AWS Solutions Architect"
                  />
                </div>
              )}

              {(selectedType === 'id_card' || selectedType === 'employee_card') && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      {selectedType === 'id_card' ? 'Program/Department' : 'Role/Department'}
                    </label>
                    <input
                      type="text"
                      value={formData.roleOrProgram}
                      onChange={(e) => setFormData({...formData, roleOrProgram: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder={selectedType === 'id_card' ? 'Computer Science' : 'Software Engineer'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      ID Number
                    </label>
                    <input
                      type="text"
                      value={formData.idNumber}
                      onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., EMP001 or STU2024001"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Valid Until (Optional)
                </label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({...formData, validUntil: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  IPFS CID (Optional)
                </label>
                <input
                  type="text"
                  value={formData.metadataURI}
                  onChange={(e) => setFormData({...formData, metadataURI: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="QmXxXxXx... (if you pinned metadata)"
                />
              </div>
            </div>

            {/* QR Position Control */}
            {uploadedFile && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">QR Code Position</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600">X Position (%)</label>
                    <input
                      type="range"
                      min="5"
                      max="90"
                      value={qrPosition.x}
                      onChange={(e) => setQrPosition({...qrPosition, x: parseInt(e.target.value)})}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Y Position (%)</label>
                    <input
                      type="range"
                      min="5"
                      max="25"
                      value={qrPosition.y}
                      onChange={(e) => setQrPosition({...qrPosition, y: parseInt(e.target.value)})}
                      className="w-full"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">Adjust QR position to avoid important content</p>
              </div>
            )}

            <button
              onClick={issueDocument}
              disabled={loading || !uploadedFile || !formData.issuer || !formData.subject}
              className="w-full mt-6 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Processing...' : `Issue ${DOCUMENT_TYPES[selectedType].name}`}
            </button>
          </div>
        </div>

        {generatedDoc && (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-green-800 mb-2">
              ✅ {DOCUMENT_TYPES[selectedType].name} Issued Successfully!
            </h3>
            <p className="text-green-700">
              <strong>Document ID:</strong> {generatedDoc.id}
            </p>
            <p className="text-sm text-green-600 mt-2">
              File downloaded with QR code and digital signature overlay
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentUploader;