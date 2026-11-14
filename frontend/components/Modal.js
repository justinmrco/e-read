"use client";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dialogMotion } from '../lib/dialog-motion';
export default function Modal({ title, onClose, onClosing, canClose = () => true, children }) {
  const ref = useRef(null);
  const callbacks = useRef({ onClose, onClosing, canClose });
  callbacks.current = { onClose, onClosing, canClose };
  const lifecycle = useRef(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted) return;
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog.showModal();
    dialog.focus({ preventScroll:true });
    lifecycle.current = dialogMotion(dialog, () => callbacks.current.onClose(), () => callbacks.current.canClose(), () => callbacks.current.onClosing?.());
    return () => {
      lifecycle.current.dispose(); lifecycle.current = null;
      dialog.close();
      if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll:true });
    };
  }, [mounted]);
  if (!mounted) return null;
  const requestClose = () => lifecycle.current?.requestClose();
  return createPortal(<dialog autoFocus ref={ref} tabIndex={-1} className="eread-dialog" aria-label={title} onCancel={event => { event.preventDefault(); requestClose(); }}>{typeof children === 'function' ? children(requestClose) : children}</dialog>, document.body);
}
