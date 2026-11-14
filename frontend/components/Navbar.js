"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown, Search, ShoppingBag, X } from 'lucide-react';
import CartModal from './CartModal';
import { useCart } from '../lib/use-cart';
import { useSession } from '../lib/use-session';
const genres=['Fiction','Sci-Fi','Fantasy','Romance','Comedy','Thriller','Adventure','Mystery','Action','Historical'];
export default function Navbar({ isLoggedIn, onLoginClick, onLogoutClick, search, genre, onSearch, sessionUnavailable }) {
  const [cart,setCart]=useState(false);
  const [searchOpen,setSearchOpen]=useState(!!search);
  const [scrolled,setScrolled]=useState(false);
  const header=useRef(null), searchInput=useRef(null), searchToggle=useRef(null);
  const session=useSession();
  const accountCart=useCart(session);
  const quantity=accountCart.items.length;
  const initials=(session.user?.username || 'Reader').trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0] || '').join('').toUpperCase();
  useEffect(() => {
    const update=()=>setScrolled(window.scrollY > 12);
    const dismiss=event=>{ for(const details of header.current?.querySelectorAll('details[open]') || []) if(!details.contains(event.target)) details.open=false; };
    update();window.addEventListener('scroll',update,{passive:true});
    document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss);
    return ()=>{window.removeEventListener('scroll',update);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss);};
  },[]);
  useEffect(()=>{if(searchOpen) searchInput.current?.focus();},[searchOpen]);
  function escapeMenu(event) { if(event.key==='Escape') {event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();} }
  function closeMenu(event) { const details=event.currentTarget.closest('details');details.open=false;details.querySelector('summary')?.focus(); }
  return <header ref={header} className="site-header" data-scrolled={scrolled}><a href="#main" className="nav-skip sr-only focus:not-sr-only">Skip to content</a>
    <nav aria-label="Main navigation" className="site-nav">
      <Link href="/" className="nav-brand"><Image src="/logo.png" width={36} height={36} alt="" className="nav-logo" /><span className="brand-name">E-Read<span className="brand-dot" aria-hidden="true">.</span></span></Link>
      <form role="search" className="nav-search search-arrival" data-expanded={searchOpen} onSubmit={event=>event.preventDefault()} onKeyDown={event=>{if(event.key==='Escape' && searchOpen) {event.preventDefault();setSearchOpen(false);searchToggle.current?.focus();}}}>
        <Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor="catalog-search">Search book titles</label><input ref={searchInput} id="catalog-search" type="search" placeholder="Find your next read" value={search} onChange={event=>onSearch(event.target.value,genre)} />
      </form>
      <details className="nav-genres nav-dropdown" onKeyDown={escapeMenu}><summary>{genre || 'Genres'}<ChevronDown size={14} aria-hidden="true" /></summary><div className="nav-menu menu-arrival" role="group" aria-label="Filter by genre"><p className="nav-menu-caption">Browse by genre</p>{['',...genres].map(value=><button key={value} aria-pressed={genre===value} onClick={event=>{onSearch(search,value);closeMenu(event);}}>{value || 'All genres'}</button>)}</div></details>
      <div className="nav-account-actions">
        <button ref={searchToggle} className="nav-icon nav-search-toggle" aria-label={searchOpen ? 'Close search' : 'Open search'} aria-controls="catalog-search" aria-expanded={searchOpen} onClick={()=>setSearchOpen(value=>!value)}>{searchOpen ? <X size={21} aria-hidden="true" /> : <Search size={21} aria-hidden="true" />}</button>
        <button onClick={()=>isLoggedIn?setCart(true):onLoginClick()} className="nav-icon nav-cart" aria-label={'Cart, '+quantity+' books'}><ShoppingBag size={22} aria-hidden="true" />{quantity>0&&<span className="cart-count">{quantity}</span>}</button>
        {isLoggedIn?<details className="nav-profile nav-dropdown" onKeyDown={escapeMenu}><summary aria-label="Your profile" className="profile-trigger">{initials}</summary><div className="nav-menu nav-profile-menu menu-arrival"><p className="nav-menu-caption">Your reading space</p><p className="nav-account-name">{session.user?.username || 'Reader'}</p>{[['Profile','/profile#account'],['Library','/profile#purchased-books'],['Orders','/profile#transaction-history'],['Settings','/profile#settings']].map(([label,href])=><Link key={label} href={href} onClick={closeMenu}>{label}</Link>)}<div className="nav-menu-divider" /><button onClick={event=>{closeMenu(event);onLogoutClick();}}>Log out</button></div></details>:sessionUnavailable?<span className="nav-session-notice" role="status">Session unavailable</span>:<button onClick={onLoginClick} className="nav-login">Sign in <span aria-hidden="true">&nearr;</span></button>}
      </div>
    </nav>{cart&&<CartModal onClose={()=>setCart(false)} />}
  </header>;
}
