import { Link, NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-ball" aria-hidden />
          PokeDraft <span className="brand-sub">League</span>
        </Link>
        <nav>
          <NavLink to="/" end>Play</NavLink>
          <NavLink to="/dex">Price list</NavLink>
          <NavLink to="/groups">Price groups</NavLink>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
