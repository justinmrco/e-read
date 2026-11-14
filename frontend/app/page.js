"use client";
import { useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LoginModal from '../components/LoginModal';
import BookDetailModal from '../components/BookDetailModal';
import BookSection from '../components/BookSection';
import BookCollection from '../components/BookCollection';
import SessionNotice from '../components/SessionNotice';
import BookSkeleton from '../components/BookSkeleton';
import { apiRequest, clearSession } from '../lib/api';
import { useSession } from '../lib/use-session';
import { parseCatalog } from '../lib/catalog';
export default function LandingPage() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(0);
  const [login, setLogin] = useState(false);
  const [selected, setSelected] = useState(null);
  const session = useSession();
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setUnavailable(0);
    apiRequest('/api/books', { auth:false }).then(data => { const catalog = parseCatalog(data); if (active) { setBooks(catalog.books); setUnavailable(catalog.unavailable); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const filtered = books.filter(book => String(book.title || '').toLowerCase().includes(search.trim().toLowerCase()) && (!genre || book.genre === genre));
  const featured = useMemo(() => books.slice(0,7), [books]);
  const searching = !!search.trim() || !!genre;

  return <div className="min-h-screen flex flex-col">
    <Navbar isLoggedIn={!!session.user} sessionUnavailable={session.unavailable} onLoginClick={() => setLogin(true)} onLogoutClick={() => clearSession()} search={search} genre={genre} onSearch={(term,value)=>{setSearch(term);setGenre(value);}} />
    <main id="main" className="catalog-shell flex-grow px-4 sm:px-8 py-8"><h1 className="sr-only">E-Read book catalog</h1><SessionNotice session={session} />{searching && <button className="secondary mb-5" onClick={()=>{setSearch('');setGenre('');}}>Clear filters</button>}
      {!loading && !error && unavailable > 0 && <div role="status" className="session-notice"><p>Some books are temporarily unavailable because their details could not be verified.</p><button className="secondary" onClick={() => setRetry(value => value + 1)}>Refresh catalog</button></div>}
      {error ? <div role="alert" className="session-notice"><p>{error}</p><button className="secondary" onClick={()=>setRetry(value=>value+1)}>Try again</button></div> : loading ? <BookSkeleton /> : !filtered.length ? <div className="text-center py-12"><BookOpen aria-hidden="true" className="mx-auto mb-4" /><p>{searching ? 'No books match this selection.' : 'No books are available yet.'}</p></div> : searching ? <BookSection title="Search results" books={filtered} onBookClick={setSelected} /> : <><BookSection title="Featured books" books={featured} layout="scroll" onBookClick={setSelected} />{!!books.slice(7).length && <BookCollection books={books.slice(7)} onBookClick={setSelected} />}</>}
    </main>
    {selected && <BookDetailModal book={selected} onClose={() => setSelected(null)} />}
    {login && <LoginModal onClose={() => setLogin(false)} onLoginSuccess={() => setLogin(false)} />}
    <Footer />
  </div>;
}
