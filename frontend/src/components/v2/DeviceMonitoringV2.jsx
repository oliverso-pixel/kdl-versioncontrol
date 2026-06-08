import React, { useState, useEffect } from 'react';
import { Search, Smartphone, Battery, MapPin, Key } from 'lucide-react';
import api from '../../services/api';

const DeviceMonitoringV2 = () => {
  const [allDevices, setAllDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState(''); // 即時過濾關鍵字
  
  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    // 一次性拉取所有設備 (V2 API)
    const data = await api.getDevices(); 
    setAllDevices(data);
  };

  // 前端即時篩選邏輯 (KeyUp 體驗)
  const filteredDevices = allDevices.filter(device => 
    device.android_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (device.device_model && device.device_model.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">設備監控 (V2)</h1>
      
      {/* 即時搜尋框 */}
      <div className="mb-6 relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="即時搜尋設備 Android ID, 型號..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)} // Keyup 即時觸發過濾
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredDevices.map(device => (
          <div key={device.id} className="bg-white p-4 rounded-lg shadow flex items-center justify-between border-l-4 border-indigo-500">
            <div className="flex items-center space-x-4">
               {/* 狀態燈 */}
              <div className={`w-3 h-3 rounded-full ${device.is_online ? 'bg-green-500 shadow-green-500 shadow-md' : 'bg-gray-300'}`} title={device.is_online ? '上線中' : '離線'}></div>
              <div>
                <h3 className="font-bold text-lg">{device.device_model}</h3>
                <p className="text-sm text-gray-500 font-mono">{device.android_id}</p>
              </div>
            </div>

            <div className="flex items-center space-x-6">
              <div className="flex flex-col items-center" title="API Key">
                <Key className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-600 mt-1">{device.device_api_key ? '已綁定' : '未綁定'}</span>
              </div>
              <div className="flex flex-col items-center" title="電量">
                <Battery className={`w-4 h-4 ${device.battery_level > 20 ? 'text-green-500' : 'text-red-500'}`} />
                <span className="text-xs text-gray-600 mt-1">{device.battery_level ? `${device.battery_level}%` : '-'}</span>
              </div>
              <div className="flex flex-col items-center" title="位置">
                <MapPin className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-600 mt-1">
                  {device.latitude ? <a href={`https://maps.google.com/?q=${device.latitude},${device.longitude}`} target="_blank" rel="noreferrer" className="hover:underline">查看</a> : '-'}
                </span>
              </div>
            </div>
            
            <div>
              <button className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded text-sm">遠端控制與已裝列表</button>
            </div>
          </div>
        ))}
        
        {filteredDevices.length === 0 && (
          <div className="text-center text-gray-500 py-10">找不到符合的設備</div>
        )}
      </div>
    </div>
  );
};
export default DeviceMonitoringV2;