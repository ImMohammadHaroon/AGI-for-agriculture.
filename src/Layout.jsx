import { NavLink, Outlet } from 'react-router-dom';
import { LeafIcon } from './Icons';

function SoilIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 4C10 4 6 9 6 14c0 6 4 10 10 14 6-4 10-8 10-14 0-5-4-10-10-10z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M16 8v18M12 14h8M14 18h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Layout() {
  return (
    <>
      {/* Shared Navbar */}
      <nav className="navbar" id="navbar">
        <div className="navbar-inner navbar-inner--with-nav">
          <div className="navbar-logo">
            <LeafIcon className="navbar-logo-icon" />
            <span className="navbar-logo-text">
              Leaf<span>Scan</span> AI
            </span>
          </div>

          <div className="navbar-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link--active' : ''}`
              }
            >
              <LeafIcon className="nav-link-icon" />
              <span>Leaf Disease</span>
            </NavLink>
            <NavLink
              to="/soilcrop"
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link--active' : ''}`
              }
            >
              <SoilIcon className="nav-link-icon" />
              <span>NPK Sensor</span>
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <Outlet />

      {/* Shared Footer */}
      <footer className="footer" id="footer">
        <p className="footer-text">
          &copy; {new Date().getFullYear()} Created by <a href="https://devowl.me" target="_blank" rel="noopener noreferrer">devowl</a>
        </p>
      </footer>
    </>
  );
}

export default Layout;
