'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import apiClient from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('daily');
  const [daily, setDaily] = useState<any>(null);
  const [profit, setProfit] = useState<any>(null);
  const [inventory, setInventory] = useState<any>(null);
  const [loading, setLoading] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(activeTab);
      const calls: Record<string, Promise<any>> = {};
      if (activeTab === 'daily' && !daily) calls.daily = apiClient.get('/reports/daily-sales');
      if (activeTab === 'profit' && !profit) calls.profit = apiClient.get('/reports/profit');
      if (activeTab === 'inventory' && !inventory) calls.inventory = apiClient.get('/reports/inventory-valuation');
      const results = await Promise.all(Object.values(calls));
      const keys = Object.keys(calls);
      keys.forEach((k, i) => {
        if (k === 'daily') setDaily(results[i]?.data);
        if (k === 'profit') setProfit(results[i]?.data);
        if (k === 'inventory') setInventory(results[i]?.data);
      });
    } catch { /* */ } finally { setLoading(''); }
  }, [activeTab, daily, profit, inventory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl lg:text-2xl font-bold">Báo cáo</h1>

      <div className="flex gap-1 border-b overflow-x-auto">
        {[
          { id: 'daily', label: 'Doanh thu' },
          { id: 'profit', label: 'Lợi nhuận' },
          { id: 'inventory', label: 'Tồn kho' },
          { id: 'cashier', label: 'Thu ngân' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-3 lg:px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-gray-400 py-8">⏳ Đang tải...</div>}

      {/* 📊 Daily Sales */}
      {activeTab === 'daily' && daily && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Hóa đơn" value={String(daily.summary.totalInvoices)} />
            <StatCard title="Doanh thu" value={formatCurrency(daily.summary.totalRevenue)} color="green" />
            <StatCard title="Giá vốn" value={formatCurrency(daily.summary.totalCost)} color="orange" />
            <StatCard title="Lợi nhuận" value={formatCurrency(daily.summary.totalProfit)} color="blue" />
          </div>
          {daily.paymentBreakdown && Object.keys(daily.paymentBreakdown).length > 0 && (
            <div className="bg-white p-4 rounded-lg border">
              <h3 className="font-semibold text-sm mb-3">Phương thức thanh toán</h3>
              {Object.entries(daily.paymentBreakdown).map(([m, a]: any) => (
                <div key={m} className="flex justify-between text-sm"><span>{m}</span><span className="font-medium">{formatCurrency(a)}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 💰 Profit */}
      {activeTab === 'profit' && profit && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard title="Tổng doanh thu" value={formatCurrency(profit.summary.totalRevenue)} color="green" />
            <StatCard title="Tổng chi phí (COGS)" value={formatCurrency(profit.summary.totalCost)} color="orange" />
            <StatCard title="Lợi nhuận ròng" value={formatCurrency(profit.summary.totalProfit)} color="blue" />
          </div>
          {profit.daily?.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-3 border-b font-semibold text-sm">Chi tiết theo ngày</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr><th className="p-2 text-left">Ngày</th><th className="p-2 text-right">Đơn</th><th className="p-2 text-right">Doanh thu</th><th className="p-2 text-right">Chi phí</th><th className="p-2 text-right">Lợi nhuận</th></tr>
                </thead>
                <tbody>
                  {profit.daily.map((d: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{d.date}</td><td className="p-2 text-right">{d.count}</td>
                      <td className="p-2 text-right">{formatCurrency(d.revenue)}</td><td className="p-2 text-right">{formatCurrency(d.cost)}</td>
                      <td className="p-2 text-right font-medium text-green-600">{formatCurrency(d.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(!profit.daily || profit.daily.length === 0) && (
            <div className="text-center py-16 bg-white rounded-lg border">
              <span className="text-5xl block mb-4">📊</span>
              <p className="text-gray-400">Chưa có dữ liệu — hãy tạo hóa đơn trước</p>
            </div>
          )}
        </div>
      )}

      {/* 📦 Inventory */}
      {activeTab === 'inventory' && inventory && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard title="Tổng SP" value={String(inventory.summary.totalProducts)} />
            <StatCard title="Giá trị kho (giá nhập)" value={formatCurrency(inventory.summary.totalCostValue)} color="green" />
            <StatCard title="Giá bán lẻ" value={formatCurrency(inventory.summary.totalRetailValue)} color="blue" />
          </div>
          {inventory.categoryBreakdown?.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-3 border-b font-semibold text-sm">Theo danh mục</div>
              {inventory.categoryBreakdown.map((c: any, i: number) => (
                <div key={i} className="flex justify-between px-3 py-2 border-b last:border-0 text-sm">
                  <span>{c.category}</span>
                  <span>{c.quantity} SP — {formatCurrency(c.totalCost)}</span>
                </div>
              ))}
            </div>
          )}
          {(!inventory.items || inventory.items.length === 0) && (
            <div className="text-center py-16 bg-white rounded-lg border">
              <span className="text-5xl block mb-4">🏭</span>
              <p className="text-gray-400">Chưa có dữ liệu tồn kho</p>
            </div>
          )}
        </div>
      )}

      {/* Cashier Performance */}
      {activeTab === 'cashier' && (
        <CashierReport />
      )}
    </div>
  );
}

function StatCard({ title, value, color = 'gray' }: { title: string; value: string; color?: string }) {
  const c: Record<string, string> = {
    gray: 'bg-white', green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200', blue: 'bg-blue-50 border-blue-200',
  };
  return (
    <div className={`p-3 lg:p-4 rounded-lg border ${c[color] || c.gray}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-base lg:text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

function CashierReport() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { apiClient.get('/reports/cashier-performance').then(r => setData(r.data)).catch(() => toast.error('Không thể tải báo cáo')).finally(() => setLoading(false)); }, []);

  if (loading) return <p className="text-gray-400 text-center py-8">⏳ Đang tải...</p>;
  if (!data || !data.cashiers?.length) return <div className="text-center py-16 bg-white rounded-lg border"><span className="text-5xl block mb-4">👤</span><p className="text-gray-400">Chưa có dữ liệu</p></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard title="Thu ngân" value={String(data.summary.totalCashiers)} />
        <StatCard title="Hóa đơn" value={String(data.summary.totalSales)} />
        <StatCard title="Doanh thu" value={formatCurrency(data.summary.totalRevenue)} color="green" />
      </div>
      <div className="bg-white rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr><th className="p-2 text-left">Thu ngân</th><th className="p-2 text-right">Hóa đơn</th><th className="p-2 text-right">Doanh thu</th><th className="p-2 text-right">TB/đơn</th></tr>
          </thead>
          <tbody>
            {data.cashiers.map((c: any, i: number) => (
              <tr key={i} className="border-t"><td className="p-2 font-medium">{c.cashierName}</td><td className="p-2 text-right">{c.totalSales}</td><td className="p-2 text-right">{formatCurrency(c.totalRevenue)}</td><td className="p-2 text-right">{formatCurrency(c.avgOrderValue)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
