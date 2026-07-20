import React, { useState, useEffect } from 'react';
import { 
  Home, Package, GitBranch, Smartphone, Users,
  FileText, Settings, LogOut, Menu, Bell
} from 'lucide-react';
import Login from './components/Auth/Login';
import Dashboard from './components/Dashboard/Dashboard';
// import ApplicationManagement from './components/Applications/ApplicationManagement';
// import BranchManagement from './components/Branches/BranchManagement';
// import VersionManagement from './components/Versions/VersionManagement';
import DeviceMonitoring from './components/Devices/DeviceMonitoring';
import UpdateLogs from './components/Logs/UpdateLogs';
import SystemSettings from './components/Settings/SystemSettings';
import NotificationCenter from './components/Notifications/NotificationCenter';
import StoreManagement from './components/Store/StoreManagement';
import UserManagement from './components/User/UserManagement';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [apiMode, setApiMode] = useState(localStorage.getItem('apiMode') || 'v1');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (token, mode) => {
    setIsAuthenticated(true);
    setApiMode(mode);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const navigation = apiMode === 'v1' ? [
    { name: '儀表板', icon: Home, view: 'dashboard' },
    // { name: '應用程式管理', icon: Package, view: 'applications' },
    // { name: '分支管理', icon: GitBranch, view: 'branches' },
    // { name: '版本管理', icon: GitBranch, view: 'versions' },
    { name: '設備監控', icon: Smartphone, view: 'devices' },
    { name: '系統設定', icon: Settings, view: 'settings' },
  ] : [
    { name: '儀表板', icon: Home, view: 'dashboard' },
    { name: '企業商城 (App/版控)', icon: Package, view: 'store' },
    { name: '設備監控', icon: Smartphone, view: 'devices' },
    { name: '帳號管理', icon: Users, view: 'users' },
    { name: '系統設定', icon: Settings, view: 'settings' },
  ];

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      // case 'applications':
      //   return <ApplicationManagement />;
      // case 'branches':
      //   return <BranchManagement />;
      // case 'versions':
      //   return <VersionManagement />;
      case 'devices': return <DeviceMonitoring />;
      case 'logs': return <UpdateLogs />;
      case 'settings': return <SystemSettings />;
      case 'store': return <StoreManagement />;
      case 'users': return <UserManagement />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-800 transition-all duration-300`}>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4">
            <h2 className={`text-white font-semibold ${sidebarOpen ? 'block' : 'hidden'}`}>
              版本控制中心
            </h2>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-gray-300 hover:text-white"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => (
              <button
                key={item.name}
                onClick={() => setCurrentView(item.view)}
                className={`${
                  currentView === item.view
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                } group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full`}
              >
                <item.icon className="mr-3 h-6 w-6 flex-shrink-0" />
                <span className={sidebarOpen ? 'block' : 'hidden'}>{item.name}</span>
              </button>
            ))}
          </nav>

          <div className="p-4">
            <button
              onClick={handleLogout}
              className="text-gray-300 hover:bg-gray-700 hover:text-white group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full"
            >
              <LogOut className="mr-3 h-6 w-6 flex-shrink-0" />
              <span className={sidebarOpen ? 'block' : 'hidden'}>登出</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">

        <div className="bg-white shadow-sm px-8 py-4 flex justify-end">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="text-gray-500 hover:text-gray-700"
          >
            <Bell className="h-6 w-6" />
          </button>
        </div>

        <main className="p-8">
          {renderContent()}
        </main>
      </div>

      {/* Notification Center */}
      {showNotifications && <NotificationCenter />}
    </div>
  );
}

export default App;