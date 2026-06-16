import React, { useState, useEffect } from 'react';
import { Package, GitBranch, Smartphone, Activity } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalApps: 0,
    totalVersions: 0,
    activeDevices: 0,
    todayChecks: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setStats({
        totalApps: 3,
        totalVersions: 12,
        activeDevices: 156,
        todayChecks: 1024,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-md p-3 ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">儀表板</h1>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="應用程式總數"
          value={stats.totalApps}
          icon={Package}
          color="bg-blue-500"
        />
        <StatCard
          title="版本總數"
          value={stats.totalVersions}
          icon={GitBranch}
          color="bg-green-500"
        />
        <StatCard
          title="活躍設備"
          value={stats.activeDevices}
          icon={Smartphone}
          color="bg-yellow-500"
        />
        <StatCard
          title="今日檢查次數"
          value={stats.todayChecks}
          icon={Activity}
          color="bg-purple-500"
        />
      </div>
    </div>
  );
};

export default Dashboard;