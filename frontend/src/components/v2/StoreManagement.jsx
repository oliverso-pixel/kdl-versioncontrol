import React, { useState, useEffect } from 'react';
import { Package, Plus, ChevronRight, Download } from 'lucide-react';
import api from '../../services/api';

const StoreManagement = () => {
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [appDetails, setAppDetails] = useState(null);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    const res = await api.getStoreApps(); // 調用前面寫的 /api/v2/store/apps
    setApps(res.data);
  };

  const openAppDetails = async (appId) => {
    setSelectedApp(appId);
    const res = await api.getStoreAppDetails(appId); // 調用 /api/v2/store/apps/{id}/details
    setAppDetails(res.data);
  };

  if (selectedApp && appDetails) {
    return (
      <div>
        <button onClick={() => setSelectedApp(null)} className="mb-4 text-indigo-600 hover:underline">← 返回商城首頁</button>
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-2xl font-bold">{appDetails.name}</h2>
          <p className="text-gray-500 mt-2">{appDetails.description}</p>
          <div className="mt-4 flex gap-2">
             <button className="bg-blue-600 text-white px-3 py-1 rounded">修改程式</button>
             <button className="bg-red-600 text-white px-3 py-1 rounded">停用/刪除程式</button>
          </div>
        </div>

        <h3 className="text-xl font-bold mb-4">分支與版本</h3>
        <button className="mb-4 bg-green-600 text-white px-3 py-1 rounded flex items-center"><Plus className="w-4 h-4 mr-1"/> 新增分支/版本</button>
        
        {appDetails.branches.map(b => (
          <div key={b.branch_name} className="bg-white p-4 rounded-lg shadow mb-4">
            <h4 className="font-bold text-lg text-indigo-700">{b.branch_name} 分支</h4>
            <p className="text-sm text-gray-500 mb-4">{b.description}</p>
            
            <div className="border border-gray-200 rounded p-4 bg-gray-50">
              <span className="font-bold">最新版本：{b.latest_version.version_name} (Code: {b.latest_version.version_code})</span>
              <p className="text-sm mt-2 whitespace-pre-wrap">{b.latest_version.release_notes}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => window.open(b.latest_version.download_url)} className="bg-indigo-600 text-white px-3 py-1 rounded flex items-center">
                  <Download className="w-4 h-4 mr-1"/> 下載 APK
                </button>
                <button className="bg-gray-600 text-white px-3 py-1 rounded">歷史版本紀錄</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">企業商城 (應用程式管理)</h1>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center"><Plus className="w-4 h-4 mr-1"/> 新增程式</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {apps.map(app => (
          <div key={app.app_id} onClick={() => openAppDetails(app.app_id)} className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition flex flex-col items-center text-center">
            <Package className="w-16 h-16 text-indigo-500 mb-4" />
            <h3 className="text-xl font-bold">{app.name}</h3>
            <p className="text-gray-500 text-sm mt-2">{app.app_id}</p>
            <div className="mt-4 text-xs text-gray-400 bg-gray-100 w-full py-2 rounded">
              包含 {app.branches_summary.length} 個分支
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default StoreManagement;