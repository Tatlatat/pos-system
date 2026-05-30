'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import apiClient from '@/lib/api-client';

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/users')
      .then((res) => setUsers(res.data.data || []))
      .catch(() => toast.error('Không thể tải danh sách người dùng'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-20" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Quản trị hệ thống</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Người dùng</h2>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Tên</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Vai trò</th>
                <th className="text-center p-2">Hoạt động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.fullName}</td>
                  <td className="p-2 text-xs">{u.email}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                      {u.role}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${u.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Audit Log</h2>
          <p className="text-gray-400 text-sm text-center py-8">
            Xem audit log tại API endpoint /api/audit
          </p>
        </div>
      </div>
    </div>
  );
}
