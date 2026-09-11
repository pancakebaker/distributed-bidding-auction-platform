/**
 * Public React presentation for Laravel-owned CMS pages and FAQs.
 */
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

type PublicCmsBootstrap =
    | {
          page: 'page';
          props: {
              title: string;
              body: string;
              published_at: string | null;
          };
      }
    | {
          page: 'faq';
          props: {
              faqs: Array<{
                  id: number;
                  question: string;
                  answer: string;
              }>;
          };
      };

declare global {
    interface Window {
        __CMS_BOOTSTRAP__?: PublicCmsBootstrap;
    }
}

/**
 * Renders public CMS content resolved and authorized by Laravel routes.
 */
export function PublicCmsApp({ bootstrap }: { bootstrap: PublicCmsBootstrap }) {
    if (bootstrap.page === 'faq') {
        return <FaqPage faqs={bootstrap.props.faqs} />;
    }

    return <ContentPage body={bootstrap.props.body} title={bootstrap.props.title} />;
}

function ContentPage({ body, title }: { body: string; title: string }) {
    return (
        <main className="cms-public-shell">
            <a className="admin-secondary-link" href="/auctions">
                Auctions
            </a>
            <article className="cms-public-content">
                <p className="eyebrow">Information</p>
                <h1>{title}</h1>
                <p>{body}</p>
            </article>
        </main>
    );
}

function FaqPage({ faqs }: { faqs: Array<{ id: number; question: string; answer: string }> }) {
    return (
        <main className="cms-public-shell">
            <a className="admin-secondary-link" href="/auctions">
                Auctions
            </a>
            <section className="cms-public-content">
                <p className="eyebrow">Support</p>
                <h1>FAQs</h1>
                <div className="cms-faq-list">
                    {faqs.map((faq) => (
                        <article key={faq.id}>
                            <h2>{faq.question}</h2>
                            <p>{faq.answer}</p>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}

function MissingBootstrap() {
    return (
        <main className="cms-public-shell">
            <section className="state-message error">
                <h1>CMS data unavailable</h1>
                <p>Refresh the page to request the content payload from Laravel.</p>
            </section>
        </main>
    );
}

const root = document.getElementById('cms-app');

if (root) {
    createRoot(root).render(
        <StrictMode>
            {window.__CMS_BOOTSTRAP__ ? (
                <PublicCmsApp bootstrap={window.__CMS_BOOTSTRAP__} />
            ) : (
                <MissingBootstrap />
            )}
        </StrictMode>,
    );
}
