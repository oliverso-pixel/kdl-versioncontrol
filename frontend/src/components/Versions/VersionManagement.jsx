// src/components/Versions/VersionManagement.jsx
import React, { useState, useEffect } from 'react';
import { Upload, Download, Trash2, GitBranch, Package, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import { API_BASE } from '../../utils/constants';

const VersionManagement = () => {
  const [versions, setVersions] = useState([]);
  const [applications, setApplications] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // const [selectedApp, setSelectedApp] = useState('');
  const [uploadData, setUploadData] = useState({
    application_id: '',
    branch_id: '',
    version_code: '',
    version_name: '',
    force_update: false,
    min_supported_version: '0',
    release_notes: '',
    file: null,
  });
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (uploadData.application_id) {
      fetchBranches(uploadData.application_id);
    }
  }, [uploadData.application_id]);

  const fetchData = async () => {
    try {
      const [versionsData, appsData] = await Promise.all([
        api.getVersions(),
        api.getApplications()
      ]);
      setVersions(versionsData);
      setApplications(appsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async (appId) => {
    try {
      const data = await api.getBranches(appId);
      setBranches(data);
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) { // 500MB
        alert('檔案大小不能超過 500MB');
        e.target.value = '';
        return;
      }
      setUploadData({ ...uploadData, file });
    }
  };

  // const handleUpload = async (e) => {
  //   e.preventDefault();
    
  //   if (!uploadData.file) {
  //     alert('請選擇 APK 檔案');
  //     return;
  //   }

  //   const formData = new FormData();
  //   Object.keys(uploadData).forEach(key => {
  //     if (uploadData[key] !== null) {
  //       formData.append(key, uploadData[key]);
  //     }
  //   });

  //   try {
  //     setUploadProgress(10);
  //     const result = await api.uploadAPK(formData);
  //     setUploadProgress(100);
      
  //     alert('版本上傳成功！');
  //     setShowUploadModal(false);
  //     setUploadData({
  //       application_id: '',
  //       branch_id: '',
  //       version_code: '',
  //       version_name: '',
  //       force_update: false,
  //       min_supported_version: '0',
  //       release_notes: '',
  //       file: null,
  //     });
  //     setUploadProgress(0);
  //     fetchData();
  //   } catch (err) {
  //     console.error('Failed to upload APK:', err);
  //     alert(`上傳失敗：${err.message || '請檢查輸入並重試'}`);
  //     setUploadProgress(0);
  //   }
  // };

  // const handleDeleteVersion = async (versionId) => {
  //   if (window.confirm('確定要刪除這個版本嗎？此操作不可恢復！')) {
  //     try {
  //       await api.deleteVersion(versionId);
  //       fetchData();
  //     } catch (err) {
  //       console.error('Failed to delete version:', err);
  //     }
  //   }
  // };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!uploadData.file) {
      alert('請選擇 APK 檔案');
      return;
    }

    const formData = new FormData();
    
    // 添加所有必要的參數
    formData.append('application_id', uploadData.application_id);
    formData.append('branch_id', uploadData.branch_id);
    formData.append('version_code', uploadData.version_code);
    formData.append('version_name', uploadData.version_name);
    formData.append('file', uploadData.file);
    
    // 明確設置布林值為字串
    formData.append('force_update', uploadData.force_update ? 'true' : 'false');
    
    // 確保 min_supported_version 是字串
    formData.append('min_supported_version', String(uploadData.min_supported_version || '0'));
    
    // 添加 release_notes
    if (uploadData.release_notes) {
      formData.append('release_notes', uploadData.release_notes);
    }

    console.log('Uploading with data:', {
      application_id: uploadData.application_id,
      branch_id: uploadData.branch_id,
      version_code: uploadData.version_code,
      version_name: uploadData.version_name,
      force_update: uploadData.force_update,
      min_supported_version: uploadData.min_supported_version,
      release_notes: uploadData.release_notes
    });

    try {
      setUploadProgress(10);
      // const result = await api.uploadAPK(formData);
      setUploadProgress(100);
      
      alert('版本上傳成功！');
      setShowUploadModal(false);
      setUploadData({
        application_id: '',
        branch_id: '',
        version_code: '',
        version_name: '',
        force_update: false,
        min_supported_version: '0',
        release_notes: '',
        file: null,
      });
      setUploadProgress(0);
      fetchData();
    } catch (err) {
      console.error('Failed to upload APK:', err);
      alert(`上傳失敗：${err.message || '請檢查輸入並重試'}`);
      setUploadProgress(0);
    }
  };

  const handleDeleteVersion = async (version, event) => {
    const message = `確定要刪除版本 ${version.version_name} 嗎？`;
    
    // 檢查是否按住 Shift 鍵
    const isPermanent = event?.shiftKey || false;
    
    if (isPermanent) {
      const confirmPermanent = window.confirm(message + '\n\n⚠️ 警告：您按住了 Shift 鍵，這將永久刪除版本！\n\n是否繼續？');
      if (!confirmPermanent) return;
      
      const deleteFile = window.confirm('是否同時刪除 APK 檔案？');
      
      try {
        await api.deleteVersion(version.id, true, deleteFile);
        alert('版本已永久刪除！');
        fetchData();
      } catch (err) {
        console.error('Failed to delete version:', err);
        alert('刪除失敗！');
      }
    } else {
      // 軟刪除
      const confirmSoft = window.confirm(message + '\n\n此操作將停用該版本（軟刪除）。\n如需永久刪除，請按住 Shift 鍵再點擊刪除按鈕。');
      if (!confirmSoft) return;
      
      try {
        await api.deleteVersion(version.id, false, false);
        alert('版本已停用！');
        fetchData();
      } catch (err) {
        console.error('Failed to delete version:', err);
        alert('刪除失敗！');
      }
    }
  };

  // 按應用程式分組版本
  const versionsByApp = versions.reduce((acc, version) => {
    const appId = version.application_id;
    if (!acc[appId]) {
      acc[appId] = {
        app: applications.find(a => a.id === appId),
        versions: []
      };
    }
    acc[appId].versions.push(version);
    return acc;
  }, {});

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">版本管理</h1>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Upload className="h-4 w-4 mr-2" />
          上傳新版本
        </button>
      </div>

      {/* 版本列表 */}
      <div className="space-y-6">
        {Object.values(versionsByApp).map(({ app, versions }) => (
          <div key={app?.id || 'unknown'} className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 bg-gray-50">
              <div className="flex items-center">
                <Package className="h-5 w-5 text-gray-400 mr-2" />
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {app?.name || '未知應用程式'}
                </h3>
              </div>
              <p className="mt-1 text-sm text-gray-500">{app?.app_id}</p>
            </div>
            
            <div className="border-t border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      版本
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      分支
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      強制更新
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      檔案大小
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      發布時間
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {versions.sort((a, b) => b.version_code - a.version_code).map((version) => (
                    <tr key={version.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{version.version_name}</div>
                        <div className="text-sm text-gray-500">#{version.version_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <GitBranch className="h-3 w-3 mr-1" />
                          {version.branch_name || 'stable'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {version.force_update ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            是
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            否
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {version.file_size ? `${(version.file_size / 1024 / 1024).toFixed(2)} MB` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(version.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                          onClick={() => window.open(`${API_BASE}${version.apk_download_url}`, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900"
                          onClick={(e) => handleDeleteVersion(version, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* 上傳 Modal */}
      {showUploadModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleUpload}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    上傳新版本
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        應用程式
                      </label>
                      <select
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={uploadData.application_id}
                        onChange={(e) => setUploadData({ ...uploadData, application_id: e.target.value, branch_id: '' })}
                      >
                        <option value="">選擇應用程式</option>
                        {applications.map(app => (
                          <option key={app.id} value={app.id}>{app.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        分支
                      </label>
                      <select
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={uploadData.branch_id}
                        onChange={(e) => setUploadData({ ...uploadData, branch_id: e.target.value })}
                        disabled={!uploadData.application_id}
                      >
                        <option value="">選擇分支</option>
                        {branches.map(branch => (
                          <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          版本號
                        </label>
                        <input
                          type="number"
                          required
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={uploadData.version_code}
                          onChange={(e) => setUploadData({ ...uploadData, version_code: e.target.value })}
                          placeholder="101"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          版本名稱
                        </label>
                        <input
                          type="text"
                          required
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={uploadData.version_name}
                          onChange={(e) => setUploadData({ ...uploadData, version_name: e.target.value })}
                          placeholder="1.0.1"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        最低支援版本號
                      </label>
                      <input
                        type="number"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={uploadData.min_supported_version}
                        onChange={(e) => setUploadData({ ...uploadData, min_supported_version: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        APK 檔案
                      </label>
                      <input
                        type="file"
                        required
                        accept=".apk"
                        onChange={handleFileChange}
                        className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      />
                      {uploadData.file && (
                        <p className="mt-1 text-sm text-gray-500">
                          已選擇: {uploadData.file.name} ({(uploadData.file.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        checked={uploadData.force_update}
                        onChange={(e) => setUploadData({ ...uploadData, force_update: e.target.checked })}
                      />
                      <label className="ml-2 block text-sm text-gray-900">
                        強制更新
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        發布說明
                      </label>
                      <textarea
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={uploadData.release_notes}
                        onChange={(e) => setUploadData({ ...uploadData, release_notes: e.target.value })}
                        rows={4}
                        placeholder="- 修復了一些錯誤&#10;- 改善了效能&#10;- 新增了新功能"
                      />
                    </div>
                    
                    {uploadProgress > 0 && (
                      <div className="relative pt-1">
                        <div className="flex mb-2 items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold inline-block text-indigo-600">
                              上傳進度
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold inline-block text-indigo-600">
                              {uploadProgress}%
                            </span>
                          </div>
                        </div>
                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-indigo-200">
                          <div 
                            style={{ width: `${uploadProgress}%` }}
                            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 transition-all duration-300"
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={uploadProgress > 0}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {uploadProgress > 0 ? '上傳中...' : '上傳'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadProgress(0);
                    }}
                    disabled={uploadProgress > 0}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VersionManagement;