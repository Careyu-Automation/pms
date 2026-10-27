import { useCallback, useId, useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { cx } from '../../utils/cx';

export function Dropdown({ label, align = 'end', trigger, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, close, open);

  return (
    <div className={cx('dropdown', align === 'end' && 'dropdown--end', open && 'is-open')} ref={ref}>
      {trigger({
        open,
        menuId,
        toggle: () => setOpen((value) => !value),
      })}
      {open ? (
        <div className="dropdown__menu" id={menuId} role="menu" aria-label={label}>
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}
