import React, { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, RotateCcw, Camera, Type } from 'lucide-react';
import api from '../../services/api';

const RemoteScreen = ({ device, onClose }) => {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const closingRef = useRef(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [quality, setQuality] = useState(50);
  const [scale, setScale] = useState(2);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');

  const lastFrameTimeRef = useRef(Date.now());
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!device) return;
    closingRef.current = false;

    // 建立 WebSocket 連線
    const wsUrl = api.getScreenStreamWSUrl(device.android_id, device.device_api_key);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('📡 WebSocket 已連線，開始螢幕截取...');
      startScreenCapture();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'screen_frame' && data.image_base64) {
          renderFrame(data.image_base64);
          updateStats(data.timestamp || Date.now());
          // 首張畫面到達即視為 capturing（用於覆蓋 loading spinner）
          if (!isCapturing) setIsCapturing(true);
        }
      } catch (e) {
        console.error('解析 WebSocket 訊息失敗:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket 錯誤:', error);
    };

    // 注意：不在 ws.onclose 觸發 stopScreenCapture
    // 讓後端保持 device 端 Service 常駐，避免下次重連需重新授權螢幕錄製
    ws.onclose = () => {
      console.log('🔌 WebSocket 已斷線');
    };

    return () => {
      closingRef.current = true;
      // 使用者關閉視窗才明確停止 device 端 capture
      stopScreenCapture();
      try { ws.close(); } catch (_) {}
      wsRef.current = null;
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  const startScreenCapture = async () => {
    try {
      const resp = await api.startScreenCapture(device.android_id, quality, scale);
      // status: "started" (首次) 或 "reused" (複用現有 session)
      console.log('🎬 螢幕截取啟動回應:', resp?.status);
      // 首張 frame 到達時 ws.onmessage 會設 isCapturing=true
      // 若是複用現有 session，畫面應立即進來
    } catch (err) {
      console.error('啟動螢幕截取失敗:', err);
      const msg = err?.response?.data?.detail || err?.message || '未知錯誤';
      alert(`❌ 無法啟動螢幕控制: ${msg}`);
    }
  };

  const stopScreenCapture = async () => {
    try {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      
      try {
        await api.stopScreenCapture(device.android_id);
      } catch (err) {
        console.warn('停止截取指令發送失敗（可能已離線）:', err);
      }
      
      setIsCapturing(false);
    } catch (err) {
      console.error('停止截取失敗:', err);
    }
  };

  const renderFrame = (base64Image) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // 計算 FPS
      frameCountRef.current += 1;
    };
    
    img.src = `data:image/jpeg;base64,${base64Image}`;
  };

  const updateStats = (timestamp) => {
    const now = Date.now();
    const delay = now - timestamp;
    setLatency(delay);
    
    // 每秒更新一次 FPS
    const elapsed = now - lastFrameTimeRef.current;
    if (elapsed >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
  };

  // ===== 手勢追蹤 =====
  // 分辨 tap / long-press / swipe / drag，並轉成 canvas 座標送到 backend
  const gestureRef = useRef(null);           // { startX, startY, startTs, points, longPressTimer, isLongPress }
  const LONG_PRESS_MS = 500;                  // 按住到此門檻視為 long-press
  const MOVE_THRESHOLD_PX = 8;                // 位移小於此值仍算 tap
  const DRAG_SAMPLE_INTERVAL_MS = 30;         // 拖動採樣間隔（30ms 約 33Hz）

  const canvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    // touch 事件用 changedTouches[0]，mouse 用 e 本身
    const src = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: Math.max(0, Math.floor((src.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.floor((src.clientY - rect.top) * scaleY)),
    };
  };

  const sendGestureStroke = async (points, durationMs) => {
    try {
      await api.sendGesture(device.android_id, [
        { points, duration_ms: Math.max(1, Math.round(durationMs)), start_ms: 0 },
      ]);
    } catch (err) {
      console.error('發送手勢失敗:', err);
    }
  };

  const handlePointerStart = (e) => {
    e.preventDefault();
    const { x, y } = canvasCoords(e);
    const now = performance.now();

    // 先開一個 long-press 定時器；若在時間內沒明顯位移就 fire long-press 並鎖定
    const longPressTimer = setTimeout(() => {
      const g = gestureRef.current;
      if (!g || g.fired) return;
      const dx = g.lastX - g.startX;
      const dy = g.lastY - g.startY;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) {
        g.isLongPress = true;
        // 不立即發送 — 使用者仍可能繼續拖動變成 drag-after-long-press
        // 待 pointerEnd 時決定
      }
    }, LONG_PRESS_MS);

    gestureRef.current = {
      startX: x, startY: y,
      lastX: x, lastY: y,
      startTs: now,
      points: [{ x, y, t: now }],
      longPressTimer,
      isLongPress: false,
      fired: false,
    };
  };

  const handlePointerMove = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    const { x, y } = canvasCoords(e);
    const now = performance.now();
    g.lastX = x;
    g.lastY = y;
    // 採樣：跟上一點時間差需 >= interval 才記錄，避免軌跡過密
    const last = g.points[g.points.length - 1];
    if (now - last.t >= DRAG_SAMPLE_INTERVAL_MS) {
      g.points.push({ x, y, t: now });
    }
  };

  const handlePointerEnd = async (e) => {
    const g = gestureRef.current;
    if (!g || g.fired) return;
    g.fired = true;
    clearTimeout(g.longPressTimer);
    gestureRef.current = null;

    const { x, y } = canvasCoords(e);
    const endTs = performance.now();
    const totalDurationMs = endTs - g.startTs;
    const dx = x - g.startX;
    const dy = y - g.startY;
    const totalDistance = Math.hypot(dx, dy);

    // 補一點終點（避免採樣間隔錯過最後位置）
    const points = g.points.slice();
    const lastPt = points[points.length - 1];
    if (lastPt.x !== x || lastPt.y !== y) {
      points.push({ x, y, t: endTs });
    }

    if (totalDistance < MOVE_THRESHOLD_PX) {
      // 未明顯移動 → tap 或 long-press
      if (g.isLongPress || totalDurationMs >= LONG_PRESS_MS) {
        // long-press：單點 stroke + 完整按住時長
        await sendGestureStroke(
          [{ x: g.startX, y: g.startY }],
          Math.max(LONG_PRESS_MS, totalDurationMs),
        );
      } else {
        // tap：單點 + 短時長
        await sendGestureStroke(
          [{ x: g.startX, y: g.startY }],
          Math.min(80, Math.max(30, totalDurationMs)),
        );
      }
    } else {
      // 有明顯位移 → swipe 或 drag
      // 為節省頻寬：若採樣點太多，抽稀至 <= 20 點（保留起點與終點）
      const simplified = points.length <= 20
        ? points.map(p => ({ x: p.x, y: p.y }))
        : simplifyPoints(points, 20);
      await sendGestureStroke(simplified, totalDurationMs);
    }
  };

  const handlePointerCancel = () => {
    const g = gestureRef.current;
    if (g) clearTimeout(g.longPressTimer);
    gestureRef.current = null;
  };

  // 等距抽稀，保留起點/終點
  const simplifyPoints = (pts, targetCount) => {
    if (pts.length <= targetCount) return pts.map(p => ({ x: p.x, y: p.y }));
    const out = [];
    const step = (pts.length - 1) / (targetCount - 1);
    for (let i = 0; i < targetCount; i++) {
      const idx = Math.round(i * step);
      const p = pts[idx];
      out.push({ x: p.x, y: p.y });
    }
    return out;
  };

  const handleKeyPress = async (keycode) => {
    try {
      await api.sendKeyEvent(device.android_id, keycode);
    } catch (err) {
      console.error('發送按鍵事件失敗:', err);
    }
  };

  const handleTextSubmit = async () => {
    if (!textInputValue.trim()) return;
    
    try {
      await api.sendTextInput(device.android_id, textInputValue);
      setTextInputValue('');
      setShowTextInput(false);
      alert('✅ 文字已送出');
    } catch (err) {
      alert('❌ 發送文字失敗');
    }
  };

  const handleScreenshot = async () => {
    try {
      const result = await api.captureScreenshot(device.android_id);
      if (result.image_base64) {
        // 下載截圖
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${result.image_base64}`;
        link.download = `screenshot_${device.android_id}_${Date.now()}.jpg`;
        link.click();
        alert('✅ 截圖已儲存');
      }
    } catch (err) {
      alert('❌ 截圖失敗');
    }
  };

  const toggleFullscreen = () => {
    const container = document.getElementById('remote-screen-container');
    
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleQualityChange = async (newQuality) => {
    setQuality(newQuality);
    // 重新啟動截取以套用新設定
    await stopScreenCapture();
    await startScreenCapture();
  };

  const handleScaleChange = async (newScale) => {
    setScale(newScale);
    await stopScreenCapture();
    await startScreenCapture();
  };

  return (
    <div 
      id="remote-screen-container"
      className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center p-4"
    >
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[95vh]">
        
        {/* 標題列 */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex justify-between items-center text-white rounded-t-xl">
          <div>
            <h3 className="text-xl font-bold flex items-center">
              📱 螢幕遠端控制
            </h3>
            <p className="text-purple-200 text-sm">
              {device.device_model} ({device.android_id})
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="text-purple-200">
                FPS: <span className="font-mono font-bold text-white">{fps}</span>
              </div>
              <div className="text-purple-200">
                延遲: <span className="font-mono font-bold text-white">{latency}ms</span>
              </div>
            </div>
            
            <button 
              onClick={handleScreenshot}
              className="p-2 hover:bg-white/20 rounded transition"
              title="截圖並下載"
            >
              <Camera size={20} />
            </button>
            
            <button 
              onClick={toggleFullscreen}
              className="p-2 hover:bg-white/20 rounded transition"
              title={isFullscreen ? "退出全螢幕" : "全螢幕顯示"}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded transition"
              title="關閉"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* 畫面顯示區 */}
        <div className="flex-1 overflow-auto bg-gray-800 p-4 flex items-center justify-center">
          {isCapturing ? (
            <canvas
              ref={canvasRef}
              onMouseDown={handlePointerStart}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerEnd}
              onMouseLeave={handlePointerCancel}
              onTouchStart={handlePointerStart}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerEnd}
              onTouchCancel={handlePointerCancel}
              className="max-w-full max-h-full border-2 border-purple-500 rounded shadow-2xl cursor-crosshair select-none touch-none"
              style={{ imageRendering: 'crisp-edges' }}
            />
          ) : (
            <div className="text-center text-gray-400">
              <RotateCcw className="w-16 h-16 mx-auto mb-4 animate-spin" />
              <p>正在啟動螢幕截取...</p>
              <p className="text-sm mt-2">請確認裝置已授予螢幕錄製權限</p>
            </div>
          )}
        </div>

        {/* 控制列 */}
        <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 rounded-b-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            
            {/* 虛擬按鍵 */}
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={() => handleKeyPress(3)} 
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition"
                title="HOME 鍵"
              >
                🏠 Home
              </button>
              <button 
                onClick={() => handleKeyPress(4)} 
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition"
                title="BACK 鍵"
              >
                ◀️ Back
              </button>
              <button 
                onClick={() => handleKeyPress(187)} 
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition"
                title="最近使用的應用程式"
              >
                📋 Recent
              </button>
              <button 
                onClick={() => setShowTextInput(!showTextInput)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition flex items-center gap-1"
                title="輸入文字"
              >
                <Type size={16} /> 輸入文字
              </button>
            </div>

            {/* 品質與縮放設定 */}
            <div className="flex items-center gap-4 text-sm text-gray-300">
              <label className="flex items-center gap-2">
                品質:
                <select 
                  value={quality} 
                  onChange={(e) => handleQualityChange(Number(e.target.value))}
                  className="bg-gray-700 border-gray-600 rounded px-2 py-1 text-white"
                >
                  <option value={30}>低 (30%)</option>
                  <option value={50}>中 (50%)</option>
                  <option value={70}>高 (70%)</option>
                  <option value={90}>極高 (90%)</option>
                </select>
              </label>

              <label className="flex items-center gap-2">
                解析度:
                <select 
                  value={scale} 
                  onChange={(e) => handleScaleChange(Number(e.target.value))}
                  className="bg-gray-700 border-gray-600 rounded px-2 py-1 text-white"
                >
                  <option value={1}>100%</option>
                  <option value={2}>50%</option>
                  <option value={3}>33%</option>
                  <option value={4}>25%</option>
                </select>
              </label>
            </div>

            {/* 重新連線按鈕 */}
            <button 
              onClick={async () => {
                await stopScreenCapture();
                await startScreenCapture();
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm transition flex items-center gap-2"
            >
              <RotateCcw size={16} /> 重新連線
            </button>
          </div>

          {/* 文字輸入框（條件顯示） */}
          {showTextInput && (
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleTextSubmit()}
                placeholder="輸入文字後按 Enter..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                autoFocus
              />
              <button
                onClick={handleTextSubmit}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition"
              >
                送出
              </button>
              <button
                onClick={() => {
                  setShowTextInput(false);
                  setTextInputValue('');
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm transition"
              >
                取消
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoteScreen;