import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const AutoLogoutProvider = ({ children }) => {
    const navigate = useNavigate();
    const timeoutRef = useRef(null);
    //30 分鐘的非活動時間（以毫秒為單位）
    const INACTIVITY_TIME = 30 * 60 * 1000; 

    const handleAutoLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('apiMode');
        localStorage.removeItem('isSuperuser');
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        alert("您已經超過 30 分鐘沒有操作，將自動登出。");
        window.location.href = '/login?reason=timeout';
    };

    const resetTimer = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(handleAutoLogout, INACTIVITY_TIME);
    };

    useEffect(() => {
        const isLoggedIn = !!localStorage.getItem('apiMode');

        if (isLoggedIn) {
            resetTimer();

            const events = ['mousemove', 'mousedown', 'click', 'scroll', 'keypress', 'touchstart'];

            events.forEach(event => {
                window.addEventListener(event, resetTimer);
            });

            return () => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                events.forEach(event => {
                    window.removeEventListener(event, resetTimer);
                });
            };
        }
    }, [navigate]);

    return <>{children}</>;
};

export default AutoLogoutProvider;