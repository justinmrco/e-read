"use client";
import { useEffect, useState } from 'react';
import { apiRequest, signalCart } from './api';
export function useCart(session) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const userId = session.user?._id;
  useEffect(() => {
    let active = true, request = 0;
    setResult(null);
    async function refresh(event) {
      if (event?.type === 'storage' && event.key !== null && event.key !== 'eread-cart-change:' + userId) return;
      if (!userId || session.checking || session.unavailable || localStorage.getItem('token') !== session.token) return;
      const version = ++request;
      try {
        const data = await apiRequest('/api/user/cart');
        if (!Array.isArray(data.items) || data.items.some(item => !item || typeof item._id !== 'string' || typeof item.title !== 'string' || !Number.isSafeInteger(item.price) || item.price <= 0)) throw new Error('Cart details are unavailable. Please retry.');
        if (active && version === request) setResult({ ...data, token:session.token });
      } catch (error) { if (active && version === request && error.name !== 'AbortError') setResult({ token:session.token, error:error.message }); }
    }
    refresh();
    for (const name of ['cart-change','storage','focus','pageshow','online']) window.addEventListener(name, refresh);
    return () => { active = false; for (const name of ['cart-change','storage','focus','pageshow','online']) window.removeEventListener(name, refresh); };
  }, [session.token, userId, session.checking, session.unavailable, revision]);
  const current = result?.token === session.token && userId ? result : null;
  return { items:current?.items || [], omitted:current?.omitted || 0, error:current?.error || '', loading:!!userId && !current, refresh:() => setRevision(value => value + 1), changed:() => signalCart(userId) };
}
