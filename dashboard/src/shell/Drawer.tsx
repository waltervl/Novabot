import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function Drawer({ open, onClose, children, title = 'Diagnostics' }: Props) {
  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity z-[2000] ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed top-0 right-0 h-full w-[360px] max-w-full bg-zinc-950 border-l border-zinc-800 shadow-xl transition-transform z-[2001] ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-49px)]">
          {open ? children : null}
        </div>
      </aside>
    </>
  );
}
