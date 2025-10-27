import React, { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from '@google/genai';

// =================================================================================
// GEMINI API FUNCTIONS
// =================================================================================
const generateImage = async (prompt, imageDataUrl, apiKey) => {
  if (!apiKey) throw new Error("API key is not set.");
  const ai = new GoogleGenAI({ apiKey });
  const base64ImageData = imageDataUrl.split(',')[1];

  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: 'image/jpeg',
    },
  };

  const textPart = { text: prompt };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [imagePart, textPart] },
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return part.inlineData.data;
    }
  }

  return null;
};

const generateStory = async (base64ImageData, apiKey) => {
  if (!apiKey) throw new Error("API key is not set.");
  const ai = new GoogleGenAI({ apiKey });

  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: 'image/png',
    },
  };

  const textPart = { text: "이 그림을 보고 어린 아이를 위한 짧고 마법같은 동화를 만들어줘." };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [imagePart, textPart] },
  });

  return response.text;
};


// =================================================================================
// HOOKS
// =================================================================================
const useCanvas = () => {
  const canvasRef = useRef(null);
  const parentRef = useRef(null);
  const backgroundImageRef = useRef(null);
  const lastPosition = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasIsEmpty, setCanvasIsEmpty] = useState(true);

  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(5);
  const [mode, setMode] = useState('draw');

  const drawImageToCanvas = useCallback((image) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    
    const hRatio = canvas.width / image.width;
    const vRatio = canvas.height / image.height;
    const ratio = Math.min(hRatio, vRatio);
    const centerShiftX = (canvas.width - image.width * ratio) / 2;
    const centerShiftY = (canvas.height - image.height * ratio) / 2;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, image.width, image.height, centerShiftX, centerShiftY, image.width * ratio, image.height * ratio);
  }, []);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = parentRef.current;
    if (!canvas || !container) return;

    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
    const availableWidth = containerWidth;
    const a4Ratio = 1.414;

    let newWidth, newHeight;
    if (availableWidth / a4Ratio <= containerHeight) {
      newWidth = availableWidth;
      newHeight = availableWidth / a4Ratio;
    } else {
      newHeight = containerHeight;
      newWidth = containerHeight * a4Ratio;
    }
    
    canvas.width = newWidth;
    canvas.height = newHeight;
    
    const context = canvas.getContext('2d');
    if (context) {
        context.lineCap = 'round';
        context.lineJoin = 'round';
    }
    
    if (backgroundImageRef.current) {
        drawImageToCanvas(backgroundImageRef.current);
    }
  }, [drawImageToCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    parentRef.current = canvas.closest('.canvas-container');
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });

    if (parentRef.current) {
        resizeObserver.observe(parentRef.current);
    }
    handleResize();

    return () => resizeObserver.disconnect();
  }, [handleResize]);

  const getCoordinates = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = useCallback((event) => {
    event.preventDefault();
    const coords = getCoordinates(event);
    const context = canvasRef.current?.getContext('2d');
    if (!coords || !context) return;
    
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.globalCompositeOperation = mode === 'draw' ? 'source-over' : 'destination-out';

    setIsDrawing(true);
    setCanvasIsEmpty(false);
    lastPosition.current = coords;
    
    context.beginPath();
    context.moveTo(coords.x, coords.y);
    context.lineTo(coords.x, coords.y);
    context.stroke();
  }, [color, lineWidth, mode]);

  const draw = useCallback((event) => {
    if (!isDrawing) return;
    event.preventDefault();
    const coords = getCoordinates(event);
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!coords || !canvas || !context || !lastPosition.current) return;
    
    context.beginPath();
    context.moveTo(lastPosition.current.x, lastPosition.current.y);
    context.lineTo(coords.x, coords.y);
    context.stroke();
    lastPosition.current = coords;
  }, [isDrawing]);

  const finishDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPosition.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', finishDrawing);
    canvas.addEventListener('mouseout', finishDrawing);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', finishDrawing);
    canvas.addEventListener('touchcancel', finishDrawing);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', finishDrawing);
      canvas.removeEventListener('mouseout', finishDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', finishDrawing);
      canvas.removeEventListener('touchcancel', finishDrawing);
    };
  }, [startDrawing, draw, finishDrawing]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    backgroundImageRef.current = null;
    setCanvasIsEmpty(true);
  }, []);
  
  const getCanvasAsDataURL = useCallback((type, quality) => {
    const canvas = canvasRef.current;
    return canvas?.toDataURL(type, quality) || '';
  }, []);

  const loadImageToCanvas = useCallback((image) => {
    backgroundImageRef.current = image;
    drawImageToCanvas(image);
    setCanvasIsEmpty(false);
    setMode('draw');
  }, [drawImageToCanvas]);

  return { 
    canvasRef, canvasIsEmpty, clearCanvas, getCanvasAsDataURL, loadImageToCanvas,
    color, setColor, lineWidth, setLineWidth, mode, setMode 
  };
};

