import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, AlertCircle, X } from 'lucide-react';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(false);

  const addNotification = (type, message) => {
    const notification = {
      id: Date.now(),
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    
    setNotifications(prev => [notification, ...prev].slice(0, 50));
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 overflow-hidden">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">通知中心</h3>
            <div className="flex items-center">
              {connected ? (
                <span className="flex items-center text-sm text-green-600">
                  <span className="w-2 h-2 bg-green-600 rounded-full mr-2"></span>
                  已連接
                </span>
              ) : (
                <span className="flex items-center text-sm text-red-600">
                  <span className="w-2 h-2 bg-red-600 rounded-full mr-2"></span>
                  未連接
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              暫無通知
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {notifications.map((notification) => (
                <li key={notification.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      {notification.type === 'success' && (
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      )}
                      {notification.type === 'error' && (
                        <AlertCircle className="h-5 w-5 text-red-400" />
                      )}
                      {notification.type === 'info' && (
                        <Bell className="h-5 w-5 text-blue-400" />
                      )}
                    </div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-gray-900">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <button
                        onClick={() => removeNotification(notification.id)}
                        className="inline-flex text-gray-400 hover:text-gray-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;