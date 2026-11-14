"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SessionNotice from '../../components/SessionNotice';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import SortableBookCard from '../../components/admin/SortableBookCard';
import AddBookModal from '../../components/admin/AddBookModal';
import { apiRequest, clearSession, saveSession } from '../../lib/api';
import { useSession } from '../../lib/use-session';
import { readPendingSave, clearPendingSave } from '../../lib/admin-save';
export default function AdminDashboardPage() {
  const [books, setBooks] = useState([]);
  const [modal, setModal] = useState(null);
  const [revision, setRevision] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [pendingSave, setPendingSave] = useState(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewedRecovery, setReviewedRecovery] = useState(false);
  const session = useSession(true);
  const loggedIn = !!session.user && !session.checking;
  const ownerId = session.user?._id;
  const mutationsPaused = !recoveryReady || !!pendingSave || !!recoveryError;
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const savingOrder = useRef(false);
  const loginAttempt = useRef(null);
  const catalogRequest = useRef(null);
  useEffect(() => {
    function invalidate(event) {
      if (event.type === 'storage' && event.key !== null && event.key !== 'admin_token') return;
      if (loginAttempt.current) setLoggingIn(false);
      loginAttempt.current = null;
      setPassword('');
    }
    window.addEventListener('auth-change', invalidate);
    window.addEventListener('storage', invalidate);
    return () => {
      loginAttempt.current = null;
      window.removeEventListener('auth-change', invalidate);
      window.removeEventListener('storage', invalidate);
    };
  }, []);
  useEffect(() => {
    function refreshRecovery() {
      setAcknowledged(false); setReviewedRecovery(false);
      try { setPendingSave(readPendingSave(ownerId)); setRecoveryError(''); setRecoveryReady(true); }
      catch { setPendingSave(null); setRecoveryReady(false); setRecoveryError('Save recovery is unavailable. Enable site storage or review the catalog before discarding saved recovery.'); }
    }
    setPendingSave(null); setRecoveryError(''); setRecoveryReady(false);
    if (!loggedIn) return;
    refreshRecovery(); window.addEventListener('admin-save-change', refreshRecovery);
    return () => window.removeEventListener('admin-save-change', refreshRecovery);
  }, [ownerId, loggedIn]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const fetchBooks = useCallback(async () => {
    const request = {};
    catalogRequest.current = request;
    setLoading(true);
    setRevision(null);
    try {
      const data = await apiRequest('/api/books/admin/catalog', { admin: true });
      if (request !== catalogRequest.current) throw Object.assign(new Error('Catalog request superseded.'), { name:'AbortError' });
      if (!Array.isArray(data.books) || !Number.isSafeInteger(data.revision)) throw new Error('Invalid catalog response. Reload before editing.');
      setBooks(data.books); setRevision(data.revision);
    } finally { if (request === catalogRequest.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    setBooks([]); setRevision(null); setModal(null); setError(''); setMessage(''); setPassword('');
    setLoading(false);
    if (loggedIn) fetchBooks().catch(error => { if (active && error.name !== 'AbortError') setError(error.message); });
    return () => { active = false; catalogRequest.current = null; };
  }, [fetchBooks, loggedIn, session.token, session.user]);
  async function login(event) {
    event.preventDefault();
    if (loginAttempt.current || session.checking || session.unavailable || loggedIn) return;
    const attempt = {};
    loginAttempt.current = attempt;
    setError('');
    setLoggingIn(true);
    try {
      const previousToken = localStorage.getItem('admin_token');
      const data = await apiRequest('/api/auth/login', { auth: false, method: 'POST', body: JSON.stringify({ username, password }) });
      if (loginAttempt.current !== attempt) return;
      if (data.role !== 'admin') throw new Error('Administrator access required.');
      if (localStorage.getItem('admin_token') !== previousToken) throw new Error('The administrator account changed while logging in. Please try again.');
      saveSession(data);
      setPassword('');
    } catch (error) { if (loginAttempt.current === attempt) setError(error.message); }
    finally { if (loginAttempt.current === attempt) { loginAttempt.current = null; setLoggingIn(false); } }
  }
  async function reorder({ active, over }) {
    if (mutationsPaused || session.unavailable || savingOrder.current || loading || revision === null || modal || !over || active.id === over.id) return;
    const from = books.findIndex(book => book._id === active.id);
    const to = books.findIndex(book => book._id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(books, from, to);
    savingOrder.current = true;
    setBooks(next);
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiRequest('/api/books/reorder', { admin: true, method: 'POST', body: JSON.stringify({ bookIds: next.map(book => book._id), revision }) });
      setRevision(data.revision); setMessage('Catalog order saved.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        setRevision(null);
        try { await fetchBooks(); setError(error.message + ' The latest catalog has been loaded.'); }
        catch (refreshError) { if (refreshError.name !== 'AbortError') setError('Reorder outcome could not be confirmed. Reload the catalog before making more changes.'); }
      }
    } finally { savingOrder.current = false; setSaving(false); }
  }
  async function saved(book) {
    setModal(null);
    setBooks(previous => previous.some(item => item._id === book._id) ? previous.map(item => item._id === book._id ? book : item) : [...previous, book]);
    setMessage('Book saved successfully.'); setError('');
    try { await fetchBooks(); }
    catch (error) { if (error.name !== 'AbortError') setError('The book was saved, but catalog refresh failed. Reload the catalog; do not add it again.'); }
  }
  async function reviewRecovery() {
    setAcknowledged(false); setReviewedRecovery(false);
    try { await fetchBooks(); setReviewedRecovery(true); }
    catch (error) { if (error.name !== 'AbortError') setError('The latest catalog could not be loaded. Keep recovery and try again.'); }
  }
  function discardRecovery() {
    if (!acknowledged || !reviewedRecovery || loading || revision === null || session.unavailable || modal) return;
    try { clearPendingSave(ownerId); setMessage('Recovery discarded after catalog review. Verify existing books before adding again.'); }
    catch { setRecoveryError('Recovery storage could not be cleared. Enable site storage and try again.'); }
  }
  return <main className="page-arrival page-shell min-h-screen bg-neutral-900 text-white p-4 sm:p-8">
    <Link href="/" className="underline text-yellow-300">Back to catalog</Link>
    <SessionNotice session={session} /><h1 className="text-3xl text-white my-6">Admin dashboard</h1>
    {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}
    {loggedIn && (pendingSave || recoveryError) && <section className="session-notice" aria-label="Pending administrator save">
      <div className="space-y-3 min-w-0">
        <p>{recoveryError || 'A previous save needs review. Other catalog changes are paused. Resume it with the original details before starting another save.'}</p>
        {pendingSave && <button disabled={!!modal || loading || saving || session.unavailable} className="secondary" onClick={() => setModal({ ...(pendingSave.bookId ? { _id:pendingSave.bookId, __v:pendingSave.version } : {}), recoverySave:pendingSave })}>Resume pending save</button>}
        <button disabled={!!modal || loading || saving || session.unavailable} className="secondary" onClick={reviewRecovery}>Review catalog for recovery</button>
        {reviewedRecovery && revision !== null && !loading && !modal && <><label className="flex gap-3 items-start"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />I reviewed the latest catalog. The previous save may already exist; discarding recovery does not undo it.</label><button disabled={!acknowledged || session.unavailable} onClick={discardRecovery} className="secondary">Discard reviewed recovery</button></>}
      </div>
    </section>}
    {!loggedIn ? session.unavailable ? null : <form onSubmit={login} className="max-w-sm space-y-4"><label className="block">Username<input required maxLength={50} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" className="block bg-neutral-800 rounded p-2 w-full" /></label><label className="block">Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" className="block bg-neutral-800 rounded p-2 w-full" /></label><button disabled={loggingIn || session.checking} className="bg-yellow-500 text-black px-4 py-2 rounded disabled:opacity-50">{loggingIn || session.checking ? 'Checking...' : 'Log in'}</button></form> : <>
      <div className="admin-toolbar flex flex-wrap gap-4 mb-6"><button disabled={mutationsPaused || session.unavailable || saving || loading || revision === null} onClick={() => setModal({})} className="bg-yellow-500 text-black rounded px-4 py-2">Add book</button><button disabled={session.unavailable || saving || loading} onClick={() => fetchBooks().then(() => setError('')).catch(error => { if (error.name !== 'AbortError') setError(error.message); })}>Reload catalog</button><button onClick={() => clearSession(true)}>Log out</button></div>
      <p className="text-neutral-300 mb-4">Drag a Reorder handle, or focus it, press Space, use arrow keys, and press Space again.</p>
      <p role="status">{message}</p><p role="status">{loading ? 'Loading catalog...' : saving ? 'Saving order...' : ''}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={books.map(book => book._id)} strategy={rectSortingStrategy}><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{books.map(book => <SortableBookCard key={book._id} book={book} disabled={mutationsPaused || session.unavailable || saving || loading || revision === null || !!modal} onEdit={() => setModal(book)} />)}</div></SortableContext></DndContext>
      {modal && <AddBookModal ownerId={ownerId} recoverySave={modal.recoverySave} onRetryConnection={session.retry} retrying={session.refreshing} connectionUnavailable={session.unavailable} key={modal._id || "new"} isOpen book={modal._id ? modal : null} onClose={() => setModal(null)} onSubmit={saved} />}
    </>}
  </main>;
}
