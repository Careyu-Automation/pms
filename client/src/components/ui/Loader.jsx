import { BrandMark } from '../common/Brand';

export function Loader({ label = 'Loading', fullPage = false }) {
  if (!fullPage) {
    return (
      <span className="inline-loader" role="status">
        <span className="spinner" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <div className="loader-screen" role="status">
      <BrandMark size={40} />
      <span className="spinner spinner--lg" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
