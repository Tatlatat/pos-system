'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'OWNER'] },
  { href: '/pos', label: 'POS Bán hàng', icon: '💳', roles: ['CASHIER', 'BRANCH_MANAGER'] },
  { href: '/products', label: 'Sản phẩm', icon: '📦', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_STAFF'] },
  { href: '/inventory', label: 'Kho hàng', icon: '🏭', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_STAFF'] },
  { href: '/suppliers', label: 'Nhà cung cấp', icon: '🚚', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_STAFF'] },
  { href: '/customers', label: 'Khách hàng', icon: '👤', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
  { href: '/reports', label: 'Báo cáo', icon: '📈', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'OWNER'] },
  { href: '/admin', label: 'Quản trị', icon: '⚙️', roles: ['SUPER_ADMIN'] },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const allowedItems = navItems.filter(
    (item) => user && item.roles.includes(user.role),
  );

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-30 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out',
          collapsed ? '-translate-x-full lg:translate-x-0 lg:w-16' : 'translate-x-0 w-64',
        )}
      >
        {/* Logo */}
        <div className={cn(
          'p-4 border-b border-gray-200 flex items-center',
          collapsed ? 'justify-center' : 'justify-between',
        )}>
          {collapsed ? (
            <span className="text-xl font-bold text-blue-600">P</span>
          ) : (
            <>
              <div>
                <h1 className="text-lg font-bold text-blue-600">POS System</h1>
                <p className="text-xs text-gray-500 mt-1 truncate max-w-36">{user?.fullName}</p>
              </div>
              <button onClick={onToggle} className="p-1 hover:bg-gray-100 rounded lg:block hidden" title="Thu gọn">
                ◀
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {allowedItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { if (window.innerWidth < 1024) onToggle(); }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  collapsed ? 'justify-center' : '',
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50',
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className="text-lg">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle for desktop */}
        {!collapsed && (
          <div className="p-2 border-t border-gray-200 lg:hidden block" />
        )}

        {/* Logout */}
        <div className={cn('p-3 border-t border-gray-200', collapsed ? 'flex justify-center' : '')}>
          <button
            onClick={logout}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 w-full transition-colors',
              collapsed ? 'justify-center' : '',
            )}
            title="Đăng xuất"
          >
            <span className="text-lg">🚪</span>
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center p-3 border-t border-gray-200 text-gray-400 hover:text-gray-600"
            title="Mở rộng"
          >
            ▶
          </button>
        )}
      </aside>
    </>
  );
}
