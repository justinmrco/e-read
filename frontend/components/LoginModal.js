"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import Modal from './Modal';
import { apiRequest, saveSession } from '../lib/api';
export default function LoginModal({ onClose, onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const mounted = useRef(false);
  const attempt = useRef(null);
  useEffect(() => {
    mounted.current = true;
    function invalidate(event) {
      if (event.type === 'storage' && event.key !== null && !['token','admin_token'].includes(event.key)) return;
      attempt.current = null; setBusy(false); setPassword(''); setConfirm('');
    }
    window.addEventListener('auth-change', invalidate); window.addEventListener('storage', invalidate);
    return () => { mounted.current = false; attempt.current = null; window.removeEventListener('auth-change', invalidate); window.removeEventListener('storage', invalidate); };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (!mounted.current || attempt.current) return;
    if (register && password !== confirm) { setMessage('Passwords do not match.'); return; }
    const request = {}; attempt.current = request; setBusy(true);
    setMessage('');
    try {
      const previousCustomer = localStorage.getItem('token');
      const previousAdmin = localStorage.getItem('admin_token');
      const data = await apiRequest(register ? '/api/auth/register' : '/api/auth/login', { auth: false, method: 'POST', body: JSON.stringify(register ? { username, email, password } : { username, password }) });
      if (!mounted.current || attempt.current !== request) return;
      if (register) { setRegister(false); setPassword(''); setConfirm(''); setMessage('Account created. Please log in.'); return; }
      const admin = data.role === 'admin';
      if (localStorage.getItem(admin ? 'admin_token' : 'token') !== (admin ? previousAdmin : previousCustomer)) throw new Error('The account changed while logging in. Please try again.');
      saveSession(data);
      onLoginSuccess?.();
      onClose();
      if (admin) router.push('/admin');
    } catch (error) { if (mounted.current && attempt.current === request) setMessage(error.message); }
    finally { if (mounted.current && attempt.current === request) { attempt.current = null; setBusy(false); } }
  }
  return <Modal title={register ? 'Register' : 'Log in'} onClose={onClose} onClosing={() => { mounted.current = false; }}>{requestClose => <div className="bg-neutral-900 text-white p-6 rounded-xl w-full sm:w-96 relative">
    <h2 className="text-xl font-semibold mb-4">{register ? 'Register' : 'Log in'}</h2>
    {message && <p role="status" className="text-yellow-300 mb-4">{message}</p>}
    <form onSubmit={submit} className="space-y-4">
      <label className="block">Username<input required minLength={register ? 3 : 1} maxLength={50} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="block w-full p-2 bg-neutral-800 rounded" /></label>
      {register && <label className="block">Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="block w-full p-2 bg-neutral-800 rounded" /></label>}
      <label className="block">Password<input required type="password" minLength={register ? 8 : 1} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} className="block w-full p-2 bg-neutral-800 rounded" /></label>
      {register && <label className="block">Confirm password<input required type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} className="block w-full p-2 bg-neutral-800 rounded" /></label>}
      <button disabled={busy} className="w-full p-2 bg-yellow-500 text-black rounded disabled:opacity-50">{busy ? 'Please wait...' : register ? 'Create account' : 'Log in'}</button>
      <button type="button" disabled={busy} onClick={() => { setRegister(value => !value); setMessage(''); }} className="text-yellow-300 underline">{register ? 'Already registered? Log in' : 'Create an account'}</button>
    </form>
    <button aria-label="Close login" onClick={requestClose} className="icon-button absolute top-3 right-3"><X /></button>
  </div>}</Modal>;
}
