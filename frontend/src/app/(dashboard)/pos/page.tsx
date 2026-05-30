'use client';

import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Toaster, toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

interface CartItem {
  id: string; productId: string; quantity: number; unitPrice: number;
  discount: number; subtotal: number; lineTotal: number;
  product: { id: string; sku: string; name: string; barcode: string; sellingPrice: number; unit: string; };
}

interface CartSummary {
  itemCount: number; totalQuantity: number;
  subtotal: number; taxAmount: number; grandTotal: number;
}

interface Cart {
  id: string; items: CartItem[]; summary: CartSummary;
  customer?: { id: string; name: string; phone: string };
}

interface Customer {
  id: string; name: string; phone: string; email?: string; totalPoints: number;
}

export default function PosPage() {
  const { user } = useAuth();
  // State
  const [cart, setCart] = useState<Cart | null>(null);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [showCart, setShowCart] = useState(false);

  // Product search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Customer
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSearch, setCustomerSearch] = useState<Customer | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Discount
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState(0);

  // Payment
  const [cashReceived, setCashReceived] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'E_WALLET'>('CASH');

  // Add quantity modal
  const [addQty, setAddQty] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // ==== Init ====
  useEffect(() => { loadCart(); }, []);

  const loadCart = async () => {
    try { const r = await apiClient.get('/pos/cart'); setCart(r.data); }
    catch { /* ignore */ } finally { setLoading(false); }
  };

  // ==== Product Operations ====
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    setSelectedProduct(null);
    try {
      const r = await apiClient.post('/pos/cart/scan', { barcode: barcode.trim() });
      setCart(r.data); setBarcode(''); toast.success('Đã thêm');
    } catch (err: any) { toast.error('Không tìm thấy sản phẩm'); }
  };

  const searchProduct = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const r = await apiClient.get('/products/search', { params: { name: q, limit: 8 } });
      setSearchResults(r.data.data || []);
    } catch { setSearchResults([]); }
  };

  const openAddModal = (product: any) => {
    setSelectedProduct(product);
    setAddQty(1);
  };

  const confirmAddToCart = async () => {
    if (!selectedProduct || addQty < 1) return;
    try {
      const r = await apiClient.post('/pos/cart/add', { productId: selectedProduct.id, quantity: addQty });
      setCart(r.data); setSelectedProduct(null); setSearchQuery(''); setSearchResults([]);
      toast.success(`Đã thêm ${addQty} ${selectedProduct.name}`);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Không đủ hàng'); }
  };

  const updateQty = async (itemId: string, qty: number) => {
    if (qty < 1) return;
    try { const r = await apiClient.patch(`/pos/cart/item/${itemId}`, { quantity: qty }); setCart(r.data); }
    catch (err: any) { toast.error(err.response?.data?.message || 'Lỗi'); }
  };

  const removeItem = async (itemId: string) => {
    try { const r = await apiClient.delete(`/pos/cart/item/${itemId}`); setCart(r.data); }
    catch { /* ignore */ }
  };

  // ==== Customer ====
  const lookupCustomer = async () => {
    if (!customerPhone.trim()) return;
    try {
      const r = await apiClient.get(`/customers/phone/${customerPhone.trim()}`);
      setCustomerSearch(r.data);
      setShowCreateCustomer(false);
      toast.success(`Đã tìm: ${r.data.name}`);
    } catch {
      setCustomerSearch(null);
      setShowCreateCustomer(true);
      setNewCustomerName('');
      toast.error('Không tìm thấy khách hàng. Bạn có muốn tạo mới?');
    }
  };

  const createCustomer = async () => {
    if (!newCustomerName.trim() || !customerPhone.trim()) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }
    setCreatingCustomer(true);
    try {
      const r = await apiClient.post('/customers', {
        name: newCustomerName.trim(),
        phone: customerPhone.trim(),
      });
      toast.success(`Đã tạo khách hàng: ${r.data.name}`);
      await setCartCustomer(r.data.id);
      setShowCreateCustomer(false);
      setCustomerPhone('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo khách hàng');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const setCartCustomer = async (customerId: string) => {
    try { await apiClient.post('/pos/cart/customer', { customerId }); loadCart(); }
    catch { /* ignore */ }
  };

  // ==== Checkout ====
  const openPayment = () => {
    setShowPayment(true);
    setCashReceived(cart?.summary.grandTotal || 0);
  };

  const checkout = async () => {
    if (!cart) return;
    const effectiveTotal = applyDiscount(cart.summary.grandTotal); // 🛡️ Calculate discount FIRST
    if (paymentMethod === 'CASH' && cashReceived < effectiveTotal) {
      toast.error('Tiền khách đưa chưa đủ!');
      return;
    }

    try {
      const r = await apiClient.post('/pos/checkout', {
        customerId: cart.customer?.id,
        discountAmount: cart.summary.grandTotal - effectiveTotal,
        payments: [{
          method: paymentMethod,
          amount: effectiveTotal,
          changeDue: paymentMethod === 'CASH' ? cashReceived - effectiveTotal : 0,
        }],
      });
      toast.success(`✅ Hóa đơn: ${r.data.invoiceNo}`);

      // Print receipt (escape HTML to prevent injection)
      const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c] || c);
      const w = window.open('', '_blank', 'width=400,height=600');
      if (w) {
        const itemsHtml = r.data.items.map((i: any) =>
          `<tr><td>${esc(i.product.name)}</td><td>${i.quantity}</td><td style="text-align:right">${formatCurrency(Number(i.unitPrice))}</td><td style="text-align:right">${formatCurrency(Number(i.subtotal))}</td></tr>`
        ).join('');
        w.document.write(`<!DOCTYPE html>
<html><head><title>Hóa đơn ${esc(r.data.invoiceNo)}</title>
<style>body{font-family:monospace;font-size:12px;margin:0;padding:10px}
h2{text-align:center;margin:0 0 10px} p{margin:2px 0}
table{width:100%;border-collapse:collapse}
td,th{border-bottom:1px dashed #ccc;padding:3px 0} 
th{text-align:left}
hr{border:none;border-top:1px dashed #000;margin:8px 0}
.total{font-size:16px;font-weight:bold;text-align:right}
.center{text-align:center}</style></head>
<body onload="window.print();setTimeout(()=>window.close(),500)">
<h2>POS MINIMART</h2>
<p class="center">${r.data.invoiceNo}</p>
<p>Thu ngân: ${esc(r.data.cashier.fullName)}</p>
<p>Ngày: ${new Date(r.data.createdAt).toLocaleString('vi-VN')}</p>
<hr>
<table>${itemsHtml}</table>
<hr>
<p class="total">TỔNG: ${formatCurrency(Number(r.data.totalAmount))}</p>
<p class="center" style="margin-top:15px">Cảm ơn quý khách!</p>
</body></html>`);
        w.document.close();
      }

      setShowPayment(false); setShowCart(false);
      loadCart();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Lỗi thanh toán'); }
  };

  const applyDiscount = (total: number) => {
    if (discountType === 'percent') return Math.max(0, total * (1 - discountValue / 100));
    return Math.max(0, total - discountValue);
  };

  const effectiveTotal = cart ? applyDiscount(cart.summary.grandTotal) : 0;
  const change = paymentMethod === 'CASH' ? cashReceived - effectiveTotal : 0;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-3">
      <Toaster position="top-center" richColors />

      {/* LEFT: Product selection */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Barcode */}
        <form onSubmit={handleScan} className="flex gap-2">
          <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)}
            placeholder="📷 Quét / nhập barcode..."
            className="flex-1 px-4 py-3 border rounded-lg text-base lg:text-lg focus:ring-2 focus:ring-blue-500"
            autoFocus />
          <button type="submit" className="px-4 lg:px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Thêm</button>
        </form>

        {/* Search */}
        <div className="relative">
          <input type="text" value={searchQuery} onChange={e => searchProduct(e.target.value)}
            placeholder="🔍 Tìm sản phẩm..."
            className="w-full px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => openAddModal(p)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku} · Tồn: {p.inventoryStocks?.find((s: any) => s.branchId === user?.branchId)?.quantity ?? 0}</p>
                  </div>
                  <p className="font-semibold text-blue-600 text-sm ml-2 whitespace-nowrap">{formatCurrency(Number(p.sellingPrice))}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent items (desktop) */}
        <div className="hidden lg:block flex-1 bg-white rounded-lg border p-3 overflow-y-auto">
          {(!cart || cart.items.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <span className="text-5xl mb-2">🛒</span>
              <p>Quét mã vạch hoặc tìm sản phẩm để bắt đầu</p>
            </div>
          ) : (
            <div className="space-y-1">
              {cart.items.map(item => (
                <div key={item.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                  <span className="text-gray-400 text-xs w-6">{item.quantity}x</span>
                  <span className="flex-1 text-sm truncate">{item.product.name}</span>
                  <span className="text-sm font-semibold text-right w-24">{formatCurrency(Number(item.subtotal))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="bg-white rounded-lg border p-3">
          <div className="flex gap-2 mb-2">
            <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="📞 SĐT khách hàng..."
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
              onKeyDown={e => e.key === 'Enter' && lookupCustomer()} />
            <button onClick={lookupCustomer} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">Tìm</button>
          </div>
          {customerSearch && (
            <div className="flex items-center justify-between bg-blue-50 p-2 rounded-lg">
              <div>
                <p className="text-sm font-medium">{customerSearch.name}</p>
                <p className="text-xs text-gray-500">{customerSearch.phone} · {customerSearch.totalPoints} điểm</p>
              </div>
              <button onClick={() => { setCartCustomer(customerSearch.id); setCustomerSearch(null); }}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg">Gắn</button>
            </div>
          )}
          {cart?.customer && (
            <div className="flex items-center justify-between bg-green-50 p-2 rounded-lg mt-1">
              <div>
                <p className="text-sm font-medium">{cart.customer.name}</p>
                <p className="text-xs text-gray-500">{cart.customer.phone}</p>
              </div>
              <button onClick={() => setCartCustomer('')} className="text-xs text-red-600">Gỡ</button>
            </div>
          )}
          {showCreateCustomer && (
            <div className="bg-gray-50 p-2.5 rounded-lg border border-dashed mt-2 space-y-2">
              <p className="text-xs text-gray-500 font-medium">✨ Khách hàng mới</p>
              <input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                placeholder="Tên khách hàng *"
                className="w-full px-3 py-1.5 border rounded-lg text-sm bg-white" />
              <div className="flex gap-2">
                <button onClick={() => setShowCreateCustomer(false)}
                  className="flex-1 py-1.5 border rounded-lg text-xs hover:bg-gray-100">Hủy</button>
                <button onClick={createCustomer} disabled={creatingCustomer}
                  className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:bg-gray-400">
                  {creatingCustomer ? '...' : 'Tạo & Gắn'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Discount */}
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Giảm giá:</span>
            <select value={discountType} onChange={e => setDiscountType(e.target.value as any)}
              className="text-sm border rounded px-2 py-1">
              <option value="percent">%</option>
              <option value="amount">₫</option>
            </select>
            <input type="number" value={discountValue || ''} onChange={e => setDiscountValue(Number(e.target.value))}
              className="w-24 px-2 py-1 border rounded text-sm text-right" min={0} />
            {discountValue > 0 && cart && (
              <span className="text-sm text-red-600 ml-auto">
                -{formatCurrency(cart.summary.grandTotal - effectiveTotal)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div className={`${showCart ? 'fixed inset-0 z-40 flex flex-col bg-white lg:static lg:w-80 lg:min-w-80' : 'hidden lg:flex lg:w-80 lg:min-w-80'} bg-white rounded-lg border lg:flex lg:flex-col`}>
        <div className="p-3 lg:p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base">Giỏ hàng</h2>
            <p className="text-xs text-gray-500">{cart?.summary.itemCount || 0} mặt hàng</p>
          </div>
          <button onClick={() => setShowCart(false)} className="lg:hidden p-1 text-gray-400">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart?.items.map(item => (
            <div key={item.id} className="bg-gray-50 p-2.5 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-sm font-medium truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(Number(item.unitPrice))}</p>
                </div>
                <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">✕</button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-white border flex items-center justify-center hover:bg-gray-100">-</button>
                  <span className="w-6 text-center font-semibold text-sm">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-white border flex items-center justify-center hover:bg-gray-100">+</button>
                </div>
                <span className="font-semibold text-sm">{formatCurrency(Number(item.subtotal))}</span>
              </div>
            </div>
          ))}
          {(!cart || cart.items.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-2">🛒</span>
              <p className="text-sm">Giỏ hàng trống</p>
            </div>
          )}
        </div>

        {cart && cart.items.length > 0 && (
          <div className="border-t p-3 lg:p-4 space-y-2">
            <div className="flex justify-between text-xs lg:text-sm"><span>Tạm tính:</span><span>{formatCurrency(Number(cart.summary.subtotal))}</span></div>
            <div className="flex justify-between text-xs lg:text-sm"><span>Thuế (8%):</span><span>{formatCurrency(Number(cart.summary.taxAmount))}</span></div>
            {discountValue > 0 && (
              <div className="flex justify-between text-xs lg:text-sm text-red-600"><span>Giảm giá:</span><span>-{formatCurrency(cart.summary.grandTotal - effectiveTotal)}</span></div>
            )}
            <div className="flex justify-between text-base lg:text-lg font-bold border-t pt-2">
              <span>Tổng:</span>
              <span className="text-blue-600">{formatCurrency(effectiveTotal)}</span>
            </div>
            <button onClick={openPayment}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-sm lg:text-base hover:bg-green-700 transition-colors">
              💳 Thanh toán
            </button>
          </div>
        )}
      </div>

      {/* Mobile cart button */}
      {cart && cart.items.length > 0 && !showCart && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-4 right-4 z-30 lg:hidden bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl">
          🛒<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{cart.items.length}</span>
        </button>
      )}

      {/* Payment Modal */}
      {showPayment && cart && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50" onClick={e => e.target === e.currentTarget && setShowPayment(false)}>
          <div className="bg-white rounded-t-xl lg:rounded-lg p-5 lg:p-6 w-full lg:w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Thanh toán</h3>

            {/* Method */}
            <div className="mb-4">
              <label className="text-sm font-medium mb-1 block">Phương thức:</label>
              <div className="flex gap-2">
                {(['CASH', 'BANK_TRANSFER', 'E_WALLET'] as const).map(m => (
                  <button key={m} onClick={() => setPaymentMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border ${paymentMethod === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                    {m === 'CASH' ? '💵 TM' : m === 'BANK_TRANSFER' ? '🏦 CK' : '📱 Ví'}
                  </button>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between text-sm"><span>Tạm tính:</span><span>{formatCurrency(Number(cart.summary.subtotal))}</span></div>
              <div className="flex justify-between text-sm"><span>Thuế (8%):</span><span>{formatCurrency(Number(cart.summary.taxAmount))}</span></div>
              {discountValue > 0 && (
                <div className="flex justify-between text-sm text-red-600"><span>Giảm giá:</span><span>-{formatCurrency(cart.summary.grandTotal - effectiveTotal)}</span></div>
              )}
              <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t">
                <span>Tổng:</span>
                <span className="text-blue-600">{formatCurrency(effectiveTotal)}</span>
              </div>
            </div>

            {/* Cash input */}
            {paymentMethod === 'CASH' && (
              <div className="mb-4">
                <label className="text-sm font-medium mb-1 block">Tiền khách đưa:</label>
                <div className="flex gap-2">
                  <input type="number" value={cashReceived || ''} onChange={e => setCashReceived(Number(e.target.value))}
                    className="flex-1 px-4 py-2 border rounded-lg text-lg text-right" />
                  <button onClick={() => setCashReceived(effectiveTotal)}
                    className="px-3 py-2 bg-gray-100 rounded-lg text-xs">Đủ</button>
                </div>
                {cashReceived > 0 && change >= 0 && (
                  <div className={`mt-2 p-2 rounded-lg text-center font-bold ${change > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                    {change > 0 ? `💰 Tiền thừa: ${formatCurrency(change)}` : '💵 Khách đưa đúng tiền'}
                  </div>
                )}
                {cashReceived > 0 && change < 0 && (
                  <div className="mt-2 p-2 rounded-lg text-center font-bold bg-red-50 text-red-700">
                    ⚠️ Thiếu {formatCurrency(Math.abs(change))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setShowPayment(false)}
                className="flex-1 py-3 border rounded-lg hover:bg-gray-50 text-sm">Hủy</button>
              <button onClick={checkout}
                disabled={paymentMethod === 'CASH' && cashReceived < effectiveTotal}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm font-bold">
                ✅ Thanh toán {formatCurrency(effectiveTotal)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Quantity Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50" onClick={e => e.target === e.currentTarget && setSelectedProduct(null)}>
          <div className="bg-white rounded-t-xl lg:rounded-lg p-5 lg:p-6 w-full lg:w-80">
            <h3 className="font-bold mb-3">{selectedProduct.name}</h3>
            <p className="text-sm text-gray-500 mb-4">{formatCurrency(Number(selectedProduct.sellingPrice))} · Tồn: {selectedProduct.inventoryStocks?.find((s: any) => s.branchId === user?.branchId)?.quantity ?? 0}</p>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-sm">Số lượng:</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddQty(Math.max(1, addQty - 1))}
                  className="w-10 h-10 rounded-full border flex items-center justify-center text-xl">-</button>
                <input type="number" value={addQty} onChange={e => setAddQty(Number(e.target.value))}
                  className="w-16 text-center text-lg font-bold border rounded-lg py-2" min={1} />
                <button onClick={() => setAddQty(addQty + 1)}
                  className="w-10 h-10 rounded-full border flex items-center justify-center text-xl">+</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelectedProduct(null)}
                className="flex-1 py-3 border rounded-lg text-sm">Hủy</button>
              <button onClick={confirmAddToCart}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg text-sm font-bold">
                Thêm {formatCurrency(Number(selectedProduct.sellingPrice) * addQty)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
