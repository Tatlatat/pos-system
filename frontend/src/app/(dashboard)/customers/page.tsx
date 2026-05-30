'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import { Toaster, toast } from 'sonner';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  const load = async (q?: string) => {
    try {
      const params: any = { limit: 100 };
      if (q) params.search = q;
      const r = await apiClient.get('/customers', { params });
      setCustomers(r.data.data || []);
    } catch { /* */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.phone) { toast.error('Nhập tên và SĐT'); return; }
    setSaving(true);
    try { await apiClient.post('/customers', form); toast.success('Đã tạo!'); setShowForm(false); load(search); }
    catch (err: any) { toast.error(err.response?.data?.message || 'Lỗi'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-20" />;

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold">Khách hàng</h1>
        <input type="text" placeholder="🔍 Tìm..." value={search} onChange={e => { setSearch(e.target.value); load(e.target.value); }}
          className="px-4 py-2 border rounded-lg text-sm w-full lg:w-48" />
        <button onClick={() => { setForm({ name: '', phone: '', email: '' }); setShowForm(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap">+ Thêm</button>
      </div>

      <div className="hidden lg:block bg-white rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-3 text-left">Tên</th><th className="p-3 text-left">SĐT</th><th className="p-3 text-left">Email</th><th className="p-3 text-right">Điểm</th><th className="p-3 text-right">Tổng chi</th></tr></thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.name}</td><td className="p-3">{c.phone}</td><td className="p-3">{c.email}</td>
                <td className="p-3 text-right">{c.totalPoints}</td><td className="p-3 text-right font-medium">{Number(c.totalSpent).toLocaleString()}₫</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-2">
        {customers.map(c => (
          <div key={c.id} className="bg-white rounded-lg border p-3">
            <div className="flex justify-between"><p className="font-medium">{c.name}</p><span className="text-sm text-blue-600">{c.totalPoints}đ</span></div>
            <p className="text-xs text-gray-500">{c.phone} · Chi: {Number(c.totalSpent).toLocaleString()}₫</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50">
          <div className="bg-white rounded-t-xl lg:rounded-lg p-5 lg:p-6 w-full lg:w-96">
            <h3 className="text-lg font-bold mb-4">Thêm khách hàng</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Tên *" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="SĐT *" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Email" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 border rounded-lg text-sm">Hủy</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold">{saving ? '...' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
