import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { PasswordField } from '../../components/auth/PasswordField';
import { Button } from '../../components/ui/Button';
import { resetPassword } from '../../services/auth.service';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (values.newPassword !== values.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await resetPassword({
        token: params.get('token') || '',
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      setDone(result.message);
    } catch (err) {
      setError(err.details?.fields?.newPassword || err.details?.fields?.token || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Reset password">
      <p className="auth__kicker auth__kicker--form">CareYu Automation</p>
      <h2 className="auth__title">Choose a new password</h2>
      {done ? <p className="auth__note" role="status">{done}</p> : null}
      {error ? <p className="auth__alert" role="alert">{error}</p> : null}
      {done ? <Link to="/login">Sign in</Link> : (
        <form className="stack-form" onSubmit={onSubmit}>
          <PasswordField id="reset-password" label="New password" autoComplete="new-password" required value={values.newPassword} onChange={(event) => setValues({ ...values, newPassword: event.target.value })} />
          <PasswordField id="reset-confirm" label="Confirm new password" autoComplete="new-password" required value={values.confirmPassword} onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })} />
          <Button type="submit" block loading={busy}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