const useCamera = (containerRef) => {
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraViewStyle, setCameraViewStyle] = useState({});
  const videoRef = useRef(null);

  const openCamera = useCallback(async () => {
    const container = containerRef.current;
    if (container) {
      const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
      const a4Ratio = 1.414;
      const newWidth = Math.min(containerWidth, containerHeight * a4Ratio);
      const newHeight = newWidth / a4Ratio;
      setCameraViewStyle({
        width: `${newWidth}px`,
        height: `${newHeight}px`,
      });
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
    } catch (err) {
      console.error("Error accessing camera: ", err);
      alert("카메라에 접근할 수 없습니다. 권한을 확인해주세요.");
    }
  }, [containerRef]);

  const closeCamera = useCallback(() => {
    cameraStream?.getTracks().forEach(track => track.stop());
    setCameraStream(null);
  }, [cameraStream]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (cameraStream && videoEl) {
      videoEl.srcObject = cameraStream;
    }
  }, [cameraStream]);

  return { cameraStream, cameraViewStyle, openCamera, closeCamera, videoRef };
};


// =================================================================================
// COMPONENTS
// =================================================================================
const Header = ({ apiKey, setApiKey, isApiKeyValid, setIsApiKeyValid }) => {
  const [tempApiKey, setTempApiKey] = useState(apiKey);

  const handleSaveKey = () => {
    if (tempApiKey.trim()) {
      setApiKey(tempApiKey.trim());
      setIsApiKeyValid(true);
    } else {
      alert('API 키를 입력해주세요.');
    }
  };
  
  const handleEditKey = () => {
    setIsApiKeyValid(false);
  };

  useEffect(() => {
    setTempApiKey(apiKey);
  }, [apiKey]);

  return (
    <header>
      <div className="title-block">
        <h1>Scribble's Museum</h1>
        <p>낙서에 마법을 더하면 그림이 이야기를 합니다.</p>
      </div>
      <div className="api-key-manager">
        {isApiKeyValid ? (
          <div className="api-key-display">
            <span>API 키가 설정되었습니다.</span>
            <button onClick={handleEditKey} className="edit-key-button">수정</button>
          </div>
        ) : (
          <div className="api-key-input-group">
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="Gemini API 키를 입력하세요"
              aria-label="Gemini API Key Input"
              className="api-key-input"
            />
            <button onClick={handleSaveKey} className="save-key-button">저장</button>
          </div>
        )}
      </div>
    </header>
  );
};

const Controls = ({
  prompt,
  onPromptChange,
  onGenerate,
  isLoading,
  canvasIsEmpty,
  isApiKeyValid,
}) => (
  <footer className="controls">
    <input 
      className="prompt-input" 
      type="text" 
      placeholder="예: 빛나는 버섯이 있는 마법의 숲" 
      aria-label="그림에 대한 설명"
      value={prompt}
      onChange={(e) => onPromptChange(e.target.value)}
      disabled={isLoading || canvasIsEmpty || !isApiKeyValid}
    />
    <button 
      className="action-button" 
      aria-label="이야기 만들기"
      onClick={onGenerate}
      disabled={isLoading || canvasIsEmpty || !prompt.trim() || !isApiKeyValid}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    </button>
  </footer>
);

