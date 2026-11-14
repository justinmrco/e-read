"use client";
/* eslint-disable @next/next/no-img-element -- Local transparent cutouts retain their original alpha. */
import BookCover from './BookCover';
import { useState } from 'react';
import { imageHue } from '../lib/cover-accent';
export default function BookCard({ book, onClick, duplicate = false }) {
  const [accent, setAccent] = useState(null);
  const fallback = ({ Fantasy:155, Romance:335, Historical:40, Fiction:215, Adventure:175, Comedy:45, Mystery:255, Thriller:265, Action:15, 'Sci-Fi':200 })[book.genre] ?? 210;
  const hue = accent?.source === book.imageUrl ? accent.hue ?? fallback : fallback;
  // ponytail: prepared cover-specific cutouts; extend this map only when another asset is prepared.
  const decoration = ({ '/covers/the-hazel-wood.avif':'hazel-branch', '/covers/furthermore.jpg':'furthermore-leaves', '/covers/wicked.webp':'wicked-blossom', '/covers/fireonhigh.jpg':'fire-citrus', '/covers/colorproject.jpg':'color-flower', '/covers/bittersweet.jpg':'bitter-thorn', '/covers/weyward.jpg':'weyward-butterfly', '/covers/fableworld.jpg':'fable-vine' })[book.imageUrl];
  const visibleDecoration = decoration && !(accent?.source === book.imageUrl && accent.failed);
  const hazel = decoration === 'hazel-branch';
  const wicked = decoration === 'wicked-blossom';
  const fire = decoration === 'fire-citrus';
  const color = decoration === 'color-flower';
  const bitter = decoration === 'bitter-thorn';
  const fable = decoration === 'fable-vine';
  const weyward = decoration === 'weyward-butterfly';
  const flowingHook = visibleDecoration && Boolean(book.hook);
  return <button type="button" tabIndex={duplicate ? -1 : undefined} onPointerDown={duplicate ? event => event.preventDefault() : undefined} onClick={onClick} aria-label={'View details for ' + book.title + (flowingHook ? '. ' + book.hook : '')} className="book-card" style={{ '--cover-hue':hue }}><span className={'card-artwork' + (visibleDecoration ? ' card-artwork-blend' : '')}><BookCover book={book} onImageLoad={image => setAccent({ source:book.imageUrl, hue:imageHue(image), failed:image.getAttribute?.('src') === '/sample-cover.svg' })} onImageError={() => setAccent({ source:book.imageUrl, hue:null, failed:true })} />{visibleDecoration && <span className={'card-decoration card-decoration-' + decoration} aria-hidden="true">
  <svg className="card-vine-rear" viewBox="0 0 120 330" preserveAspectRatio="none" focusable="false"><path d={fable ? 'M12 65 C-8 115 8 150 22 175 S10 220 12 265 M110 190 C130 225 120 285 112 330' : weyward ? 'M12 220 C-5 265 18 320 65 310 S120 290 112 330' : bitter ? 'M112 95 C138 120 130 165 108 188 S88 230 110 255' : color ? 'M14 25 C-10 40 -8 90 14 112 M110 230 C127 255 125 295 112 330' : fire ? 'M108 190 C130 215 125 250 103 275 S90 310 112 330' : wicked ? 'M12 35 C35 -8 95 -8 112 35 S125 130 105 170' : hazel ? 'M105 20 C130 55 130 105 108 140 S85 185 105 225' : 'M110 115 L125 155 108 195 122 235'} /></svg>
  <span className="card-vine-front">
    <svg viewBox="0 0 120 330" preserveAspectRatio="none" focusable="false"><path d={fable ? 'M12 65 C35 85 28 130 22 175 S40 230 12 265 M110 190 C88 220 92 280 112 330' : weyward ? 'M12 220 C35 245 4 280 35 300 S85 275 112 330 M110 45 C95 65 100 90 114 100' : bitter ? 'M108 188 C65 220 60 155 95 150 C125 145 114 200 104 225 S100 295 112 330' : color ? 'M14 112 C46 80 35 35 14 25 M110 230 C94 245 92 285 112 330' : fire ? 'M108 190 C90 210 67 225 78 248 S117 285 112 330' : wicked ? 'M12 35 C40 65 78 10 112 35 M105 170 C90 210 118 270 112 330' : hazel ? 'M108 140 C75 165 65 200 83 225 S118 280 112 330' : 'M108 195 L48 230 76 260 112 285 112 330'} /></svg>
    {[0,1].map(index => <img key={decoration + index} className={'card-leaf card-leaf-' + index} src={'/covers/decorations/' + decoration + '.png'} alt="" loading="lazy" draggable={false} onError={event => { event.currentTarget.style.display = 'none'; }} />)}
    <svg className="card-vine-tip" viewBox="0 0 24 140" preserveAspectRatio="none" focusable="false"><path d={fable ? 'M16 0 C4 22 27 48 14 70 S7 115 16 132 M14 70 L23 58' : weyward ? 'M16 0 C4 35 24 55 13 80 S8 115 17 132 M13 80 L5 71 M12 108 L20 99' : bitter ? 'M16 0 C30 24 4 45 14 70 S25 112 12 132 M14 70 L5 60 M20 105 L23 94' : color ? 'M16 0 C30 35 2 36 10 60 S28 108 12 132' : fire ? 'M16 0 C4 25 24 40 14 60 S5 100 16 132' : wicked ? 'M16 0 C28 35 8 45 16 75 S23 110 12 132 M16 75 L7 67' : hazel ? 'M16 0 C16 30 28 45 17 65 S5 108 14 132 M17 65 L8 56' : 'M16 0 L21 35 12 65 18 90 10 128 M12 65 L4 58'} /></svg>
  </span>
</span>}</span><span className="book-card-copy"><span className={'book-card-title' + (visibleDecoration ? ' book-card-title-sculpted title-' + decoration : '')} aria-hidden={visibleDecoration ? true : undefined}>{visibleDecoration ? (book.title || 'Untitled').split(/(\s+)/).map((word,index) => /\s+/.test(word) ? word : <span className="title-word" key={index} style={{ '--title-rise':(hazel ? 2 - Math.min(index,4) : 0) + 'px' }}>{Array.from(word).map((letter,letterIndex,letters) => {
  const position = letters.length > 1 ? letterIndex / (letters.length - 1) : .5;
  return <span className="title-letter" key={letterIndex} style={{ '--letter-rise':(Math.sin(position * Math.PI) * (hazel ? -2 : 3)).toFixed(2) + 'px', '--letter-turn':((position - .5) * (hazel ? -10 : 12)).toFixed(2) + 'deg' }}>{letter}</span>;
})}</span>) : book.title || 'Untitled'}</span><span className={'book-card-hook' + (flowingHook ? ' book-card-hook-flow' : '')} aria-hidden={flowingHook || !book.hook}>{flowingHook ? book.hook.split(/(\s+)/).map((word,index) => /\s+/.test(word) ? word : <span key={index} className="hook-word" style={{ '--word-rise':([0,-2,-3,-2,0][Math.floor(index / 2) % 5] * (hazel ? 1 : -1)) + 'px' }}>{word}</span>) : book.hook || ''}</span><span className="book-card-author" title={book.author}><span className="book-card-by">by </span>{book.author || 'Unknown author'}</span><span className="book-card-price">Rp{Number(book.price || 0).toLocaleString('id-ID')}</span></span></button>;
}
