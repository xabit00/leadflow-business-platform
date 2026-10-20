import { NavLink } from 'react-router-dom';
import { ArrowUpRight, Building2, Clock3, Kanban, LayoutDashboard, Layers, LifeBuoy, Users, Zap } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const groups = [
  { label: 'Workspace', items: [{ label: 'Overview', icon: LayoutDashboard, to: '/' }] },
  { label: 'Customer relationships', items: [
    { label: 'Contacts', icon: Users, to: '/contacts' },
    { label: 'Companies', icon: Building2, to: '/companies' },
    { label: 'Opportunities', icon: Kanban, to: '/opportunities' },
  ] },
  { label: 'Lead operations', items: [
    { label: 'Lead intake', icon: Zap, to: '/lead-intake' },
    { label: 'SLA & escalation', icon: Clock3, to: '/sla-escalation' },
    { label: 'Recovery queue', icon: LifeBuoy, to: '/recovery-queue' },
  ] },
];

export const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { profile } = useAuth();
  return <aside className="workspace-sidebar">
    <NavLink to="/" className="brand" onClick={onNavigate}><span className="brand-mark"><Layers size={21} /></span>LeadFlow<span className="brand-dot">.</span></NavLink>
    <div className="workspace-label"><Building2 size={17} /><div><strong>{profile?.workspace_name || 'Your workspace'}</strong><span>Business workspace</span></div></div>
    <nav aria-label="Main navigation">{groups.map(group => <div className="nav-group" key={group.label}>
      <p>{group.label}</p>
      {group.items.map(({ label, icon: Icon, to }) => <NavLink end={to === '/'} key={to} to={to} onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}><Icon size={18} /><span>{label}</span></NavLink>)}
    </div>)}</nav>
    <div className="sidebar-note"><span className="text-blue-400"><LifeBuoy size={20} /></span><strong>Keep the conversation going.</strong><p>Find leads that need a follow-up in your recovery queue.</p><NavLink to="/recovery-queue" onClick={onNavigate}>Review queue <ArrowUpRight size={15} /></NavLink></div>
    <div className="sidebar-account"><span className="avatar">{profile?.full_name?.slice(0, 1).toUpperCase() || 'U'}</span><div><strong>{profile?.full_name || 'Your account'}</strong><span>{profile?.level || 'Workspace member'}</span></div></div>
  </aside>;
};