const Toolbar = ({ color, setColor, lineWidth, setLineWidth, mode, setMode }) => {
    const colors = ['#000000', '#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];
    const brushSizes = [
        { size: 2, label: '얇게' },
        { size: 5, label: '중간' },
        { size: 10, label: '굵게' }
    ];

    return (
        <div className="toolbar">
            <div className="tool-section">
                <button
                    className={`tool-button ${mode === 'erase' ? 'active' : ''}`}
                    onClick={() => setMode(mode === 'erase' ? 'draw' : 'erase')}
                    aria-label="지우개" title="지우개"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.42 4.58a2.1 2.1 0 0 0-2.97 0L7.86 12.15a1.05 1.05 0 0 0 0 1.49l6.52 6.51a2.1 2.1 0 0 0 2.97 0l2.97-2.97a2.1 2.1 0 0 0 0-2.97l-6.51-6.52a1.05 1.05 0 0 0-1.49 0L7.85 12.14" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                </button>
            </div>
            <div className="tool-section brush-sizes">
                {brushSizes.map(({ size, label }) => (
                    <button key={size} className={`brush-size ${lineWidth === size ? 'active' : ''}`} onClick={() => setLineWidth(size)} aria-label={label} title={label}>
                        <span style={{ width: size + 4, height: size + 4 }}></span>
                    </button>
                ))}
            </div>
            <div className="tool-section color-palette">
                {colors.map(c => (
                    <button key={c} className={`color-swatch ${color === c && mode === 'draw' ? 'active' : ''}`} style={{ backgroundColor: c }} onClick={() => { setColor(c); setMode('draw'); }} aria-label={`색상 ${c}`}></button>
                ))}
            </div>
        </div>
    );
};

const Canvas = forwardRef(
  ({ isLoading, canvasIsEmpty, onClear, getCanvasDataURL, onGenerateStory, isCanvasVisible, toolbar }, ref) => {

    const handleDownload = () => {
      const link = document.createElement('a');
      link.download = 'scribble-story.png';
      link.href = getCanvasDataURL('image/png');
      link.click();
    };

    const handlePrint = () => {
      const dataUrl = getCanvasDataURL('image/png');
      const windowContent = `
        <!DOCTYPE html>
        <html>
          <head><title>Print</title></head>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <img src="${dataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" onload="window.print();">
          </body>
        </html>
      `;
      const printWin = window.open('', '', 'width=800,height=600');
      printWin?.document.open();
      printWin?.document.write(windowContent);
      printWin?.document.close();
    };

    return (
      <div className="canvas-wrapper">
        {isCanvasVisible && !isLoading && toolbar}
        <div className="canvas-and-loader">
          {isLoading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
            </div>
          )}
          <canvas ref={ref} style={{ visibility: isCanvasVisible ? 'visible' : 'hidden' }} />
        </div>
        {isCanvasVisible && (
            <div className="canvas-actions">
              <button className="canvas-action-button" onClick={onClear} aria-label="처음으로" title="처음으로">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              </button>
              <button className="canvas-action-button" onClick={onGenerateStory} aria-label="이야기 만들기" title="이야기 만들기" disabled={canvasIsEmpty}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/><path d="M5 5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><path d="M19 5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><path d="m12 19-2 2-2-2"/><path d="m19 12-2 2-2-2"/><path d="m5 12-2 2-2-2"/><path d="m12 12 5 5"/><path d="m12 12-5 5"/></svg>
              </button>
              <button className="canvas-action-button" onClick={handleDownload} aria-label="다운로드" title="다운로드" disabled={canvasIsEmpty}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </button>
              <button className="canvas-action-button" onClick={handlePrint} aria-label="출력" title="출력" disabled={canvasIsEmpty}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              </button>
            </div>
          )}
      </div>
    );
  }
);

const CameraView = ({ videoRef, style, onClose, onCapture }) => (
  <div className="camera-view" style={style}>
    <button className="close-camera-button" onClick={onClose} aria-label="카메라 닫기">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <div className="camera-video-container">
      <video ref={videoRef} autoPlay playsInline muted />
      <div className="camera-guide"></div>
    </div>
    <div className="camera-controls">
      <button className="capture-button" onClick={onCapture} aria-label="사진 촬영"></button>
    </div>
  </div>
);

const InitialScreen = ({ onOpenCamera, onUpload, onStartDrawing, isApiKeyValid }) => (
  <div className="image-controls">
    <p className="api-key-prompt" style={{ display: isApiKeyValid ? 'none' : 'block' }}>
      시작하려면 API 키를 입력해주세요.
    </p>
    <button onClick={onStartDrawing} disabled={!isApiKeyValid}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
      그림 그리기
    </button>
    <button onClick={onOpenCamera} disabled={!isApiKeyValid}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
      카메라 열기
    </button>
    <button onClick={onUpload} disabled={!isApiKeyValid}>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      이미지 업로드
    </button>
  </div>
);

const StoryModal = ({ isOpen, isLoading, story, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose} aria-label="닫기">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <h2>나만의 이야기</h2>
        {isLoading ? (
          <div className="modal-loader">
            <div className="spinner"></div>
          </div>
        ) : (
          <p>{story}</p>
        )}
      </div>
    </div>
  );
};


