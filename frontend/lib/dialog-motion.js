// Native dialogs stay in the top layer until their guarded exit completes.
export function dialogMotion(dialog, onClose, canClose = () => true, onClosing = () => {}) {
  let exit = null;
  let disposed = false;
  const finish = () => {
    const current = exit;
    if (!current) return;
    exit = null;
    if (!disposed && canClose()) onClose();
    current?.cancel();
  };
  return {
    requestClose() {
      if (disposed || exit || !canClose()) return;
      onClosing();
      if (!dialog.animate) { onClose(); return; }
      try {
        exit = dialog.animate([{ opacity:1, transform:'translateY(0)' }, { opacity:0, transform:'translateY(8px)' }], { duration:180, easing:'cubic-bezier(.22,1,.36,1)', fill:'forwards' });
      } catch { onClose(); return; }
      exit.onfinish = finish;
      exit.oncancel = finish;
    },
    dispose() { disposed = true; if (exit) { exit.onfinish = null; exit.oncancel = null; exit.cancel(); exit = null; } },
  };
}
