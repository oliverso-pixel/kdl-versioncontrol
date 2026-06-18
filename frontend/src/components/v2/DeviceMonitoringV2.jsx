import React, { useState, useEffect, useRef } from 'react';
import { Search, Smartphone, Battery, MapPin, Key, Cpu, RotateCcw, DownloadCloud, Settings as SettingsIcon, History, Volume2, VolumeX, Edit, ShieldOff, Shield, Trash2 } from 'lucide-react';
import api from '../../services/api';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import L from "leaflet";
import LocationMap from "./LocationMap";

const DeviceMonitoringV2 = () => {
  const [allDevices, setAllDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 篩選條件狀態 (預設: 線上 / 啟用中)
  const [filterOnline, setFilterOnline] = useState('online'); // 'all', 'online', 'offline'
  const [filterActive, setFilterActive] = useState('active'); // 'all', 'active', 'inactive'
  
  const [storeApps, setStoreApps] = useState([]);
  const [selectedInstallApp, setSelectedInstallApp] = useState("");

  // Modal 狀態
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [installedApps, setInstalledApps] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [startDate, setStartDate] = useState(new Date());

  
  // 修改設備 Modal 狀態
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ id: null, device_model: '', notes: '' });

  useEffect(() => {
    fetchDevices();
    fetchStoreApps();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      const data = await api.getAllDevicesV2();
      setAllDevices(data);
    } catch (err) {
      console.error("載入設備失敗", err);
    }
  };

  const fetchStoreApps = async () => {
    try {
      const res = await api.getStoreApps();
      const filteredApps = res.data.filter(app => app.app_id !== 'com.kowloondairy.mdmapp');
      setStoreApps(filteredApps);
      if(filteredApps.length > 0) setSelectedInstallApp(filteredApps[0].app_id);
    } catch (err) {}
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
    } catch (err) {} finally {
      setLoadingDetails(false);
    }
  };

  const handleRemoteCommand = async (action, extraData = {}) => {
    if (!window.confirm(`確定要對設備執行 [${action}] 指令嗎？`)) return;
    try {
      const payload = { action, task_id: `task_${Date.now()}`, ...extraData };
      if (action.startsWith('DC_')) payload.target_app = "com.kowloondairy.mdmapp";
      await api.sendDeviceCommandV2(selectedDevice.android_id, payload);
      alert('✅ 指令已送出');
    } catch (err) {
      alert('❌ 發送失敗，設備可能處於離線狀態');
    }
  };

  // --- CRUD 操作邏輯 ---
  const handleToggleActive = async (device) => {
    if(!window.confirm(`確定要${device.is_active ? '停用' : '啟用'}設備 ${device.android_id} 嗎？`)) return;
    try {
      await api.updateDevice(device.id, { is_active: !device.is_active });
      fetchDevices();
    } catch(e) { alert('操作失敗'); }
  };

  const handleDeleteDevice = async (device) => {
    if(!window.confirm(`確定要刪除設備 ${device.android_id} 嗎？此操作將清除其所有資料且不可逆！`)) return;
    try {
      await api.deleteDevice(device.id);
      fetchDevices();
    } catch(e) { alert('刪除失敗'); }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.updateDevice(editFormData.id, { device_model: editFormData.device_model, notes: editFormData.notes });
      setShowEditModal(false);
      fetchDevices();
      alert('✅ 設備資訊已更新');
    } catch(e) { alert('更新失敗'); }
  };

  // --- 綜合篩選邏輯 ---
  const filteredDevices = allDevices.filter(device => {
    const matchText = device.android_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (device.device_model && device.device_model.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchOnline = filterOnline === 'all' ? true : 
                        filterOnline === 'online' ? device.is_online : !device.is_online;
    
    const matchActive = filterActive === 'all' ? true : 
                        filterActive === 'active' ? device.is_active : !device.is_active;

    return matchText && matchOnline && matchActive;
  });

  const isOnline = selectedDevice?.is_online || false;
  const btnDisabledClass = !isOnline ? "opacity-50 cursor-not-allowed filter grayscale" : "hover:-translate-y-0.5 shadow-sm";

  const filteredHistory = locationHistory.filter((loc) => {
    const locDate = new Date(loc.time).toDateString();
    return !selectedDate || locDate === selectedDate.toDateString();
  })
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  const datePickerRef = useRef(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">設備監控 (MDM 控制中心)</h1>
        <span className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-semibold">
          總計: {allDevices.length} | 線上: {allDevices.filter(d => d.is_online).length}
        </span>
      </div>
      
      {/* 篩選與搜尋工具列 */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6 flex flex-wrap gap-4 items-center border border-gray-200">
        <div className="flex-1 relative min-w-[250px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="搜尋 Android ID, 設備型號..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">連線狀態:</label>
          <select value={filterOnline} onChange={e => setFilterOnline(e.target.value)} className="border border-gray-300 rounded p-1.5 text-sm">
            <option value="all">全部顯示</option>
            <option value="online">🟢 僅顯示線上</option>
            <option value="offline">⚪ 僅顯示離線</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 font-medium">啟用狀態:</label>
          <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="border border-gray-300 rounded p-1.5 text-sm">
            <option value="all">全部顯示</option>
            <option value="active">✅ 僅顯示啟用中</option>
            <option value="inactive">🚫 僅顯示已停用</option>
          </select>
        </div>
      </div>

      {/* 設備列表 */}
      <div className="grid grid-cols-1 gap-4">
        {filteredDevices.map(device => (
          <div key={device.id} className={`bg-white p-4 rounded-lg shadow flex items-center justify-between border-l-4 transition ${device.is_active ? 'border-indigo-500' : 'border-red-500 opacity-75'}`}>
            
            <div className="flex items-center space-x-4 w-1/4">
              <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500 shadow-md' : 'bg-gray-300'}`} title={device.is_online ? '上線中' : '離線'}></div>
              <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center">
                  {device.device_model || '未知設備'}
                  {!device.is_active && <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded border border-red-200">已停用</span>}
                </h3>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                  <Smartphone className="w-3 h-3 mr-1"/> {device.android_id}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center space-x-8 w-1/3">
              <div className="flex flex-col items-center" title="最後通訊時間">
                <span className="text-xs font-semibold text-gray-700">最後連線</span>
                <span className="text-xs text-gray-500 mt-1">
                  {device.last_check_time ? new Date(device.last_check_time).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : '從未連線'}
                </span>
              </div>
              <div className="flex flex-col items-center" title="電量">
                <Battery className={`w-5 h-5 ${device.battery_level > 20 ? 'text-green-500' : 'text-red-500'}`} />
                <span className="text-xs text-gray-600 font-bold mt-1">{device.battery_level ? `${device.battery_level}%` : '-'}</span>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 w-1/3">
              <button onClick={() => { setEditFormData({ id: device.id, device_model: device.device_model || '', notes: device.notes || '' }); setShowEditModal(true); }} className="p-2 text-gray-500 hover:text-indigo-600 bg-gray-50 rounded transition" title="修改資訊">
                <Edit className="w-4 h-4"/>
              </button>
              <button onClick={() => handleToggleActive(device)} className={`p-2 rounded transition ${device.is_active ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50 bg-gray-50'}`} title={device.is_active ? "停用設備" : "啟用設備"}>
                {device.is_active ? <ShieldOff className="w-4 h-4"/> : <Shield className="w-4 h-4"/>}
              </button>
              <button onClick={() => handleDeleteDevice(device)} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 bg-gray-50 rounded transition" title="刪除設備">
                <Trash2 className="w-4 h-4"/>
              </button>
              <button onClick={() => openDeviceDetails(device)} className="ml-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-4 py-2 border border-indigo-200 rounded text-sm transition shadow-sm">
                遠端控制
              </button>
            </div>
          </div>
        ))}
        {filteredDevices.length === 0 && <div className="text-center text-gray-500 py-10 bg-white rounded shadow border border-gray-100">找不到符合條件的設備</div>}
      </div>

      {/* ===================== 修改設備資訊 Modal ===================== */}
      {showEditModal && (
        <div className="fixed z-20 inset-0 overflow-y-auto bg-gray-900 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6">
            <h3 className="text-xl font-bold mb-4">修改設備資訊</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">設備顯示名稱 (型號)</label>
                <input required type="text" className="mt-1 block w-full border border-gray-300 rounded p-2" value={editFormData.device_model} onChange={e => setEditFormData({...editFormData, device_model: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">管理員備註</label>
                <textarea className="mt-1 block w-full border border-gray-300 rounded p-2" rows="3" value={editFormData.notes} onChange={e => setEditFormData({...editFormData, notes: e.target.value})} placeholder="例如: 派發給哪位員工使用..."></textarea>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">儲存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== 控制中心 Modal (保留原有的完整控制面板) ===================== */}
      {selectedDevice && (
        <div className="fixed z-10 inset-0 overflow-y-auto bg-gray-900 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <div>
                <h3 className="text-xl font-bold flex items-center"><Cpu className="mr-2"/> 設備控制中心</h3>
                <p className="text-indigo-200 text-sm">{selectedDevice.device_model} ({selectedDevice.android_id})</p>
              </div>
              <button onClick={() => setSelectedDevice(null)} className="text-white hover:text-gray-200 text-2xl font-bold">×</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50">
              <div className="space-y-6">
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h4 className="font-bold text-gray-800">遠端指令 (MDM 控制)</h4>
                    {!isOnline && <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">設備離線中，指令已停用</span>}
                  </div>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_restart')} className={`bg-red-50 text-red-700 hover:bg-red-100 p-3 rounded flex flex-col items-center justify-center border border-red-200 transition ${btnDisabledClass}`}>
                      <RotateCcw className="w-6 h-6 mb-1"/> 遠端重啟設備
                    </button>
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('sync_apps')} className={`bg-blue-50 text-blue-700 hover:bg-blue-100 p-3 rounded flex flex-col items-center justify-center border border-blue-200 transition ${btnDisabledClass}`}>
                      <DownloadCloud className="w-6 h-6 mb-1"/> 強制拉取更新
                    </button>
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('fetch_logs')} className={`bg-gray-50 text-gray-700 hover:bg-gray-100 p-3 rounded flex flex-col items-center justify-center border border-gray-200 transition ${btnDisabledClass}`}>
                      <SettingsIcon className="w-6 h-6 mb-1"/> 提取設備 Log
                    </button>
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_play_sound')} className={`bg-yellow-50 text-yellow-700 hover:bg-yellow-100 p-3 rounded flex flex-col items-center justify-center border border-yellow-200 transition ${btnDisabledClass}`}>
                      <Volume2 className="w-6 h-6 mb-1"/> 播放尋找聲音
                    </button>
                    <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_stop_sound')} className={`bg-green-50 text-green-700 hover:bg-green-100 p-3 rounded flex flex-col items-center justify-center border border-green-200 transition col-span-2 lg:col-span-1 ${btnDisabledClass}`}>
                      <VolumeX className="w-6 h-6 mb-1"/> 停止聲音
                    </button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h5 className="text-sm font-bold text-gray-700 mb-2">推送並安裝應用程式</h5>
                    <div className="flex gap-2">
                      <select disabled={!isOnline} value={selectedInstallApp} onChange={(e) => setSelectedInstallApp(e.target.value)} className={`flex-1 border border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 ${!isOnline && 'bg-gray-100 opacity-50 cursor-not-allowed'}`}>
                        {storeApps.map(app => (
                          <option key={app.app_id} value={app.app_id}>{app.name} ({app.app_id})</option>
                        ))}
                      </select>
                      <button disabled={!isOnline} onClick={() => handleRemoteCommand('AC_app_install', { target_app: selectedInstallApp, branch_name: "stable" })} className={`bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 transition ${btnDisabledClass}`}>
                        派發安裝
                      </button>
                    </div>
                  </div>
                </div>

                {/* <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
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
                </div> */}
                <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                  <h4 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center">
                    <History className="w-5 h-5 mr-2 text-indigo-500" /> 歷史座標軌跡
                  </h4>

                  <div className="mb-4">
                    <DatePicker
                      ref={datePickerRef} // 3. 綁定 ref
                      selected={selectedDate}
                      onChange={(date) => {
                        if (!date) return;
                        setSelectedDate(date);
                      }}
                      onSelect={(date) => {
                        // 點擊日曆格子的邏輯保持不變
                        const hasData = Array.isArray(locationHistory) && locationHistory.some(
                          (loc) => new Date(loc.time).toDateString() === date.toDateString()
                        );
                        if (!hasData) {
                          alert("該日期尚無歷史軌跡紀錄！");
                        } else {
                          setShowPopup(true);
                        }
                      }}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="查詢日期"

                      // 4. 移除原來的 readonly，允許手動輸入
                      // className="w-full text-center" 

                      shouldCloseOnSelect={true}

                      // 5. 核心修改：按下 Enter 時，檢查資料、觸發失焦並強制關閉日曆
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const inputValue = e.target.value;
                          const parsedDate = new Date(inputValue);

                          // 檢查手動輸入的字串是否為有效日期
                          if (!isNaN(parsedDate.getTime())) {
                            // 執行您原有的歷史資料檢查邏bles
                            const hasData = Array.isArray(locationHistory) && locationHistory.some(
                              (loc) => new Date(loc.time).toDateString() === parsedDate.toDateString()
                            );

                            if (!hasData) {
                              alert("該日期尚無歷史軌跡紀錄！");
                            } else {
                              setShowPopup(true);
                            }

                            // 同步更新狀態
                            setSelectedDate(parsedDate);
                          }

                          // ✨ 強制關閉 DatePicker 面板並讓輸入框失焦
                          if (datePickerRef.current) {
                            datePickerRef.current.setOpen(false); // 關閉面板
                          }
                          e.target.blur(); // 輸入框失焦
                        }
                      }}
                    />
                    
                    {showPopup && (
                      <div className="modal-overlay">
                        <div className="modal-container">
                          <button
                            onClick={() => setShowPopup(false)}
                            className="modal-close-btn"
                          >
                            ✕
                          </button>
                          <LocationMap
                            locationHistory={filteredHistory}
                            selectedDate={selectedDate}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {loadingDetails ? (
                    <p className="text-gray-500 text-sm">讀取中...</p>
                  ) : (
                    <div className="mb-6">
                      <LocationMap locationHistory={filteredHistory} selectedDate={selectedDate} />
                    </div>
                  )}
                </div>

              </div>

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
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-mono border border-green-200">v{app.version_code}</span>
                        </div>
                      </div>
                    )) : <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">此設備尚未安裝任何被控端 App</div>}
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