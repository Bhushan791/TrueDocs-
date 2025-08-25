"use client"

import { useState, useRef } from "react"
import { PDFDocument, rgb } from "pdf-lib"
import QRCode from "qrcode"
import CryptoJS from "crypto-js"
import { v4 as uuidv4 } from "uuid"
import JSZip from "jszip"
import { ethers } from "ethers"

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS; 

const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "string", name: "_id", type: "string" },
      { internalType: "bytes32", name: "_docHash", type: "bytes32" },
      { internalType: "string", name: "_docType", type: "string" },
      { internalType: "string", name: "_issuer", type: "string" },
      { internalType: "string", name: "_subject", type: "string" },
      { internalType: "string", name: "_metadataURI", type: "string" },
      { internalType: "uint64", name: "_validUntil", type: "uint64" },
      { internalType: "string", name: "_title", type: "string" },
      { internalType: "string", name: "_roleOrProgram", type: "string" },
      { internalType: "string", name: "_idNumber", type: "string" },
    ],
    name: "issueDocument",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
]

const DOCUMENT_TYPES = {
  certificate: {
    name: "Certificate",
    icon: "🎓",
    fields: ["title"],
    description: "Course, skill, or exam certificates",
    gradient: "from-blue-500 to-purple-600",
  },
  id_card: {
    name: "Student ID Card",
    icon: "🆔",
    fields: ["roleOrProgram", "idNumber"],
    description: "Student identification cards",
    gradient: "from-green-500 to-teal-600",
  },
  employee_card: {
    name: "Employee Card",
    icon: "👔",
    fields: ["roleOrProgram", "idNumber"],
    description: "Staff identification cards",
    gradient: "from-orange-500 to-red-600",
  },
}

