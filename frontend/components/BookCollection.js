"use client";
import { useState } from 'react';
import CollectionCard from './CollectionCard';
export default function BookCollection({ books, onBookClick }) {
  const [genre, setGenre] = useState('');
  if (!books.length) return null;
  const genres = [...new Set(books.map(book => book.genre))];
  const active = genres.includes(genre) ? genre : '';
  return <section className="book-collection" aria-label="Find your next read">
    <h2 className="collection-heading">Find your next read</h2>
    <div className="collection-filters" role="group" aria-label="Filter the collection by genre">
      {['', ...genres].map(value => <button key={value} type="button" aria-pressed={active === value} onClick={() => setGenre(value)}>{value || 'All books'}</button>)}
    </div>
    <section className="book-section" aria-label="Explore the collection">
      <div className="shelf-heading"><h2>Explore the collection</h2></div>
      <div className="catalog-grid collection-grid">
        {books.filter(book => !active || book.genre === active).map(book => <CollectionCard key={book._id} book={book} onClick={() => onBookClick(book)} />)}
      </div>
    </section>
  </section>;
}
