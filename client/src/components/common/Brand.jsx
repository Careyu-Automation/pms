import brandMark from '../../assets/brand-mark.svg';
import { cx } from '../../utils/cx';

export function BrandMark({ size = 32 }) {
  return (
    <img
      className="brand__mark"
      src={brandMark}
      width={size}
      height={size}
      alt=""
    />
  );
}

export function Brand({ compact = false, subtitle = 'Automation' }) {
  return (
    <span className={cx('brand', compact && 'brand--compact')}>
      <BrandMark size={compact ? 28 : 32} />
      <span className={compact ? 'sr-only' : 'brand__text'}>
        <span className="brand__name">CareYu</span>
        {subtitle ? <span className="brand__sub">{subtitle}</span> : null}
      </span>
    </span>
  );
}
