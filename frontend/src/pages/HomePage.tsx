import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Building2, Clock3, Kanban, LifeBuoy, Users, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { listCompanies, listContacts, listOpportunities } from '../api/crm';
import { recoveryQueue } from '../api/leads';

const destinations = [
  { title: 'Contacts', description: 'The people behind every opportunity.', to: '/contacts', icon: Users },
  { title: 'Companies', description: 'Build a clearer picture of your customers.', to: '/companies', icon: Building2 },
  { title: 'Opportunities', description: 'Keep your next conversation moving forward.', to: '/opportunities', icon: Kanban },
];

export const HomePage = () => {
  const { profile, hasPermission } = useAuth();
  const records = useQuery({
    queryKey: ['overview', profile?.workspace_id, profile?.id],
    enabled: Boolean(profile) && hasPermission('crm.view'),
    queryFn: async () => {
      const workspace = profile!.workspace_id;
      const [contacts, companies, opportunities] = await Promise.all([listContacts(workspace, '', 1), listCompanies(workspace, '', 1), listOpportunities(workspace, '', 1, hasPermission('value.view'))]);
      return [contacts.count, companies.count, opportunities.count];
    },
  });
  const recovery = useQuery({ queryKey: ['recovery-queue', profile?.workspace_id], queryFn: recoveryQueue, enabled: Boolean(profile) && hasPermission('leads.view'), refetchInterval: 30000 });
  return <div className="overview space-y-8">
    <header className="overview-heading"><div><p className="eyebrow">YOUR WORKSPACE, AT A GLANCE</p><h1>Good to see you, {profile?.full_name?.split(' ')[0] || 'there'}.</h1><p>Stay close to your customers. Keep every lead moving.</p></div><Link to="/lead-intake" className="primary-link"><Zap size={17} />Capture a lead</Link></header>
    <div className="overview-metrics">{destinations.map(({ title, to, icon: Icon }, index) => <Link key={to} to={to} className="metric-card"><span className="metric-label"><Icon size={18} />{title}<ArrowUpRight size={16} /></span><strong>{records.isSuccess ? records.data[index].toLocaleString() : '—'}</strong><span>{records.isPending && records.fetchStatus === 'fetching' ? 'Loading your records…' : records.isError ? 'Records unavailable' : 'View accessible records'}</span></Link>)}</div>
    {records.isError && <div className="inline-notice" role="alert">We couldn’t load your workspace totals. <button onClick={() => void records.refetch()}>Try again</button></div>}
    <div className="overview-grid">
      <section className="focus-panel"><div className="flex items-center justify-between"><span className="eyebrow">FOLLOW-UP DESK</span><LifeBuoy size={22} className="text-blue-300" /></div><h2>Give your next lead<br />a clear next step.</h2><p>Review overdue acknowledgements and leads that have gone quiet. A timely follow-up can make the difference.</p><Link to="/recovery-queue" className="primary-link">Open recovery queue <ArrowRight size={17} /></Link><div className="focus-caption"><Clock3 size={15} />{recovery.isSuccess ? `${recovery.data.length} lead${recovery.data.length === 1 ? '' : 's'} in your recovery queue` : 'Review follow-ups and ownership in one place'}</div></section>
      <section className="workspace-panel"><div className="panel-heading"><h2>Make your next move</h2><span>Quick access</span></div>{destinations.map(({ title, description, to, icon: Icon }) => <Link className="quick-link" key={to} to={to}><span className="quick-icon"><Icon size={20} /></span><div><strong>{title}</strong><p>{description}</p></div><ArrowUpRight size={18} /></Link>)}</section>
    </div>
    <section className="workflow-strip"><div><span className="eyebrow">A SIMPLE ROUTINE</span><h2>From first inquiry to next conversation.</h2></div><ol><li><span>01</span>Capture the inquiry</li><li><span>02</span>Confirm ownership</li><li><span>03</span>Follow up on time</li></ol></section>
  </div>;
};
