import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Layers } from 'lucide-react';

export const AuthLayout = ({ children }: { children: ReactNode }) => <div className="auth-layout">
  <section className="auth-story">
    <Link to="/" className="brand"><span className="brand-mark"><Layers size={22} /></span>LeadFlow<span className="brand-dot">.</span></Link>
    <div className="auth-message"><p className="eyebrow">LESS CHASING. MORE CONNECTING.</p><h1>Every lead.<br />A clear owner.<br /><span>A next step.</span></h1><p>Bring your customer relationships and team follow-ups into one focused workspace.</p>
      <div className="auth-example" aria-label="Illustration of the lead follow-up workflow"><div className="flex items-center justify-between"><span>THE FOLLOW-UP FLOW</span><ArrowUpRight size={18} /></div>{['Capture an inquiry', 'Assign an available owner', 'Keep the conversation moving'].map((label, i) => <div className="auth-step" key={label}><span>{i === 2 ? <Check size={17} /> : `0${i + 1}`}</span>{label}</div>)}</div>
    </div><p className="auth-footnote">One workspace. Every relationship.</p>
  </section>
  <section className="auth-form-panel"><Link to="/" className="brand lg:hidden"><span className="brand-mark"><Layers size={20} /></span>LeadFlow.</Link><div className="auth-form-content">{children}</div><p className="auth-footnote">Your next customer relationship starts here.</p></section>
</div>;
