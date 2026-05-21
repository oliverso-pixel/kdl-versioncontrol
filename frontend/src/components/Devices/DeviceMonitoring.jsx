import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Smartphone, Plus, Edit2, Trash2, Search, 
  RefreshCw, Activity, Info, Power, PowerOff,
  Package, ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react';
import api from '../../services/api';

const DeviceMonitoring = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [expandedDevices, setExpandedDevices] = useState({});
  const [deviceApps, setDeviceApps] = useState({});
  const [filters, setFilters] = useState({
    days: 30,
    is_active: null
  });
  const [newDevice, setNewDevice] = useState({
    android_id: '',
    device_model: '',
    os_version: '',
    app_version: '',
    notes: ''
  });
const filtersRef = useRef(filters);
const searchTermRef = useRef(searchTerm);
const daysRef = useRef(filters.days);

useEffect(() => {
  filtersRef.current = filters;
}, [filters]);

useEffect(() => {
  searchTermRef.current = searchTerm;
}, [searchTerm]);

useEffect(() => {
  daysRef.current = filters.days;
}, [filters.days]);


  const fetchDevices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('days', filtersRef.current.days);
      if (filtersRef.current.is_active !== null) {
        params.append('is_active', filtersRef.current.is_active);
      }
      if (searchTermRef.current.trim()) {
        params.append('search', searchTermRef.current.trim());
      }
console.log("Fetching devices with parameters:", params.toString());
      const data = await api.getDevices(params.toString());
      console.log("Fetched devices:", data);
      setDevices(data);
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatistics = useCallback(async () => {
    try {
      const data = await api.getDeviceStatistics(daysRef.current);
      setStatistics(data);
    } catch (err) {
      console.error('Failed to fetch statistics:', err);
    }
  }, []);

  
