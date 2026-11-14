"use client";
import BookCard from './BookCard';
import { useEffect, useRef, useState } from 'react';
import { shelfMotion } from '../lib/shelf-motion';
export default function BookSection({ title, books, layout = 'grid', onBookClick }) {
  const section = useRef(null), rail = useRef(null), original = useRef(null);
  const [loop, setLoop] = useState(false);
  useEffect(() => {
    if (layout !== 'scroll') return;
    const controller = shelfMotion(section.current, rail.current, original.current, loop, setLoop);
    return () => controller.dispose();
  }, [layout, books, loop]);
  const cards = (items, copy = false) => items.map((book, index) => <BookCard key={book._id} book={book} duplicate={copy} onClick={event => {
    if (copy) {
      rail.current.scrollLeft += original.current.offsetLeft - event.currentTarget.parentElement.offsetLeft;
      original.current.children[index].focus({ preventScroll:true });
    }
    onBookClick(book);
  }} />);
  return <section ref={section} className="book-section">
    <div className="shelf-heading"><h2>{title}</h2>{layout === 'scroll' && loop && <span className="shelf-hint">Scroll to explore <span aria-hidden="true">↔</span></span>}</div>
    <div ref={rail} className={layout === 'scroll' ? 'book-rail hide-scrollbar' : 'catalog-grid'} role={layout === 'scroll' ? 'region' : undefined} aria-label={layout === 'scroll' ? title : undefined} tabIndex={layout === 'scroll' ? 0 : undefined}>
      {layout === 'scroll' ? <>{loop && <div className="book-rail-set" aria-hidden="true">{cards(books.slice(0,7), true)}</div>}<div ref={original} className="book-rail-set">{cards(books.slice(0,7))}</div>{loop && <div className="book-rail-set" aria-hidden="true">{cards(books.slice(0,7), true)}</div>}</> : cards(books)}
    </div>
    {layout === 'scroll' && books.length > 7 && <div className="catalog-grid mt-6">{cards(books.slice(7))}</div>}
  </section>;
}
