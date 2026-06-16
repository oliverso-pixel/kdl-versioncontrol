import React, { useState, useEffect } from 'react';
import { Package, Plus, Trash2, AlertCircle } from 'lucide-react';
import api from '../../services/api';

const ApplicationManagement = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null)
  const [deleteOptions, setDeleteOptions] = useState({
    permanent: false
  });
  const [newApp, setNewApp] = useState({
    app_id: '',
    name: '',
    description: '',
  });

  const handleDeleteClick = (app) => {
    setSelectedApp(app);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedApp) return;

    try {
      await api.deleteApplication(selectedApp.id, deleteOptions.permanent);
      alert(deleteOptions.permanent ? '應用程式已永久刪除！' : '應用程式已停用！');
      setShowDeleteModal(false);
      setSelectedApp(null);
      setDeleteOptions({ permanent: false });
      fetchApplications();
    } catch (err) {
      console.error('Failed to delete application:', err);
      alert('刪除失敗！');
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const data = await api.getApplications();
      setApplications(data);
    } catch (err) {
      console.error('Failed to fetch applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    try {
      await api.createApplication(newApp);
      setShowCreateModal(false);
      setNewApp({ app_id: '', name: '', description: '' });
      fetchApplications();
    } catch (err) {
      console.error('Failed to create application:', err);
    }
  };

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">應用程式管理</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          新增應用程式
        </button>
      </div>

      {/*<div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {applications.map((app) => (
            <li key={app.id} className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Package className="h-10 w-10 text-gray-400 mr-4" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{app.name}</p>
                    <p className="text-sm text-gray-500">{app.app_id}</p>
                    {app.description && (
                      <p className="text-sm text-gray-500 mt-1">{app.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {app.is_active ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      啟用
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      停用
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>*/}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {applications.map((app) => (
            <li key={app.id} className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Package className="h-10 w-10 text-gray-400 mr-4" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{app.name}</p>
                    <p className="text-sm text-gray-500">{app.app_id}</p>
                    {app.description && (
                      <p className="text-sm text-gray-500 mt-1">{app.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {app.is_active ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      啟用
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      停用
                    </span>
                  )}
                  <button
                    onClick={() => handleDeleteClick(app)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 新增應用程式 Modal */}
      {showCreateModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleCreateApp}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    新增應用程式
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        應用程式 ID
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newApp.app_id}
                        onChange={(e) => setNewApp({ ...newApp, app_id: e.target.value })}
                        placeholder="com.example.app"
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        唯一識別碼，建議使用包名格式
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        應用程式名稱
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newApp.name}
                        onChange={(e) => setNewApp({ ...newApp, name: e.target.value })}
                        placeholder="我的應用程式"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        描述
                      </label>
                      <textarea
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newApp.description}
                        onChange={(e) => setNewApp({ ...newApp, description: e.target.value })}
                        rows={3}
                        placeholder="應用程式的簡短描述..."
                      />
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    建立
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewApp({ app_id: '', name: '', description: '' });
                    }}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {showDeleteModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      刪除應用程式
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        您確定要刪除應用程式「{selectedApp?.name}」嗎？
                      </p>
                      <div className="mt-4">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                            checked={deleteOptions.permanent}
                            onChange={(e) => setDeleteOptions({ ...deleteOptions, permanent: e.target.checked })}
                          />
                          <span className="ml-2 text-sm text-gray-900">
                            永久刪除（將同時刪除所有相關的分支、版本和日誌）
                          </span>
                        </label>
                      </div>
                      {deleteOptions.permanent && (
                        <div className="mt-2 p-2 bg-red-50 rounded">
                          <p className="text-xs text-red-800">
                            警告：此操作不可恢復！所有相關資料將被永久刪除。
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${
                    deleteOptions.permanent
                      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                      : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                  }`}
                >
                  {deleteOptions.permanent ? '永久刪除' : '停用'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedApp(null);
                    setDeleteOptions({ permanent: false });
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 程式碼省略，可從之前的程式碼複製 */}
    </div>
  );
};

export default ApplicationManagement;