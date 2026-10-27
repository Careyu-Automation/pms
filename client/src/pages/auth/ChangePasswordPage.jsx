import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { PasswordField } from '../../components/auth/PasswordField';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { changePassword } from '../../services/auth.service';

export default function ChangePasswordPage() {
  const { refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
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
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      await refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.details?.fields?.newPassword || err.details?.fields?.currentPassword || err.details?.fields?.confirmPassword || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Change password">
      <p className="auth__kicker auth__kicker--form">CareYu Automation</p>
      <h2 className="auth__title">Choose a new password</h2>
      <p className="auth__subtitle">Your current password must be replaced before the workspace opens.</p>
      {error ? <p className="auth__alert" role="alert">{error}</p> : null}
      <form className="stack-form" onSubmit={onSubmit}>
        <PasswordField id="current-password" label="Current password" autoComplete="current-password" required value={values.currentPassword} onChange={(event) => setValues({ ...values, currentPassword: event.target.value })} />
        <PasswordField id="new-password" label="New password" autoComplete="new-password" required value={values.newPassword} onChange={(event) => setValues({ ...values, newPassword: event.target.value })} />
        <PasswordField id="confirm-password" label="Confirm new password" autoComplete="new-password" required value={values.confirmPassword} onChange={(event) => setValues({ ...values, confirmPassword: event.target.value })} />
        <Button type="submit" block loading={busy}>Update password</Button>
        <Button type="button" variant="secondary" onClick={logout}>Sign out</Button>
      </form>
    </AuthLayout>
  );
}
