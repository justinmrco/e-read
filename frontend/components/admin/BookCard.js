"use client";
import BookCover from '../BookCover';
export default function BookCard({ book }) {
  return <div className="bg-neutral-800 border border-neutral-600 rounded p-4"><div className="max-w-36 mx-auto"><BookCover book={book} /></div><h2 className="text-xl mt-4 line-clamp-2">{book.title || 'Untitled'}</h2><p className="text-sm text-neutral-300 mt-2">{book.author || 'Unknown author'}</p><div className="flex flex-wrap justify-between gap-2 text-xs mt-3"><span className="text-yellow-300">{book.genre}</span><span className="font-semibold">Rp{Number(book.price || 0).toLocaleString('id-ID')}</span></div></div>;
}
