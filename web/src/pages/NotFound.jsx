import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <p className="muted">
        This page doesn't exist or isn't yours. Go back to the <Link to="/">shop</Link>.
      </p>
    </div>
  );
}