const resetAndFetchDevices = useCallback(async () => {
  try {
    // 重置搜尋條件
    setSearchTerm('');
    
    // 重置篩選器為預設值
    setFilters({
      days: 30,
      is_active: null
    });
    
    // 注意：useRef 的更新不會立即生效，需要用新的值直接呼叫 API
    const params = new URLSearchParams();
    params.append('days', 30);  // 預設值
    
    console.log("重置並獲取設備，參數:", params.toString());
    
    const data = await api.getDevices(params.toString());
    console.log("重置後獲取的設備:", data);
    setDevices(data);
    
    // 也重置統計數據
    await fetchStatistics();
    
  } catch (err) {
    console.error('Failed to reset and fetch devices:', err);
  }
}, [fetchStatistics]); // 依賴 fetchStatistics


  const fetchDeviceApps = async (deviceId) => {
    try {
      const response = await api.getDeviceDetails(deviceId);
      
      if (response && response.installed_apps) {
        setDeviceApps(prev => ({
          ...prev,
          [deviceId]: response.installed_apps
        }));
      } else {
        setDeviceApps(prev => ({
          ...prev,
          [deviceId]: []
        }));
      }
    } catch (err) {
      console.error('Failed to fetch device apps:', err);
      setDeviceApps(prev => ({
        ...prev,
        [deviceId]: []
      }));
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchStatistics();
  }, []);

  const formatDateTime = (dateString) => {
    if (!dateString) return '無記錄';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '無效日期';
      }
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return '日期格式錯誤';
    }
  };

  const toggleDeviceExpand = async (deviceId) => {
    const isExpanded = !expandedDevices[deviceId];
    setExpandedDevices(prev => ({
      ...prev,
      [deviceId]: isExpanded
    }));

    if (isExpanded && !deviceApps[deviceId]) {
      await fetchDeviceApps(deviceId);
    }
  };

  const handleCreateDevice = async (e) => {
    e.preventDefault();
    try {
      await api.createDevice(newDevice);
      setShowCreateModal(false);
      setNewDevice({
        android_id: '',
        device_model: '',
        os_version: '',
        app_version: '',
        notes: ''
      });
      fetchDevices();
    } catch (err) {
      console.error('Failed to create device:', err);
      alert('建立設備失敗');
    }
  };

  const handleToggleDevice = async (device) => {
    try {
      if (device.is_active) {
        await api.deleteDevice(device.id, false);
      } else {
        await api.activateDevice(device.id);
      }
      fetchDevices();
    } catch (err) {
      console.error('Failed to toggle device:', err);
    }
  };

  const handleViewDetails = async (device) => {
    try {
      const response = await api.getDeviceDetails(device.id);
      console.log('API response:', response);
      
      let deviceDetails = response;
      
      // 獲取設備的應用程式資訊
      if (response && response.device) {
        deviceDetails = {
          ...response.device,
          recent_logs: response.update_logs || []
        };
      }
      
      // 額外獲取設備的所有應用程式
      try {
        const appsResponse = await api.get(`/api/admin/devices/${device.id}/apps`);
        deviceDetails.installed_apps = appsResponse.data || [];
      } catch (err) {
        console.error('Failed to fetch device apps:', err);
        deviceDetails.installed_apps = [];
      }
      
      setSelectedDevice(deviceDetails);
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Failed to fetch device details:', err);
      setSelectedDevice({
        ...device,
        recent_logs: [],
        installed_apps: []
      });
      setShowDetailsModal(true);
    }
  };

  const handleDeleteDevice = async (device, permanent = false) => {
    const message = permanent 
      ? `確定要永久刪除設備 ${device.device_model} (${device.android_id}) 嗎？\n此操作將刪除所有相關的更新日誌！`
      : `確定要停用設備 ${device.device_model} (${device.android_id}) 嗎？`;
      
    if (!window.confirm(message)) return;

    try {
      await api.deleteDevice(device.id, permanent);
      alert(permanent ? '設備已永久刪除！' : '設備已停用！');
      fetchDevices();
    } catch (err) {
      console.error('Failed to delete device:', err);
      alert('刪除失敗！');
    }
  };

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">設備監控</h1>
        <div className="flex space-x-2">
          {/* <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            新增設備
          </button> */}
          <button
            // onClick={fetchDevices}
            onClick={resetAndFetchDevices}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            重新整理
          </button>
        </div>
      </div>

      {/* 統計卡片 */}
      {statistics && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Smartphone className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      總設備數
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {statistics.total_devices}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Activity className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      活躍設備
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {statistics.active_devices}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Plus className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      新增設備
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {statistics.new_devices}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <PowerOff className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      非活躍設備
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {statistics.total_devices - statistics.active_devices}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 篩選器 */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">搜尋關鍵字</label>
            <div className="mt-1 relative">
              <input
                type="text"
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Android ID / 型號 / OS"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          
          
          <div>
            <label className="block text-sm font-medium text-gray-700">活動期間</label>
            <select
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={filters.days}
              onChange={(e) => setFilters({ ...filters, days: parseInt(e.target.value) })}
            >
              <option value={7}>最近 7 天</option>
              <option value={30}>最近 30 天</option>
              <option value={90}>最近 90 天</option>
              <option value={365}>最近 1 年</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">狀態</label>
            <select
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={filters.is_active === null ? '' : filters.is_active}
              onChange={(e) => setFilters({ 
                ...filters, 
                is_active: e.target.value === '' ? null : e.target.value === 'true' 
              })}
            >
              <option value="">全部</option>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => {
                setLoading(true);
                fetchStatistics();
                fetchDevices();
              }}
              className="w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              套用篩選
            </button>
          </div>
        </div>
      </div>

      {/* 設備列表 */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                設備資訊
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                系統版本
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                安裝應用
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                最後活動
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                狀態
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {devices.map((device) => (
              <React.Fragment key={device.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleDeviceExpand(device.id)}
                        className="mr-2 text-gray-500 hover:text-gray-700"
                      >
                        {expandedDevices[device.id] ? 
                          <ChevronDown className="h-4 w-4" /> : 
                          <ChevronRight className="h-4 w-4" />
                        }
                      </button>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {device.device_model}
                        </div>
                        <div className="text-sm text-gray-500">
                          {device.android_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{device.os_version}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Package className="h-4 w-4 mr-1 text-gray-400" />
                      {device.app_count || 1} 個應用
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(device.last_check_time)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {device.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Power className="h-3 w-3 mr-1" />
                        啟用
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <PowerOff className="h-3 w-3 mr-1" />
                        停用
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleViewDetails(device)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleDevice(device)}
                      className="text-gray-600 hover:text-gray-900 mr-3"
                    >
                      {device.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={(e) => handleDeleteDevice(device, e.shiftKey)}
                      className="text-red-600 hover:text-red-900"
                      title="按住 Shift 永久刪除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                
                {/* 展開的應用程式列表 */}
                {expandedDevices[device.id] && (
                  <tr>
                    <td colSpan="6" className="px-6 py-4 bg-gray-50">
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          已安裝的應用程式
                        </h4>
                        {deviceApps[device.id] && deviceApps[device.id].length > 0 ? (
                          <div className="grid grid-cols-1 gap-2">
                            {deviceApps[device.id].map((app) => (
                              <div key={app.app_id} className="bg-white p-3 rounded-lg border border-gray-200">
                                <div className="grid grid-cols-6 gap-4 items-center">
                                  <div className="col-span-2">
                                    <p className="text-sm font-medium text-gray-900">{app.app_name}</p>
                                    <p className="text-xs text-gray-500">{app.app_id}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">當前版本</p>
                                    <p className="text-sm text-gray-900">{app.current_version || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">最新版本</p>
                                    <p className="text-sm text-gray-900">{app.latest_version || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">最後檢查</p>
                                    <p className="text-sm text-gray-900">
                                      {formatDateTime(app.last_check_time)}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    {app.needs_update ? (
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                        需要更新
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                                        已是最新
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                            <p className="text-sm">載入中或暫無應用程式資訊</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 設備詳情 Modal - 增強版 */}
      {showDetailsModal && selectedDevice && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  設備詳情
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Android ID</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">
                      {selectedDevice.android_id || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">設備型號</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {selectedDevice.device_model || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">作業系統版本</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {selectedDevice.os_version || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">最後活動時間</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {formatDateTime(selectedDevice.last_check_time)}
                    </dd>
                  </div>
                </div>
                
                {selectedDevice.notes && (
                  <div className="mb-6">
                    <dt className="text-sm font-medium text-gray-500">備註</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedDevice.notes}</dd>
                  </div>
                )}

                {/* 已安裝應用程式列表 */}
                {selectedDevice.installed_apps && selectedDevice.installed_apps.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">已安裝應用程式</h4>
                    <div className="space-y-2">
                      {selectedDevice.installed_apps.map((app) => (
                        <div key={app.app_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{app.app_name}</p>
                            <p className="text-xs text-gray-500">{app.app_id}</p>
                          </div>
                          <div className="text-center px-4">
                            <p className="text-xs text-gray-500">當前版本</p>
                            <p className="text-sm text-gray-900">{app.current_version || 'N/A'}</p>
                          </div>
                          <div className="text-center px-4">
                            <p className="text-xs text-gray-500">最新版本</p>
                            <p className="text-sm text-gray-900">{app.latest_version || 'N/A'}</p>
                          </div>
                          <div className="text-right">
                            {app.needs_update ? (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                需要更新
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                                已是最新
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 最近更新記錄 */}
                {selectedDevice.recent_logs && selectedDevice.recent_logs.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">最近更新記錄</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">時間</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">應用程式</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">類型</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">版本</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedDevice.recent_logs.map((log, index) => (
                            <tr key={log.id || index}>
                              <td className="px-4 py-2 text-xs text-gray-900">
                                {formatDateTime(log.created_at)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                App #{log.application_id}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {log.update_type || '-'}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {log.from_version && log.to_version 
                                  ? `${log.from_version} → ${log.to_version}`
                                  : log.to_version || '-'}
                              </td>
                              <td className="px-4 py-2 text-xs">
                                <span className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full ${
                                  log.status === 'success' 
                                    ? 'bg-green-100 text-green-800' 
                                    : log.status === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {log.status || '-'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setShowDetailsModal(false)}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 設備詳情 Modal */}
      {showDetailsModal && selectedDevice && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  設備詳情
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Android ID</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">
                      {selectedDevice.android_id || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">設備型號</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {selectedDevice.device_model || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">作業系統版本</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {selectedDevice.os_version || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">應用程式版本</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {selectedDevice.app_version || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">總檢查次數</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {selectedDevice.total_checks || 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">最後活動時間</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {/* {selectedDevice.last_check_time 
                        ? new Date(selectedDevice.last_check_time).toLocaleString('zh-TW')
                        : '無記錄'} */}
                      {formatDateTime(selectedDevice.last_check_time)}
                    </dd>
                  </div>
                </div>
                
                {selectedDevice.notes && (
                  <div className="mb-6">
                    <dt className="text-sm font-medium text-gray-500">備註</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedDevice.notes}</dd>
                  </div>
                )}
                
                {selectedDevice.recent_logs && selectedDevice.recent_logs.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">最近更新記錄</h4>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">時間</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">類型</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">版本</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedDevice.recent_logs.map((log, index) => (
                            <tr key={log.id || index}>
                              <td className="px-4 py-2 text-xs text-gray-900">
                                {formatDateTime(log.check_time || log.created_at)}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {log.action || 'check'}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {log.current_version && log.latest_version 
                                  ? `${log.current_version} → ${log.latest_version}`
                                  : log.current_version || '-'}
                              </td>
                              <td className="px-4 py-2 text-xs">
                                <span className={`inline-flex px-2 text-xs font-semibold leading-5 rounded-full ${
                                  log.needs_update === false
                                    ? 'bg-green-100 text-green-800' 
                                    : log.needs_update === true
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {log.needs_update === false ? '已是最新' : log.needs_update === true ? '需要更新' : '檢查中'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setShowDetailsModal(false)}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceMonitoring;