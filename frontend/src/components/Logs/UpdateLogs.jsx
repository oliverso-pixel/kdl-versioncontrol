import React, { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle, XCircle, Clock, Filter, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const UpdateLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    app_id: '',
    branch: '',
    date_from: '',
    date_to: '',
    status: ''
  });
  const [applications, setApplications] = useState([]);
    const [branches, setBranches] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const resetFilters = async () => {
  const emptyFilters = {
    app_id: '',
    branch: '',
    date_from: '',
    date_to: '',
    status: ''
  };
  
  setFilters(emptyFilters);
  
  // 立即使用空篩選獲取數據
  try {
    setLoading(true);
    const [logsResponse, appsResponse, branchesResponse] = await Promise.all([
      api.getUpdateLogs(emptyFilters),
      api.getApplications(),
      api.getBranches()
    ]);
    
    let logsData = [];
    if (Array.isArray(logsResponse)) {
      logsData = logsResponse;
    } else if (logsResponse && logsResponse.data && Array.isArray(logsResponse.data)) {
      logsData = logsResponse.data;
    } else if (logsResponse && logsResponse.logs && Array.isArray(logsResponse.logs)) {
      logsData = logsResponse.logs;
    }
    
    setLogs(logsData);
    setApplications(Array.isArray(appsResponse) ? appsResponse : []);
    setBranches(Array.isArray(branchesResponse) ? branchesResponse : [])
  } catch (err) {
    console.error('Failed to fetch logs:', err);
    setLogs([]);
    setApplications([]);
    setBranches([]);
  } finally {
    setLoading(false);
  }
};

  const fetchData = async () => {
    try {
      setLoading(true);

      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '')
      );
      
      console.log('Fetching logs with filters:', activeFilters);

      const [logsResponse, appsResponse, branchesResponse] = await Promise.all([
        api.getUpdateLogs(activeFilters),
        api.getApplications(),
        api.getBranches()
      ]);
      
      // 處理可能的數據格式問題
      let logsData = [];
      if (Array.isArray(logsResponse)) {
        logsData = logsResponse;
      } else if (logsResponse && logsResponse.data && Array.isArray(logsResponse.data)) {
        logsData = logsResponse.data;
      } else if (logsResponse && logsResponse.logs && Array.isArray(logsResponse.logs)) {
        logsData = logsResponse.logs;
      }
      
      console.log('Processed logs data:', logsData);
      setLogs(logsData);
      setApplications(Array.isArray(appsResponse) ? appsResponse : []);
      setBranches(Array.isArray(branchesResponse) ? branchesResponse : []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([]);
      setApplications([]);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

    const handleFilterChange = (key, value) => {
    console.log(`Filter changed - ${key}: "${value}"`);
    setFilters(prev => {
    const newFilters = {
      ...prev,
      [key]: value
    };
    console.log('New filters state:', newFilters);
    return newFilters;
  });
};

  const applyFilters = () => {
    fetchData();
  };

  const exportLogs = () => {
    if (!Array.isArray(logs) || logs.length === 0) {
      alert('沒有可匯出的日誌');
      return;
    }

    const csv = [
      ['時間', '應用程式ID', '分支ID', '設備ID', '原版本', '新版本', '更新類型', '狀態'],
      ...logs.map(log => [
        new Date(log.created_at).toLocaleString('zh-TW'),
        log.application_id || '',
        log.branch_id || '',
        log.device_id || '',
        log.from_version || '',
        log.to_version || '',
        log.update_type || '',
        log.status || ''
      ])
    ];

    const csvContent = '\uFEFF' + csv.map(row => row.join(',')).join('\n'); // 添加 BOM 以支援中文
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `update_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="text-center py-12">載入中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">更新日誌</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            篩選
          </button>
              <button
      onClick={fetchData}
      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
    >
      <RefreshCw className="h-4 w-4 mr-2" />
      重新整理
    </button>
          <button
            onClick={exportLogs}
            disabled={!Array.isArray(logs) || logs.length === 0}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4 mr-2" />
            匯出 CSV
          </button>
        </div>
      </div>

{showFilters && (
  <div className="bg-white p-4 rounded-lg shadow mb-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
      {/* 應用程式篩選 */}
      <div>
        <label className="block text-sm font-medium text-gray-700">應用程式</label>
        <select
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={filters.app_id}
          onChange={(e) => handleFilterChange('app_id', e.target.value)}
        >
          <option value="">全部應用程式</option>
          {applications.map(app => (
            <option key={app.id} value={app.id}>
              { `應用程式 #${app.id}`}
            </option>
          ))}
        </select>
      </div>

      {/* 分支篩選 */}
            <div>
              <label className="block text-sm font-medium text-gray-700">分支</label>
              <select
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={filters.branch}
                onChange={(e) => handleFilterChange('branch', e.target.value)}
              >
                <option value="">全部分支</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {` #${branch.id} ${branch.branch_name} ${branch.application_id}`}
                  </option>
                ))}
              </select>
            </div>

      {/* 開始日期 */}
      <div>
        <label className="block text-sm font-medium text-gray-700">開始日期</label>
        <input
          type="date"
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={filters.date_from}
          onChange={(e) => handleFilterChange('date_from', e.target.value)}
        />
      </div>

      {/* 結束日期 */}
      <div>
        <label className="block text-sm font-medium text-gray-700">結束日期</label>
        <input
          type="date"
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={filters.date_to}
          onChange={(e) => handleFilterChange('date_to', e.target.value)}
        />
      </div>

      {/* 狀態篩選 */}
      <div>
        <label className="block text-sm font-medium text-gray-700">狀態</label>
        <select
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
        >
          <option value="">全部狀態</option>
                <option value="success">成功</option>
                <option value="failed">失敗</option>
                <option value="pending">處理中</option>
        </select>
      </div>
    </div>

    {/* 篩選器操作按鈕 */}
    <div className="flex justify-end space-x-2 mt-4">
      <button
        onClick={resetFilters
        }
        className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
      >
        重置篩選
      </button>
      <button
        onClick={applyFilters}
        className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
      >
        套用篩選
      </button>
    </div>
  </div>
)}

      {/* 日誌列表 */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                時間
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                應用程式
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                設備
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                版本
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                狀態
              </th>
              {/* <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th> */}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Array.isArray(logs) && logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.created_at || log.check_time).toLocaleString('zh-TW')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {/* 顯示應用程式 ID 和分支 ID */}
                    應用程式 #{log.application_id}
                    <span className="text-gray-500 text-xs block">
                      分支 #{log.branch_id}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="font-mono text-xs">
                      設備 #{log.device_id}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.from_version || '-'} → {log.to_version || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {/* 根據 update_type 和 status 顯示狀態 */}
                    {log.update_type === 'check' && log.status === 'success' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Clock className="h-3 w-3 mr-1" />
                        檢查更新
                      </span>
                    )}
                    {log.update_type === 'download' && log.status === 'success' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        下載成功
                      </span>
                    )}
                    {log.status === 'failed' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="h-3 w-3 mr-1" />
                        失敗
                      </span>
                    )}
                    {log.status === 'pending' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="h-3 w-3 mr-1" />
                        處理中
                      </span>
                    )}
                  </td>
                  {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button className="text-indigo-600 hover:text-indigo-900">
                      詳細
                    </button>
                  </td> */}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                  暫無日誌記錄
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UpdateLogs;