import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { PasswordField } from '../../components/auth/PasswordField';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { forgotPassword } from '../../services/auth.service';
import { validateLogin } from '../../utils/validation';

const INITIAL = { email: '', password: '', rememberMe: false };

export default function LoginPage() {
  const { login, unavailable, sessionExpired, retry } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState(INITIAL);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const submitLock = useRef(false);

  const clientErrors = validateLogin(values);
  const notice = location.state?.notice || '';
  const showError = (field) => {
    if (serverErrors[field]) return serverErrors[field];
    if (submitted || touched[field]) return clientErrors[field] || '';
    return '';
  };

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setFormError('');
    if (Object.keys(clientErrors).length) return;

    const from = location.state?.from;
    const landing = localStorage.getItem('careyu.pref.landing');
    const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
      ? from
      : (typeof landing === 'string' && landing.startsWith('/') && !landing.startsWith('//') ? landing : '/dashboard');

    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    const credentials = {
      email: values.email.trim(),
      password: values.password,
      rememberMe: values.rememberMe,
    };
    try {
      let lastError;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
          const signedIn = await login(credentials);
          navigate(signedIn?.mustChangePassword ? '/change-password' : destination, { replace: true });
          return;
        } catch (error) {
          lastError = error;
          const starting = error.status === 0 || error.details?.reason === 'network';
          if (!starting || attempt === 14) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      const error = lastError;
      if (error.details?.fields) setServerErrors(error.details.fields);
      if (error.status === 401) setFormError('Invalid email or password.');
      else if (error.status === 0) setFormError('Unable to connect to CareYu services. Please try again.');
      else if (error.status >= 500) setFormError('Something went wrong. Please try again.');
      else setFormError(error.message || 'Unable to sign in.');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Sign in">
      <p className="auth__kicker auth__kicker--form">CareYu Automation</p>
      <h2 className="auth__title">Welcome Back</h2>
      <p className="auth__subtitle">Sign in to continue to your workspace.</p>
      {notice ? <p className="auth__note" role="status">{notice}</p> : null}
      {sessionExpired ? <p className="auth__alert" role="alert">Your session has expired. Please sign in again.</p> : null}
      {unavailable ? (
        <div className="auth__alert" role="alert">
          <p>Unable to connect to CareYu services. Please try again.</p>
          <Button variant="secondary" onClick={retry}>Retry</Button>
        </div>
      ) : null}
      {formError ? <p className="auth__alert" role="alert">{formError}</p> : null}
      <form className="stack-form" onSubmit={onSubmit} noValidate>
        <Input
          id="email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={values.email}
          error={showError('email')}
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          onChange={(event) => setField('email', event.target.value)}
        />
        <PasswordField
          id="password"
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={values.password}
          error={showError('password')}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          onChange={(event) => setField('password', event.target.value)}
        />
        <div className="form-row">
          <Checkbox
            id="remember-me"
            label="Remember me"
            checked={values.rememberMe}
            onChange={(event) => setField('rememberMe', event.target.checked)}
          />
          <Button variant="ghost" size="sm" onClick={() => setForgotOpen(true)}>
            Forgot password?
          </Button>
        </div>
        <Button type="submit" variant="primary" block loading={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      <p className="auth__switch">
        Don&apos;t have an account? <Link to="/signup">Create an account</Link>
      </p>
      <Modal open={forgotOpen} title="Forgot password" onClose={() => { setForgotOpen(false); setForgotMessage(''); }}>
        <form className="stack-form" onSubmit={async (event) => {
          event.preventDefault();
          setForgotBusy(true);
          try {
            const result = await forgotPassword(forgotEmail.trim());
            setForgotMessage(result.message);
          } catch (error) {
            setForgotMessage(error.message);
          } finally {
            setForgotBusy(false);
          }
        }}>
          <Input id="forgot-email" label="Email" type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} />
          {forgotMessage ? <p className="form-note" role="status">{forgotMessage}</p> : <p className="form-note">If an account exists for that email, reset instructions will be sent.</p>}
          <Button type="submit" loading={forgotBusy}>Send reset link</Button>
        </form>
      </Modal>
    </AuthLayout>
  );
}
