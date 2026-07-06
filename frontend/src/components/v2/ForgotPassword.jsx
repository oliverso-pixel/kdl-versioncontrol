import { useState } from "react";
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../services/api';

export default function ForgotPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: "", text: "" });

        try {
            const res = await api.forgotPassword(email);

            console.log("後端回應:", res);
            setMessage({
                type: "success",
                text: res.detail || `已寄送重設密碼請求。`
            });
        } catch (err) {
            console.error("發送失敗:", err);
            setMessage({ type: "error", text: err.message || "發送失敗，請稍後再試。" });
        } finally {
            setLoading(false);
        }
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setMessage({ type: "error", text: "兩次輸入的密碼不一致。" });
            return;
        }

        setLoading(true);
        setMessage({ type: "", text: "" });

        try {
            // 呼叫更新後的 api 方法
            const res = await api.resetPassword(token, password);

            console.log("密碼重設成功:", res);
            setMessage({
                type: "success",
                text: res.detail || "密碼重設成功！請點擊下方連結返回登入頁面重新登入。"
            });

            setPassword("");
            setConfirmPassword("");
        } catch (err) {
            console.error("重設密碼失敗:", err);
            const backendErrorDetail = err.response?.data?.detail; 
            
            setMessage({
                type: "error",
                text: backendErrorDetail || err.message || "重設失敗，連結可能已失效或過期。"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
            <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-md">

                {/* 標題切換：成功後顯示完成標題 */}
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                    {message.type === "success"
                        ? "處理完成"
                        : (!token ? "忘記密碼" : "重設您的密碼")}
                </h2>

                <p className="text-xs text-gray-500 mb-4">
                    {message.type === "success"
                        ? "請依照下方提示進行下一步。"
                        : (!token ? "請輸入管理員 Email，系統將向您發送重設連結。" : "請為您的後台帳號設定一組新密碼。")}
                </p>

                {/* 統一提示訊息區塊 */}
                {message.text && (
                    <div className={`mb-4 p-3 rounded text-sm font-medium ${message.type === "success"
                        ? "bg-green-50 text-green-800 border border-green-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                        }`}>
                        {message.text}
                    </div>
                )}

                {/* ---------------- 模式 A：發送 Email (無 Token) ---------------- */}
                {!token ? (
                    message.type !== "success" ? (
                        <form onSubmit={handleForgotSubmit} className="space-y-4">
                            <input
                                type="email"
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                placeholder="請輸入註冊的 Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded transition disabled:opacity-50"
                            >
                                {loading ? "處理中..." : "寄送重設連結"}
                            </button>
                        </form>
                    ) : (
                        <div className="text-center py-4 text-sm text-gray-600">
                            請至您的 <span className="font-semibold text-indigo-600">{email}</span> 信箱收信。
                        </div>
                    )
                ) : (
                    /* ---------------- 模式 B：輸入新密碼 (有 Token) ---------------- */
                    message.type !== "success" ? (
                        <form onSubmit={handleResetSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">新密碼</label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    placeholder="請輸入至少 8 位數新密碼"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">確認新密碼</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    placeholder="請再次輸入新密碼"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={loading}
                                />
                                {confirmPassword && password !== confirmPassword && (
                                    <span className="text-xs text-red-500 mt-1 block">密碼與確認密碼不符</span>
                                )}
                            </div>
                            <button
                                type="submit"
                                disabled={loading || (confirmPassword !== "" && password !== confirmPassword)}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded transition disabled:opacity-50"
                            >
                                {loading ? "更新中..." : "確認重設密碼"}
                            </button>
                        </form>
                    ) : null
                )}

                <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                    <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
                        ← 返回登入頁面
                    </Link>
                </div>

            </div>
        </div>
    );
}