import { useState, useEffect } from 'react';
import { useI18n } from '../i18n';

function GuideTable({ table }) {
  if (!table) return null;
  return (
    <table className="guide-table">
      <thead>
        <tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export default function GuidePage({ visible = true }) {
  const { t, tr } = useI18n();
  const [activeId, setActiveId] = useState('start');
  const [appVersion, setAppVersion] = useState('');

  const guide = tr('guide') || {};
  const sectionIds = guide.sectionIds || [];

  useEffect(() => {
    if (!visible) return;
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => setAppVersion(h.version || ''))
      .catch(() => {});
  }, [visible]);

  const scrollTo = (id) => {
    setActiveId(id);
    document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderSection = (id) => {
    const data = guide[id];
    if (!data) return null;

    switch (id) {
      case 'start':
        return (
          <>
            <ol className="guide-steps">{data.steps?.map((s) => <li key={s}>{s}</li>)}</ol>
            {data.tip && <div className="guide-tip">{data.tip}</div>}
          </>
        );
      case 'faq': {
        const items = Array.isArray(data) ? data : data.items;
        return (
          <dl className="guide-faq">
            {items?.map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        );
      }
      case 'paths':
        return (
          <>
            <GuideTable table={data.table} />
            <p className="guide-contact">
              {data.contact}{' '}
              {data.contactName && <strong>{data.contactName}</strong>}
              {data.contactName && data.contactEmail && ' · '}
              <a href={`mailto:${data.contactEmail}`}>{data.contactEmail}</a>
            </p>
          </>
        );
      case 'chat':
        return (
          <>
            <p>{data.intro}</p>
            <GuideTable table={data.phaseTable} />
            <h4>{data.tipsTitle}</h4>
            <ul>{data.tips?.map((s) => <li key={s}>{s}</li>)}</ul>
          </>
        );
      case 'llm':
      case 'smtp':
        return (
          <>
            <p>{data.intro}</p>
            <GuideTable table={data.table} />
            {data.exampleTitle && data.exampleTable && (
              <>
                <h4 className="guide-example-title">{data.exampleTitle}</h4>
                <GuideTable table={data.exampleTable} />
              </>
            )}
            {data.bullets && <ul>{data.bullets.map((s) => <li key={s}>{s}</li>)}</ul>}
            {data.footer && <p>{data.footer}</p>}
          </>
        );
      default:
        return (
          <>
            {data.intro && <p>{data.intro}</p>}
            {data.bullets && <ul>{data.bullets.map((s) => <li key={s}>{s}</li>)}</ul>}
            {data.warn && <div className="guide-warn">{data.warn}</div>}
            {data.footer && <p>{data.footer}</p>}
          </>
        );
    }
  };

  return (
    <div className="page guide-page">
      <div className="guide-layout">
        <nav className="guide-toc">
          <h3>{t('guide.toc')}</h3>
          <ul>
            {sectionIds.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  className={`guide-toc-item ${activeId === id ? 'active' : ''}`}
                  onClick={() => scrollTo(id)}
                >
                  {guide.sectionTitles?.[id]}
                </button>
              </li>
            ))}
          </ul>
          {appVersion && (
            <div className="guide-version">{t('guide.versionLabel', { version: appVersion })}</div>
          )}
        </nav>

        <article className="guide-content">
          <header className="guide-header">
            <h2>{t('guide.title')}</h2>
            <p>{t('guide.subtitle')}</p>
          </header>

          {sectionIds.map((id) => (
            <section key={id} id={`guide-${id}`} className="guide-section">
              <h3>{guide.sectionTitles?.[id]}</h3>
              {renderSection(id)}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
