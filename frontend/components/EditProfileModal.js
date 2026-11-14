"use client";
import { useRef, useState } from 'react';
import Modal from './Modal';
import { apiRequest } from '../lib/api';
export default function EditProfileModal({ user, token, onClose, onSaved }) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (submitting.current || localStorage.getItem('token') !== token) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const data = await apiRequest('/api/user/profile', { method:'PATCH', body:JSON.stringify({ username, email, currentPassword }) });
      if (localStorage.getItem('token') === token) { window.dispatchEvent(new Event('auth-change')); onSaved(data.message); }
    } catch (error) {
      if (localStorage.getItem('token') === token) setError(!error.status || error.status >= 500 ? 'The update could not be confirmed. Refresh your profile before trying again.' : error.message);
    } finally { submitting.current = false; setBusy(false); }
  }
  return <Modal title="Edit profile" onClose={onClose} canClose={() => !submitting.current}>{requestClose => <form onSubmit={save} className="bg-neutral-800 p-6 rounded w-full sm:w-96 space-y-4"><h2 className="text-xl text-yellow-400">Edit profile</h2><fieldset disabled={busy} className="space-y-4"><label className="block">Username<input required minLength={3} maxLength={50} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="block w-full bg-neutral-700 p-2 rounded" /></label><label className="block">Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="block w-full bg-neutral-700 p-2 rounded" /></label><label className="block">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setPassword(event.target.value)} className="block w-full bg-neutral-700 p-2 rounded" /></label>{error && <p role="alert">{error}</p>}<div className="flex gap-4"><button type="button" className="secondary" onClick={requestClose}>Cancel</button><button className="primary">{busy ? 'Saving...' : 'Save profile'}</button></div></fieldset></form>}</Modal>;
}
