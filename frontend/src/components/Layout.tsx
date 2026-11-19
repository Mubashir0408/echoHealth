import { NavLink, Outlet } from 'react-router-dom';
import { Activity, History, LayoutDashboard } from 'lucide-react';
import { useHealth } from '../hooks/HealthContext';
import { useMonitor } from '../monitor/MonitorContext';
import { Badge, cx } from './ui';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/5 ring-1 ring-accent/30">
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
          <path
            d="M3 16h5l2.5-7 4.5 15 3.5-10 2 4H29"
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-ink">EchoHealth</div>
        <div className="text-[11px] text-ink-faint">Respiratory sound monitor</div>
      </div>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/live', label: 'Live monitor', icon: Activity, end: false },
  { to: '/history', label: 'History', icon: History, end: false },
];

function ConnectionBadge() {
  const { connection, modelReady } = useHealth();
  if (connection === 'checking') return <Badge tone="neutral" dot>Connecting…</Badge>;
  if (connection === 'offline') return <Badge tone="bad" dot>Backend offline</Badge>;
  if (!modelReady) return <Badge tone="warn" dot>Model unavailable</Badge>;
  return <Badge tone="ok" dot>Model ready · local</Badge>;
}

export function Layout() {
  const { active } = useMonitor();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-white/5 bg-navy-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-accent/10 text-accent-soft' : 'text-ink-muted hover:bg-white/5 hover:text-ink',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
                {to === '/live' && active && <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" aria-label="Monitoring active" />}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ConnectionBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
