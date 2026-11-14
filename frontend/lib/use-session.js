"use client";
import { useEffect, useRef, useState } from 'react';
import { apiRequest, clearSession } from './api';
export function useSession(admin = false) {
  const [session, setSession] = useState({ token:null, user:null, checking:true, refreshing:false, unavailable:false, error:'', expiresAt:null });
  const refreshRef = useRef(null);
  useEffect(() => {
    const key = admin ? 'admin_token' : 'token';
    let version = 0, timer;
    async function refresh(event) {
      if (event?.type === 'storage' && event.key !== null && event.key !== key) return;
      const request = ++version;
      let token;
      try {
        token = localStorage.getItem(key);
        setSession(previous => {
          const same = previous.token === token;
          const user = same && (!previous.expiresAt || previous.expiresAt > Date.now()) ? previous.user : null;
          return { token, user, checking:!!token && !user, refreshing:!!token, unavailable:!!token && same && previous.unavailable, error:same ? previous.error : '', expiresAt:same ? previous.expiresAt : null };
        });
        if (!token) { clearTimeout(timer); return; }
        const data = await apiRequest('/api/user/status', { admin });
        if (request !== version) return;
        if (!data.loggedIn || !data.user || (admin && data.user.role !== 'admin') || (Number.isFinite(data.expiresAt) && data.expiresAt <= Date.now())) { clearSession(admin,token); return; }
        clearTimeout(timer);
        setSession(previous => ({ token, user:previous.token === token && JSON.stringify(previous.user) === JSON.stringify(data.user) ? previous.user : data.user, checking:false, refreshing:false, unavailable:false, error:'', expiresAt:data.expiresAt ?? null }));
        if (Number.isFinite(data.expiresAt)) timer = setTimeout(() => {
          setSession(previous => previous.token === token ? { ...previous, user:null, checking:true } : previous);
          refresh();
        }, Math.max(0, Math.min(data.expiresAt - Date.now() + 100,2147483647)));
      } catch (error) {
        if (request === version && error.name !== 'AbortError') setSession(previous => ({ token, user:previous.token === token && previous.expiresAt > Date.now() ? previous.user : null, expiresAt:previous.token === token ? previous.expiresAt : null, checking:false, refreshing:false, unavailable:!!token, error:error.message }));
      }
    }
    refreshRef.current = refresh;
    refresh();
    for (const name of ['auth-change','storage','focus','pageshow','online']) window.addEventListener(name,refresh);
    return () => { version++; clearTimeout(timer); refreshRef.current = null; for (const name of ['auth-change','storage','focus','pageshow','online']) window.removeEventListener(name,refresh); };
  }, [admin]);
  return { ...session, retry:() => refreshRef.current?.() };
}
