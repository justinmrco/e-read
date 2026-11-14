"use client";
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Modal from './Modal';
import LoginModal from './LoginModal';
import SessionNotice from './SessionNotice';
import { useSession } from '../lib/use-session';
import { apiRequest } from '../lib/api';
import { useCart } from '../lib/use-cart';
import { checkout } from '../lib/checkout';
export default function CartModal({ onClose }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(false);
  const session = useSession();
  const cart = useCart(session);
  const items = cart.items;
  useEffect(() => { setError(''); setShowLogin(false); }, [session.token]);
  useEffect(() => {
    mounted.current = true;
    function reset() { busy.current = false; setProcessing(false); }
    window.addEventListener('pageshow', reset);
    return () => { mounted.current = false; window.removeEventListener('pageshow', reset); };
  }, []);
  async function remove(id) {
    if (busy.current || !session.user || localStorage.getItem('token') !== session.token) return;
    busy.current = true; setProcessing(true);
    try { await apiRequest('/api/user/cart/items/' + encodeURIComponent(id), { method:'DELETE' }); if (mounted.current) { cart.changed(); setError(''); } }
    catch (error) { if (mounted.current && error.name !== 'AbortError') setError(error.message); }
    finally { busy.current = false; if (mounted.current) setProcessing(false); }
  }
  async function pay() {
    if (busy.current || session.unavailable || session.checking) return;
    if (!session.user) { setShowLogin(true); return; }
    if (localStorage.getItem('token') !== session.token) { setError('Account changed. Please wait for your cart to refresh.'); return; }
    busy.current = true;
    setProcessing(true);
    setError('');
    try {
      const token = session.token;
      const { items:next } = await apiRequest('/api/user/cart');
      if (!mounted.current) return;
      if (!Array.isArray(next)) throw new Error('Cart details are unavailable.');
      cart.changed();
      if (!next.length) throw new Error('No unpurchased books remain in your cart.');
      if (next.length !== items.length || next.some((book,index) => (book._id !== items[index]?._id || book.price !== items[index]?.price))) throw new Error('Your cart changed. Purchased books were removed where applicable. Review it before checking out.');
      await checkout(next.map(item => item._id), true, token, () => mounted.current);
    }
    catch (error) { if (mounted.current) { setError(error.message); setProcessing(false); } busy.current = false; }
  }
  return <><Modal title="Shopping cart" onClose={onClose} onClosing={() => { mounted.current = false; }}>{requestClose => <div className="bg-neutral-900 text-white p-6 rounded-xl w-full sm:w-[500px] relative">
    <SessionNotice session={session} /><h2 className="text-xl font-bold mb-4">Your Cart</h2>
    <p className="text-sm text-neutral-300 mb-4">Sandbox demo. Prices are confirmed by the server at checkout.</p>
    {cart.omitted > 0 && <p role="status">Some unavailable or purchased books were omitted from this cart.</p>}
    {cart.error && <p role="alert">{cart.error} <button onClick={cart.refresh}>Retry cart</button></p>}
    {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}
    {!session.user ? <button className="primary" disabled={session.checking || session.unavailable} onClick={() => setShowLogin(true)}>Log in to view your cart</button> : cart.loading ? <p role="status">Loading your cart...</p> : !items.length ? <p>Your cart is empty.</p> : <>
      <ul className="cart-items space-y-4">{items.map(item => <li key={item._id} className="flex items-center justify-between gap-4 bg-neutral-800 p-3 rounded-lg"><div><p>{item.title}</p><p>Rp{item.price.toLocaleString('id-ID')}</p></div><button disabled={processing} onClick={() => remove(item._id)} className="destructive">Remove<span className="sr-only"> {item.title}</span></button></li>)}</ul>
      <p className="cart-total my-4">Estimated total: Rp{items.reduce((sum, item) => sum + item.price, 0).toLocaleString('id-ID')}</p>
      <button disabled={processing || cart.loading || !!cart.error || session.unavailable || session.checking} onClick={pay} className="w-full py-2 bg-yellow-500 text-black rounded disabled:opacity-50">{processing ? 'Checkout in progress...' : !session.user ? 'Log in to check out' : 'Sandbox checkout'}</button>
    </>}
    <button aria-label="Close cart" onClick={requestClose} className="icon-button absolute top-3 right-3"><X /></button>
  </div>}</Modal>{showLogin && <LoginModal onClose={() => setShowLogin(false)} onLoginSuccess={() => { setShowLogin(false); setError('Signed in. Review your cart, then check out.'); }} />}</>;
}
