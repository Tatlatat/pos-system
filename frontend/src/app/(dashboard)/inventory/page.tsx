'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import apiClient from '@/lib/api-client';

export default function InventoryPage() {
  const [lowStock, setLowStock] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/inventory/low-stock')
      .then(res => setLowStock(res.data))
      .catch(() => toast.error('Không thể tải cảnh báo tồn kho'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-20" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl lg:text-2xl font-bold">Kho hàng</h1>

      {/* Alert cards */}
      {lowStock && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-xs lg:text-sm text-red-600">Hết hàng</p>
            <p className="text-xl lg:text-2xl font-bold text-red-700">{lowStock.critical}</p>
          </div>
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs lg:text-sm text-yellow-600">Sắp hết</p>
            <p className="text-xl lg:text-2xl font-bold text-yellow-700">{lowStock.warning}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs lg:text-sm text-blue-600">Tổng</p>
            <p className="text-xl lg:text-2xl font-bold text-blue-700">{lowStock.total}</p>
          </div>
        </div>
      )}

      {/* Desktop table */}
      {lowStock?.items?.length > 0 && (
        <>
          <div className="hidden lg:block bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Sản phẩm</th>
                  <th className="text-left p-3">Kho</th>
                  <th className="text-right p-3">Tồn hiện tại</th>
                  <th className="text-right p-3">Tồn tối thiểu</th>
                  <th className="text-right p-3">Thiếu hụt</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.items.map((item: any) => (
                  <tr key={item.productId} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{item.productName}</td>
                    <td className="p-3">{item.branch}</td>
                    <td className="p-3 text-right">{item.currentStock}</td>
                    <td className="p-3 text-right">{item.minStock}</td>
                    <td className="p-3 text-right text-red-600 font-medium">{item.deficit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {lowStock.items.map((item: any, i: number) => (
              <div key={i} className="bg-white rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm truncate">{item.productName}</p>
                  <span className="text-xs text-gray-500">{item.branch}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Tồn: <strong className={item.currentStock <= 0 ? 'text-red-600' : 'text-orange-600'}>{item.currentStock}</strong></span>
                  <span>Min: {item.minStock}</span>
                  <span className="text-red-600 font-medium">Thiếu: {item.deficit}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
