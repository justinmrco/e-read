import { parseCatalog } from './catalog';
import { validId } from './records';
function key(owner) {
  if (!validId(owner)) throw new Error('Administrator identity unavailable. Sign in again before saving.');
  return 'eread-admin-save:' + owner.toLowerCase();
}
function validate(value, owner) {
  if (!value || value.schemaVersion !== 1 || value.owner !== owner.toLowerCase() || !['uncertain','conflict'].includes(value.state) || !Number.isSafeInteger(value.version) || value.version < 0 || value.version >= Number.MAX_SAFE_INTEGER || (value.bookId !== null && !validId(value.bookId)) || (value.bookId === null && (typeof value.requestId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.requestId)))) throw new Error('Saved recovery details are invalid. Review the catalog before discarding them.');
  const payload = value.payload;
  // Validate without normalizing: a retry must preserve the exact submitted payload.
  parseCatalog([{ ...payload, _id:value.bookId || '000000000000000000000001' }]);
  for (const [field,max] of [['format',100],['publisher',200]]) if (payload[field] !== undefined && (typeof payload[field] !== 'string' || payload[field].length > max)) throw new Error('Invalid recovery edition details');
  if (payload.pages !== undefined && payload.pages !== null && (!Number.isInteger(payload.pages) || payload.pages < 1 || payload.pages > 100000)) throw new Error('Invalid recovery pages');
  if (payload.hook !== undefined && (typeof payload.hook !== 'string' || payload.hook.length > 100)) throw new Error('Invalid recovery hook');
  if (typeof payload.imageUrl !== 'string' || payload.imageUrl.length > 2048) throw new Error('Invalid recovery image');
  let safeImage = payload.imageUrl === '/sample-cover.svg' || /^\/covers\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp|avif)$/i.test(payload.imageUrl);
  try { const url = new URL(payload.imageUrl); safeImage ||= ['http:','https:'].includes(url.protocol) && !url.username && !url.password; } catch {}
  if (!safeImage) throw new Error('Invalid recovery image');
  return { schemaVersion:1, owner:owner.toLowerCase(), bookId:value.bookId, requestId:value.bookId ? null : value.requestId, version:value.version, state:value.state, payload:{ title:payload.title,author:payload.author,year:payload.year,genre:payload.genre,description:payload.description,imageUrl:payload.imageUrl,price:payload.price,...Object.fromEntries(['format','pages','publisher'].filter(field=>payload[field] !== undefined).map(field=>[field,payload[field]])),...(payload.hook === undefined ? {} : {hook:payload.hook}) } };
}
export function readPendingSave(owner) {
  const raw = sessionStorage.getItem(key(owner));
  return raw === null ? null : validate(JSON.parse(raw), owner);
}
export function storePendingSave(owner, value) {
  const journal = validate({ ...value, schemaVersion:1, owner:owner.toLowerCase() }, owner);
  const existing = readPendingSave(owner);
  if (existing && (existing.bookId !== journal.bookId || (!journal.bookId && existing.requestId !== journal.requestId))) throw new Error('Resume the previous pending save first.');
  sessionStorage.setItem(key(owner), JSON.stringify(journal));
  window.dispatchEvent(new Event('admin-save-change'));
  return journal;
}
export function clearPendingSave(owner) {
  sessionStorage.removeItem(key(owner));
  window.dispatchEvent(new Event('admin-save-change'));
}
