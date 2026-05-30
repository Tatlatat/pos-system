'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Toaster, toast } from 'sonner';

const EMPTY_PRODUCT = {
  sku: '', barcode: '', name: '', description: '', unit: 'cái',
  costPrice: 0, sellingPrice: 0, minStock: 0, taxRate: 8, categoryId: '',
};

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setError('');
    try {
      const [pRes, cRes] = await Promise.all([
        apiClient.get('/products/search', { params: { limit: 100 } }),
        apiClient.get('/categories'),
      ]);
      setProducts(pRes.data.data || []);
      setCategories(Array.isArray(cRes.data) ? cRes.data : []);
    } catch { setError('Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  };

  const loadProducts = async (q?: string) => {
    try {
      const params: any = { limit: 100 };
      if (q) params.name = q;
      const r = await apiClient.get('/products/search', { params });
      setProducts(r.data.data || []);
    } catch { /* ignore */ }
  };

  const openCreate = () => { setForm(EMPTY_PRODUCT); setEditing(null); setShowForm(true); };
  const openEdit = (p: any) => {
    setForm({
      sku: p.sku, barcode: p.barcode, name: p.name, description: p.description || '',
      unit: p.unit, costPrice: Number(p.costPrice), sellingPrice: Number(p.sellingPrice),
      minStock: p.minStock, taxRate: Number(p.taxRate), categoryId: p.categoryId,
    });
    setEditing(p); setShowForm(true);
  };

  const saveProduct = async () => {
    if (!form.name || !form.sku || !form.barcode) { toast.error('Vui lòng nhập đủ SKU, Barcode, Tên'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiClient.patch(`/products/${editing.id}`, form);
        toast.success('Đã cập nhật!');
      } else {
        await apiClient.post('/products', form);
        toast.success('Đã tạo sản phẩm!');
      }
      setShowForm(false);
      loadProducts(search);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Lỗi lưu'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (id: string) => {
    try { await apiClient.patch(`/products/${id}/toggle-active`); toast.success('OK'); loadProducts(search); }
    catch { /* */ }
  };

  if (loading) return <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mt-20" />;
  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 mb-3">{error}</p>
      <button onClick={loadAll} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Thử lại</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <h1 className="text-xl lg:text-2xl font-bold">Sản phẩm</h1>
        <input type="text" placeholder="🔍 Tìm kiếm..." value={search}
          onChange={e => { setSearch(e.target.value); loadProducts(e.target.value); }}
          className="lg:ml-auto px-4 py-2 border rounded-lg text-sm w-full lg:w-64" />
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap">+ Thêm mới</button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border">
          <span className="text-5xl block mb-4">📦</span>
          <p className="text-gray-400 mb-3">Chưa có sản phẩm nào</p>
          <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">+ Tạo sản phẩm đầu tiên</button>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden lg:block bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">SKU</th>
                  <th className="text-left p-3">Tên</th>
                  <th className="text-left p-3">Danh mục</th>
                  <th className="text-right p-3">Giá bán</th>
                  <th className="text-right p-3">Tồn</th>
                  <th className="text-center p-3">TT</th>
                  <th className="text-center p-3"></th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{p.sku}</td>
                    <td className="p-3 font-medium cursor-pointer hover:text-blue-600" onClick={() => openEdit(p)}>{p.name}</td>
                    <td className="p-3 text-gray-500">{p.category?.name}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(Number(p.sellingPrice))}</td>
                    <td className="p-3 text-right">{p.inventoryStocks?.reduce((s: number, st: any) => s + st.quantity, 0) || 0}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => toggleActive(p.id)}
                        className={`px-2 py-1 rounded text-xs ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {p.isActive ? 'Bán' : 'Ngừng'}
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => openEdit(p)} className="text-blue-600 text-xs hover:underline">Sửa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden space-y-2">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-lg border p-3" onClick={() => openEdit(p)}>
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.category?.name} · {p.sku}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleActive(p.id); }}
                    className={`px-2 py-0.5 rounded text-xs shrink-0 ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {p.isActive ? 'Bán' : 'Ngừng'}
                  </button>
                </div>
                <div className="flex justify-between text-sm">
                  <strong>{formatCurrency(Number(p.sellingPrice))}</strong>
                  <span className="text-gray-500">Tồn: {p.inventoryStocks?.reduce((s: number, st: any) => s + st.quantity, 0) || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white rounded-t-xl lg:rounded-lg p-5 lg:p-6 w-full lg:w-[500px] max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editing ? 'Sửa sản phẩm' : 'Tạo sản phẩm mới'}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">SKU *</label>
                  <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium">Barcode *</label>
                  <input value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Tên sản phẩm *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Danh mục</label>
                  <select value={form.categoryId} onChange={e => setForm({...form, categoryId: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Chọn --</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Đơn vị</label>
                  <input value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Giá nhập</label>
                  <input type="number" value={form.costPrice || ''} onChange={e => setForm({...form, costPrice: Number(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg text-sm text-right" />
                </div>
                <div>
                  <label className="text-xs font-medium">Giá bán *</label>
                  <input type="number" value={form.sellingPrice || ''} onChange={e => setForm({...form, sellingPrice: Number(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg text-sm text-right" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Tồn tối thiểu</label>
                  <input type="number" value={form.minStock || ''} onChange={e => setForm({...form, minStock: Number(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium">Thuế VAT (%)</label>
                  <input type="number" value={form.taxRate || ''} onChange={e => setForm({...form, taxRate: Number(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 border rounded-lg text-sm">Hủy</button>
              <button onClick={saveProduct} disabled={saving}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-400">
                {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
