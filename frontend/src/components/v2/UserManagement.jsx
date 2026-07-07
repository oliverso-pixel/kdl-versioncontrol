import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Mail, Clock, Unlock } from 'lucide-react';
import api from '../../services/api';

const UserManagement = () => {
  const currentUserName = localStorage.getItem('userName');
  const currentUserId = localStorage.getItem('userId');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    is_superuser: false
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();

    if (!newUser.username || !newUser.password || !newUser.email) {
      alert('請填寫完整的帳號、密碼與電子郵件！');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUser.email)) {
      alert('請輸入有效的電子郵件格式！ (例如: example@domain.com)');
      return;
    }

    try {
      await api.createUser(newUser);
      setShowCreateModal(false);
      setNewUser({ username: '', password: '', email: '', is_superuser: false });
      fetchUsers();
      alert('使用者建立成功');
    } catch (err) {
      console.error('Failed to create user:', err);

      let errorMsg = '建立失敗，請稍後再試';
      if (err.response && err.response.data && err.response.data.detail) {
        const detail = err.response.data.detail;

        if (detail === "accountExists") {
          errorMsg = '建立失敗：此帳號已被註冊！';
        } else if (detail === "emailExists") {
          errorMsg = '建立失敗：此電子郵件已被註冊！';
        } else {
          errorMsg = `建立失敗：${detail}`;
        }
      }

      alert(errorMsg);
    }
  };

const handleDeleteUser = async (user) => {

  if (String(user.id) === String(currentUserId)) {
    alert('無法刪除當前登入的帳號！');
    return;
  }

  if (!window.confirm(`確定要刪除使用者「${user.username}」嗎？`)) {
    return;
  }

  if (user.is_superuser) {
    const doubleCheck = window.confirm(
      `警告：使用者「${user.username}」擁有超級管理員 (Superuser) 權限！\n刪除此帳號可能會影響系統管理。您真的確定要將其徹底刪除嗎？`
    );
    if (!doubleCheck) {
      return;
    }
  }

  try {
    await api.deleteUser(user.id);
    alert(`使用者「${user.username}」已成功刪除！`);
    
    if (typeof fetchUsers === 'function') {
      fetchUsers();
    }
  } catch (err) {
    console.error('Failed to delete user:', err);
    const errorMsg = err.response?.data?.detail || '刪除失敗，請確認您的權限或稍後再試。';
    alert(errorMsg);
  }
};

  const handleUnlockUser = async (user) => {
    const confirmUnlock = window.confirm(`確定要解鎖使用者「${user.username}」嗎？`);
    if (!confirmUnlock) return;

    try {
      await api.toggleUserActiveStatus(user.id);
      alert('帳號解鎖成功！');

      if (typeof fetchUsers === 'function') {
        fetchUsers();
      }
    } catch (err) {
      console.error('解鎖失敗:', err);
      alert('解鎖失敗，請稍後再試。');
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '從未登入';
    return new Date(dateString).toLocaleString('zh-TW');
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">載入中...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">後台帳號管理</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          新增使用者
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg overflow-x-auto max-w-full">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                使用者
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                狀態
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                最後登入
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <Shield className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {user.username}
                      </div>
                      <div className="text-xs text-gray-500">ID: {user.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-gray-900">
                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                    {user.email || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.is_active ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      啟用
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      停用
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1 text-gray-400" />
                    {formatDateTime(user.last_login)}
                  </div>
                </td>
                {/* 操作欄位 */}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {!user.is_active && (
                    <button
                      onClick={() => handleUnlockUser(user)}
                      className="text-indigo-600 hover:text-indigo-900 mr-2"
                      title="解鎖帳號"
                    >
                      <Unlock className="h-5 w-5 " />
                    </button>
                  )}
                  {String(currentUserId) !== String(user.id) && (
                    <button
                      onClick={() => handleDeleteUser(user)}
                      className="text-red-600 hover:text-red-900"
                      title="刪除使用者"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增使用者 Modal */}
      {showCreateModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleCreateUser}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    新增管理員帳號
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        帳號 (Username) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        placeholder="帳號名稱"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        密碼 (Password) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        placeholder="設定一組安全的密碼"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        placeholder="manager@example.com"
                      />
                    </div>

                    <div className="mt-4 flex items-center">
                      <input
                        id="is_superuser"
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        checked={newUser.is_superuser || false}
                        onChange={(e) => setNewUser({ ...newUser, is_superuser: e.target.checked })}
                      />
                      <label htmlFor="is_superuser" className="ml-2 block text-sm text-gray-900 font-medium">
                        設定為超級管理員 (Superuser)
                      </label>
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

export default UserManagement;