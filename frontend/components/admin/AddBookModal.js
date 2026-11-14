"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import Modal from "../Modal";
import { apiRequest } from "../../lib/api";
import { storePendingSave, clearPendingSave } from '../../lib/admin-save';

export default function AddBookModal({ isOpen, book, ownerId, recoverySave, onClose, onSubmit, connectionUnavailable = false, onRetryConnection, retrying = false }) {
  const initial = recoverySave?.payload || book;
  const [title, setTitle] = useState(initial?.title || "");
  const [author, setAuthor] = useState(initial?.author || "");
  const [year, setYear] = useState(initial?.year ?? "");
  const [genre, setGenre] = useState(initial?.genre || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || "/sample-cover.svg");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [hook, setHook] = useState(initial?.hook || '');
  const [format, setFormat] = useState(initial?.format || '');
  const [pages, setPages] = useState(initial?.pages ?? '');
  const [publisher, setPublisher] = useState(initial?.publisher || '');
  const [notification, setNotification] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(recoverySave?.state || '');
  const [latest, setLatest] = useState(null);
  const submitting = useRef(false);
  const saved = useRef(false);
  const requestId = useRef(recoverySave?.requestId || null);
  const pendingSave = useRef(recoverySave?.payload || null);
  const version = useRef(recoverySave?.version ?? book?.__v ?? 0);
  function close() { if (!submitting.current) onClose(); }

  const genres = [
    'Fiction', 'Sci-Fi', 'Fantasy', 'Romance', 'Comedy', 'Thriller', 'Adventure',
    'Mystery', 'Action', 'Historical'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (connectionUnavailable || submitting.current || saved.current || recovery === 'conflict') return;
    if (!title.trim() || !author.trim() || !year || !genre || !description.trim() || !imageUrl || !price) {
      setNotification('Complete every required field.');
      return;
    }

    const newBook = pendingSave.current || {
      title,
      hook,
      format, publisher, pages:pages === '' ? null : Number(pages),
      author,
      year: Number(year),
      genre,
      description,
      imageUrl,
      price: Number(price),
    };

    if (!Number.isInteger(newBook.year) || newBook.year < 1000 || newBook.year > 3000 || !Number.isSafeInteger(newBook.price) || newBook.price < 1 || newBook.price > 100000000) { setNotification('Use a valid year and a whole-IDR price from 1 to 100,000,000.'); return; }
    if (newBook.hook !== undefined && (typeof newBook.hook !== 'string' || newBook.hook.length > 100)) { setNotification('Card hooks must be at most 100 characters.'); return; }
    if (newBook.format?.length > 100 || newBook.publisher?.length > 200 || (newBook.pages != null && (!Number.isInteger(newBook.pages) || newBook.pages < 1 || newBook.pages > 100000))) { setNotification('Use valid edition details and a whole page count from 1 to 100,000.'); return; }
    let safeImage = imageUrl === '/sample-cover.svg' || /^\/covers\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/i.test(imageUrl);
    try { const url = new URL(imageUrl); safeImage = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch {}
    if (!safeImage) { setNotification('Use a /covers/ image path, /sample-cover.svg, or an HTTP(S) image URL without embedded credentials.'); return; }
    submitting.current = true; setBusy(true); setNotification('');
    let sent = false;
    try {
      if (!book) requestId.current ||= crypto.randomUUID();
      pendingSave.current = newBook;
      storePendingSave(ownerId, { bookId:book?._id || null, requestId:requestId.current, payload:newBook, version:version.current, state:'uncertain' });
      sent = true;
      const result = await apiRequest(book ? '/api/books/' + book._id : '/api/books', { admin: true, method: book ? 'PATCH' : 'POST', headers: book ? {} : { 'Idempotency-Key': requestId.current }, body: JSON.stringify(book ? { ...newBook, version: version.current } : newBook) });
      if (!result || !/^[a-f0-9]{24}$/i.test(result._id) || (book && result._id !== book._id)) throw new Error('Save response could not be verified.');
      saved.current = true;
      clearPendingSave(ownerId);
      await onSubmit(result);
    } catch (error) {
      if (error.name !== 'AbortError') {
        if (!sent) setNotification('Recovery storage is unavailable. No save request was sent. Enable site storage, then retry.');
        else if (saved.current) setNotification('The book was saved. Close this form and reload the catalog; do not submit it again.');
        else if (!error.status || error.status >= 500) {
          setRecovery('uncertain');
          setNotification('Save outcome unconfirmed. Your submitted details are kept unchanged. Retry the same save before closing; do not start another addition.');
        } else if (error.status === 409) {
          setRecovery('conflict');
          try { storePendingSave(ownerId, { bookId:book?._id || null, requestId:requestId.current, payload:newBook, version:version.current, state:'conflict' }); } catch {}
          setNotification('The saved record differs from this draft. Review the latest catalog before saving again. Your draft is kept.');
        } else {
          // Only validation failures prove the mutation was rejected before writing.
          if (error.status === 400) {
            try { clearPendingSave(ownerId); } catch { setNotification('The save was rejected, but recovery storage could not be cleared. Review the catalog before discarding recovery.'); return; }
            pendingSave.current = null; setRecovery('');
          } else setRecovery('uncertain');
          setNotification(error.message);
        }
      }
    }
    finally { submitting.current = false; setBusy(false); }

  };
  async function reviewLatest() {
    if (submitting.current || connectionUnavailable) return;
    submitting.current = true; setBusy(true);
    try {
      const data = await apiRequest('/api/books/admin/catalog', { admin:true });
      if (!Array.isArray(data.books)) throw new Error('Catalog unavailable. Please retry.');
      const current = data.books.find(item => item._id === book._id);
      if (!current || !Number.isSafeInteger(current.__v ?? 0) || (current.__v ?? 0) < 0) throw new Error('The current book or version is unavailable. Keep your draft and inspect the catalog.');
      setLatest({ ...current, __v:current.__v ?? 0 }); setNotification('Compare the latest saved details below with your draft. Nothing has been overwritten.');
    } catch (error) { if (error.name !== 'AbortError') setNotification(error.message); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (!isOpen) return null;

  return (
    <Modal title={book ? 'Edit a book' : 'Add a book'} onClose={close} canClose={() => !submitting.current}>{requestClose => (
      <div className="bg-neutral-800 text-white rounded-xl shadow-lg w-full max-w-4xl p-6 relative">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl text-yellow-300 font-bold">{book ? 'Edit Book' : 'Add a New Book'}</h2>
          <button type="button" disabled={busy} aria-label="Close book form" onClick={requestClose}>
            <X className="w-6 h-6 text-white hover:text-yellow-300" />
          </button>
        </div>

        {notification && (
          <div role="alert" className="mb-4 text-sm text-center text-red-300">{notification}</div>
        )}

        {connectionUnavailable && <div role="status" className="session-notice"><p>Connection unavailable. Your draft is kept; retry the connection before saving.</p><button type="button" disabled={retrying} onClick={onRetryConnection} className="secondary">{retrying ? 'Checking connection...' : 'Retry connection'}</button></div>}
        {recovery === 'uncertain' && !saved.current && <button type="button" disabled={busy || connectionUnavailable} onClick={handleSubmit} className="secondary mb-4">Retry same save</button>}
        {recovery === 'conflict' && book && <div className="mb-4 space-y-3">
          <button type="button" disabled={busy || connectionUnavailable} onClick={reviewLatest} className="secondary">Review latest saved details</button>
          {latest && <><h3 className="text-lg text-yellow-300">Latest saved details</h3><dl className="space-y-2 break-words">{['title','hook','format','pages','publisher','author','year','genre','description','imageUrl','price'].map(field => <div key={field}><dt className="text-neutral-300">{field}</dt><dd>{latest[field]}</dd></div>)}</dl>
            <p className="text-sm text-yellow-300">Saving after this choice replaces all current details with your draft. Review every field first. A newer competing edit will still be rejected.</p>
            <button type="button" disabled={busy || connectionUnavailable} className="secondary" onClick={() => { version.current = latest.__v; pendingSave.current = null; setRecovery(''); setLatest(null); setNotification('Draft retained with the reviewed version. Review your fields, then save explicitly.'); }}>Keep my draft with this reviewed version</button></>}
        </div>}
        {/* Form */}
        <form onSubmit={handleSubmit}><fieldset disabled={connectionUnavailable || busy || saved.current || !!recovery} className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
          <div>
            <label htmlFor="add-book-0" className="block text-sm mb-1">Title</label>
            <input id="add-book-0" maxLength={200}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
            />
          </div>

          <div>
            <label htmlFor="add-book-1" className="block text-sm mb-1">Genre</label>
            <select id="add-book-1"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
            >
              <option value="">Select Genre</option>
              {genres.map((g, i) => (
                <option key={i} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="add-book-2" className="block text-sm mb-1">Author</label>
            <input id="add-book-2" maxLength={200}
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
            />
          </div>

          <div>
            <label htmlFor="add-book-6" className="block text-sm mb-1">Image URL</label>
            <input id="add-book-6" maxLength={2048}
              type="text" placeholder="/covers/book.jpg or https://..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
            />
          </div>

          <div>
            <label htmlFor="add-book-3" className="block text-sm mb-1">Year Release</label>
            <input id="add-book-3" step={1}
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
              min="1000"
              max="3000"
            />
          </div>

          <div>
            <label htmlFor="add-book-4" className="block text-sm mb-1">Price (Rp)</label>
            <input id="add-book-4" max={100000000} step={1}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
              min="1"
            />
          </div>

          <div className="md:col-span-2"><label htmlFor="book-hook" className="block text-sm mb-1">Card hook (optional)</label><input id="book-hook" type="text" maxLength={100} value={hook} onChange={event => setHook(event.target.value)} aria-describedby="book-hook-help" className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600" /><p id="book-hook-help" className="text-sm text-neutral-300 mt-1">A short, spoiler-free phrase. {hook.length}/100 characters.</p></div>
          <div><label htmlFor="book-format" className="block text-sm mb-1">Edition format (optional)</label><input id="book-format" maxLength={100} value={format} onChange={event => setFormat(event.target.value)} className="w-full px-4 py-2 rounded-md" /></div>
          <div><label htmlFor="book-pages" className="block text-sm mb-1">Edition pages (optional)</label><input id="book-pages" type="number" min={1} max={100000} step={1} value={pages} onChange={event => setPages(event.target.value)} className="w-full px-4 py-2 rounded-md" /></div>
          <div className="md:col-span-2"><label htmlFor="book-publisher" className="block text-sm mb-1">Edition publisher (optional)</label><input id="book-publisher" maxLength={200} value={publisher} onChange={event => setPublisher(event.target.value)} className="w-full px-4 py-2 rounded-md" /><p className="text-sm text-neutral-300 mt-1">Use verified details for the supplied edition, not the shared demo reader.</p></div>
          {/* Description full width */}
          <div className="md:col-span-2">
            <label htmlFor="add-book-5" className="block text-sm mb-1">Description</label>
            <textarea id="add-book-5" maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              className="w-full px-4 py-2 rounded-md bg-neutral-800 border border-neutral-600"
              required
            />
          </div>

          {/* Submit Button */}
          <div className="md:col-span-2 flex justify-end mt-4">
            <button
              type="submit" disabled={busy || saved.current}
              className="bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-2 rounded-lg"
            >
              {busy ? 'Saving...' : saved.current ? 'Saved' : book ? 'Save changes' : 'Add book'}
            </button>
          </div>
        </fieldset></form>
      </div>
    )}</Modal>
  );
}
