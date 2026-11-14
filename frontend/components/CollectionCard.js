"use client";
/* eslint-disable @next/next/no-img-element -- Local transparent motifs retain their alpha. */
import { useState } from 'react';
import BookCover from './BookCover';
// ponytail: artwork-specific compositions; add an entry only with a prepared local motif.
const treatments = {
  '/covers/fableworld.jpg': { name:'fable', image:'fable-vine', rear:'M3 12 C-9 22 -5 45 3 58 M97 40 C108 49 108 70 98 78', front:'M3 12 C13 18 11 36 3 46 M98 54 C88 62 92 72 98 78' },
  '/covers/feedsbelow.jpg': { name:'feeds', image:'collection-feeds-mushroom', rear:'M3 26 C-8 34 -8 58 3 67 M97 12 C108 18 107 39 97 48', front:'M3 42 C11 47 11 59 3 67 M97 12 C87 20 91 35 97 39' },
  '/covers/dreamthief.jpg': { name:'dream', image:'collection-dream-lilac', rear:'M3 8 L-3 12 L-3 40 L3 46 M97 32 L103 38 L103 65 L97 71', front:'M3 8 L13 18 L3 28 M97 48 L88 58 L97 71' },
  '/covers/worldapart.jpg': { name:'world', image:'collection-world-gold', rear:'M97 18 C111 28 108 53 97 60 M3 29 C-8 40 -8 56 3 67', front:'M97 18 C83 26 85 47 97 52 M3 47 C18 50 16 62 3 67' },
  '/covers/Nous.jpg': { name:'nous', image:'collection-nous-butterfly', rear:'M97 6 C110 18 108 41 97 52 M3 40 C-8 48 -6 68 3 76', front:'M97 6 C87 17 90 33 97 39 M3 58 C12 65 10 70 3 76' },
};
export default function CollectionCard({ book, onClick }) {
  const [failed, setFailed] = useState(null);
  const treatment = failed === book.imageUrl ? null : treatments[book.imageUrl];
  return <button type="button" className="collection-card" data-cover={book.imageUrl === '/covers/fableworld.jpg' ? 'fable' : undefined} data-depth={treatment?.name} aria-label={'View details for ' + book.title + ' by ' + book.author + '. Rp' + book.price.toLocaleString('id-ID')} onClick={onClick}>
    {treatment && <span className="collection-orbit collection-orbit-rear" aria-hidden="true"><svg viewBox="0 0 100 150" preserveAspectRatio="none" focusable="false"><path d={treatment.rear} /></svg></span>}
    <BookCover book={book} onImageError={() => setFailed(book.imageUrl)} onImageLoad={image => { if (image.getAttribute?.('src') === '/sample-cover.svg') setFailed(book.imageUrl); }} />
    {treatment && <span className="collection-orbit collection-orbit-front" aria-hidden="true">
      <svg viewBox="0 0 100 150" preserveAspectRatio="none" focusable="false"><path d={treatment.front} /></svg>
      <img src={'/covers/decorations/' + treatment.image + '.png'} alt="" draggable={false} loading="lazy" onError={() => setFailed(book.imageUrl)} />
    </span>}
    <span className="collection-card-copy">
      <span className="collection-card-title">{book.title}</span>
      <span className="collection-card-author">{book.author}</span>
      <span className="collection-card-price">Rp{book.price.toLocaleString('id-ID')}</span>
    </span>
  </button>;
}
