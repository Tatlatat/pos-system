'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Toaster, toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();
  const redirectRef = useRef<ReturnType<typeof setTimeout>>();

  // Already logged in → redirect (inside useEffect, not during render)
  useEffect(() => {
    if (user) {
      const dest = user.role === 'CASHIER' ? '/pos' : user.role === 'INVENTORY_STAFF' ? '/inventory' : '/dashboard';
      router.replace(dest);
    }
    // Cleanup redirect timeout on unmount
    return () => {
      if (redirectRef.current) clearTimeout(redirectRef.current);
    };
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    try {
      const userData = await login(email, password);
      toast.success(`👋 Xin chào ${userData.fullName}!`);
      // Small delay for toast to show, then redirect
      const dest = userData.role === 'CASHIER' ? '/pos' : userData.role === 'INVENTORY_STAFF' ? '/inventory' : '/dashboard';
      redirectRef.current = setTimeout(() => router.replace(dest), 400);
    } catch (error: any) {
      const msg = error.response?.status === 401 || error.response?.status === 400
        ? 'Sai email hoặc mật khẩu'
        : 'Lỗi kết nối máy chủ';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-900 p-4">
      <Toaster position="top-center" richColors />
      <div className="bg-white p-6 lg:p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">POS & Inventory</h1>
          <p className="text-gray-500 mt-1 text-sm">Hệ thống Quản lý Bán hàng & Kho vận</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              placeholder="admin@pos.com"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors font-medium text-base"
          >
            {loading ? '⏳ Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 font-medium mb-2">Tài khoản demo:</p>
          <div className="text-xs text-gray-400 space-y-0.5">
            <p>Admin: admin@pos.com / password123</p>
            <p>Manager: manager@pos.com / password123</p>
            <p>Cashier: cashier1@pos.com / password123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
