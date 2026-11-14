"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ShoppingCart, X } from 'lucide-react';
import Modal from './Modal';
import BookCover from './BookCover';
import LoginModal from './LoginModal';
import SessionNotice from './SessionNotice';
import { apiRequest, signalCart } from '../lib/api';
import { parseLibrary } from '../lib/records';
import { checkout } from '../lib/checkout';
import { useSession } from '../lib/use-session';
import { bookDetailArt } from '../lib/book-detail-art';
import { imageHue } from '../lib/cover-accent';
export default function BookDetailModal({ book, onClose, themeColor }) {
  const [showLogin, setShowLogin] = useState(false);
  const [ownership, setOwnership] = useState(null);
  const [checking, setChecking] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [coverAccent, setCoverAccent] = useState(null);
  const override = typeof themeColor === 'string' && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(themeColor) ? themeColor : null;
  const hue = coverAccent?.source === book.imageUrl ? coverAccent?.hue : null;
  const art = coverAccent?.source === book.imageUrl && coverAccent?.failed ? null : bookDetailArt[book.imageUrl];
  const color = override || art?.accent || (hue != null ? 'hsl(' + hue + ' 45% 65%)' : '#c9c3b8');
  const hookWords = book.hook?.trim().split(/\s+/) || [];
  const session = useSession();
  const verified = !!session.user && ownership?.token === session.token && ownership.bookId === book._id; const owned = verified && ownership.owned;
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    function refresh() { setRetry(value => value + 1); }
    for (const name of ['focus', 'pageshow', 'online']) window.addEventListener(name, refresh);
    return () => { for (const name of ['focus', 'pageshow', 'online']) window.removeEventListener(name, refresh); };
  }, []);
  useEffect(() => {
    function reset() { busy.current = false; setProcessing(false); }
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  useEffect(() => {
    let active = true;
    setChecking(true);
    setOwnership(null);
    setMessage('');
    if (session.checking) return;
    if (!session.user || session.unavailable) { setChecking(false); return; }
    apiRequest('/api/user/books').then(response => { const data = parseLibrary(response); if (data.unavailable) throw new Error('Some library details are unavailable. Please retry.'); if (active) setOwnership({ token: session.token, bookId:book._id, owned: data.books.some(item => item._id === book._id) }); }).catch(error => { if (active && error.name !== 'AbortError') setMessage(error.message); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [book._id, session.token, session.user, session.checking, session.unavailable, retry]);
  async function buy() {
    if (session.unavailable || session.checking || checking) return;
    if (!session.user) { setShowLogin(true); return; }
    if (busy.current || !verified || owned) return;
    busy.current = true;
    setProcessing(true);
    setMessage('');
    try { await checkout([book._id], false, session.token, () => mounted.current); }
    catch (error) { setMessage(error.message); busy.current = false; setProcessing(false); }
  }
  async function add() {
    if (session.unavailable || session.checking || checking || busy.current || processing || (session.user && (!verified || owned))) return;
    if (!session.user) { setShowLogin(true); return; }
    if (localStorage.getItem('token') !== session.token) { setMessage('Account changed. Please wait for your account to refresh.'); return; }
    busy.current = true; setProcessing(true);
    try {
      await apiRequest('/api/user/cart/items', { method:'POST', body:JSON.stringify({ bookId:book._id }) });
      if (!mounted.current) return;
      signalCart(session.user._id);
      setMessage('Added to cart.');
    } catch (error) { if (mounted.current && error.name !== 'AbortError') setMessage(error.message || 'Your cart could not be saved. Please try again.'); }
    finally { busy.current = false; if (mounted.current) setProcessing(false); }
  }
  return <>
    <Modal title={book.title} onClose={onClose} onClosing={() => { mounted.current = false; }}>{requestClose => <div className="book-detail text-white relative" data-art={art?.id} style={{ '--book-theme-color':color, ...(art ? { '--detail-background':art.bg } : {}) }}>
      <div className="detail-close-row"><button aria-label="Close book details" onClick={requestClose} className="icon-button"><X /></button></div>
      {art && <div className="detail-cover-scenery" aria-hidden="true">
        <svg viewBox="0 0 1000 800" preserveAspectRatio="none" fill="none"><path d="M-20 740 C160 620 -60 330 100 190 S180 60 40 -20 M1020 60 C840 190 1050 380 920 570 S900 760 1020 820" /></svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="detail-edge-motif" src={'/covers/decorations/' + art.motif + '.png'} alt="" onError={() => setCoverAccent({ source:book.imageUrl, hue:null, failed:true })} />
      </div>}
      <SessionNotice session={session} /><div className="book-detail-layout">
        <div className="detail-cover"><BookCover book={book} onImageLoad={image => setCoverAccent({ source:book.imageUrl, hue:imageHue(image), failed:image.getAttribute?.('src') === '/sample-cover.svg' })} onImageError={() => setCoverAccent({ source:book.imageUrl, hue:null, failed:true })} /></div>
        <div className="book-detail-copy"><p className="detail-meta"><span className="genre-tag">{book.genre}</span><span>{book.year}</span></p><h2 className="book-detail-title" data-genre={book.genre}>{book.title}</h2><p className="detail-author">by {book.author}</p><section className="detail-edition" aria-label="Edition details"><p className="detail-edition-label">Edition details</p><dl className="detail-specs">{[['Format',book.format],['Pages',book.pages],['Publisher',book.publisher]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not specified'}</dd></div>)}</dl></section><p className="detail-synopsis">{book.description}</p>
          {book.hook && <div className="detail-closing">
            <div className="detail-watermark" aria-hidden="true">{art ? <><svg viewBox="0 0 400 300" fill="none"><path d={art.path} /></svg>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="detail-closing-motif" src={'/covers/decorations/' + art.motif + '.png'} alt="" onError={() => setCoverAccent({ source:book.imageUrl, hue:null, failed:true })} /></> : <svg viewBox="0 0 400 260" fill="none"><path d="M40 200 L150 85 L285 135 L350 30 M150 85 L225 230 L285 135 M40 200 L225 230" />{[[40,200],[150,85],[285,135],[350,30],[225,230]].map(([cx,cy]) => <circle key={cx} cx={cx} cy={cy} r="3" />)}</svg>}{[0,1,2,3,4].map(i => <span key={i} className="detail-particle" style={{ '--particle-index':i }} />)}</div>
            <p className="detail-hook"><span className="sr-only">{book.hook}</span><span aria-hidden="true"><span className="detail-hook-opening">{hookWords.slice(0, -2).join(' ')}{hookWords.length > 2 ? ' ' : ''}</span><span className="detail-hook-turn">{hookWords.slice(-2).join(' ')}</span></span></p>
          </div>}
          </div>
          <div className="detail-purchase">

          {message && <p role="status" className="feedback mt-3">{message === 'Added to cart.' && <Check size={18} aria-hidden="true" />}{message}</p>}
          {session.user && !verified && !checking && !session.unavailable && <button className="secondary mt-3" onClick={() => setRetry(value => value + 1)}>Retry library check</button>}<p className="detail-price-caption">Your next read</p><p className="detail-price"><span className="detail-currency">Rp</span><span>{book.price.toLocaleString('id-ID')}</span></p><p className="detail-checkout-label">Sandbox checkout</p><ul className="detail-features" aria-label="Reading features"><li>Multi-device</li><li>Offline reading ? planned</li></ul><div className="detail-actions">
            {owned ? <p className="text-green-300">In your purchased library</p> : <>
              <button disabled={session.unavailable || session.checking || checking || processing || (!!session.user && !verified)} onClick={buy} className="detail-buy"><span>{checking ? 'Checking library...' : processing ? 'Checkout in progress...' : 'Make it yours'}</span><ArrowUpRight size={20} aria-hidden="true" /></button>
              <button disabled={session.unavailable || session.checking || checking || processing || (!!session.user && !verified)} onClick={add} className="detail-cart"><ShoppingCart size={18} aria-hidden="true" /><span>Add to cart</span></button>
            </>}
            <Link href="/readbook" className="block text-yellow-300 underline">Open shared sample reader</Link>
          </div><p className="detail-sample-notice">Academic sandbox demo. All titles use the same public sample reader.</p></div>
      </div>

    </div>}</Modal>
    {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLoginSuccess={() => setShowLogin(false)} />}
  </>;
}
