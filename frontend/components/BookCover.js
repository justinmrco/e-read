"use client";
import { useState } from 'react';
export default function BookCover({ book, onImageLoad, onImageError }) {
  const [failed, setFailed] = useState(null);
  const source = book.imageUrl || '/sample-cover.svg';
  const current = failed === source ? '/sample-cover.svg' : source;
  if (failed === 'fallback:' + source) return <span className="book-cover" aria-hidden="true" />;
  return <span className="book-cover">
    {/* Remote covers use a native image with a bounded local fallback. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img key={source} src={current} alt="" loading="lazy" onLoad={event => onImageLoad?.(event.currentTarget)} onError={() => { onImageError?.(); setFailed(current === '/sample-cover.svg' ? 'fallback:' + source : source); }} />
  </span>;
}
