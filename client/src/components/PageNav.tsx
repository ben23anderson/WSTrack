import { Link } from 'react-router-dom';

export interface NavCrumb {
  label: string;
  to: string;
}

/** Horizontal breadcrumb nav — pass crumbs from root to the immediate parent. */
export default function PageNav({ crumbs }: { crumbs: NavCrumb[] }) {
  if (crumbs.length === 0) return null;
  return (
    <nav className="flex items-center gap-1 flex-wrap text-sm">
      {crumbs.map((crumb, idx) => (
        <span key={crumb.to} className="flex items-center gap-1">
          {idx > 0 && <span className="text-gray-300 select-none">›</span>}
          <Link to={crumb.to} className="text-blue-600 hover:text-blue-800 hover:underline">
            {crumb.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
