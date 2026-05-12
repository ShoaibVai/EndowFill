/**
 * pages/WelcomePage.tsx — Public landing page.
 *
 * Shown at "/" for unauthenticated visitors.
 * Includes hero section, feature highlights, and CTAs to /auth.
 */

import { useNavigate } from 'react-router-dom';
import { FileText, Zap, Shield, ArrowRight, Layers } from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'Smart PDF Editing',
    description:
      'Detect and map fillable fields automatically — no manual configuration needed.',
  },
  {
    icon: Zap,
    title: 'Bulk Generation',
    description:
      'Generate hundreds of personalised PDFs from a spreadsheet in seconds.',
  },
  {
    icon: Layers,
    title: 'Template Studio',
    description:
      'Design pixel-perfect templates with our drag-and-drop visual editor.',
  },
  {
    icon: Shield,
    title: 'Secure & Private',
    description:
      'Your data stays yours. Files are processed in your browser — nothing is stored without consent.',
  },
];

export function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      {/* ── Nav bar ── */}
      <nav className="welcome-nav">
        <div className="welcome-nav__brand">
          <FileText size={22} className="welcome-nav__logo-icon" />
          <span>PDF Forge</span>
        </div>
        <div className="welcome-nav__actions">
          <button
            id="welcome-signin-btn"
            className="btn-ghost"
            onClick={() => navigate('/auth?tab=login')}
          >
            Sign in
          </button>
          <button
            id="welcome-signup-btn"
            className="btn-primary"
            onClick={() => navigate('/auth?tab=signup')}
          >
            Get started free
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero__badge">✨ Now with AI-powered field detection</div>

        <h1 className="hero__title">
          Build, Fill &amp; Generate<br />
          <span className="hero__title--accent">PDFs at Scale</span>
        </h1>

        <p className="hero__subtitle">
          The all-in-one workspace for designing PDF templates, mapping data
          fields, and generating thousands of documents — all in your browser.
        </p>

        <div className="hero__cta-group">
          <button
            id="hero-get-started-btn"
            className="btn-primary btn-primary--lg"
            onClick={() => navigate('/auth?tab=signup')}
          >
            Start for free <ArrowRight size={18} />
          </button>
          <button
            id="hero-login-btn"
            className="btn-ghost btn-ghost--lg"
            onClick={() => navigate('/auth?tab=login')}
          >
            Sign in to existing account
          </button>
        </div>

        {/* Decorative gradient orb */}
        <div className="hero__orb hero__orb--1" aria-hidden="true" />
        <div className="hero__orb hero__orb--2" aria-hidden="true" />
      </section>

      {/* ── Features ── */}
      <section className="features" aria-labelledby="features-heading">
        <h2 id="features-heading" className="features__heading">
          Everything you need, nothing you don't
        </h2>
        <div className="features__grid">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="feature-card">
              <div className="feature-card__icon">
                <Icon size={22} />
              </div>
              <h3 className="feature-card__title">{title}</h3>
              <p className="feature-card__desc">{description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="bottom-cta">
        <h2 className="bottom-cta__title">Ready to save hours of manual work?</h2>
        <button
          id="bottom-cta-btn"
          className="btn-primary btn-primary--lg"
          onClick={() => navigate('/auth?tab=signup')}
        >
          Create your free account <ArrowRight size={18} />
        </button>
      </section>

      <footer className="welcome-footer">
        <p>© {new Date().getFullYear()} PDF Forge. Built with ♥ for document professionals.</p>
      </footer>
    </div>
  );
}
