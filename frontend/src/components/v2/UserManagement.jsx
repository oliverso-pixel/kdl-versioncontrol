import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Mail, Clock, Unlock, Lock, ShieldAlert } from 'lucide-react';
import api from '../../services/api';
import Select from 'react-select';

const UserManagement = () => {
  const currentUserName = localStorage.getItem('userName');
  const currentUserId = localStorage.getItem('userId');
  const isSuperuser = localStorage.getItem('isSuperuser') === 'true';
  const pemissionLevel = parseInt(localStorage.getItem('permissionLevel') || '1', 10);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    is_superuser: false,
    app_id: [],
    permission_level: 2,
    dept_code: ''
  });
  const [apps, setApps] = useState([]);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetchUsers();
    fetchStoreApps();
    fetchDepartments();
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

  const fetchStoreApps = async () => {
    try {
      const res = await api.getStoreApps();

      setApps(res.data || []);
    } catch (err) {
      console.error('Failed to fetch store apps:', err);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.getDepartments();
      if (Array.isArray(res)) setDepartments(res);
      else if (res && Array.isArray(res.data)) setDepartments(res.data);
      else setDepartments([]);
    } catch (err) {
      console.error('Failed to fetch departments:', err);
      setDepartments([]);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();

    if (!isSuperuser && pemissionLevel < 3) {
      alert('您沒有權限建立新使用者，請聯絡管理員！');
      return;
    }

    if (!newUser.username || !newUser.password || !newUser.email) {
      alert('請填寫完整的帳號、密碼與電子郵件！');
      return;
    }

    if (!newUser.app_id || newUser.app_id.length === 0) {
      alert('請至少選擇一個所屬 App 專案！');
      return;
    }

    if (!newUser.dept_code) {
      alert('請選擇部門代碼！');
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
      setNewUser({ username: '', password: '', email: '', is_superuser: false, dept_code: '', app_id: '', permission_level: 2 });
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

    if (user.is_superuser) {
      alert('無法刪除超級管理員 (Superuser) 帳號！');
      return;
    }

    if (window.confirm(`確定要刪除使用者「${user.username}」嗎？`)) {
      try {
        await api.deleteUser(user.id);

        alert('使用者刪除成功！');

        if (typeof fetchUsers === 'function') {
          fetchUsers();
        }
      } catch (err) {
        console.error('Failed to delete user:', err);
        const errorMsg = err.response?.data?.detail || '刪除失敗，請確認您的權限或稍後再試。';
        alert(errorMsg);
      }
    }
  };

  const handleToggleUserActive = async (user) => {
    const actionText = user.is_active ? '停用' : '啟用';

    const confirmToggle = window.confirm(`確定要將使用者「${user.username}」${actionText} 嗎？`);
    if (!confirmToggle || currentUserId === user.id || (user.is_superuser && user.is_active)) return;

    try {
      await api.toggleUserActiveStatus(user.id);

      alert(`帳號${actionText}成功！`);

      if (typeof fetchUsers === 'function') {
        fetchUsers();
      }
    } catch (err) {
      console.error(`${actionText}失敗:`, err);
      const errorMsg = err.response?.data?.detail || `${actionText}失敗，請確認權限或稍後再試。`;
      alert(errorMsg);
    }
  };

  const handlePromoteToSuperuser = async (user) => {
    const confirmPromote = window.confirm(`確定要將使用者「${user.username}」提升為超級管理員 (Superuser) 嗎？\n此操作將賦予該帳號最高系統權限！`);
    if (!confirmPromote) return;

    try {
      await api.promoteUserToSuperuser(user.id);

      alert(`已成功將「${user.username}」提升為超級管理員！`);
      if (typeof fetchUsers === 'function') fetchUsers();
    } catch (err) {
      console.error('提升權限失敗:', err);
      alert(err.response?.data?.detail || '操作失敗，請檢查權限。');
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '從未登入';
    return new Date(dateString).toLocaleString('zh-TW');
  };

  // #region 新增使用者 Modal
  const createUserModal = showCreateModal ? (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-visible shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
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
                    電子郵件 (Email) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="manager@example.com"
                  />
                </div>

                {isSuperuser ? (
                  <div className="mt-4 flex items-center">
                    <input
                      id="is_superuser"
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      checked={newUser.is_superuser || false}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setNewUser({
                          ...newUser,
                          is_superuser: isChecked,
                          ...(isChecked ? { app_id: [], permission_level: 3, dept_code: '' } : { app_id: [], permission_level: 2 })
                        });
                      }}
                    />
                    <label htmlFor="is_superuser" className="ml-2 block text-sm text-gray-900 font-medium">
                      設定為超級管理員 (Superuser)
                    </label>
                  </div>
                ) : (
                  <input type="hidden" value="false" />
                )}

                {!newUser.is_superuser && (
                  <div className="mt-4 space-y-4">

                    <div className="relative mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        所屬 App 專案 (可多選) *
                      </label>

                      <div
                        className="mt-1 p-2 border border-gray-300 rounded-md bg-white text-sm cursor-pointer min-h-[38px] flex flex-wrap gap-1 items-center justify-between shadow-sm"
                        onClick={() => setIsAppMenuOpen(!isAppMenuOpen)}
                      >
                        <div className="flex flex-wrap gap-1 items-center flex-1">
                          {(newUser.app_id || []).length === 0 && (
                            <span className="block text-sm font-medium text-gray-700">-- 請選擇已存在的應用程式 --</span>
                          )}
                          {(newUser.app_id || []).map(id => {
                            const foundApp = Array.isArray(apps) ? apps.find(a => a.app_id === id) : null;
                            const displayName = foundApp && foundApp.name ? `${foundApp.name} (${id})` : id;
                            return (
                              <span key={id} className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                                {displayName}
                                <button
                                  type="button"
                                  className="text-indigo-400 hover:text-indigo-600 font-bold ml-0.5 text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNewUser({ ...newUser, app_id: (newUser.app_id || []).filter(item => item !== id) });
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                        <div className="text-gray-400 ml-2 px-1">
                          <svg className={`h-4 w-4 transform transition-transform duration-200 ${isAppMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {isAppMenuOpen && (
                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md bg-white shadow-lg border border-gray-200 py-1">
                          {Array.isArray(apps) && apps.map((app) => {
                            const isSelected = (newUser.app_id || []).includes(app.app_id);
                            return (
                              <div
                                key={app.app_id}
                                className={`cursor-pointer select-none p-2.5 text-sm hover:bg-indigo-600 hover:text-white flex justify-between items-center ${isSelected ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-900'
                                  }`}
                                onClick={() => {
                                  let updatedIds = [...(newUser.app_id || [])];
                                  if (isSelected) {
                                    updatedIds = updatedIds.filter(id => id !== app.app_id);
                                  } else {
                                    updatedIds.push(app.app_id);
                                  }
                                  setNewUser({ ...newUser, app_id: updatedIds });
                                  setIsAppMenuOpen(false);
                                }}
                              >
                                <span>{app.name ? `${app.name} (${app.app_id})` : app.app_id}</span>
                                {isSelected && <span className="text-indigo-600 font-bold">✓</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        分配所屬部門 (Department)
                      </label>
                      <select
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                        value={newUser.dept_code || ''}
                        onFocus={() => setIsAppMenuOpen(false)} //  選到部門時，自動收起App多選選單
                        onChange={(e) => setNewUser({ ...newUser, dept_code: e.target.value })}
                        required={!newUser.is_superuser} // 非超級管理員時此欄位必填
                      >
                        <option value="">-- 請選擇部門 --</option>
                        {Array.isArray(departments) && departments.map((dept) => {
                          const displayLabel = `${dept.dept_name_zh} / ${dept.dept_name_en}`;

                          return (
                            <option key={dept.dept_code} value={dept.dept_code}>
                              {displayLabel} ({dept.dept_code})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        管理員級別 (Permission Level) *
                      </label>

                      <div className="flex items-center space-x-6 bg-gray-50 p-3 rounded-md border border-gray-200">
                        <label className="flex items-center cursor-pointer select-none">
                          <input
                            type="radio"
                            name="admin_level"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={newUser.permission_level === 2}
                            onChange={() => setNewUser({ ...newUser, permission_level: 2 })}
                          />
                          <div className="ml-2">
                            <span className="block text-sm font-medium text-gray-900">一般管理員</span>
                            {/* <span className="block text-xs text-gray-500">可檢視與編輯專案資料 (Editor)</span> */}
                          </div>
                        </label>

                        <label className="flex items-center cursor-pointer select-none">
                          <input
                            type="radio"
                            name="admin_level"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={newUser.permission_level === 3}
                            onChange={() => setNewUser({ ...newUser, permission_level: 3 })}
                          />
                          <div className="ml-2">
                            <span className="block text-sm font-medium text-gray-900">高級管理員</span>
                            {/* <span className="block text-xs text-gray-500">具備專案最高權限與帳號管理 (Admin)</span> */}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
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
  ) : null;
  // #endregion

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
                      {user.is_superuser ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          超級管理員
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-600">
                          一般管理員
                        </span>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-semibold text-gray-700">部門：</span>
                        {user.department_code ? (
                          <span>
                            {user.department_code} ({user.department_name_zh} / {user.department_name_en})
                          </span>
                        ) : (
                          <span className="text-gray-400">未分派</span>
                        )}
                      </div>
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
                  <div className="flex items-center justify-end gap-1.5">
                    {/* 1. 啟用/停用按鈕 */}
                    {String(currentUserId) !== String(user.id) && (
                      !(user.is_superuser && user.is_active) ? (
                        <button
                          onClick={() => handleToggleUserActive(user)}
                          className={`transition-colors p-1 rounded bg-gray-50 border border-gray-100 ${user.is_active
                            ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            : 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50'
                            }`}
                          title={user.is_superuser ? "啟用超級管理員" : (user.is_active ? "停用帳號" : "啟用帳號")}
                        >
                          {user.is_active ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                        </button>
                      ) : null
                    )}
                    {/* 2. 提升為超級管理員按鈕 */}
                    {!user.is_superuser && (
                      <button
                        onClick={() => handlePromoteToSuperuser(user)}
                        className="text-amber-600 hover:text-amber-900 bg-gray-50 border border-gray-100 p-1 rounded hover:bg-amber-50 transition-colors"
                        title="提升為超級管理員"
                      >
                        <ShieldAlert className="h-5 w-5" />
                      </button>
                    )}
                    {/* 3. 刪除使用者按鈕 */}
                    {String(currentUserId) !== String(user.id) && !user.is_superuser && (
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="text-red-500 hover:text-red-900 hover:bg-red-50 bg-gray-50 border border-gray-100 p-1 rounded transition-colors"
                        title="刪除使用者"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {createUserModal}
    </div>
  );
};

export default UserManagement;