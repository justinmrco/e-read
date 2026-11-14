export function parseCatalog(data) {
  if (!Array.isArray(data)) throw new Error('The catalog response was unavailable. Please try again.');
  const counts = new Map();
  for (const book of data) if (typeof book?._id === 'string') {
    const id = book._id.toLowerCase();
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const books = [];
  for (const book of data) {
    if (!book || typeof book._id !== 'string' || !/^[a-f0-9]{24}$/i.test(book._id) || counts.get(book._id.toLowerCase()) !== 1) continue;
    if (![ ['title',200], ['author',200], ['description',5000], ['genre',100] ].every(([field,max]) => typeof book[field] === 'string' && book[field].trim() && book[field].length <= max)) continue;
    if (!Number.isInteger(book.year) || book.year < 1000 || book.year > 3000 || !Number.isSafeInteger(book.price) || book.price < 1 || book.price > 100000000) continue;
    let imageUrl = '/sample-cover.svg';
    if (typeof book.imageUrl === 'string' && book.imageUrl.length <= 2048) {
      if (/^\/covers\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/i.test(book.imageUrl)) imageUrl = book.imageUrl;
      try {
        const url = new URL(book.imageUrl);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) imageUrl = url.href;
      } catch {}
    }
    books.push({ _id:book._id.toLowerCase(), title:book.title.trim(), author:book.author.trim(), description:book.description.trim(), genre:book.genre.trim(), year:book.year, price:book.price, imageUrl, format:typeof book.format === 'string' && book.format.length <= 100 ? book.format.trim() : '', publisher:typeof book.publisher === 'string' && book.publisher.length <= 200 ? book.publisher.trim() : '', pages:Number.isInteger(book.pages) && book.pages > 0 && book.pages <= 100000 ? book.pages : null, hook:typeof book.hook === 'string' && book.hook.length <= 100 ? book.hook.trim() : '' });
  }
  if (data.length && !books.length) throw new Error('Catalog details are unavailable. Please try again later.');
  return { books, unavailable:data.length - books.length };
}
