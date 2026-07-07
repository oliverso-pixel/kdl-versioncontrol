import React, { useState } from 'react';
import api from '../../services/api';
import { Link } from 'react-router-dom';

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
      let data, isSuper = false;

      if (mode === 'v1') {
        data = await api.login(apiKey);
        localStorage.setItem('apiMode', 'v1');
        localStorage.setItem('isSuperuser', 'false');
        localStorage.setItem('userId', 'V1_API_KEY_USER');
        localStorage.setItem('userName', `API_KEY_${apiKey.substring(0, 4)}...`);
      } else {
        data = await api.loginV2(username, password);
        isSuper = Boolean(data.user?.is_superuser);
        localStorage.setItem('apiMode', 'v2');
        localStorage.setItem('isSuperuser', isSuper ? 'true' : 'false');
        localStorage.setItem('userId', String(data.user?.user_id || ''));
        localStorage.setItem('userName', data.user?.user_name || '');
      }

      onLogin(data.access_token, mode, isSuper);
    } catch (err) {
      console.error("登入失敗:", err);

      if (err.response?.status === 403) {
        setError('權限不足，請確認帳號是否為 superuser');
      } else if (err.message) {
        if (err.message === "ACCOUNT_LOCKED_MAX_ATTEMPTS") {
          setError("帳號已被系統停用，請聯繫管理員或自行重設密碼。");
        }
        else if (err.message.startsWith("INVALID_PASSWORD_REMAINING_")) {
          const remaining = err.message.split("_").pop();
          setError(`帳號或密碼錯誤（剩餘嘗試次數：${remaining} 次）`);
        }
        else {
          setError(err.message);
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
          <div className="flex justify-center mt-4 space-x-2">
            <button onClick={() => setMode('v1')} className={`px-4 py-1 rounded ${mode === 'v1' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>V1 (API Key)</button>
            <button onClick={() => setMode('v2')} className={`px-4 py-1 rounded ${mode === 'v2' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>V2 (帳號密碼)</button>
          </div>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {mode === 'v1' ? (
            <input type="password" required className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          ) : (
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
          )}
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