// =================================================================================
// MAIN APP COMPONENT
// =================================================================================
const App = () => {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [story, setStory] = useState('');
  const [isStoryLoading, setIsStoryLoading] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [isCanvasVisible, setIsCanvasVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isApiKeyValid, setIsApiKeyValid] = useState(false);


  const {
    canvasRef,
    canvasIsEmpty,
    clearCanvas,
    getCanvasAsDataURL,
    loadImageToCanvas,
    color, setColor, lineWidth, setLineWidth, mode, setMode
  } = useCanvas();

  const {
    cameraStream,
    cameraViewStyle,
    openCamera,
    closeCamera,
    videoRef,
  } = useCamera(containerRef);

  const handleApiError = (error) => {
    console.error("API Error:", error);
    if (error.message.includes('API key not valid') || error.toString().includes('400')) {
        alert("API 키가 유효하지 않습니다. 다시 확인해주세요.");
        setIsApiKeyValid(false);
    } else {
        alert("이미지 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('그림에 대한 설명을 입력해주세요.');
      return;
    }
    if (!isApiKeyValid) {
      alert('API 키를 먼저 설정해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const imageDataUrl = getCanvasAsDataURL('image/jpeg');
      const base64ImageData = await generateImage(prompt, imageDataUrl, apiKey);
      if (base64ImageData) {
        const newImage = new Image();
        newImage.onload = () => {
          loadImageToCanvas(newImage);
        };
        newImage.src = `data:image/png;base64,${base64ImageData}`;
      }
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateStory = async () => {
    if (canvasIsEmpty) {
      alert("이야기를 만들 그림이 없습니다.");
      return;
    }
    if (!isApiKeyValid) {
      alert('API 키를 먼저 설정해주세요.');
      return;
    }

    setIsStoryLoading(true);
    setIsStoryModalOpen(true);
    try {
      const imageDataUrl = getCanvasAsDataURL('image/png');
      const base64ImageData = imageDataUrl.split(',')[1];
      const generatedStory = await generateStory(base64ImageData, apiKey);
      setStory(generatedStory || "이야기를 만드는 데 실패했습니다.");
    } catch (error) {
      console.error("Error generating story:", error);
      setStory("이야기를 만드는 데 실패했습니다. API 키를 확인하고 다시 시도해주세요.");
      if (error.message.includes('API key not valid') || error.toString().includes('400')) {
        setIsApiKeyValid(false);
      }
    } finally {
      setIsStoryLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          loadImageToCanvas(img);
          setIsCanvasVisible(true);
        };
        img.src = event.target?.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasRef.current?.width || video.videoWidth;
    tempCanvas.height = canvasRef.current?.height || video.videoHeight;
    const context = tempCanvas.getContext('2d');
    if (!context) return;
    
    context.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    
    const capturedImage = new Image();
    capturedImage.onload = () => {
      loadImageToCanvas(capturedImage);
      setIsCanvasVisible(true);
    };
    capturedImage.src = tempCanvas.toDataURL();
    
    closeCamera();
  }, [videoRef, canvasRef, loadImageToCanvas, closeCamera]);

  const handleStartDrawing = () => {
    setIsCanvasVisible(true);
  };

  const handleRestart = () => {
    clearCanvas();
    setIsCanvasVisible(false);
  };

  return (
    <>
      <Header
        apiKey={apiKey}
        setApiKey={setApiKey}
        isApiKeyValid={isApiKeyValid}
        setIsApiKeyValid={setIsApiKeyValid}
      />
      <main ref={containerRef} className="canvas-container">
        {!isCanvasVisible && !cameraStream && (
          <InitialScreen
            onOpenCamera={() => openCamera()}
            onUpload={() => fileInputRef.current?.click()}
            onStartDrawing={handleStartDrawing}
            isApiKeyValid={isApiKeyValid}
          />
        )}
        {cameraStream && (
          <CameraView
            videoRef={videoRef}
            style={cameraViewStyle}
            onClose={closeCamera}
            onCapture={handleCapture}
          />
        )}
        <Canvas
          ref={canvasRef}
          isLoading={isLoading}
          canvasIsEmpty={canvasIsEmpty}
          onClear={handleRestart}
          getCanvasDataURL={getCanvasAsDataURL}
          onGenerateStory={handleGenerateStory}
          isCanvasVisible={isCanvasVisible}
          toolbar={(
            <Toolbar
              color={color}
              setColor={setColor}
              lineWidth={lineWidth}
              setLineWidth={setLineWidth}
              mode={mode}
              setMode={setMode}
            />
          )}
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />
      </main>
      <Controls
        prompt={prompt}
        onPromptChange={setPrompt}
        onGenerate={handleGenerate}
        isLoading={isLoading}
        canvasIsEmpty={canvasIsEmpty}
        isApiKeyValid={isApiKeyValid}
      />
      <StoryModal
        isOpen={isStoryModalOpen}
        isLoading={isStoryLoading}
        story={story}
        onClose={() => setIsStoryModalOpen(false)}
      />
    </>
  );
};


// =================================================================================
// RENDER APP
// =================================================================================
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
