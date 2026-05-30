'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';

interface DashData {
  today: { revenue: number; invoiceCount: number; averageOrderValue: number; };
  inventory: { totalValue: number; retailValue: number; lowStockCount: number; totalProducts: number; };
  operations: { activeCashiers: number; };
  recentSales: any[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const r = await apiClient.get('/dashboard');
      setData(r.data); setError('');
    } catch { setError('Lỗi tải dashboard'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-40" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-lg" />)}
      </div>
    </div>
  );
  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 mb-3">{error}</p>
      <button onClick={load} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Thử lại</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">Dashboard</h1>
        <span className="text-xs text-gray-400">⏱ Tự động cập nhật 30s</span>
      </div>

      {data && (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Doanh thu hôm nay" value={formatCurrency(Number(data.today.revenue))} color="green" />
            <StatCard title="Hóa đơn" value={String(data.today.invoiceCount)} sub={`TB ${formatCurrency(Number(data.today.averageOrderValue))}`} color="blue" />
            <StatCard title="Giá trị tồn kho" value={formatCurrency(Number(data.inventory.totalValue))} sub={`${data.inventory.totalProducts} SP`} color="purple" />
            <StatCard title="⚠️ Tồn thấp" value={String(data.inventory.lowStockCount)} sub="Cần nhập hàng" color="red" />
          </div>

          {/* Recent Sales */}
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b font-semibold text-sm">Hóa đơn gần đây</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Hóa đơn</th>
                    <th className="text-left p-3">Thu ngân</th>
                    <th className="text-left p-3">SL</th>
                    <th className="text-right p-3">Tổng tiền</th>
                    <th className="text-right p-3">Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales?.map((sale: any) => (
                    <tr key={sale.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs">{sale.invoiceNo}</td>
                      <td className="p-3">{sale.cashier?.fullName}</td>
                      <td className="p-3">{sale.totalQuantity || 0}</td>
                      <td className="p-3 text-right font-medium">{formatCurrency(Number(sale.totalAmount))}</td>
                      <td className="p-3 text-right text-xs text-gray-400">{new Date(sale.createdAt).toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                  {(data.recentSales?.length || 0) === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">Chưa có hóa đơn</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, sub, color = 'gray' }: { title: string; value: string; sub?: string; color?: string }) {
  const c: Record<string, string> = {
    green: 'bg-green-50 border-green-200', blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200', red: 'bg-red-50 border-red-200',
    gray: 'bg-white',
  };
  return (
    <div className={`p-3 lg:p-4 rounded-lg border ${c[color] || c.gray}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-base lg:text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