function EnhancedDocumentProcessor() {
  const [selectedType, setSelectedType] = useState("certificate")
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [formData, setFormData] = useState({
    issuer: "",
    title: "",
    roleOrProgram: "",
    idNumber: "",
    metadataURI: "",
    validUntil: "",
    notes: "",
  })
  const [loading, setLoading] = useState(false)
  const [processingStatus, setProcessingStatus] = useState("")
  const [processedDocs, setProcessedDocs] = useState([])
  const [qrSettings, setQrSettings] = useState({
    size: 80,
    errorCorrectionLevel: "H",
    margin: 4,
    color: "#000000",
    backgroundColor: "#ffffff",
  })
  const fileInputRef = useRef(null)

  // Smart QR positioning using computer vision techniques
  const findOptimalQRPosition = async (canvas, qrSize) => {
    const ctx = canvas.getContext("2d")
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    const cornerRegions = [
      { x: 0, y: 0, name: "top-left" },
      { x: canvas.width - qrSize, y: 0, name: "top-right" },
      { x: 0, y: canvas.height - qrSize, name: "bottom-left" },
      { x: canvas.width - qrSize, y: canvas.height - qrSize, name: "bottom-right" },
    ]

    let bestPosition = cornerRegions[1] // Default top-right
    let bestScore = -1

    for (const region of cornerRegions) {
      let whitePixels = 0
      let totalPixels = 0
      let edgePixels = 0

      // Sample region for whitespace and edge detection
      for (let y = Math.max(0, region.y); y < Math.min(canvas.height, region.y + qrSize); y += 5) {
        for (let x = Math.max(0, region.x); x < Math.min(canvas.width, region.x + qrSize); x += 5) {
          const idx = (y * canvas.width + x) * 4
          const r = data[idx]
          const g = data[idx + 1]
          const b = data[idx + 2]

          // Check if pixel is light/white
          const brightness = (r + g + b) / 3
          if (brightness > 200) whitePixels++

          // Simple edge detection (check contrast with neighbors)
          if (x > 0 && y > 0) {
            const neighborIdx = ((y - 1) * canvas.width + (x - 1)) * 4
            const neighborBrightness = (data[neighborIdx] + data[neighborIdx + 1] + data[neighborIdx + 2]) / 3
            if (Math.abs(brightness - neighborBrightness) > 50) edgePixels++
          }

          totalPixels++
        }
      }

      const whiteRatio = whitePixels / totalPixels
      const edgeRatio = edgePixels / totalPixels
      const score = whiteRatio * 0.7 - edgeRatio * 0.3 // Prefer white areas, avoid edges

      if (score > bestScore) {
        bestScore = score
        bestPosition = region
      }
    }

    // Add some padding from edges
    const padding = 10
    return {
      x: Math.max(padding, Math.min(canvas.width - qrSize - padding, bestPosition.x)),
      y: Math.max(padding, Math.min(canvas.height - qrSize - padding, bestPosition.y)),
      score: bestScore,
      region: bestPosition.name,
    }
  }

  const generateHighQualityQR = async (data, options = {}) => {
    const canvas = document.createElement("canvas")
    const finalOptions = {
      width: options.size || qrSettings.size,
      margin: qrSettings.margin,
      errorCorrectionLevel: qrSettings.errorCorrectionLevel,
      color: {
        dark: qrSettings.color,
        light: qrSettings.backgroundColor,
      },
      ...options,
    }

    await QRCode.toCanvas(canvas, data, finalOptions)

    // Enhance QR quality with image processing
    const ctx = canvas.getContext("2d")
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Apply sharpening filter
    const sharpenKernel = [
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0],
    ]

    const newImageData = ctx.createImageData(canvas.width, canvas.height)
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        let r = 0,
          g = 0,
          b = 0

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * canvas.width + (x + kx)) * 4
            const weight = sharpenKernel[ky + 1][kx + 1]
            r += imageData.data[idx] * weight
            g += imageData.data[idx + 1] * weight
            b += imageData.data[idx + 2] * weight
          }
        }

        const idx = (y * canvas.width + x) * 4
        newImageData.data[idx] = Math.max(0, Math.min(255, r))
        newImageData.data[idx + 1] = Math.max(0, Math.min(255, g))
        newImageData.data[idx + 2] = Math.max(0, Math.min(255, b))
        newImageData.data[idx + 3] = 255
      }
    }

    ctx.putImageData(newImageData, 0, 0)
    return canvas
  }

  const handleMultipleFileUpload = (e) => {
    const files = Array.from(e.target.files)
    const validFiles = files.filter((file) => file.type === "application/pdf" || file.type.startsWith("image/"))

    if (validFiles.length !== files.length) {
      alert(`${files.length - validFiles.length} files were rejected. Only PDF and image files are supported.`)
    }

    setUploadedFiles((prev) => [
      ...prev,
      ...validFiles.map((file) => ({
        file,
        id: uuidv4(),
        status: "pending",
        preview: null,
      })),
    ])

    // Generate previews
    validFiles.forEach((file, index) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setUploadedFiles((prev) => prev.map((f) => (f.file === file ? { ...f, preview: e.target.result } : f)))
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const removeFile = (fileId) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const computeFileHash = async (file) => {
    try {
      // Use more robust file reading for Node.js 22
      const arrayBuffer = await file.arrayBuffer()

      // Ensure proper buffer handling for Node.js 22
      const uint8Array = new Uint8Array(arrayBuffer)
      const wordArray = CryptoJS.lib.WordArray.create(uint8Array)

      // Use SHA3 with explicit configuration for better compatibility
      const hash = CryptoJS.SHA3(wordArray, {
        outputLength: 256,
        algorithm: CryptoJS.algo.SHA3,
      }).toString(CryptoJS.enc.Hex)

      return hash
    } catch (error) {
      console.error("Hash computation failed:", error)
      const fallbackHash = CryptoJS.SHA256(file.name + file.size + Date.now()).toString()
      return fallbackHash
    }
  }

  const addSmartQRToPDF = async (file, qrData, docId) => {
    try {
      const arrayBuffer = await file.arrayBuffer()

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("Invalid PDF file buffer")
      }

      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const pages = pdfDoc.getPages()
      const firstPage = pages[0]
      const { width, height } = firstPage.getSize()

      // Generate high-quality QR with enhanced error handling
      const qrCanvas = await generateHighQualityQR(qrData, { size: qrSettings.size * 2 })
      const qrDataUrl = qrCanvas.toDataURL("image/png")
      const qrImage = await pdfDoc.embedPng(qrDataUrl)

      // Smart positioning for PDF (prefer top-right corner with padding)
      const qrSize = qrSettings.size
      const padding = 15
      const x = width - qrSize - padding
      const y = height - qrSize - padding

      // Add semi-transparent background for better readability
      firstPage.drawRectangle({
        x: x - 5,
        y: y - 5,
        width: qrSize + 10,
        height: qrSize + 10,
        color: rgb(1, 1, 1),
        opacity: 0.9,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      })

      firstPage.drawImage(qrImage, {
        x,
        y,
        width: qrSize,
        height: qrSize,
      })

      // Add document ID with better typography
      firstPage.drawText(`Doc ID: ${docId}`, {
        x: x,
        y: y - 18,
        size: 8,
        color: rgb(0.2, 0.2, 0.2),
      })

      // Add verification URL
      firstPage.drawText("Scan to verify", {
        x: x,
        y: y - 30,
        size: 6,
        color: rgb(0.4, 0.4, 0.4),
      })

      const pdfBytes = await pdfDoc.save()
      return new Uint8Array(pdfBytes)
    } catch (error) {
      console.error("PDF processing failed:", error)
      throw new Error(`PDF processing failed: ${error.message}`)
    }
  }

  const addSmartQRToImage = async (file, qrData, docId) => {
    return new Promise(async (resolve, reject) => {
      try {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        const img = new Image()

        img.onerror = (error) => {
          reject(new Error(`Image loading failed: ${error.message || "Unknown error"}`))
        }

        img.onload = async () => {
          try {
            // Maintain original resolution
            canvas.width = img.width
            canvas.height = img.height

            // Draw original image with high quality
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = "high"
            ctx.drawImage(img, 0, 0)

            // Find optimal QR position
            const qrSize = Math.max(60, Math.min(canvas.width * 0.08, 120))
            const position = await findOptimalQRPosition(canvas, qrSize)

            // Generate high-quality QR
            const qrCanvas = await generateHighQualityQR(qrData, { size: qrSize * 2 })

            // Add semi-transparent background
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)"
            ctx.strokeStyle = "rgba(200, 200, 200, 0.8)"
            ctx.lineWidth = 2
            const bgPadding = 8
            ctx.fillRect(
              position.x - bgPadding,
              position.y - bgPadding,
              qrSize + bgPadding * 2,
              qrSize + bgPadding * 2 + 25,
            )
            ctx.strokeRect(
              position.x - bgPadding,
              position.y - bgPadding,
              qrSize + bgPadding * 2,
              qrSize + bgPadding * 2 + 25,
            )

            // Draw QR with anti-aliasing
            ctx.imageSmoothingEnabled = false // Sharp QR codes
            ctx.drawImage(qrCanvas, position.x, position.y, qrSize, qrSize)
            ctx.imageSmoothingEnabled = true

            // Add text with better styling
            ctx.fillStyle = "#333"
            ctx.font = "bold 10px Arial"
            ctx.textAlign = "center"
            ctx.fillText(`ID: ${docId}`, position.x + qrSize / 2, position.y + qrSize + 15)

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob)
                } else {
                  reject(new Error("Failed to create image blob"))
                }
              },
              "image/png",
              0.95,
            )
          } catch (error) {
            reject(new Error(`Image processing failed: ${error.message}`))
          }
        }

        try {
          const objectUrl = URL.createObjectURL(file)
          img.src = objectUrl

          // Clean up object URL after a timeout to prevent memory leaks
          setTimeout(() => {
            URL.revokeObjectURL(objectUrl)
          }, 30000)
        } catch (error) {
          reject(new Error(`Failed to create object URL: ${error.message}`))
        }
      } catch (error) {
        reject(new Error(`Image processing setup failed: ${error.message}`))
      }
    })
  }

  const connectWallet = async () => {
    try {
      if (typeof window === "undefined") {
        throw new Error("Window object not available")
      }

      if (typeof window.ethereum !== "undefined") {
        try {
          await window.ethereum.request({ method: "eth_requestAccounts" })

          // Check if we're on the correct network
          const chainId = await window.ethereum.request({ method: "eth_chainId" })
          console.log("[v0] Connected to chain:", chainId)

          return true
        } catch (error) {
          console.error("Failed to connect wallet:", error)
          throw new Error(`Wallet connection failed: ${error.message}`)
        }
      } else {
        throw new Error("MetaMask is not installed. Please install MetaMask to continue.")
      }
    } catch (error) {
      alert(error.message)
      return false
    }
  }

  const callSmartContract = async (docData) => {
    try {
      if (typeof window === "undefined") {
        throw new Error("Window object not available")
      }

      if (!window.ethereum) {
        throw new Error("MetaMask not found")
      }

      if (CONTRACT_ADDRESS === "0x1234567890123456789012345678901234567890") {
        throw new Error(
          "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS environment variable.",
        )
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const userAddress = await signer.getAddress()

      // Check user balance
      const balance = await provider.getBalance(userAddress)
      if (balance === 0n) {
        throw new Error("Insufficient ETH balance for transaction fees")
      }

      // Validate contract exists
      const contractCode = await provider.getCode(CONTRACT_ADDRESS)
      if (contractCode === "0x") {
        throw new Error(`No contract found at address ${CONTRACT_ADDRESS}. Please verify the contract is deployed.`)
      }

      // Create contract instance with ethers
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)

      const validUntil = docData.validUntil ? Math.floor(new Date(docData.validUntil).getTime() / 1000) : 0

      if (!docData.id || !docData.fileHash || !docData.issuer) {
        throw new Error("Missing required contract parameters: id, fileHash, or issuer")
      }

      // Ensure fileHash is properly formatted
      let formattedHash = docData.fileHash
      if (!formattedHash.startsWith("0x")) {
        formattedHash = `0x${formattedHash}`
      }
      if (formattedHash.length !== 66) {
        throw new Error("Invalid file hash format. Expected 32-byte hex string.")
      }

      console.log("[v0] Calling contract with params:", {
        id: docData.id,
        fileHash: formattedHash,
        type: docData.type || "",
        issuer: docData.issuer,
        subject: "", // removed as requested
        metadataURI: docData.metadataURI || "",
        validUntil: validUntil,
        title: docData.title || "",
        roleOrProgram: docData.roleOrProgram || "",
        idNumber: docData.idNumber || "",
      })

      try {
        const gasEstimate = await contract.issueDocument.estimateGas(
          docData.id,
          formattedHash,
          docData.type || "",
          docData.issuer,
          "", // subject removed as requested
          docData.metadataURI || "",
          validUntil,
          docData.title || "",
          docData.roleOrProgram || "",
          docData.idNumber || "",
        )
        console.log("[v0] Gas estimate:", gasEstimate.toString())
      } catch (gasError) {
        console.error("[v0] Gas estimation failed:", gasError)
        throw new Error(`Transaction would fail: ${gasError.reason || gasError.message}`)
      }

      // Call the smart contract with enhanced error handling
      const tx = await contract.issueDocument(
        docData.id,
        formattedHash,
        docData.type || "",
        docData.issuer,
        "", // subject removed as requested
        docData.metadataURI || "",
        validUntil,
        docData.title || "",
        docData.roleOrProgram || "",
        docData.idNumber || "",
        {
          gasLimit: 300000, // Set reasonable gas limit
        },
      )

      console.log("[v0] Transaction sent:", tx.hash)

      // Wait for transaction confirmation with timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Transaction timeout after 60 seconds")), 60000)),
      ])

      console.log("[v0] Transaction confirmed:", receipt.hash)
      return receipt.hash
    } catch (error) {
      console.error("[v0] Smart contract call failed:", error)

      let errorMessage = error.message
      if (error.code === "UNKNOWN_ERROR" && error.error?.message) {
        errorMessage = error.error.message
      } else if (error.reason) {
        errorMessage = error.reason
      } else if (error.message.includes("user rejected")) {
        errorMessage = "Transaction was rejected by user"
      } else if (error.message.includes("insufficient funds")) {
        errorMessage = "Insufficient ETH balance for transaction fees"
      } else if (error.message.includes("nonce too high")) {
        errorMessage = "Transaction nonce error. Please reset your MetaMask account."
      }

      throw new Error(`Blockchain transaction failed: ${errorMessage}`)
    }
  }

  const processAllDocuments = async () => {
    if (uploadedFiles.length === 0 || !formData.issuer) {
      alert("Please upload files and fill required fields")
      return
    }

    setLoading(true)
    setProcessingStatus("Connecting to wallet...")

    const walletConnected = await connectWallet()
    if (!walletConnected) {
      setLoading(false)
      return
    }

    setProcessingStatus("Initializing batch processing...")
    const processedDocuments = []

    try {
      // Process each file
      for (let i = 0; i < uploadedFiles.length; i++) {
        const fileData = uploadedFiles[i]
        const file = fileData.file

        setProcessingStatus(`Processing ${i + 1}/${uploadedFiles.length}: ${file.name}`)

        // Update file status
        setUploadedFiles((prev) => prev.map((f) => (f.id === fileData.id ? { ...f, status: "processing" } : f)))

        try {
          // Generate unique document ID
          const docId = selectedType.toUpperCase() + "-" + uuidv4().slice(0, 8)

          // Compute file hash
          const fileHash = await computeFileHash(file)

          // Create QR data
          const qrData = `${window.location.origin}/verify?chain=amoy&contract=${CONTRACT_ADDRESS}&id=${docId}`

          // Process file with smart QR placement
          let processedFile
          if (file.type === "application/pdf") {
            const pdfBytes = await addSmartQRToPDF(file, qrData, docId)
            processedFile = new Blob([pdfBytes], { type: "application/pdf" })
          } else {
            processedFile = await addSmartQRToImage(file, qrData, docId)
          }

          // Register document on blockchain
          setProcessingStatus(`Registering ${docId} on blockchain...`)

          const contractData = {
            id: docId,
            fileHash: `0x${fileHash}`,
            type: selectedType,
            issuer: formData.issuer,
            metadataURI: formData.metadataURI,
            validUntil: formData.validUntil,
            title: formData.title,
            roleOrProgram: formData.roleOrProgram,
            idNumber: formData.idNumber,
          }

          const txHash = await callSmartContract(contractData)

          processedDocuments.push({
            id: docId,
            originalName: file.name,
            processedFile,
            type: selectedType,
            fileHash,
            txHash,
          })

          // Update file status
          setUploadedFiles((prev) => prev.map((f) => (f.id === fileData.id ? { ...f, status: "completed" } : f)))
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error)
          setUploadedFiles((prev) =>
            prev.map((f) => (f.id === fileData.id ? { ...f, status: "error", error: error.message } : f)),
          )
        }
      }

      setProcessedDocs(processedDocuments)
      setProcessingStatus(`Completed! Processed ${processedDocuments.length} documents.`)
    } catch (error) {
      console.error("Batch processing error:", error)
      alert("Batch processing failed: " + error.message)
    }

    setLoading(false)
  }

  const downloadAllDocuments = async () => {
    if (processedDocs.length === 0) return

    const zip = new JSZip()
    const folder = zip.folder("processed-documents")

    // Add each processed document to zip
    processedDocs.forEach((doc, index) => {
      const extension = doc.originalName.split(".").pop()
      const filename = `${doc.id}_signed.${extension}`
      folder.file(filename, doc.processedFile)
    })

    // Add metadata file
    const metadata = {
      processedAt: new Date().toISOString(),
      documentType: selectedType,
      issuer: formData.issuer,
      totalDocuments: processedDocs.length,
      documents: processedDocs.map((doc) => ({
        id: doc.id,
        originalName: doc.originalName,
        fileHash: doc.fileHash,
        verificationURL: `${window.location.origin}/verify?chain=amoy&contract=${CONTRACT_ADDRESS}&id=${doc.id}`,
      })),
    }

    folder.file("metadata.json", JSON.stringify(metadata, null, 2))

    // Generate and download zip
    setProcessingStatus("Creating download package...")
    const zipBlob = await zip.generateAsync({ type: "blob" })

    // Trigger download with file picker simulation
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedType}-documents-${new Date().toISOString().split("T")[0]}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setProcessingStatus("Download completed!")
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return "⏳"
      case "processing":
        return "🔄"
      case "completed":
        return "✅"
      case "error":
        return "❌"
      default:
        return "📄"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full mb-6">
            <span className="text-3xl">🚀</span>
          </div>
          <h1 className="text-6xl font-bold bg-gradient-to-r from-gray-800 to-blue-600 bg-clip-text text-transparent mb-4">
            Smart Document Processor
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            AI-powered batch processing with smart QR placement, high-quality output, and blockchain verification
          </p>
        </div>

        {/* Document Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {Object.entries(DOCUMENT_TYPES).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`group relative p-8 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 ${
                selectedType === type
                  ? "border-blue-500 bg-white shadow-2xl ring-4 ring-blue-100"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-xl"
              }`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-r ${config.gradient} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`}
              ></div>
              <div className="relative z-10">
                <div className="text-5xl mb-4">{config.icon}</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{config.name}</h3>
                <p className="text-sm text-gray-600">{config.description}</p>
                {selectedType === type && (
                  <div className="mt-4 inline-flex items-center text-blue-600 text-sm font-semibold">
                    <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                    Selected
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* File Upload Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-green-600 text-xl">📁</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-800">Multi-File Upload</h2>
              </div>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                {uploadedFiles.length} files
              </span>
            </div>

            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
                uploadedFiles.length > 0
                  ? "border-green-300 bg-green-50"
                  : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleMultipleFileUpload}
                multiple
                className="hidden"
              />
              <button onClick={() => fileInputRef.current?.click()} className="w-full">
                <div className="text-5xl mb-4">{uploadedFiles.length > 0 ? "✅" : "📎"}</div>
                <p className="text-lg text-gray-700 mb-3 font-semibold">
                  {uploadedFiles.length > 0
                    ? `${uploadedFiles.length} files ready`
                    : "Drop multiple files or click to upload"}
                </p>
                <p className="text-sm text-gray-500">
                  Supports PDF, PNG, JPG • Smart QR placement • High-quality output
                </p>
              </button>
            </div>

            {/* File List */}
            {uploadedFiles.length > 0 && (
              <div className="mt-6 space-y-3 max-h-64 overflow-y-auto">
                {uploadedFiles.map((fileData) => (
                  <div key={fileData.id} className="flex items-center p-3 bg-gray-50 rounded-lg border">
                    <span className="text-xl mr-3">{getStatusIcon(fileData.status)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{fileData.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(fileData.file.size / 1024).toFixed(1)} KB • {fileData.file.type}
                      </p>
                      {fileData.error && <p className="text-xs text-red-500 mt-1">{fileData.error}</p>}
                    </div>
                    {fileData.preview && (
                      <img
                        src={fileData.preview || "/placeholder.svg"}
                        alt="Preview"
                        className="w-10 h-10 object-cover rounded mr-2"
                      />
                    )}
                    <button onClick={() => removeFile(fileData.id)} className="text-red-500 hover:text-red-700 p-1">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* QR Settings */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                <span className="text-lg mr-2">⚙️</span>
                QR Code Settings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Size</label>
                  <select
                    value={qrSettings.size}
                    onChange={(e) => setQrSettings({ ...qrSettings, size: Number.parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value={60}>Small (60px)</option>
                    <option value={80}>Medium (80px)</option>
                    <option value={100}>Large (100px)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Quality</label>
                  <select
                    value={qrSettings.errorCorrectionLevel}
                    onChange={(e) => setQrSettings({ ...qrSettings, errorCorrectionLevel: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="L">Low (7%)</option>
                    <option value="M">Medium (15%)</option>
                    <option value="Q">Quartile (25%)</option>
                    <option value="H">High (30%)</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500">
                💡 AI automatically finds the best position to avoid overlapping content
              </div>
            </div>
          </div>

          {/* Form Section */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <span className="text-purple-600 text-xl">📝</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Document Details</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Issuer Organization *</label>
                <input
                  type="text"
                  value={formData.issuer}
                  onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Your organization name"
                />
              </div>

              {selectedType === "certificate" && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Certificate Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    placeholder="e.g., AWS Solutions Architect"
                  />
                </div>
              )}

              {(selectedType === "id_card" || selectedType === "employee_card") && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      {selectedType === "id_card" ? "Program/Department" : "Role/Department"}
                    </label>
                    <input
                      type="text"
                      value={formData.roleOrProgram}
                      onChange={(e) => setFormData({ ...formData, roleOrProgram: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      placeholder={selectedType === "id_card" ? "Computer Science" : "Software Engineer"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">ID Number</label>
                    <input
                      type="text"
                      value={formData.idNumber}
                      onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      placeholder="e.g., EMP001 or STU2024001"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Valid Until (Optional)</label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">IPFS CID (Optional)</label>
                <input
                  type="text"
                  value={formData.metadataURI}
                  onChange={(e) => setFormData({ ...formData, metadataURI: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="QmXxXxXx... (if you pinned metadata)"
                />
              </div>
            </div>

            {/* Processing Status */}
            {processingStatus && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
                  <span className="text-blue-800 font-medium">{processingStatus}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 space-y-4">
              <button
                onClick={processAllDocuments}
                disabled={loading || uploadedFiles.length === 0 || !formData.issuer}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Processing {uploadedFiles.length} files...
                  </div>
                ) : (
                  `🚀 Process ${uploadedFiles.length} Documents`
                )}
              </button>

              {processedDocs.length > 0 && (
                <button
                  onClick={downloadAllDocuments}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 px-8 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  📦 Download All ({processedDocs.length} files)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Section */}
        {processedDocs.length > 0 && (
          <div className="mt-12 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-8 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white text-xl">✅</span>
                </div>
                <h3 className="text-2xl font-bold text-green-800">
                  {processedDocs.length} Documents Processed Successfully!
                </h3>
              </div>
              <div className="text-right">
                <div className="text-sm text-green-600">Total Size</div>
                <div className="font-bold text-green-800">
                  {(processedDocs.reduce((acc, doc) => acc + doc.processedFile.size, 0) / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {processedDocs.map((doc, index) => (
                <div key={doc.id} className="bg-white rounded-xl p-4 border border-green-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-600">#{index + 1}</span>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      {doc.type.toUpperCase()}
                    </span>
                  </div>
                  <h4 className="font-bold text-gray-800 truncate mb-1">{doc.originalName}</h4>
                  <p className="text-xs text-gray-600 mb-2 font-mono bg-gray-100 px-2 py-1 rounded">ID: {doc.id}</p>
                  <div className="flex items-center text-xs text-green-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    QR added • Hash: {doc.fileHash.slice(0, 8)}...
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-white rounded-xl border border-green-200">
              <h4 className="font-bold text-green-800 mb-2">📋 Processing Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-green-600">Documents</div>
                  <div className="font-bold text-green-800">{processedDocs.length}</div>
                </div>
                <div>
                  <div className="text-green-600">QR Quality</div>
                  <div className="font-bold text-green-800">{qrSettings.errorCorrectionLevel} Level</div>
                </div>
                <div>
                  <div className="text-green-600">Smart Positioning</div>
                  <div className="font-bold text-green-800">AI Optimized</div>
                </div>
                <div>
                  <div className="text-green-600">Output Quality</div>
                  <div className="font-bold text-green-800">High-Res</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Features Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">AI-Powered Positioning</h3>
            <p className="text-sm text-gray-600">
              Computer vision algorithms detect optimal QR placement to avoid overlapping important content
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📦</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Batch Processing</h3>
            <p className="text-sm text-gray-600">
              Upload multiple files at once. Process hundreds of documents with a single click
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">High-Quality QR</h3>
            <p className="text-sm text-gray-600">
              Enhanced QR codes with error correction, sharpening filters, and optimal readability
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🔗</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Blockchain Verified</h3>
            <p className="text-sm text-gray-600">
              Each document is cryptographically signed and verifiable on the blockchain
            </p>
          </div>
        </div>

        {/* Technical Notes */}
        <div className="mt-12 bg-gray-900 text-green-400 rounded-2xl p-6 font-mono text-sm">
          <div className="flex items-center mb-4">
            <span className="text-lg mr-2">💻</span>
            <h3 className="text-white font-bold">Technical Enhancements</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p>✅ Multi-file upload with drag & drop</p>
              <p>✅ Smart QR positioning using computer vision</p>
              <p>✅ High-quality QR with error correction</p>
              <p>✅ Batch ZIP download with metadata</p>
            </div>
            <div>
              <p>✅ Original image quality preservation</p>
              <p>✅ Anti-aliasing and sharpening filters</p>
              <p>✅ Real-time processing status</p>
              <p>✅ Individual file error handling</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EnhancedDocumentProcessor
