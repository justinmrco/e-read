"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, signalCart } from '../../lib/api';
import { parseReceipt, parseLibrary } from '../../lib/records';
import LoginModal from '../../components/LoginModal';
function OrderStatus() {
  const params = useSearchParams();
  const orderId = params.get('order_id');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [retry, setRetry] = useState(0);
  const [warning, setWarning] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [login, setLogin] = useState(false);
  useEffect(() => {
    function changed(event) {
      if (event.type === 'storage' && event.key !== null && event.key !== 'token') return;
      setOrder(null); setChecking(true); setRetry(value => value + 1);
    }
    for (const name of ['auth-change', 'storage', 'focus', 'pageshow']) window.addEventListener(name, changed);
    return () => { for (const name of ['auth-change', 'storage', 'focus', 'pageshow']) window.removeEventListener(name, changed); };
  }, []);
  useEffect(() => {
    let active = true;
    let token;
    setChecking(true);
    setError('');
    setWarning('');
    setNeedsLogin(false);
    setOrder(null);
    if (!orderId) { setError('No order reference was supplied.'); setChecking(false); return; }
    try { token = localStorage.getItem('token'); } catch { setError('Browser storage is unavailable. Enable site storage and check this same order again.'); setChecking(false); return; }
    apiRequest('/api/midtrans/orders/' + encodeURIComponent(orderId)).then(async response => {
      if (!active) return;
      const data = parseReceipt(response, orderId);
      setOrder(data);
      setWarning(data.warning || '');
      setChecking(false);
      if (data.paid) {
        try {
          const library = parseLibrary(await apiRequest('/api/user/books'));
          if (library.unavailable) throw new Error('Library incomplete');
          if (!active) return;
          const account = await apiRequest('/api/user/status');
          if (active && localStorage.getItem('token') === token) signalCart(account.user._id);
        } catch { if (active) setWarning('Payment remains confirmed. Library refresh was unavailable; please check your library before purchasing again.'); }
      }
    }).catch(error => { if (active) { setError(error.message); setNeedsLogin(error.status === 401); } }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [orderId, retry]);
  return <main className="min-h-screen bg-neutral-900 text-white p-6 flex items-center justify-center"><div className="page-arrival receipt bg-neutral-800 p-6 sm:p-8 rounded-xl max-w-lg w-full">
    <h1 className="text-3xl text-white mb-6">Sandbox payment status</h1>
    {params.get('review') === '1' && <p role="status" className="session-notice mb-4">You have a previous checkout. Your new selection was not added. Review the books and total in the previous order below before choosing Resume sandbox checkout.</p>}
    <p className="eyebrow mb-3">Sandbox receipt</p><div aria-live="polite">{checking ? <p>Checking your order with the server...</p> : error ? <p role="alert">{error}</p> : order && <><p data-paid={order.paid} className="status-badge mb-4">{order.paid ? 'Confirmed' : order.status}</p><p>{order.paid ? order.libraryUpdated === false ? 'Payment confirmed. Library access is still being synchronized.' : 'Payment confirmed. Your purchased library has been updated.' : order.status === 'pending' ? order.checkoutState === 'uncertain' || order.checkoutState === 'creating' ? 'Checkout confirmation is unavailable. Check this order again; do not start another payment. If it remains unresolved, contact the demo administrator with this order reference.' : 'Payment is pending. Resume this checkout or check again after completing it.' : 'Payment was not completed: ' + order.status + '.'}</p><p className="mt-6 border-t border-neutral-600 pt-4 text-2xl font-semibold">Total: Rp{order.amount.toLocaleString('id-ID')}</p>{!!order.items?.length && <ul className="mt-3">{order.items.map(item => <li key={item.bookId}><span>{item.title}</span><span className="shrink-0">Rp{item.price.toLocaleString('id-ID')}</span></li>)}</ul>}</>}</div>
    {warning && <p role="status" className="mt-4 text-yellow-300">{warning}</p>}
    {!checking && !error && order?.status === 'pending' && <section aria-labelledby="payment-recovery" className="mt-4 border-t border-neutral-600 pt-4">
      <h2 id="payment-recovery" className="text-lg text-yellow-300">Recover this checkout</h2>
      <ol className="list-decimal pl-5 mt-2 space-y-2 text-sm text-neutral-300">
        <li>Keep the order reference below. Use Check again to refresh this same order.</li>
        <li>If Resume sandbox checkout is available, use it to continue the existing payment.</li>
        <li>If confirmation stays unavailable, give the demo administrator this reference. Do not start or pay for another order while this one is unresolved.</li>
      </ol>
      <p className="mt-3 text-sm text-neutral-300">A timeout or missing gateway status does not prove that payment failed.</p>
    </section>}
    {needsLogin && <button onClick={() => setLogin(true)} className="mt-4 bg-yellow-500 text-black px-4 py-2 rounded">Log in to check this order</button>}
    {!checking && order?.redirect_url && (() => {
      try {
        const url = new URL(order.redirect_url);
        if (url.origin === 'https://app.sandbox.midtrans.com' && !url.username && !url.password) return <button onClick={() => window.location.assign(url.href)} className="mt-4 bg-yellow-500 text-black px-4 py-2 rounded">Resume sandbox checkout</button>;
      } catch {}
      return null;
    })()}
    <p className="mt-4 text-sm break-all">Order: {orderId || 'Unavailable'}</p>
    <button disabled={checking} onClick={() => setRetry(value => value + 1)} className="my-4 px-4 py-2 bg-yellow-500 text-black rounded disabled:opacity-50">Check again</button>
    <div className="flex flex-wrap gap-4"><Link className="underline" href="/">Catalog</Link><Link className="underline" href="/profile">Library and history</Link></div>
    {login && <LoginModal onClose={() => setLogin(false)} onLoginSuccess={() => { setLogin(false); setRetry(value => value + 1); }} />}
  </div></main>;
}
export default function PaymentSuccess() { return <Suspense fallback={<p>Loading order...</p>}><OrderStatus /></Suspense>; }
