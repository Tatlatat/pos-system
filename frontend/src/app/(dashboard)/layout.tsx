'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/layout/Sidebar';
import { cn } from '@/lib/utils';

const routePermissions = [
  { href: '/dashboard', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'OWNER'] },
  { href: '/pos', roles: ['CASHIER', 'BRANCH_MANAGER'] },
  { href: '/products', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_STAFF'] },
  { href: '/inventory', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_STAFF'] },
  { href: '/suppliers', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'INVENTORY_STAFF'] },
  { href: '/customers', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'CASHIER'] },
  { href: '/reports', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'OWNER'] },
  { href: '/admin', roles: ['SUPER_ADMIN'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // collapsed by default on mobile

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else {
        // Route guard check
        const matchingRoute = routePermissions.find(r => pathname.startsWith(r.href));
        if (matchingRoute && !matchingRoute.roles.includes(user.role)) {
          // Find first allowed page for this role
          const firstAllowed = routePermissions.find(r => r.roles.includes(user.role));
          if (firstAllowed) {
            router.replace(firstAllowed.href);
            return;
          }
        }
        
        setReady(true);
        // Auto-expand sidebar on desktop
        if (window.innerWidth >= 1024) {
          setSidebarCollapsed(false);
        }
      }
    }
  }, [user, loading, router, pathname]);

  if (loading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main content */}
      <div className={cn(
        'flex-1 flex flex-col min-h-screen transition-all duration-300',
        sidebarCollapsed ? 'lg:ml-0' : 'lg:ml-0',
      )}>
        {/* Top bar (mobile) */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <span className="text-xl">☰</span>
          </button>
          <h1 className="font-bold text-blue-600">POS System</h1>
          <div className="ml-auto text-xs text-gray-500 truncate max-w-24">{user?.fullName}</div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-3 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
