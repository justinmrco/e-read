"use client";
export default function SessionNotice({ session }) {
  if (!session.unavailable && !session.error) return null;
  return <div role="alert" className="session-notice"><p>{session.unavailable ? 'Connection unavailable. Your session could not be verified. Editing and checkout are paused.' : session.error}</p>{session.unavailable && <button type="button" disabled={session.refreshing} onClick={session.retry} className="secondary">{session.refreshing ? 'Checking connection...' : 'Retry connection'}</button>}</div>;
}
