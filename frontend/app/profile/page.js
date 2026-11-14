"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SessionNotice from '../../components/SessionNotice';
import Modal from '../../components/Modal';
import EditProfileModal from '../../components/EditProfileModal';
import BookCover from '../../components/BookCover';
import BookSkeleton from '../../components/BookSkeleton';
import { apiRequest, clearSession } from '../../lib/api';
import { parseLibrary, parseHistory } from '../../lib/records';
import { useSession } from '../../lib/use-session';
export default function ProfilePage() {
  const [library, setLibrary] = useState(null);
  const [history, setHistory] = useState(null);
  const [libraryRetry, setLibraryRetry] = useState(0);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const session = useSession();
  useEffect(() => {
    if (!session.user) return;
    const id = window.location?.hash?.slice(1);
    if (['account','settings','purchased-books','transaction-history'].includes(id)) document.getElementById(id)?.scrollIntoView({ block:'start' });
  }, [session.user]);
  useEffect(() => { setEditing(false); setModal(false); setOldPassword(''); setNewPassword(''); if (session.token) setMessage(''); }, [session.token]);
  useEffect(() => {
    let active = true;
    setLibrary(null);
    if (!session.user || session.checking) return;
    apiRequest('/api/user/books').then(data => {
      const result = parseLibrary(data);
      if (active) setLibrary({ token:session.token, ...result });
    }).catch(error => { if (active && error.name !== 'AbortError') setLibrary({ token:session.token, error:error.message }); });
    return () => { active = false; };
  }, [session.token, session.user, session.checking, libraryRetry]);
  useEffect(() => {
    let active = true;
    setHistory(null);
    if (!session.user || session.checking) return;
    apiRequest('/api/user/transactions').then(data => {
      const result = parseHistory(data);
      if (active) setHistory({ token:session.token, ...result });
    }).catch(error => { if (active && error.name !== 'AbortError') setHistory({ token:session.token, error:error.message }); });
    return () => { active = false; };
  }, [session.token, session.user, session.checking, historyRetry]);
  const books = library?.token === session.token ? library : null;
  const transactions = history?.token === session.token ? history : null;
  async function changePassword(event) {
    event.preventDefault();
    if (submitting.current || session.unavailable) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    const token = session.token;
    try {
      const data = await apiRequest('/api/user/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      clearSession(false, token);
      setMessage(data.message); setOldPassword(''); setNewPassword(''); setModal(false); setLibrary(null); setHistory(null);
    } catch (error) {
      if (error.name === 'AbortError' || (localStorage.getItem('token') !== token && error.status !== 401)) return;
      if (error.status === 409) {
        clearSession(false, token);
        setModal(false); setOldPassword(''); setNewPassword(''); setLibrary(null); setHistory(null);
      }
      setMessage(!error.status || error.status >= 500 ? 'The password change could not be confirmed. Try signing in with your new password before submitting another change.' : error.message);
    } finally { submitting.current = false; setBusy(false); }
  }
  return <main className="page-arrival page-shell min-h-screen bg-neutral-900 text-white p-4 sm:p-8">
    <Link href="/" className="inline-block bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded">Back Home</Link>
    <SessionNotice session={session} /><h1 className="text-3xl font-bold text-yellow-400 my-6">?? User Profile</h1>
    {message && !modal && <p role="status" className="mb-4">{message}</p>}
    {session.checking ? <BookSkeleton /> : !session.user ? session.unavailable ? null : <p>Please <Link href="/" className="underline">return to the catalog to log in</Link>.</p> : <>
      <div id="account" className="mb-8 space-y-2"><p>Username: {session.user.username}</p><p>Email: {session.user.email}</p></div>
      <button id="settings" className="primary mr-4" disabled={session.unavailable} onClick={() => { setMessage(''); setEditing(true); }}>Edit profile</button>
      <button onClick={() => { setMessage(''); setModal(true); }} disabled={session.unavailable} className="my-4 px-4 py-2 bg-yellow-500 text-black rounded">Change password</button>
      <section aria-labelledby="purchased-books" aria-busy={!books}><h2 id="purchased-books" className="text-2xl text-yellow-300 my-4">Purchased books{books?.books && ` (${books.books.length})`}</h2>
      {books?.unavailable > 0 && <div role="status" className="session-notice"><p>Some library details are unavailable.</p><button className="secondary" disabled={session.unavailable} onClick={() => setLibraryRetry(value => value + 1)}>Retry library</button></div>}{!books ? <BookSkeleton /> : books.error ? <div role="alert"><p>{books.error}</p><button disabled={session.unavailable} className="secondary my-3" onClick={() => setLibraryRetry(value => value + 1)}>Retry library</button></div> : !books.books.length ? <p>No purchased books yet.</p> : <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{books.books.map(book => <li key={book._id} className="library-card"><div className="mb-2"><BookCover book={book} /></div><h3 className="text-lg text-yellow-300">{book.title}</h3><p className="text-sm text-neutral-300">{book.author} / {book.year}</p><p className="text-sm text-neutral-300">{book.genre}</p><Link className="underline" href="/readbook">Open shared sample reader</Link></li>)}</ul>}
      </section><section aria-labelledby="transaction-history" aria-busy={!transactions}><h2 id="transaction-history" className="text-2xl text-yellow-300 my-4">Transaction history</h2>
      {transactions?.unavailable > 0 && <div role="status" className="session-notice"><p>Some transaction details are unavailable.</p><button className="secondary" disabled={session.unavailable} onClick={() => setHistoryRetry(value => value + 1)}>Retry history</button></div>}{!transactions ? <p role="status">Loading transaction history...</p> : transactions.error ? <div role="alert"><p>{transactions.error}</p><button disabled={session.unavailable} className="secondary my-3" onClick={() => setHistoryRetry(value => value + 1)}>Retry history</button></div> : !transactions.transactions.length ? <p>No transactions yet.</p> : <div className="overflow-x-auto max-h-[32rem] border border-neutral-600 rounded" tabIndex={0} role="region" aria-label="Transaction history"><table className="min-w-full text-left bg-neutral-800"><caption className="sr-only">Your sandbox purchases</caption><thead className="bg-neutral-700 text-yellow-400"><tr>{['Date', 'Books', 'Amount (IDR)', 'Status'].map(label => <th scope="col" key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{transactions.transactions.map(tx => <tr key={tx.id}><td className="p-3">{new Date(tx.date).toLocaleString()}</td><td className="p-3">{tx.title}{tx.orderId && <Link className="block underline text-yellow-300" href={"/payment-success?order_id=" + encodeURIComponent(tx.orderId)}>Check order</Link>}</td><td className="p-3">{tx.amount.toLocaleString('id-ID')}</td><td className="p-3"><span className="status-badge">{tx.status}</span></td></tr>)}</tbody></table></div>}</section>
    </>}
    {editing && session.user && <EditProfileModal key={session.token} user={session.user} token={session.token} onClose={() => setEditing(false)} onSaved={message => { setEditing(false); setMessage(message); }} />}
    {modal && <Modal title="Change password" onClose={() => setModal(false)} canClose={() => !submitting.current}>{requestClose => <form onSubmit={changePassword} className="bg-neutral-800 text-white p-6 rounded w-full sm:w-96 space-y-4"><h2 className="text-xl text-yellow-300">Change password</h2><SessionNotice session={session} /><fieldset disabled={busy || !!session.unavailable} className="space-y-4 min-w-0"><label className="block">Current password<input required type="password" autoComplete="current-password" value={oldPassword} onChange={event => setOldPassword(event.target.value)} className="block w-full bg-neutral-800 p-2 rounded" /></label><label className="block">New password<input required type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="block w-full bg-neutral-800 p-2 rounded" /></label><p className="text-sm">At least 8 characters; maximum 72 UTF-8 bytes. Changing your password signs out all sessions.</p>{message && <p role="alert">{message}</p>}<div className="flex gap-4"><button type="button" onClick={requestClose}>Cancel</button><button disabled={busy} className="bg-yellow-500 text-black p-2 rounded disabled:opacity-50">{busy ? 'Saving...' : 'Save password'}</button></div></fieldset>{busy && <p role="status">Saving your password. Please wait before closing this form.</p>}</form>}</Modal>}
  </main>;
}
