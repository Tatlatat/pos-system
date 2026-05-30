'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import { Toaster, toast } from 'sonner';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: '', name: '', contactPerson: '', phone: '', email: '', address: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => toast.error('Không thể tải danh sách nhà cung cấp'))
      .finally(() => setLoading(false));
  }, []);

  const openCreate = () => { setForm({ code: '', name: '', contactPerson: '', phone: '', email: '', address: '' }); setEditing(null); setShowForm(true); };
  const openEdit = (s: any) => { setForm({ code: s.code, name: s.name, contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '', address: s.address || '' }); setEditing(s); setShowForm(true); };

  const save = async () => {
    if (!form.name || !form.code) { toast.error('Nhập mã và tên NCC'); return; }
    setSaving(true);
    try {
      if (editing) { await apiClient.patch(`/suppliers/${editing.id}`, form); }
      else { await apiClient.post('/suppliers', form); }
      toast.success('OK!'); setShowForm(false);
      const r = await apiClient.get('/suppliers'); setSuppliers(r.data);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Lỗi'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-20" />;

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">Nhà cung cấp</h1>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ Thêm</button>
      </div>

      <div className="hidden lg:block bg-white rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-3 text-left">Mã</th><th className="p-3 text-left">Tên</th><th className="p-3 text-left">Liên hệ</th><th className="p-3 text-left">SĐT</th><th className="p-3 text-left">Email</th></tr></thead>
          <tbody>
            {suppliers.map(s => (
              <tr key={s.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(s)}>
                <td className="p-3 font-mono text-xs">{s.code}</td>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3">{s.contactPerson}</td>
                <td className="p-3">{s.phone}</td>
                <td className="p-3">{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-2">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-lg border p-3" onClick={() => openEdit(s)}>
            <p className="font-medium">{s.name}</p>
            <p className="text-xs text-gray-500">{s.code} · {s.phone}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50">
          <div className="bg-white rounded-t-xl lg:rounded-lg p-5 lg:p-6 w-full lg:w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editing ? 'Sửa NCC' : 'Thêm NCC'}</h3>
            <div className="space-y-3">
              <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="Mã *" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Tên *" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.contactPerson} onChange={e => setForm({...form, contactPerson: e.target.value})} placeholder="Người liên hệ" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="SĐT" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="Email" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Địa chỉ" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 border rounded-lg text-sm">Hủy</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold">{saving ? '...' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
