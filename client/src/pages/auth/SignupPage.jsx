import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { PasswordField } from '../../components/auth/PasswordField';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useAuth } from '../../context/AuthContext';
import { DEPARTMENT_OPTIONS } from '../../utils/departments';
import { PASSWORD_RULES } from '../../utils/password';
import { validateSignup } from '../../utils/validation';

const INITIAL = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  department: '',
  designation: '',
};

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(INITIAL);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const clientErrors = validateSignup(values);
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

  const touch = (field) => setTouched((current) => ({ ...current, [field]: true }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setFormError('');
    if (Object.keys(validateSignup(values)).length) return;

    setSubmitting(true);
    try {
      await signup({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        department: values.department,
        designation: values.designation.trim(),
      });
      navigate('/login', {
        replace: true,
        state: { notice: 'Account created. Sign in to continue.' },
      });
    } catch (error) {
      if (error.details?.fields) setServerErrors(error.details.fields);
      setFormError(error.message || 'Unable to create the account.');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create account">
      <p className="auth__kicker auth__kicker--form">CareYu Automation</p>
      <h2 className="auth__title">Create Your Account</h2>
      <p className="auth__subtitle">Set up your CareYu workspace account.</p>
      {formError ? <p className="auth__alert" role="alert">{formError}</p> : null}
      <form className="stack-form" onSubmit={onSubmit} noValidate>
        <Input
          id="full-name"
          label="Full Name"
          name="name"
          autoComplete="name"
          required
          value={values.fullName}
          error={showError('fullName')}
          onBlur={() => touch('fullName')}
          onChange={(event) => setField('fullName', event.target.value)}
        />
        <Input
          id="work-email"
          label="Work Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          helper="Use your work email."
          value={values.email}
          error={showError('email')}
          onBlur={() => touch('email')}
          onChange={(event) => setField('email', event.target.value)}
        />
        <PasswordField
          id="new-password"
          label="Password"
          name="new-password"
          autoComplete="new-password"
          required
          value={values.password}
          error={showError('password')}
          onBlur={() => touch('password')}
          onChange={(event) => setField('password', event.target.value)}
        />
        <ul className="requirements" aria-label="Password requirements">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(values.password);
            return (
              <li key={rule.id} className={met ? 'is-met' : undefined}>
                {met ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <span className="requirements__mark" aria-hidden="true" />}
                {rule.label}
              </li>
            );
          })}
        </ul>
        <PasswordField
          id="confirm-password"
          label="Confirm Password"
          name="confirm-password"
          autoComplete="new-password"
          required
          value={values.confirmPassword}
          error={showError('confirmPassword')}
          onBlur={() => touch('confirmPassword')}
          onChange={(event) => setField('confirmPassword', event.target.value)}
        />
        <Select
          id="department"
          label="Department"
          name="department"
          helper="Optional"
          value={values.department}
          error={showError('department')}
          onBlur={() => touch('department')}
          onChange={(event) => setField('department', event.target.value)}
        >
          {DEPARTMENT_OPTIONS.map((option) => (
            <option key={option.value || 'none'} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Input
          id="designation"
          label="Designation"
          name="organization-title"
          autoComplete="organization-title"
          helper="Optional"
          value={values.designation}
          error={showError('designation')}
          onBlur={() => touch('designation')}
          onChange={(event) => setField('designation', event.target.value)}
        />
        <Button type="submit" variant="primary" block loading={submitting}>
          {submitting ? 'Creating account' : 'Create Account'}
        </Button>
      </form>
      <p className="auth__switch">
        Already have an account? <Link to="/login">Sign In</Link>
      </p>
    </AuthLayout>
  );
}
