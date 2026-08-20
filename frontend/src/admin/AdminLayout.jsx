import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminAuth } from './context/AdminAuthContext';
import './admin.css';

// Sidebar navigation items
const sidebarItems = [
  { id: 'command-centre', label: 'Command Centre', icon: 'command' },
  { id: 'companies', label: 'Companies', icon: 'companies' },
  { id: 'jobseekers', label: 'Job Seekers', icon: 'jobseekers' },
  { id: 'verification-queue', label: 'Verification Queue', icon: 'verification' },
  { id: 'scam-reports', label: 'Scam Reports', icon: 'scam' },
  { id: 'agents', label: 'Agents', icon: 'agents' },
  { id: 'revenue', label: 'Revenue', icon: 'revenue' },
  { id: 'plan-control', label: 'Plan Control', icon: 'plan' },
  { id: 'support-tickets', label: 'Support Tickets', icon: 'support' },
  { id: 'announcements', label: 'Announcements', icon: 'announcements' },
  { id: 'system-health', label: 'System Health', icon: 'health' },
  { id: 'ai-assistant', label: 'AI Assistant', icon: 'ai' }
];

function AdminLayout({ children, active }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { admin, logout } = useAdminAuth();
  const location = useLocation();

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="admin-shell-v2">
      {/* Mobile hamburger menu */}
      <button className="admin-mobile-menu" onClick={toggleSidebar}>
        <span className="icon">☰</span>
      </button>

      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-logo">
          <div className="admin-sidebar-logo-mark">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
            </svg>
          </div>
          <div>
            <div className="admin-sidebar-logo-title">ClearCall</div>
            <div className="admin-sidebar-logo-subtitle">Super Admin</div>
          </div>
        </div>

        <div className="admin-sidebar-nav">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              className={`admin-sidebar-link ${active === item.id ? 'active' : ''}`}
              onClick={() => {
                if (sidebarOpen) toggleSidebar();
              }}
            >
              <span className="admin-sidebar-link-icon">{item.icon}</span>
              <span className="admin-sidebar-link-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-profile">
            <div className="admin-sidebar-avatar">
              {admin?.email?.charAt(0).toUpperCase()}
              <div className="admin-sidebar-online-dot" />
            </div>
            <div>
              <div className="admin-sidebar-profile-name">{admin?.name || 'Admin'}</div>
              <div className="admin-sidebar-profile-title">Super Admin</div>
            </div>
          </div>
          <div className="admin-sidebar-email">{admin?.email}</div>
          <button className="admin-sidebar-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="admin-sidebar-overlay" onClick={toggleSidebar} />}

      {/* Main content */}
      <div className="admin-main">
        {children}
      </div>
    </div>
  );
}

export default AdminLayout;
