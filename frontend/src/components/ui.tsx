import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('card animate-fade-up', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; icon?: ReactNode }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-accent text-navy-950 hover:bg-accent-soft shadow-[0_0_0_1px_rgba(45,212,191,0.4),0_8px_24px_-8px_rgba(45,212,191,0.55)]',
    secondary: 'bg-navy-700/70 text-ink hover:bg-navy-600 ring-1 ring-inset ring-white/10',
    ghost: 'text-ink-muted hover:text-ink hover:bg-white/5',
    danger: 'bg-rose-500/90 text-white hover:bg-rose-500 shadow-[0_8px_24px_-8px_rgba(244,63,94,0.6)]',
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-45',
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';

const toneClasses: Record<Tone, string> = {
  ok: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
  warn: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
  bad: 'bg-rose-400/10 text-rose-300 ring-rose-400/25',
  neutral: 'bg-white/5 text-ink-muted ring-white/10',
  info: 'bg-accent/10 text-accent-soft ring-accent/25',
};

const dotClasses: Record<Tone, string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
  neutral: 'bg-ink-faint',
  info: 'bg-accent',
};

export function Badge({ tone = 'neutral', dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneClasses[tone],
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dotClasses[tone])} />}
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin text-accent" />
      {label}
    </div>
  );
}

export function ErrorBanner({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rose-200">{title}</p>
        <p className="mt-0.5 break-words text-rose-100/80">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-400/15"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-white/5 text-ink-faint ring-1 ring-white/10">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-faint">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card-inset px-4 py-3.5">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-faint">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-medium tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

export const SCORE_NOTE =
  'Model scores are uncalibrated classifier outputs (0–1). They are not medical probabilities and not a diagnosis.';

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs leading-relaxed text-ink-faint', className)}>
      EchoHealth detects and counts respiratory sounds for monitoring purposes only. It does not diagnose any disease.
      Counts are estimates from an automated sound classifier and may include errors. Share reports with a qualified
      healthcare professional for interpretation.
    </p>
  );
}
