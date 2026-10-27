import { ClipboardCheck, Network, Route } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Brand } from '../common/Brand';
import { ThemeToggle } from '../layout/ThemeToggle';
import { IndustrialScene } from './IndustrialScene';

const POINTS = [
  { icon: Route, text: 'From lead review through project delivery' },
  { icon: ClipboardCheck, text: 'Work, time, and leave in one workspace' },
  { icon: Network, text: 'Teams, requests, and operational control' },
];

export function AuthLayout({ title, children }) {
  useDocumentTitle(title);

  return (
    <div className="auth">
      <a className="skip-link" href="#auth-form">Skip to form</a>
      <section className="auth__story">
        <div className="auth__story-inner">
          <Brand />
          <p className="auth__kicker">CareYu Automation</p>
          <h1 className="auth__headline">Project operations, held to a standard.</h1>
          <p className="auth__lede">
            The internal workspace for sales, engineering, procurement, and delivery teams.
          </p>
          <ul className="auth__points">
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.text}>
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span>{point.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <IndustrialScene />
      </section>
      <section className="auth__panel">
        <div className="auth__toolbar">
          <ThemeToggle />
        </div>
        <div className="auth__panel-inner" id="auth-form">
          {children}
        </div>
      </section>
    </div>
  );
}
