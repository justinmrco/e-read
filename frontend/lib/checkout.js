import { apiRequest } from './api';
export async function checkout(bookIds, cart = false, expectedToken, isActive = () => true) {
  if (!isActive()) return 'dismissed';
  if (expectedToken !== undefined && localStorage.getItem('token') !== expectedToken) throw new Error('Account changed. Review your selection before checking out.');
  const result = await apiRequest('/api/midtrans/' + (cart ? 'create-cart-transaction' : 'create-transaction'), {
    method: 'POST', body: JSON.stringify(cart ? { bookIds } : { bookId: bookIds[0] }),
  });
  if (!isActive()) return 'dismissed';
  if (expectedToken !== undefined && localStorage.getItem('token') !== expectedToken) throw new Error('Account changed. Check your order history before trying again.');
  const selected = new Set(bookIds.map(id => id.toLowerCase()));
  const previousIds = Array.isArray(result.items) ? result.items.map(item => typeof item?.bookId === 'string' ? item.bookId.toLowerCase() : null) : [];
  const needsReview = result.existing && (!previousIds.length || previousIds.length !== selected.size || !previousIds.every(id => selected.has(id)) || new Set(previousIds).size !== previousIds.length);
  if (!result.redirect_url || needsReview) {
    if (!/^EREAD-[a-f0-9-]{36}$/.test(result.order_id)) throw new Error('Checkout reference is unavailable. Check your transaction history before retrying.');
    window.location.assign('/payment-success?order_id=' + encodeURIComponent(result.order_id) + (needsReview ? '&review=1' : ''));
    return 'redirecting';
  }
  const destination = new URL(result.redirect_url);
  if (destination.origin !== 'https://app.sandbox.midtrans.com' || destination.username || destination.password) throw new Error('Invalid sandbox checkout destination.');
  // Hosted checkout avoids trapping a payment iframe behind the native dialog's top layer.
  window.location.assign(destination.href);
  return 'redirecting';
}
