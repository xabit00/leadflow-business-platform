import React from 'react';
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
  ShieldCheck 
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const sections = [
    {
      title: 'CRM & Pipeline',
      items: [
        { label: 'Contacts', icon: Users },
        { label: 'Companies', icon: Building2 },
        { label: 'Opportunities', icon: Kanban },
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
        { label: 'Payments (Stripe)', icon: CreditCard },
        { label: 'Appointments (Google)', icon: Calendar },
        { label: 'Analytics Dashboard', icon: BarChart3 },
        { label: 'Audit History', icon: ShieldCheck },
      ],
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950 p-4 hidden lg:flex flex-col justify-between shrink-0">
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h4 className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2">
              {section.title}
            </h4>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-400 opacity-60 cursor-not-allowed group"
                    title="Feature planned for subsequent levels"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <span>{item.label}</span>
                    </div>
                    <span className="text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400">
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
        <p className="font-medium text-slate-300">Level 0: Monorepo Scaffold</p>
        <p className="text-[11px] mt-1 text-slate-400">
          Navigation items are structured placeholders awaiting Level 1 business implementation.
        </p>
      </div>
    </aside>
  );
};
