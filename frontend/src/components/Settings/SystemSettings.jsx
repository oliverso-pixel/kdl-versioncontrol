import React, { useState, useEffect } from 'react';
import { Settings, Key, Shield, Database, Bell, Save, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';

const SystemSettings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    general: {
      system_name: '版本控制中心',
      max_file_size: 500,
      retention_days: 90,
      enable_auto_cleanup: true
    },
    mssql_sync: {
      sleep_start: '00:00',
      sleep_end: '06:00'
    },
    security: {
      api_key_expiry: 30,
      max_login_attempts: 5,
      session_timeout: 60,
      enable_2fa: false
    },
    notifications: {
      enable_email: false,
      email_server: '',
      email_port: 587,
      enable_webhook: false,
      webhook_url: ''
    }
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await api.getSystemSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSystemSettings(settings);
      alert('設定已儲存');
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', name: '一般設定', icon: Settings },
    { id: 'security', name: '安全設定', icon: Shield },
    { id: 'api', name: 'API 金鑰管理', icon: Key },
    { id: 'database', name: '資料庫管理', icon: Database },
    { id: 'notifications', name: '通知設定', icon: Bell }
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">系統設定</h1>

      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* 一般設定 */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  系統名稱
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={settings.general.system_name}
                  onChange={(e) => setSettings({
                    ...settings,
                    general: { ...settings.general, system_name: e.target.value }
                  })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  最大檔案大小 (MB)
                </label>
                <input
                  type="number"
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={settings.general.max_file_size}
                  onChange={(e) => setSettings({
                    ...settings,
                    general: { ...settings.general, max_file_size: parseInt(e.target.value) }
                  })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  日誌保留天數
                </label>
                <input
                  type="number"
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  value={settings.general.retention_days}
                  onChange={(e) => setSettings({
                    ...settings,
                    general: { ...settings.general, retention_days: parseInt(e.target.value) }
                  })}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  checked={settings.general.enable_auto_cleanup}
                  onChange={(e) => setSettings({
                    ...settings,
                    general: { ...settings.general, enable_auto_cleanup: e.target.checked }
                  })}
                />
                <label className="ml-2 block text-sm text-gray-900">
                  啟用自動清理
                </label>
              </div>
            </div>
          )}

          {/* API 金鑰管理 */}
          {activeTab === 'api' && (
            <ApiKeyManagement />
          )}

          {/* 資料庫管理 */}
          {activeTab === 'database' && (
            <DatabaseManagement />
          )}

          {/* 保存按鈕 */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? '儲存中...' : '儲存設定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// API 金鑰管理子元件
const ApiKeyManagement = () => {
  const [apiKeys, setApiKeys] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const data = await api.getApiKeys();
      setApiKeys(data);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    }
  };

  const handleCreateKey = async () => {
    try {
      const result = await api.createApiKey({ name: newKeyName });
      alert(`新的 API Key: ${result.key}\n請妥善保管，此金鑰只會顯示一次！`);
      setShowCreateModal(false);
      setNewKeyName('');
      fetchApiKeys();
    } catch (err) {
      console.error('Failed to create API key:', err);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (window.confirm('確定要撤銷這個 API Key 嗎？')) {
      try {
        await api.revokeApiKey(keyId);
        fetchApiKeys();
      } catch (err) {
        console.error('Failed to revoke API key:', err);
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">API 金鑰列表</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          新增金鑰
        </button>
      </div>

      <div className="space-y-4">
        {apiKeys.map((key) => (
          <div key={key.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">{key.name}</p>
              <p className="text-sm text-gray-500">
                建立時間：{new Date(key.created_at).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                最後使用：{key.last_used ? new Date(key.last_used).toLocaleString() : '從未使用'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {key.is_active ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  啟用
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  已撤銷
                </span>
              )}
              {key.is_active && (
                <button
                  onClick={() => handleRevokeKey(key.id)}
                  className="text-red-600 hover:text-red-900 text-sm"
                >
                  撤銷
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 新增 API Key Modal */}
      {showCreateModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  新增 API 金鑰
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    金鑰名稱
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="例如：Production API Key"
                  />
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleCreateKey}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  建立
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 資料庫管理子元件
const DatabaseManagement = () => {
  const [dbStats, setDbStats] = useState({
    total_size: '0 MB',
    table_stats: [],
    backup_status: 'idle'
  });

  useEffect(() => {
    fetchDbStats();
  }, []);

  const fetchDbStats = async () => {
    try {
      const data = await api.getDatabaseStats();
      setDbStats(data);
    } catch (err) {
      console.error('Failed to fetch database stats:', err);
    }
  };

  const handleBackup = async () => {
    if (window.confirm('確定要執行資料庫備份嗎？')) {
      try {
        await api.backupDatabase();
        alert('備份已開始，完成後會收到通知');
      } catch (err) {
        console.error('Failed to backup database:', err);
      }
    }
  };

  const handleCleanup = async () => {
    if (window.confirm('確定要清理過期資料嗎？此操作不可恢復！')) {
      try {
        const result = await api.cleanupDatabase();
      const totalDeleted = (result.deleted_logs || 0) + 
                          (result.deleted_devices || 0) + 
                          (result.deleted_apk_files || 0);
      
      // 顯示詳細的清理結果
      alert(`清理完成：
      - 更新日誌：${result.deleted_logs || 0} 筆
      - 停用設備：${result.deleted_devices || 0} 筆
      - APK檔案：${result.deleted_apk_files || 0} 個
      總計清理 ${totalDeleted} 筆過期資料`);
        fetchDbStats();
      } catch (err) {
        console.error('Failed to cleanup database:', err);
        alert('清理失敗：' + (err.response?.data?.detail || err.message));
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">資料庫狀態</h3>
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                資料庫大小
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                {dbStats.total_size}
              </dd>
            </div>
          </div>
        </dl>
      </div>

      <div>
        <h4 className="text-base font-medium text-gray-900 mb-2">資料表統計</h4>
        <div className="bg-gray-50 rounded-lg p-4">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase">資料表</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase">記錄數</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase">大小</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {dbStats.table_stats.map((table) => (
                <tr key={table.name}>
                  <td className="py-2 text-sm text-gray-900">{table.name}</td>
                  <td className="py-2 text-sm text-gray-500 text-right">{table.row_count}</td>
                  <td className="py-2 text-sm text-gray-500 text-right">{table.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex space-x-4">
        <button
          onClick={handleBackup}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          備份資料庫
        </button>
        <button
          onClick={handleCleanup}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
        >
          清理過期資料
        </button>
      </div>
    </div>
  );
};

export default SystemSettings;