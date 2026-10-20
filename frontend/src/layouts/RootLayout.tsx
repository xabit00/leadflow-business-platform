import { useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Sidebar } from '../components/layout/Sidebar';
import { Footer } from '../components/layout/Footer';

export const RootLayout = () => {
  const menu = useRef<HTMLDialogElement>(null);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="desktop-sidebar"><Sidebar /></div>
      <div className="app-workspace">
        <Navbar onOpenMenu={() => menu.current?.showModal()} />
        <main id="main-content" tabIndex={-1} className="app-main"><Outlet /></main>
        <Footer />
      </div>
      <dialog ref={menu} className="mobile-menu" aria-label="Workspace navigation" onClick={(event) => { if (event.target === event.currentTarget) menu.current?.close(); }}>
        <button className="menu-close" aria-label="Close navigation" onClick={() => menu.current?.close()}><X size={20} /></button>
        <Sidebar onNavigate={() => menu.current?.close()} />
      </dialog>
    </div>
  );
};
