import React, { useState, useEffect } from 'react';
import { GitBranch, Plus, Edit2, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { formatDateTime } from '../../utils/date';

const BranchManagement = () => {
  const [branches, setBranches] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState('');
  const [newBranch, setNewBranch] = useState({
    branch_name: '',
    description: '',
    application_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [branchesData, appsData] = await Promise.all([
        api.getBranches(),
        api.getApplications()
      ]);
      setBranches(branchesData);
      setApplications(appsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    try {
      await api.createBranch(newBranch);
      setShowCreateModal(false);
      setNewBranch({ branch_name: '', description: '', application_id: '' });
      fetchData();
    } catch (err) {
      console.error('Failed to create branch:', err);
    }
  };

  const handleDeleteBranch = async (branchId) => {
    if (window.confirm('確定要刪除這個分支嗎？')) {
      try {
        await api.deleteBranch(branchId);
        fetchData();
      } catch (err) {
        console.error('Failed to delete branch:', err);
      }
    }
  };

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }

  // 按應用程式分組分支
  const branchesByApp = branches.reduce((acc, branch) => {
    const appId = branch.application_id;
    if (!acc[appId]) {
      acc[appId] = {
        app: applications.find(a => a.id === appId),
        branches: []
      };
    }
    acc[appId].branches.push(branch);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">分支管理</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          新增分支
        </button>
      </div>

      <div className="space-y-6">
        {Object.values(branchesByApp).map(({ app, branches }) => (
          <div key={app.id} className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 bg-gray-50">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {app.name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{app.app_id}</p>
            </div>
            <div className="border-t border-gray-200">
              <ul className="divide-y divide-gray-200">
                {branches.map((branch) => (
                  <li key={branch.id} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <GitBranch className="h-5 w-5 text-gray-400 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {branch.branch_name}
                          </p>
                          {branch.description && (
                            <p className="text-sm text-gray-500">{branch.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            建立時間：{formatDateTime(branch.created_at) ?? '未知時間'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {branch.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            啟用
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            停用
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteBranch(branch.id)}
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
          </div>
        ))}
      </div>

      {/* 新增分支 Modal */}
      {showCreateModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleCreateBranch}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    新增分支
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        應用程式
                      </label>
                      <select
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newBranch.application_id}
                        onChange={(e) => setNewBranch({ ...newBranch, application_id: e.target.value })}
                      >
                        <option value="">選擇應用程式</option>
                        {applications.map(app => (
                          <option key={app.id} value={app.id}>{app.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        分支名稱
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newBranch.branch_name}
                        onChange={(e) => setNewBranch({ ...newBranch, branch_name: e.target.value })}
                        placeholder="stable, beta, dev"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        描述
                      </label>
                      <textarea
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newBranch.description}
                        onChange={(e) => setNewBranch({ ...newBranch, description: e.target.value })}
                        rows={3}
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
                    onClick={() => setShowCreateModal(false)}
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
    </div>
  );
};

export default BranchManagement;