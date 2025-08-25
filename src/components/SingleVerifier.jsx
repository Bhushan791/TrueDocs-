import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useSearchParams } from 'react-router-dom';

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

function SingleVerifier() {
  const [searchParams] = useSearchParams();
  const [docId, setDocId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Auto-verify if coming from QR scan
    const id = searchParams.get('id');
    if (id) {
      setDocId(id);
      verifyDocument(id);
    }
  }, [searchParams]);

  const verifyDocument = async (id = docId) => {
    if (!id.trim()) {
      alert('Please enter document ID');
      return;
    }

    setLoading(true);

    try {
      const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology/');
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      
      const doc = await contract.verifyDocument(id.trim());
      
      if (doc.docHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        setResult({ valid: false, reason: 'not_found' });
      } else if (doc.revoked) {
        setResult({ valid: false, reason: 'revoked', data: doc });
      } else if (doc.validUntil > 0 && Date.now() / 1000 > doc.validUntil) {
        setResult({ valid: false, reason: 'expired', data: doc });
      } else {
        setResult({ valid: true, data: doc });
      }
      
    } catch (error) {
      console.error('Error:', error);
      setResult({ valid: false, reason: 'error' });
    }

    setLoading(false);
  };

  const getStatusColor = () => {
    if (!result) return 'gray';
    if (result.valid) return 'green';
    if (result.reason === 'expired') return 'orange';
    return 'red';
  };

  const getStatusText = () => {
    if (!result) return '';
    if (result.valid) return '✅ VALID';
    if (result.reason === 'expired') return '⏰ EXPIRED';
    if (result.reason === 'revoked') return '❌ REVOKED';
    return '❌ NOT FOUND';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Verify Document</h1>
          <p className="text-gray-600">Instant blockchain verification</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Document ID
              </label>
              <input
                type="text"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                placeholder="Enter document ID (e.g., CERTIFICATE-1703847291234)"
              />
            </div>
            
            <button
              onClick={() => verifyDocument()}
              disabled={loading || !docId.trim()}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify Document'}
            </button>
          </div>

          {result && (
            <div className={`mt-6 p-6 rounded-xl border-2 ${
              getStatusColor() === 'green' ? 'bg-green-50 border-green-200' :
              getStatusColor() === 'orange' ? 'bg-orange-50 border-orange-200' :
              'bg-red-50 border-red-200'
            }`}>
              <h3 className={`text-xl font-bold mb-4 ${
                getStatusColor() === 'green' ? 'text-green-800' :
                getStatusColor() === 'orange' ? 'text-orange-800' :
                'text-red-800'
              }`}>
                {getStatusText()}
              </h3>

              {result.data && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-semibold text-gray-600">Type:</span>
                      <p className="text-gray-800">{result.data.docType}</p>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-600">Issuer:</span>
                      <p className="text-gray-800">{result.data.issuer}</p>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-600">Subject:</span>
                      <p className="text-gray-800">{result.data.subject}</p>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-600">Issue Date:</span>
                      <p className="text-gray-800">
                        {new Date(Number(result.data.issuedAt) * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {result.data.title && (
                    <div>
                      <span className="text-sm font-semibold text-gray-600">Title:</span>
                      <p className="text-gray-800">{result.data.title}</p>
                    </div>
                  )}

                  {result.data.roleOrProgram && (
                    <div>
                      <span className="text-sm font-semibold text-gray-600">Role/Program:</span>
                      <p className="text-gray-800">{result.data.roleOrProgram}</p>
                    </div>
                  )}

                  {result.data.idNumber && (
                    <div>
                      <span className="text-sm font-semibold text-gray-600">ID Number:</span>
                      <p className="text-gray-800">{result.data.idNumber}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SingleVerifier;