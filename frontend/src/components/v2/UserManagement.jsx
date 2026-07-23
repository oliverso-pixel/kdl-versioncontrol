import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Mail, Clock, Unlock, Lock, ShieldAlert, ChevronDown, Settings } from 'lucide-react';
import api from '../../services/api';

const UserManagement = () => {
  const currentUserId = localStorage.getItem('userId');
  const isSuperuser = localStorage.getItem('isSuperuser') === 'true';
  const departmentCode = localStorage.getItem('departmentCode');
  const permissionLevel = parseInt(localStorage.getItem('permissionLevel') || '1', 10);
  const hasManagePermission = isSuperuser || permissionLevel >= 3;
  const isCurrentUser = (id) => String(currentUserId) === String(id);
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    is_superuser: false,
    app_id: [],
    permission_level: 2,
    dept_code: departmentCode
  });
  const [apps, setApps] = useState([]);
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [isDeptSelectOpen, setIsDeptSelectOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedAppIds, setSelectedAppIds] = useState([]);

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

    if (!hasManagePermission) {
      alert('您沒有權限建立新使用者，請聯絡管理員！');
      return;
    }

    if (!newUser.username || !newUser.password || !newUser.email) {
      alert('請填寫完整的帳號、密碼與電子郵件！');
      return;
    }

    if (!newUser.is_superuser && (!newUser.app_id || newUser.app_id.trim().length === 0)) {
      alert('請至少選擇一個所屬 App 專案！');
      return;
    }

    if (!newUser.is_superuser && !newUser.dept_code) {
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
      setNewUser({ username: '', password: '', email: '', is_superuser: false, dept_code: '', app_id: [], permission_level: 2 });
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

  const handlePromotionORDemotion = async (user) => {
    const isCurrentlyPromoted = user.permission_level === 3;

    let action = "promote";
    let confirmMessage = `確定要將使用者「${user.username}」提升為高級管理員嗎？`;

    if (isCurrentlyPromoted) {
      if (!isSuperuser) {
        alert("權限不足，只有超級管理員可以將他人降職！");
        return;
      }
      action = "demote";
      confirmMessage = `確定要將管理員「${user.username}」降職嗎？`;
    }

    const proceed = window.confirm(confirmMessage);
    if (!proceed) return;

    try {
      await api.updateUserPermission(user.id, action);

      alert(action === "promote" ? `已成功提升「${user.username}」！` : `已成功降職「${user.username}」！`);
      if (typeof fetchUsers === 'function') fetchUsers();
    } catch (err) {
      console.error('權限變更失敗:', err);
      alert(err.response?.data?.detail || '操作失敗，請檢查權限。');
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '從未登入';

    let formattedString = dateString;

    if (typeof dateString === 'string' && !dateString.endsWith('Z')) {
      formattedString = dateString + 'Z';
    }

    return new Date(formattedString).toLocaleString('zh-HK');
  };

  const handleEditAppPermissions = (user) => {
    setEditingUser(user);
    setSelectedAppIds(user.app_id || []);
    setIsPermissionModalOpen(true);
  };

  const handleCheckboxChange = (appId) => {
    setSelectedAppIds((prev) =>
      prev.includes(appId)
        ? prev.filter((id) => id !== appId)
        : [...prev, appId]
    );
  };

  const getUserPermissionLevel = (user) => Number(user.permission_level ?? 0);

  const canManageTargetUser = (user) => {
    if (!hasManagePermission || isCurrentUser(user.id) || user.is_superuser) return false;
    if (isSuperuser) return true;
    return permissionLevel > getUserPermissionLevel(user);
  };

  const canEditUserAppPermissions = (user) =>
    isSuperuser || (permissionLevel >= 3 && permissionLevel > getUserPermissionLevel(user));

  const canToggleUserActive = (user) => canEditUserAppPermissions(user);

  const canChangeUserPermission = (user) =>
    isSuperuser || (permissionLevel >= 3 && permissionLevel > getUserPermissionLevel(user));

  const handleSavePermissions = async () => {
    if (!editingUser) return;

    try {
      await api.updateUserAppPermissions(editingUser.id, selectedAppIds);
      setIsPermissionModalOpen(false);
      setEditingUser(null);

      if (typeof fetchUsers === 'function') {
        await fetchUsers();
      }

      alert("用戶 App 權限已成功更新！");
    } catch (err) {
      console.error("更新 App 權限失敗:", err);
      const errorDetail = err.response?.data?.detail || err.message || '請稍後再試。';
      alert(`更新失敗：${errorDetail}`);
    }
  };

  const filteredUsers = (users || []).filter((user) => {
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return true;
    return (
      (user.username || '').toLowerCase().includes(q) ||
      (user.email || '').toLowerCase().includes(q) ||
      String(user.department_code || '').toLowerCase().includes(q)
    );
  });

  // #region 新增使用者 Modal
  const createUserModal = showCreateModal ? (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-3xl text-left overflow-visible shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full max-h-[calc(100vh-4rem)] overflow-y-auto">
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
                    className="form-input"
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
                    className="form-input"
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
                    className="form-input"
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
                          <ChevronDown className={`h-4 w-4 transform transition-transform duration-200 ${isAppMenuOpen ? 'rotate-180' : ''}`} />
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

                    {isSuperuser ? (
                      <div className="w-full">
                        <label className="block text-sm font-medium text-gray-700">
                          分配所屬部門 (Department)
                        </label>
                        <div className="relative w-full mt-1">
                          <select
                            className="form-select"
                            value={newUser.dept_code || departmentCode}
                            onFocus={() => {
                              setIsAppMenuOpen(false);
                              setIsDeptSelectOpen(true);
                            }}
                            onBlur={() => setIsDeptSelectOpen(false)}
                            onChange={(e) => {
                              setNewUser({ ...newUser, dept_code: e.target.value });
                              setIsDeptSelectOpen(false);
                              e.target.blur();
                            }}
                            required={!newUser.is_superuser}
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
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                            <ChevronDown
                              className={`h-4 w-4 transform transition-transform duration-200 ${isDeptSelectOpen ? 'rotate-180' : 'rotate-0'
                                }`}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
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
                className="modal-primary-button"
              >
                建立
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="modal-secondary-button"
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
        {hasManagePermission && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            新增使用者
          </button>
        )}
      </div>

      {/* 搜尋欄 */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜尋使用者、Email、部門代碼..."
          className="form-input w-full max-w-md"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="ml-2 px-3 py-2 bg-gray-100 rounded border border-gray-200 text-sm">清除</button>
        )}
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
            {filteredUsers.map((user) => (
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
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          超級管理員
                        </span>
                      ) : user.permission_level === 3 ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                          高級管理員
                        </span>
                      ) : user.permission_level === 2 ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          一般管理員
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-600">
                          普通用戶
                        </span>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {user.department_code ? (
                          <span className="font-semibold text-gray-700">
                            部門：{user.department_code} ({user.department_name_zh} / {user.department_name_en})
                          </span>
                        ) : (
                          null
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
                {/* 操作欄位  */}
                {canManageTargetUser(user) && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1.5">

                      {/* 變更 App 權限按鈕 */}
                      {canEditUserAppPermissions(user) && (
                        <button
                          onClick={() => handleEditAppPermissions(user)}
                          className="transition-colors p-1 rounded bg-gray-50 border border-gray-100 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100"
                          title="變更 App 權限"
                        >
                          <Settings className="h-5 w-5" />
                        </button>
                      )}

                      {/* 啟用/停用按鈕 */}
                      {canToggleUserActive(user) && (
                        <button
                          onClick={() => handleToggleUserActive(user)}
                          className={`transition-colors p-1 rounded bg-gray-50 border border-gray-100 ${user.is_active
                            ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                            : 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50'
                            }`}
                          title={user.is_active ? "停用帳號" : "啟用帳號"}
                        >
                          {user.is_active ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                        </button>
                      )}

                      {/* 變更權限管理按鈕（支援提升與降職） */}
                      {canChangeUserPermission(user) && (
                        user.permission_level < 3 ? (
                          <button
                            onClick={() => handlePromotionORDemotion(user)}
                            className="text-amber-600 hover:text-amber-900 bg-gray-50 border border-gray-100 p-1 rounded hover:bg-amber-50 transition-colors"
                            title="提升為高級管理員"
                          >
                            <ShieldAlert className="h-5 w-5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePromotionORDemotion(user)}
                            className="text-rose-600 hover:text-rose-900 bg-gray-50 border border-gray-100 p-1 rounded hover:bg-rose-50 transition-colors"
                            title="解除高級管理員身份"
                          >
                            <ShieldAlert className="h-5 w-5" />
                          </button>
                        )
                      )}

                      {/* 刪除使用者按鈕 */}
                      {isSuperuser && (
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 變更App權限區域 */}
      {isPermissionModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-fade-in">

            {/* 彈窗標題 */}
            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900">修改 App 存取權限</h3>
              <p className="text-sm text-gray-500 mt-1">
                正在編輯使用者：<span className="font-semibold text-gray-700">{editingUser.username}</span>
              </p>
            </div>

            {/* App 列表複選框區域 */}
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3 space-y-2 mb-6 bg-gray-50">
              {Array.isArray(apps) && apps.length > 0 ? (
                apps.map((app) => (
                  <label
                    key={app.app_id}
                    className="app-option"
                  >
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={selectedAppIds.includes(app.app_id)}
                      onChange={() => handleCheckboxChange(app.app_id)}
                    />
                    <div className="text-sm">
                      <p className="app-name">{app.name || app.app_name}</p>
                      <p className="app-id">{app.app_id}</p>
                    </div>
                  </label>
                ))
              ) : (
                <p className="app-empty">無可用的 App 列表</p>
              )}
            </div>

            {/* 按鈕操作區域 */}
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsPermissionModalOpen(false);
                  setEditingUser(null);
                }}
                className="permission-modal-secondary-button"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                className="permission-modal-primary-button"
              >
                確認儲存
              </button>
            </div>

          </div>
        </div>
      )}
      {createUserModal}
    </div>
  );
};

export default UserManagement;