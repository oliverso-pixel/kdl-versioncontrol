import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthUser from '../../models/AuthUser'; 

const Login = ({ onLogin }) => {
  const [mode, setMode] = useState('v2');
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let loggedInUser;

      if (mode === 'v1') {
        loggedInUser = await AuthUser.loginWithApiKey(apiKey);
      } else {
        loggedInUser = await AuthUser.loginWithCredentials(username, password);
      }

      onLogin(loggedInUser.token, loggedInUser.apiMode, loggedInUser.isSuperuser);
      
    } catch (err) {
      console.error("登入失敗:", err);

      const serverMessage = err.response?.data?.detail || err.message || '';

      if (err.response?.status === 403) {
        setError('權限不足，請確認帳號是否為 superuser');
      } else if (serverMessage) {
        // 💡 比對後端回傳的特定錯誤代碼
        if (serverMessage === "ACCOUNT_LOCKED_MAX_ATTEMPTS") {
          setError("帳號已被系統停用，請聯繫管理員或自行重設密碼。");
        }
        else if (serverMessage.startsWith("INVALID_PASSWORD_REMAINING_")) {
          const remaining = serverMessage.split("_").pop();
          setError(`帳號或密碼錯誤（剩餘嘗試次數：${remaining} 次）`);
        }
        else {
          setError(serverMessage === "帳號或密碼錯誤" ? "帳號或密碼錯誤，請重新輸入" : serverMessage);
        }
      } else {
        setError('帳號或密碼錯誤，請重新輸入');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">版本控制中心</h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="帳號 (Username)" value={username} onChange={(e) => setUsername(e.target.value)} />
              <input type="password" required className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="密碼 (Password)" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="flex justify-end mt-2">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  忘記密碼？
                </Link>
              </div>
            </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
            {loading ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
};
export default Login;