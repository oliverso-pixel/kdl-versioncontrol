import React, { useState, useEffect } from 'react';
import { Search, Smartphone, Battery, MapPin, Key, Cpu, RotateCcw, DownloadCloud, Settings as SettingsIcon, History, Volume2, VolumeX } from 'lucide-react';
import api from '../../services/api';

const DeviceMonitoringV2 = () => {
  const [allDevices, setAllDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal 狀態
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [installedApps, setInstalledApps] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [storeApps, setStoreApps] = useState([]);
  const [selectedInstallApp, setSelectedInstallApp] = useState("");

  useEffect(() => {
    fetchDevices();
    // 設定定時器，每 10 秒刷新一次列表 (顯示最新的 is_online 與 last_check_time)
    fetchStoreApps();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    // 呼叫原本的 V1 API，它會回傳所有 DB 的設備，包含我們加的 latitude 等欄位
    const data = await api.getDevices(); 
    setAllDevices(data);
  };

  const fetchStoreApps = async () => {
    try {
      const res = await api.getStoreApps(); // 呼叫 V2 Admin Store API
      // 過濾掉 mdmapp，不顯示在安裝選單中
      const filteredApps = res.data.filter(app => app.app_id !== 'com.kowloondairy.mdmapp');
      setStoreApps(filteredApps);
      if(filteredApps.length > 0) setSelectedInstallApp(filteredApps[0].app_id);
    } catch (err) {
      console.error("無法取得應用程式列表", err);
    }
  };

  const openDeviceDetails = async (device) => {
    setSelectedDevice(device);
    setLoadingDetails(true);
    try {
      const [apps, history] = await Promise.all([
        api.getDeviceInstalledApps(device.android_id),
        api.getDeviceLocationHistory(device.android_id)
      ]);
      setInstalledApps(apps);
      setLocationHistory(history);
    } catch (err) {
      console.error("載入裝置詳情失敗", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRemoteCommand = async (action, extraData = {}) => {
    if (!window.confirm(`確定要對設備執行 [${action}] 指令嗎？`)) return;
    
    try {
      // 自動產生 task_id (使用 Timestamp 確保唯一性)
      const payload = {
        action: action,
        task_id: `task_${Date.now()}`,
        ...extraData
      };

      // 攔截 DC_ (Device Control) 指令，強制綁定 MDM App
      if (action.startsWith('DC_')) { payload.target_app = "com.kowloondairy.mdmapp"; }

      await api.sendDeviceCommandV2(selectedDevice.android_id, payload);
      alert('✅ 指令已送出');
    } catch (err) {
      alert('❌ 發送失敗，設備可能處於離線狀態');
    }
  };

  const filteredDevices = allDevices.filter(device => 
    device.android_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (device.device_model && device.device_model.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isOnline = selectedDevice?.is_online || false;
  const btnDisabledClass = !isOnline ? "opacity-50 cursor-not-allowed filter grayscale" : "hover:-translate-y-0.5 shadow-sm";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">設備監控 (MDM 控制中心)</h1>
        <span className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-semibold">
          線上設備: {allDevices.filter(d => d.is_online).length} / {allDevices.length}
        </span>
      </div>
      
      {/* 搜尋框 */}
      <div className="mb-6 relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="搜尋 Android ID, 設備型號..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredDevices.map(device => (
          <div key={device.id} className="bg-white p-4 rounded-lg shadow flex items-center justify-between border-l-4 border-indigo-500 hover:bg-gray-50 transition">
            <div className="flex items-center space-x-4 w-1/3">
              <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500 shadow-md' : 'bg-gray-300'}`} title={device.is_online ? '上線中' : '離線'}></div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">{device.device_model || '未知設備'}</h3>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                  <Smartphone className="w-3 h-3 mr-1"/> {device.android_id}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-8 w-1/3">
              <div className="flex flex-col items-center" title="最後通訊時間">
                <span className="text-xs font-semibold text-gray-700">最後連線</span>
                <span className="text-xs text-gray-500 mt-1">
                  {new Date(device.last_check_time).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                </span>
              </div>
              <div className="flex flex-col items-center" title="電量">
                <Battery className={`w-5 h-5 ${device.battery_level > 20 ? 'text-green-500' : 'text-red-500'}`} />
                <span className="text-xs text-gray-600 font-bold mt-1">{device.battery_level ? `${device.battery_level}%` : '-'}</span>
              </div>
              <div className="flex flex-col items-center" title="當前位置">
                <MapPin className="w-5 h-5 text-blue-500" />
                <span className="text-xs text-blue-600 font-bold mt-1">
                  {device.latitude ? <a href={`https://maps.google.com/?q=${device.latitude},${device.longitude}`} target="_blank" rel="noreferrer" className="hover:underline">Google Map</a> : '無資料'}
                </span>
              </div>
            </div>
            
            <div className="w-1/3 text-right">
              <button 
                onClick={() => openDeviceDetails(device)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-4 py-2 border border-indigo-200 rounded text-sm transition shadow-sm"
              >
                遠端控制與已裝列表
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ===================== 控制中心 Modal ===================== */}
      {selectedDevice && (
        <div className="fixed z-10 inset-0 overflow-y-auto bg-gray-900 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <div>
                <h3 className="text-xl font-bold flex items-center"><Cpu className="mr-2"/> 設備控制中心</h3>
                <p className="text-indigo-200 text-sm">{selectedDevice.device_model} ({selectedDevice.android_id})</p>
              </div>
              <button onClick={() => setSelectedDevice(null)} className="text-white hover:text-gray-200 text-2xl font-bold">&times;</button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50">
              
              {/* 左半部：資訊與控制 */}
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h4 className="font-bold text-gray-800">遠端指令 (MDM 控制)</h4>
                    {!isOnline && <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">設備離線中，指令已停用</span>}
                  </div>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* 1. 裝置重啟 (改為 DC_restart) */}
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_restart')} className={`bg-red-50 text-red-700 hover:bg-red-100 p-3 rounded flex flex-col items-center justify-center border border-red-200 transition ${btnDisabledClass}`}>
                      <RotateCcw className="w-6 h-6 mb-1"/> 遠端重啟設備
                    </button>
                    
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('sync_apps')} className={`bg-blue-50 text-blue-700 hover:bg-blue-100 p-3 rounded flex flex-col items-center justify-center border border-blue-200 transition ${btnDisabledClass}`}>
                      <DownloadCloud className="w-6 h-6 mb-1"/> 強制拉取更新
                    </button>
                    
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('fetch_logs')} className={`bg-gray-50 text-gray-700 hover:bg-gray-100 p-3 rounded flex flex-col items-center justify-center border border-gray-200 transition ${btnDisabledClass}`}>
                      <SettingsIcon className="w-6 h-6 mb-1"/> 提取設備 Log
                    </button>

                    {/* 尋找裝置聲音按鈕 */}
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_play_sound')} className={`bg-yellow-50 text-yellow-700 hover:bg-yellow-100 p-3 rounded flex flex-col items-center justify-center border border-yellow-200 transition ${btnDisabledClass}`}>
                      <Volume2 className="w-6 h-6 mb-1"/> 播放尋找聲音
                    </button>
                    
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_stop_sound')} className={`bg-green-50 text-green-700 hover:bg-green-100 p-3 rounded flex flex-col items-center justify-center border border-green-200 transition col-span-2 lg:col-span-1 ${btnDisabledClass}`}>
                      <VolumeX className="w-6 h-6 mb-1"/> 停止聲音
                    </button>
                  </div>

                  {/* ====== 新增：遠端安裝 App 區塊 ====== */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h5 className="text-sm font-bold text-gray-700 mb-2">推送並安裝應用程式</h5>
                    <div className="flex gap-2">
                      <select 
                        disabled={!isOnline}
                        value={selectedInstallApp} 
                        onChange={(e) => setSelectedInstallApp(e.target.value)}
                        className={`flex-1 border border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 ${!isOnline && 'bg-gray-100 opacity-50 cursor-not-allowed'}`}
                      >
                        {storeApps.map(app => (
                          <option key={app.app_id} value={app.app_id}>{app.name} ({app.app_id})</option>
                        ))}
                      </select>
                      <button 
                        disabled={!isOnline}
                        onClick={() => handleRemoteCommand('AC_app_install', { target_app: selectedInstallApp, branch_name: "stable" })} 
                        className={`bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 transition ${btnDisabledClass}`}
                      >
                        派發安裝
                      </button>
                    </div>
                  </div>

                </div>

                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                  <h4 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center"><History className="w-5 h-5 mr-2 text-indigo-500"/> 歷史座標軌跡</h4>
                  {loadingDetails ? <p className="text-gray-500 text-sm">讀取中...</p> : (
                    <div className="max-h-60 overflow-y-auto">
                      {locationHistory.length > 0 ? locationHistory.map((loc, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                          <div>
                            <span className="text-gray-800 font-medium">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                            <span className="text-gray-400 ml-2 text-xs">({loc.battery}%)</span>
                          </div>
                          <span className="text-gray-500">{new Date(loc.time).toLocaleTimeString()}</span>
                        </div>
                      )) : <p className="text-gray-400 text-sm">尚無歷史軌跡紀錄</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* 右半部：已安裝軟體 */}
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-4 border-b pb-2">已安裝的企業應用程式</h4>
                {loadingDetails ? <p className="text-gray-500 text-sm">同步中...</p> : (
                  <div className="space-y-3">
                    {installedApps.length > 0 ? installedApps.map(app => (
                      <div key={app.app_id} className="flex justify-between items-center p-3 bg-gray-50 rounded border">
                        <div>
                          <div className="font-bold text-gray-800">{app.name}</div>
                          <div className="text-xs text-gray-500">{app.app_id}</div>
                        </div>
                        <div className="text-right">
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-mono border border-green-200">
                            v{app.version_code}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
                        此設備尚未安裝任何被控端 App
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DeviceMonitoringV2;