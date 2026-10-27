import { Link } from 'react-router-dom';

export function Breadcrumb({ crumbs = [] }) {
  if (!crumbs.length) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="breadcrumb">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {isLast || !crumb.path ? (
                <span aria-current={isLast ? 'page' : undefined}>{crumb.label}</span>
              ) : (
                <Link to={crumb.path}>{crumb.label}</Link>
              )}
              {isLast ? null : <span className="breadcrumb__sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
