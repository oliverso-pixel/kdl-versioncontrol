import React, { useState, useEffect } from 'react';
import { Package, Plus, ChevronRight, Download, Edit, Trash2, UploadCloud, GitBranch } from 'lucide-react';
import api from '../../services/api';

const StoreManagement = () => {
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [appDetails, setAppDetails] = useState(null);
  
  // 為了相容 V1 端點，需要暫存包含數字 ID 的原始資料
  const [rawApp, setRawApp] = useState(null);
  const [rawBranches, setRawBranches] = useState([]);

  // 表單與 Modal 狀態
  const [showAppModal, setShowAppModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);

  const [expandedHistory, setExpandedHistory] = useState({});
  
  const [isEditingApp, setIsEditingApp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 表單資料狀態
  const [appFormData, setAppFormData] = useState({ app_id: '', name: '', description: '' });
  const [branchFormData, setBranchFormData] = useState({ branch_name: '', description: '' });
  const [versionFormData, setVersionFormData] = useState({
    branch_id: '',
    version_code: '',
    version_name: '',
    min_supported_version: '1',
    force_update: false,
    release_notes: '',
    file: null
  });

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const res = await api.getStoreApps(); // V2 商城列表
      setApps(res.data);
    } catch (err) {
      console.error("Failed to fetch store apps:", err);
    }
  };

  const openAppDetails = async (appId) => {
    try {
      setSelectedApp(appId);
      
      // 1. 取得 V2 的精美層級資料
      const res = await api.getStoreAppDetails(appId); 
      setAppDetails(res.data);

      // 2. 取得 V1 的原始列表，以獲取資料庫的數字 ID (供更新與刪除使用)
      const v1Apps = await api.getApplications();
      const targetApp = v1Apps.find(a => a.app_id === appId);
      setRawApp(targetApp);

      // 3. 取得該 App 下所有的分支原始資料 (供上傳 APK 選擇分支使用)
      if (targetApp) {
        const v1Branches = await api.getBranches(targetApp.id);
        setRawBranches(v1Branches);
      }
    } catch (err) {
      console.error("Failed to fetch app details:", err);
      alert("無法讀取程式詳情");
    }
  };

  // ===================== 應用程式 (Application) 邏輯 =====================
  const handleAppSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (isEditingApp) {
        await api.updateApplication(rawApp.id, appFormData);
        alert('應用程式已成功更新');
        await openAppDetails(rawApp.app_id); // 刷新詳情
      } else {
        await api.createApplication(appFormData);
        alert('應用程式已成功建立');
      }
      setShowAppModal(false);
      fetchApps(); // 刷新首頁列表
    } catch (err) {
      alert('儲存失敗，請檢查輸入資料是否重複');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteApp = async () => {
    if (!window.confirm(`確定要刪除 [${appDetails.name}] 嗎？此操作將一併刪除所有分支與版本，無法還原！`)) return;
    try {
      await api.deleteApplication(rawApp.id);
      alert('應用程式已刪除');
      setSelectedApp(null);
      fetchApps();
    } catch (err) {
      alert('刪除失敗');
    }
  };

  // ===================== 分支 (Branch) 邏輯 =====================
  const handleBranchSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createBranch({
        application_id: rawApp.id,
        branch_name: branchFormData.branch_name,
        description: branchFormData.description
      });
      alert('分支已成功建立');
      setShowBranchModal(false);
      setBranchFormData({ branch_name: '', description: '' });
      openAppDetails(rawApp.app_id); // 刷新詳情
    } catch (err) {
      alert('分支建立失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===================== 版本 (Version / APK) 邏輯 =====================
  const handleVersionSubmit = async (e) => {
    e.preventDefault();
    if (!versionFormData.file) {
      alert('請選擇 APK 檔案');
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('application_id', rawApp.id);
      formData.append('branch_id', versionFormData.branch_id);
      formData.append('version_code', versionFormData.version_code);
      formData.append('version_name', versionFormData.version_name);
      formData.append('min_supported_version', versionFormData.min_supported_version);
      formData.append('force_update', versionFormData.force_update);
      formData.append('release_notes', versionFormData.release_notes);
      formData.append('file', versionFormData.file);

      await api.uploadApk(formData); // 呼叫 V1 的上傳端點
      alert('APK 已成功上傳並發布');
      setShowVersionModal(false);
      
      // 重置表單
      setVersionFormData({
        branch_id: '', version_code: '', version_name: '', min_supported_version: '1', force_update: false, release_notes: '', file: null
      });
      openAppDetails(rawApp.app_id); // 刷新詳情
    } catch (err) {
      alert('APK 上傳失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleHistory = (branchName) => {
    setExpandedHistory(prev => ({
      ...prev,
      [branchName]: !prev[branchName]
    }));
  };

  // ===================== 渲染詳細頁面 =====================
  if (selectedApp && appDetails && rawApp) {
    return (
      <div className="pb-10">
        <button onClick={() => setSelectedApp(null)} className="mb-4 text-indigo-600 hover:underline flex items-center">
          ← 返回商城首頁
        </button>
        
        {/* App 標頭區 */}
        <div className="bg-white p-6 rounded-lg shadow mb-6 border-t-4 border-indigo-600 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">{appDetails.name}</h2>
            <p className="text-gray-500 font-mono mt-1">{appDetails.app_id}</p>
            <p className="text-gray-700 mt-4 max-w-2xl">{appDetails.description}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                setIsEditingApp(true);
                setAppFormData({ app_id: appDetails.app_id, name: appDetails.name, description: appDetails.description });
                setShowAppModal(true);
              }}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded flex items-center transition"
            >
              <Edit className="w-4 h-4 mr-2"/> 修改資訊
            </button>
            <button 
              onClick={handleDeleteApp}
              className="bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded flex items-center transition"
            >
              <Trash2 className="w-4 h-4 mr-2"/> 刪除程式
            </button>
          </div>
        </div>

        {/* 版本與分支管理區 */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-gray-800">發布頻道與版本</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowBranchModal(true)} className="bg-white border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded flex items-center transition">
              <GitBranch className="w-4 h-4 mr-2"/> 新增頻道 (Branch)
            </button>
            <button onClick={() => setShowVersionModal(true)} className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded flex items-center shadow transition">
              <UploadCloud className="w-4 h-4 mr-2"/> 發布新版本 (APK)
            </button>
          </div>
        </div>
        
        {appDetails.branches.map(b => (
          <div key={b.branch_name} className="bg-white p-6 rounded-lg shadow mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
            
            <div className="flex justify-between items-center mb-4 ml-2">
              <div>
                <h4 className="font-bold text-xl text-gray-900 flex items-center">
                  <GitBranch className="w-5 h-5 mr-2 text-blue-500"/> {b.branch_name}
                </h4>
                <p className="text-sm text-gray-500 mt-1">{b.description}</p>
              </div>
            </div>
            
            {b.latest_version ? (
              <div className="border border-gray-200 rounded-lg p-5 bg-gray-50 ml-2">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold mb-2">
                      最新版本 {b.latest_version.version_name}
                    </span>
                    <p className="text-sm text-gray-600">Version Code: {b.latest_version.version_code} | 更新日期: {new Date(b.latest_version.created_at).toLocaleDateString()}</p>
                    {b.latest_version.force_update && <span className="text-xs text-red-600 font-bold mt-1 block">⚠️ 此為強制更新版本</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => window.open(b.latest_version.download_url)} className="bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 rounded flex items-center shadow-sm transition text-sm">
                      <Download className="w-4 h-4 mr-1"/> 下載 APK
                    </button>
                    {/* 加入切換歷史紀錄的按鈕 */}
                    <button onClick={() => toggleHistory(b.branch_name)} className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-3 py-2 rounded transition text-sm">
                      {expandedHistory[b.branch_name] ? '隱藏歷史紀錄' : '歷史版本紀錄'}
                    </button>
                  </div>
                </div>
                <div className="bg-white p-3 rounded border text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {b.latest_version.release_notes || "無更新說明"}
                </div>

                {/* 歷史版本區塊 (展開後顯示) */}
                {expandedHistory[b.branch_name] && b.version_history && b.version_history.length > 1 && (
                  <div className="mt-6 border-t pt-4">
                    <h5 className="font-bold text-gray-700 mb-3 text-sm">歷史更新紀錄</h5>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm border border-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">版本名稱 (Name)</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">版本號 (Code)</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">發布時間</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-600">更新內容</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {/* 使用 slice(1) 略過第一筆，因為第一筆就是當前的最新版本 */}
                          {b.version_history.slice(1).map((vh, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-2 whitespace-nowrap">{vh.version_name}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{vh.version_code}</td>
                              <td className="px-4 py-2 whitespace-nowrap">{new Date(vh.created_at).toLocaleString()}</td>
                              <td className="px-4 py-2 min-w-[200px] whitespace-pre-wrap">{vh.release_notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {expandedHistory[b.branch_name] && b.version_history && b.version_history.length <= 1 && (
                  <div className="mt-4 border-t pt-4 text-sm text-gray-500 italic">
                    此頻道目前沒有其他歷史版本。
                  </div>
                )}
                
              </div>
            ) : (
              <div className="text-gray-400 text-sm italic ml-2 border border-dashed border-gray-300 p-4 rounded text-center">
                此頻道目前還沒有上傳任何版本。
              </div>
            )}
          </div>
        ))}
        
        {/* ===================== Modals 區塊 ===================== */}

        {/* 1. App Modal */}
        {showAppModal && (
          <div className="fixed z-10 inset-0 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-bold mb-4">{isEditingApp ? '修改應用程式' : '新增應用程式'}</h3>
              <form onSubmit={handleAppSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">App ID (Package Name)</label>
                  <input required disabled={isEditingApp} type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100" value={appFormData.app_id} onChange={e => setAppFormData({...appFormData, app_id: e.target.value})} placeholder="com.company.app"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">應用程式名稱</label>
                  <input required type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={appFormData.name} onChange={e => setAppFormData({...appFormData, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">描述</label>
                  <textarea className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" rows="3" value={appFormData.description} onChange={e => setAppFormData({...appFormData, description: e.target.value})}></textarea>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => setShowAppModal(false)} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50">取消</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">{isSubmitting ? '儲存中...' : '儲存'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. Branch Modal */}
        {showBranchModal && (
          <div className="fixed z-10 inset-0 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-bold mb-4">新增頻道 (Branch)</h3>
              <form onSubmit={handleBranchSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">頻道名稱</label>
                  <input required type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={branchFormData.branch_name} onChange={e => setBranchFormData({...branchFormData, branch_name: e.target.value})} placeholder="例如: stable, beta, dev"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">描述</label>
                  <input type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={branchFormData.description} onChange={e => setBranchFormData({...branchFormData, description: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => setShowBranchModal(false)} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50">取消</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">{isSubmitting ? '建立中...' : '建立'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. Version (Upload APK) Modal */}
        {showVersionModal && (
          <div className="fixed z-10 inset-0 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">上傳新版本 APK</h3>
              <form onSubmit={handleVersionSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">選擇發布頻道</label>
                  <select required className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={versionFormData.branch_id} onChange={e => setVersionFormData({...versionFormData, branch_id: e.target.value})}>
                    <option value="">請選擇...</option>
                    {rawBranches.map(b => (
                      <option key={b.id} value={b.id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">版本代碼 (Version Code)</label>
                    <input required type="number" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={versionFormData.version_code} onChange={e => setVersionFormData({...versionFormData, version_code: e.target.value})} placeholder="例如: 105"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">版本名稱 (Version Name)</label>
                    <input required type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={versionFormData.version_name} onChange={e => setVersionFormData({...versionFormData, version_name: e.target.value})} placeholder="例如: 1.0.5"/>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">APK 檔案</label>
                  <input required type="file" accept=".apk" className="mt-1 block w-full border border-gray-300 rounded-md p-2" onChange={e => setVersionFormData({...versionFormData, file: e.target.files[0]})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">最低支援版本 (Code)</label>
                  <input required type="number" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={versionFormData.min_supported_version} onChange={e => setVersionFormData({...versionFormData, min_supported_version: e.target.value})}/>
                </div>
                <div className="flex items-center mt-4">
                  <input type="checkbox" id="force_update" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" checked={versionFormData.force_update} onChange={e => setVersionFormData({...versionFormData, force_update: e.target.checked})}/>
                  <label htmlFor="force_update" className="ml-2 block text-sm text-red-600 font-bold">強制所有舊版本更新此版本</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">更新說明 (Release Notes)</label>
                  <textarea className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm" rows="4" value={versionFormData.release_notes} onChange={e => setVersionFormData({...versionFormData, release_notes: e.target.value})} placeholder="- 修正了...&#10;- 新增了..."></textarea>
                </div>
                
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                  <button type="button" onClick={() => setShowVersionModal(false)} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50">取消</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center">
                    {isSubmitting ? '上傳中請稍候...' : <><UploadCloud className="w-4 h-4 mr-2"/> 確認上傳</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ===================== 渲染首頁 (App 列表) =====================
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">企業商城管理</h1>
          <p className="text-gray-500 mt-2">管理所有對內部與設備發布的應用程式版本</p>
        </div>
        <button 
          onClick={() => {
            setIsEditingApp(false);
            setAppFormData({ app_id: '', name: '', description: '' });
            setShowAppModal(true);
          }} 
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg flex items-center shadow-md hover:bg-indigo-700 transition font-medium"
        >
          <Plus className="w-5 h-5 mr-2"/> 新增應用程式
        </button>
      </div>
      
      {apps.length === 0 ? (
         <div className="text-center py-20 bg-white rounded-lg shadow border border-gray-200">
           <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
           <p className="text-gray-500 text-lg">目前商城沒有任何應用程式，請點擊右上方按鈕新增。</p>
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map(app => (
            <div key={app.app_id} onClick={() => openAppDetails(app.app_id)} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition duration-200 flex flex-col items-center text-center group">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition">
                <Package className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">{app.name}</h3>
              <p className="text-gray-400 text-xs font-mono mt-1 mb-4">{app.app_id}</p>
              
              <div className="w-full bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm text-gray-600 flex justify-between items-center">
                <span>包含 {app.branches_summary.length} 個頻道</span>
                <span className="text-indigo-600 font-medium flex items-center group-hover:text-indigo-800">管理 <ChevronRight className="w-4 h-4 ml-1"/></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 渲染新增 App 的 Modal (在首頁也會用到) */}
      {showAppModal && !selectedApp && (
          <div className="fixed z-10 inset-0 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
              <h3 className="text-lg font-bold mb-4">新增應用程式</h3>
              <form onSubmit={handleAppSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">App ID (Package Name)</label>
                  <input required type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={appFormData.app_id} onChange={e => setAppFormData({...appFormData, app_id: e.target.value})} placeholder="例如: com.company.app"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">應用程式名稱</label>
                  <input required type="text" className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" value={appFormData.name} onChange={e => setAppFormData({...appFormData, name: e.target.value})} placeholder="例如: 企業內部打卡系統" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">描述</label>
                  <textarea className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" rows="3" value={appFormData.description} onChange={e => setAppFormData({...appFormData, description: e.target.value})} placeholder="簡單描述此 App 的用途..."></textarea>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button type="button" onClick={() => setShowAppModal(false)} className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50">取消</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">{isSubmitting ? '儲存中...' : '儲存'}</button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
};
export default StoreManagement;