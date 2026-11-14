export const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
export const validAmount = value => Number.isSafeInteger(value) && value > 0 && value <= 100000000;
export const validOrderId = value => typeof value === 'string' && /^(?:EREAD-[a-f0-9-]{36}|PUSDIG-(?:CART-)?\d{10,16}-\d{1,3})$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const statuses = ['pending','capture','settlement','cancel','deny','expire','failure'];
function image(value) {
  if (typeof value === 'string' && /^\/covers\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/i.test(value)) return value;
  try { const url = new URL(value); if (typeof value === 'string' && value.length <= 2048 && ['http:','https:'].includes(url.protocol) && !url.username && !url.password) return url.href; } catch {}
  return '/sample-cover.svg';
}
export function parseLibrary(data) {
  if (!Array.isArray(data?.books)) throw new Error('Library details are unavailable. Please retry.');
  const books = new Map();
  for (const book of data.books) if (validId(book?._id) && text(book.title,200)) {
    const id = book._id.toLowerCase();
    books.set(id,{ _id:id, title:book.title.trim(), author:text(book.author,200) ? book.author.trim() : 'Unknown author', imageUrl:image(book.imageUrl) });
  }
  if (data.books.length && !books.size) throw new Error('Library details are unavailable. Please retry.');
  return { books:[...books.values()], unavailable:data.books.length - books.size };
}
export function parseHistory(data) {
  if (!Array.isArray(data?.transactions)) throw new Error('Transaction details are unavailable. Please retry.');
  const transactions = new Map();
  for (const tx of data.transactions) if (validId(tx?.id) && text(tx.title,11000) && validAmount(tx.amount) && statuses.includes(tx.status) && typeof tx.date === 'string' && Number.isFinite(Date.parse(tx.date))) {
    const id = tx.id.toLowerCase();
    transactions.set(id,{ id, title:tx.title, amount:tx.amount, status:tx.status, date:tx.date, orderId:validOrderId(tx.orderId) ? tx.orderId : undefined });
  }
  if (data.transactions.length && !transactions.size) throw new Error('Transaction details are unavailable. Please retry.');
  return { transactions:[...transactions.values()], unavailable:data.transactions.length - transactions.size };
}
export function parseReceipt(data, orderId) {
  const paid = ['capture','settlement'].includes(data?.status);
  if (!validOrderId(orderId) || (data?.orderId ?? data?.order_id) !== orderId || !validAmount(data?.amount) || !statuses.includes(data?.status) || data.paid !== paid) throw new Error('Order details could not be verified. Check this reference again; do not start another payment.');
  let warning = typeof data.warning === 'string' ? data.warning : '';
  const items = Array.isArray(data.items) ? data.items.filter(item => validId(item?.bookId) && text(item.title,200) && validAmount(item.price)) : [];
  if (data.items !== undefined && (!Array.isArray(data.items) || items.length !== data.items.length || items.reduce((total,item) => total + item.price,0) !== data.amount)) warning = [warning,'Some item details are unavailable. Check this order again.'].filter(Boolean).join(' ');
  return { orderId, status:data.status, paid, amount:data.amount, items, warning, libraryUpdated:data.libraryUpdated === true, checkoutState:data.checkoutState, redirect_url:typeof data.redirect_url === 'string' ? data.redirect_url : undefined };
}
