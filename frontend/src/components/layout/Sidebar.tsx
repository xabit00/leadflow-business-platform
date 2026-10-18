import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users,
  Building2,
  Kanban,
  Zap,
  Clock,
  LifeBuoy,
  CreditCard,
  Calendar,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ElementType;
  to?: string; // undefined = draft / disabled
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'CRM & Pipeline',
    items: [
      { label: 'Contacts', icon: Users, to: '/contacts' },
      { label: 'Companies', icon: Building2, to: '/companies' },
      { label: 'Opportunities', icon: Kanban, to: '/opportunities' },
    ],
  },
  {
    title: 'Lead Operations',
    items: [
      { label: 'Lead Intake', icon: Zap },
      { label: 'SLA & Escalation', icon: Clock },
      { label: 'Recovery Queue', icon: LifeBuoy },
    ],
  },
  {
    title: 'Integrations & Finance',
    items: [
      { label: 'Payments', icon: CreditCard },
      { label: 'Upcoming Appointments', icon: Calendar },
      { label: 'Analytics Dashboard', icon: BarChart3 },
      { label: 'Audit History', icon: ShieldCheck },
    ],
  },
];

const activeCls =
  'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium bg-blue-600/15 text-blue-300 border border-blue-500/20';
const inactiveCls =
  'flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors';
const draftCls =
  'flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-400 opacity-50 cursor-not-allowed';

export const Sidebar: React.FC = () => (
  <aside className="w-64 border-r border-slate-800 bg-slate-950 p-4 hidden lg:flex flex-col justify-between shrink-0">
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-slate-500 mb-2">
            {section.title}
          </h4>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              if (item.to) {
                return (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    className={({ isActive }) => (isActive ? activeCls : inactiveCls)}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </span>
                  </NavLink>
                );
              }
              return (
                <div
                  key={item.label}
                  className={draftCls}
                  title="Coming in a future step"
                  aria-disabled="true"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </span>
                  <span className="text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                    Draft
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>

    <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400">
      <p className="font-medium text-slate-300">Step 2 — CRM Live</p>
      <p className="text-[11px] mt-1 text-slate-400">
        Contacts, Companies &amp; Opportunities are active. Lead Engine coming in Step 3.
      </p>
    </div>
  </aside>
);

