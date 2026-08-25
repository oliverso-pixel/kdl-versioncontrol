// frontend/src/components/Devices/DeviceMonitoring.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Search, Smartphone, Battery, MapPin, Key, Cpu, RotateCcw, DownloadCloud, Settings as SettingsIcon, History, Volume2, VolumeX, Edit, ShieldOff, Shield, Trash2, Power, Navigation, Clock } from 'lucide-react';
import api from '../../services/api';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import L from "leaflet";
import LocationMap from "./LocationMap";
import RemoteScreen from './RemoteScreen';

// 定位來源 (Android 回報 fused / gps / network / passive)
const LOCATION_SOURCE_LABELS = {
  fused: '融合',
  gps: 'GPS',
  network: '網路',
  passive: '被動',
};


const DeviceMonitoringV2 = () => {
  const [allDevices, setAllDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 篩選條件狀態 (預設: 線上 / 啟用中)
  const [filterOnline, setFilterOnline] = useState('online'); // 'all', 'online', 'offline'
  const [filterActive, setFilterActive] = useState('active'); // 'all', 'active', 'inactive'
  
  const [storeApps, setStoreApps] = useState([]);
  const [selectedInstallApp, setSelectedInstallApp] = useState("");

  const [availableBranches, setAvailableBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [selectedBranchName, setSelectedBranchName] = useState('');
  const [editingConfigAppId, setEditingConfigAppId] = useState(null);
  const [currentConfigText, setCurrentConfigText] = useState('{}');

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

  const [showScreenControl, setShowScreenControl] = useState(false);

  useEffect(() => {
    fetchDevices();
    fetchStoreApps();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedInstallApp) {
      const fetchInstallAppBranches = async () => {
        try {
          const res = await api.getStoreAppDetails(selectedInstallApp);
          setAvailableBranches(res.data.branches || []);
          if (res.data.branches && res.data.branches.length > 0) {
             setSelectedBranchName(res.data.branches[0].branch_name);
          } else {
             setSelectedBranchName('');
          }
        } catch (err) {
          console.error(err);
          setAvailableBranches([]);
        }
      };
      fetchInstallAppBranches();
    } else {
      setAvailableBranches([]);
      setSelectedBranchName('');
    }
  }, [selectedInstallApp]);

  const handleManageConfig = async (appId) => {
    if (editingConfigAppId === appId) {
      setEditingConfigAppId(null);
      return;
    }
    setEditingConfigAppId(appId);
    setCurrentConfigText('載入中...');
    try {
      const res = await api.getDeviceAppConfig(selectedDevice.android_id, appId);
      setCurrentConfigText(JSON.stringify(res.config || {}, null, 2));
    } catch (err) {
      setCurrentConfigText('{}');
    }
  };

  const handleSaveAndPushConfig = async () => {
    let jsonObject;
    try {
      jsonObject = JSON.parse(currentConfigText);
    } catch (e) {
      alert('❌ 輸入格式非正確 JSON 物件，請檢查括號與逗號。');
      return;
    }
    
    try {
      await api.updateDeviceAppConfig(selectedDevice.android_id, editingConfigAppId, jsonObject);
      alert('✅ 設定已成功儲存！若設備在線上，已同步發送即時更新指令。');
      setEditingConfigAppId(null);
    } catch (e) {
      alert('❌ API 儲存失敗：' + (e.message || '伺服器錯誤'));
      console.error('Update config error:', e);
    }
  };

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

  // 🔥 新增：關閉控制中心 Modal 時，一併確保螢幕控制視窗關閉，避免殘留連線
  const closeDeviceDetails = () => {
    setShowScreenControl(false);
    setSelectedDevice(null);
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
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-[1.75rem] border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-slate-900">設備監控 (MDM 控制中心)</h1>
            <p className="text-sm text-slate-500">快速查看設備連線狀態、電量與遠端控制指令。</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              總計：{allDevices.length}
            </span>
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
              線上：{allDevices.filter(d => d.is_online).length}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mt-6">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">線上設備</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{allDevices.filter(d => d.is_online).length}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">離線設備</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{allDevices.filter(d => !d.is_online).length}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">已啟用</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{allDevices.filter(d => d.is_active).length}</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">已停用</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{allDevices.filter(d => !d.is_active).length}</p>
          </div>
        </div>
      </div>

      {/* 篩選與搜尋工具列 */}
      <div className="bg-white p-5 rounded-[1.75rem] shadow-sm mb-6 flex flex-wrap gap-4 items-center border border-slate-200">
        <div className="flex-1 relative min-w-[250px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-2xl bg-slate-50 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            placeholder="搜尋 Android ID, 設備型號..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 font-medium">連線狀態:</label>
          <select value={filterOnline} onChange={e => setFilterOnline(e.target.value)} className="border border-slate-300 rounded-2xl bg-slate-50 p-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
            <option value="all">全部顯示</option>
            <option value="online">🟢 僅顯示線上</option>
            <option value="offline">⚪ 僅顯示離線</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 font-medium">啟用狀態:</label>
          <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="border border-slate-300 rounded-2xl bg-slate-50 p-2 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
            <option value="all">全部顯示</option>
            <option value="active">✅ 僅顯示啟用中</option>
            <option value="inactive">🚫 僅顯示已停用</option>
          </select>
        </div>
      </div>

      {/* 設備列表 */}
      <div className="grid grid-cols-1 gap-4">
        {filteredDevices.map(device => (
          <div
            key={device.id}
            className={`bg-white p-4 rounded-[1.75rem] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 transition duration-200 ease-out ${device.is_active ? 'border-indigo-500 hover:-translate-y-0.5 hover:shadow-lg' : 'border-red-500 opacity-95 hover:-translate-y-0.5 hover:shadow-lg'
              }`}
          >
            <div className="flex items-center gap-3 min-w-0 w-full sm:w-1/2">
              <span className={`inline-flex h-3.5 w-3.5 rounded-full ${device.is_online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.35)]' : 'bg-slate-300'}`} title={device.is_online ? '上線中' : '離線'} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 truncate">
                  <span className="truncate">{device.device_model || '未知設備'}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${device.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                    {device.is_active ? '啟用中' : '已停用'}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${device.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {device.is_online ? '線上' : '離線'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="truncate">ID: {device.android_id}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 min-w-0 text-xs text-slate-500 w-full sm:w-1/3 text-center sm:text-left">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Clock className="w-4 h-4" />
                {device.last_check_time && !isNaN(new Date(device.last_check_time).getTime())
                  ? new Date(device.last_check_time).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '從未連線'}
              </span>
              <span className={`inline-flex items-center gap-1 font-semibold ${device.battery_level > 20 ? 'text-emerald-600' : 'text-red-600'}`}>
                <Battery className={`w-4 h-4 ${device.battery_level > 20 ? 'text-emerald-500' : 'text-red-500'}`} />
                {device.battery_level !== null && device.battery_level !== undefined ? `${device.battery_level}%` : '-'}
              </span>
  <div className="inline-flex items-center gap-1 text-gray-600 font-bold" title="定位來源">
    <Navigation className="w-4 h-4 text-purple-500" />
    <span>{LOCATION_SOURCE_LABELS[device.location_source] || device.location_source || '融合'}</span>
  </div>
  <div className="inline-flex items-center gap-1 text-gray-600" title="裝置開機時間">
    <Power className="w-4 h-4 text-blue-500" />
    <span>
      {device.boot_time
        ? new Date(device.boot_time).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '2026/02/01 12:00:00'}
    </span>
  </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditFormData({ id: device.id, device_model: device.device_model || '', notes: device.notes || '' }); setShowEditModal(true); }}
                className="p-2 text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-2xl transition border border-slate-200 shadow-sm"
                title="修改資訊"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleToggleActive(device)}
                className={`p-2 rounded-lg transition border ${device.is_active
                  ? 'text-red-500 hover:bg-red-50 border-gray-100'
                  : 'text-green-600 hover:bg-green-50 bg-gray-50 border-gray-100'
                  }`}
                title={device.is_active ? "停用設備" : "啟用設備"}
              >
                {device.is_active ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
              </button>
              <button
                onClick={() => handleDeleteDevice(device)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 bg-gray-50 border border-gray-100 rounded-lg transition"
                title="刪除設備"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => openDeviceDetails(device)}
                className="text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-2 rounded-xl text-sm transition shadow-sm active:scale-95"
              >
                遠端控制
              </button>
            </div>
          </div>
        ))}

        {filteredDevices.length === 0 && (
          <div className="text-center text-slate-500 py-10 bg-white rounded-[1.75rem] shadow-sm border border-slate-200">
            找不到符合條件的設備
          </div>
        )}
      </div>

      {/* ===================== 修改設備資訊 Modal ===================== */}
      {showEditModal && (
        <div className="fixed z-20 inset-0 overflow-y-auto bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[1.75rem] max-w-md w-full shadow-2xl p-6 border border-slate-200">
            <h3 className="text-xl font-bold mb-4">修改設備資訊</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">設備顯示名稱 (型號)</label>
                <input required type="text" className="mt-1 block w-full border border-gray-300 rounded p-2" value={editFormData.device_model} onChange={e => setEditFormData({ ...editFormData, device_model: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">管理員備註</label>
                <textarea className="mt-1 block w-full border border-gray-300 rounded p-2" rows="3" value={editFormData.notes} onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })} placeholder="例如: 派發給哪位員工使用..."></textarea>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-100 transition">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition">儲存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== 控制中心 Modal (保留原有的完整控制面板) ===================== */}
      {selectedDevice && (
        <div className="fixed z-10 inset-0 overflow-y-auto bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-5xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200">
            <div className="bg-indigo-600 px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-white">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2"><Cpu className="w-5 h-5" /> 設備控制中心</h3>
                <p className="text-indigo-200 text-sm">{selectedDevice.device_model} ({selectedDevice.android_id})</p>
              </div>
              <button onClick={closeDeviceDetails} className="text-white hover:text-gray-200 text-2xl font-bold">×</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">設備狀態</p>
                      <p className="mt-3 text-xl font-semibold text-slate-900">{isOnline ? '線上' : '離線'}</p>
                    </div>
                    <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">電量</p>
                      <p className="mt-3 text-xl font-semibold text-slate-900">{selectedDevice.battery_level ?? '-'}%</p>
                    </div>
                    <div className="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">已安裝App總數</p>
                      <p className="mt-3 text-xl font-semibold text-slate-900">{installedApps.length}</p>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h4 className="font-bold text-gray-800">遠端指令 (MDM 控制)</h4>
                      {!isOnline && <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">設備離線中，指令已停用</span>}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_restart')} className={`bg-red-50 text-red-700 hover:bg-red-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center border border-red-200 shadow-sm transition ${btnDisabledClass}`}>
                        <RotateCcw className="w-6 h-6 mb-2" /> <span className="text-sm font-semibold">重啟</span>
                      </button>
                      <button disabled={!isOnline} onClick={() => handleRemoteCommand('sync_apps')} className={`bg-blue-50 text-blue-700 hover:bg-blue-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center border border-blue-200 shadow-sm transition ${btnDisabledClass}`}>
                        <DownloadCloud className="w-6 h-6 mb-2" /> <span className="text-sm font-semibold">拉取更新</span>
                      </button>
                      <button disabled={!isOnline} onClick={() => handleRemoteCommand('fetch_logs')} className={`bg-slate-50 text-slate-700 hover:bg-slate-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center border border-slate-200 shadow-sm transition ${btnDisabledClass}`}>
                        <SettingsIcon className="w-6 h-6 mb-2" /> <span className="text-sm font-semibold">提取 Log</span>
                      </button>
                      <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_play_sound')} className={`bg-yellow-50 text-yellow-700 hover:bg-yellow-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center border border-yellow-200 shadow-sm transition ${btnDisabledClass}`}>
                        <Volume2 className="w-6 h-6 mb-2" /> <span className="text-sm font-semibold">播放聲音</span>
                      </button>
                      <button disabled={!isOnline} onClick={() => handleRemoteCommand('DC_stop_sound')} className={`bg-emerald-50 text-emerald-700 hover:bg-emerald-100 p-4 rounded-[1.5rem] flex flex-col items-center justify-center border border-emerald-200 shadow-sm transition col-span-2 lg:col-span-1 ${btnDisabledClass}`}>
                        <VolumeX className="w-6 h-6 mb-2" /> <span className="text-sm font-semibold">停止聲音</span>
                      </button>
                    <button 
                      disabled={!isOnline} 
                      onClick={() => handleRemoteCommand('DC_emergency_release', { secret: "5HVQIGH2zJHr6FTFnBoUEzzZi52ZU2dM" })} 
                      className={`bg-orange-50 text-orange-700 hover:bg-orange-100 p-3 rounded flex flex-col items-center justify-center border border-orange-200 transition ${btnDisabledClass}`}
                    >
                      <span className="text-xl mb-1">🚨</span>
                      <span className="text-xs font-medium">緊急解除鎖定</span>
                    </button>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h5 className="text-sm font-bold text-gray-700 mb-2">推送並安裝應用程式</h5>
                    <div className="flex flex-col gap-2">
                      <select disabled={!isOnline} value={selectedInstallApp} onChange={(e) => setSelectedInstallApp(e.target.value)} className={`border border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 ${!isOnline && 'bg-gray-100 opacity-50 cursor-not-allowed'}`}>
                        {storeApps.map(app => (
                          <option key={app.app_id} value={app.app_id}>{app.name} ({app.app_id})</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <select disabled={!isOnline || availableBranches.length === 0} value={selectedBranchName} onChange={(e) => setSelectedBranchName(e.target.value)} className={`flex-1 border border-gray-300 rounded p-2 text-sm focus:ring-indigo-500 ${(!isOnline || availableBranches.length === 0) && 'bg-gray-100 opacity-50 cursor-not-allowed'}`}>
                          <option value="">請選擇分支...</option>
                          {availableBranches.map(b => (
                            <option key={b.branch_name} value={b.branch_name}>{b.branch_name}</option>
                          ))}
                        </select>
                        <button disabled={!isOnline || !selectedBranchName} onClick={() => handleRemoteCommand('AC_app_install', { target_app: selectedInstallApp, branch_name: selectedBranchName })} className={`bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700 transition ${btnDisabledClass} disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap`}>
                          派發安裝
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </div>

                              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center">
                  <History className="w-5 h-5 mr-2 text-indigo-500" /> 歷史座標軌跡
                </h4>

                <div className="mb-4">
                  <DatePicker
                    ref={datePickerRef}
                    selected={selectedDate}
                    onChange={(date) => {
                      if (!date) return;
                      setSelectedDate(date);
                    }}
                    onSelect={(date) => {
                      const hasData = Array.isArray(locationHistory) && locationHistory.some(
                        (loc) => new Date(loc.time).toDateString() === date.toDateString()
                      );
                      if (!hasData) {
                        alert("該日期尚無歷史軌跡紀錄！");
                      }
                    }}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="查詢日期"
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    shouldCloseOnSelect={true}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const inputValue = e.target.value;
                        const parsedDate = new Date(inputValue);

                        if (!isNaN(parsedDate.getTime())) {
                          const hasData = Array.isArray(locationHistory) && locationHistory.some(
                            (loc) => new Date(loc.time).toDateString() === parsedDate.toDateString()
                          );

                          if (!hasData) {
                            alert("該日期尚無歷史軌跡紀錄！");
                          }

                          setSelectedDate(parsedDate);
                        }

                        if (datePickerRef.current) {
                          datePickerRef.current.setOpen(false);
                        }
                        e.target.blur();
                      }
                    }}
                  />
                  {!selectedDate ? (
                    <p className="mt-2 text-xs text-slate-500">輸入日期後可檢視該日的歷史軌跡。</p>
                  ) : (
                    null
                  )}
                </div>
                {selectedDate ? (
                  <div className="mb-6 map-container-styled h-[600px] overflow-hidden">
                    {filteredHistory.length > 0 ? (
                      <LocationMap locationHistory={filteredHistory} selectedDate={selectedDate} />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-500">
                        <p className="text-sm font-medium">該日期尚無 GPS 軌跡</p>
                        <p className="mt-2 text-xs">請選擇其他有資料的日期。</p>
                      </div>
                    )}
                  </div>
                ) : (
                  null
                )}


                  {loadingDetails ? (
                    <p className="text-gray-500 text-sm">讀取中...</p>
                  ) : (
                    <div className="mb-6">
                      <LocationMap locationHistory={filteredHistory} selectedDate={selectedDate} />
                    </div>
                  )}
                </div>

              </div>

              {/* ===== 螢幕遠端控制區塊 ===== */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-5 rounded-lg shadow-sm border-2 border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    螢幕遠端控制
                  </h4>
                  {!isOnline && (
                    <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">
                      設備離線中
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-gray-600 mb-4">
                  即時查看並控制設備螢幕，支援觸控、按鍵輸入、文字輸入等操作
                </p>
                
                <button 
                  disabled={!isOnline}
                  onClick={() => setShowScreenControl(true)}
                  className={`w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 rounded-lg font-semibold flex items-center justify-center transition-all ${
                    isOnline 
                      ? 'hover:from-purple-700 hover:to-indigo-700 hover:shadow-lg' 
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {isOnline ? '啟動螢幕控制' : '設備離線中'}
                </button>
              </div>

              <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h4 className="font-bold text-gray-800 mb-4 border-b pb-2">已安裝的企業應用程式</h4>
                {loadingDetails ? <p className="text-gray-500 text-sm">同步中...</p> : (
                  <div className="space-y-3">
                    {installedApps.length > 0 ? installedApps.map(app => (
                      <div key={app.app_id} className="flex flex-col p-3 bg-gray-50 rounded border">
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div>
                            <div className="font-bold text-gray-800">{app.name}</div>
                            <div className="text-xs text-gray-500">{app.app_id}</div>
                          </div>
                          <div className="self-start sm:self-auto">
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-mono border border-green-200">
                              v{app.current_version_code || app.version_code}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => handleManageConfig(app.app_id)}
                            className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded font-medium transition flex items-center"
                          >
                            ⚙️ Config
                          </button>

                          {app.app_id !== 'com.kowloondairy.mdmapp' && (
                            <button
                              onClick={() => handleRemoteCommand('AC_app_uninstall', { target_app: app.app_id })}
                              className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded font-medium transition flex items-center"
                              title="遠端卸載此 App"
                            >
                              🗑️ 卸載
                            </button>
                          )}
                        </div>

                        {/* Config JSON 編輯區塊 */}
                        {editingConfigAppId === app.app_id && (
                          <div className="mt-3 border-t pt-3 border-gray-200">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2">
                              <span className="text-xs font-semibold text-gray-600">編輯 Config (JSON格式):</span>
                              <div className="flex gap-2 w-full sm:w-auto">
                                <button 
                                  onClick={() => setEditingConfigAppId(null)} 
                                  className="flex-1 sm:flex-none text-xs px-3 py-1.5 border rounded hover:bg-gray-100"
                                >
                                  取消
                                </button>
                                <button 
                                  onClick={handleSaveAndPushConfig} 
                                  className="flex-1 sm:flex-none text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700"
                                >
                                  儲存並推播
                                </button>
                              </div>
                            </div>
                            <textarea
                              className="w-full h-32 bg-gray-800 text-green-400 font-mono text-xs p-2 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              value={currentConfigText}
                              onChange={(e) => setCurrentConfigText(e.target.value)}
                            />
                          </div>
                        )}
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

      {/* ===================== 螢幕遠端控制子視窗 ===================== */}
      {/* 🔥 修正：移出 installedApps.map() 迴圈，整個頁面只會 mount 一個 RemoteScreen 實例 */}
      {selectedDevice && showScreenControl && (
        <RemoteScreen 
          device={selectedDevice}
          onClose={() => setShowScreenControl(false)}
        />
      )}
    </div>
  );
};

export default DeviceMonitoringV2;
