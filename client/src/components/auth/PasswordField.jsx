import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/Input';

export function PasswordField({ id, label, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      id={id}
      label={label}
      type={visible ? 'text' : 'password'}
      endAdornment={(
        <button
          type="button"
          className="field__adornment"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible
            ? <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
            : <Eye size={18} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      )}
      {...props}
    />
  );
}
