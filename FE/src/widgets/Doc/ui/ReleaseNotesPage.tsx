import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FiAlertCircle,
  FiArrowLeft,
  FiDownload,
  FiExternalLink,
  FiHome,
  FiRefreshCcw,
} from 'react-icons/fi';
import { Button, Container } from '../../../shared/ui';

type GitHubUser = {
  login: string;
};

type GitHubAsset = {
  id: number;
  name: string;
  browser_download_url: string;
  download_count: number;
  content_type: string;
  size: number;
};

type GitHubRelease = {
  id: number;
  name: string | null;
  tag_name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets: GitHubAsset[];
  author: GitHubUser;
};

const RELEASES_API_URL =
  'https://api.github.com/repos/Arfni/arfni_pjt/releases';

const formatFileSize = (sizeInBytes: number) => {
  if (sizeInBytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    Math.floor(Math.log(sizeInBytes) / Math.log(1024)),
    units.length - 1
  );
  const value = sizeInBytes / Math.pow(1024, exponent);

  return `${value.toFixed(1)} ${units[exponent]}`;
};

export const ReleaseNotesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation('releaseNotes');
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [selectedRelease, setSelectedRelease] =
    useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReleases = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(RELEASES_API_URL, { signal });

        if (!res.ok) {
          throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
        }

        const data: GitHubRelease[] = await res.json();
        setReleases(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error(err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!signal || !signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    loadReleases(controller.signal);

    return () => controller.abort();
  }, [loadReleases]);

  useEffect(() => {
    if (!releases.length) {
      setSelectedRelease(null);
      return;
    }

    const tagParam = searchParams.get('tag');
    const match = tagParam
      ? releases.find((release) => release.tag_name === tagParam)
      : releases[0];

    setSelectedRelease(match ?? releases[0]);
  }, [releases, searchParams]);

  const locale = i18n.language || 'en';

  const formattedDate = useMemo(() => {
    if (!selectedRelease) {
      return '';
    }

    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date(selectedRelease.published_at));
    } catch {
      return new Date(selectedRelease.published_at).toLocaleString();
    }
  }, [locale, selectedRelease]);

  const metadataItems = selectedRelease
    ? [
        { label: t('metadata.tag'), value: selectedRelease.tag_name },
        { label: t('metadata.published'), value: formattedDate },
        { label: t('metadata.author'), value: selectedRelease.author.login },
      ]
    : [];

  const handleSelectRelease = (tag: string) => {
    if (tag) {
      setSearchParams({ tag });
    } else {
      setSearchParams({});
    }
  };

  return (
    <section className="relative min-h-screen pt-24 pb-16 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-60 -z-10" />
      <div className="absolute -top-20 left-0 w-[28rem] h-[28rem] bg-gradient-to-br from-primary-500/25 to-blue-500/20 blur-[160px] -z-20" />
      <div className="absolute bottom-0 right-0 w-[24rem] h-[24rem] bg-gradient-to-tr from-amber-400/20 to-pink-500/20 blur-[140px] -z-20" />

      <Container className="relative space-y-12">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="uppercase tracking-[0.3em] text-sm text-primary-600">
              {t('hero.eyebrow')}
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold text-gray-900">
              {t('hero.title')}
            </h1>
            <p className="mt-4 text-gray-600 max-w-2xl">
              {t('hero.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate('/docs')}>
              <FiArrowLeft className="mr-2" />
              {t('nav.backToDocs')}
            </Button>
            <Button onClick={() => navigate('/')}>
              <FiHome className="mr-2" />
              {t('nav.goHome')}
            </Button>
          </div>
        </div>

        {loading && (
          <div className="rounded-3xl border border-gray-100 bg-white/70 p-12 backdrop-blur">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-500" />
            <p className="mt-6 text-center text-gray-500">{t('loading')}</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-red-100 bg-red-50/70 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-red-500 shadow">
              <FiAlertCircle size={28} />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-gray-900">
              {t('error.title')}
            </h2>
            <p className="mt-2 text-gray-600">{t('error.description')}</p>
            <p className="mt-4 break-words text-xs text-gray-500">{error}</p>
            <Button onClick={() => loadReleases()} className="mt-6">
              <FiRefreshCcw className="mr-2" />
              {t('error.retry')}
            </Button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-8 lg:grid-cols-[320px,1fr]">
            <aside className="rounded-3xl border border-gray-100 bg-white/80 p-6 shadow-lg shadow-gray-900/5">
              <div className="flex flex-col gap-2 border-b border-gray-100 pb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  {t('list.title')}
                </h3>
                <p className="text-sm text-gray-500">
                  {t('list.description')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start px-3 text-gray-600"
                  onClick={() => loadReleases()}
                >
                  <FiRefreshCcw className="mr-2" />
                  {t('list.refresh')}
                </Button>
              </div>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {releases.length === 0 && (
                  <p className="text-sm text-gray-500">{t('list.empty')}</p>
                )}
                {releases.map((release, index) => {
                  const isActive = selectedRelease?.id === release.id;
                  const formatted = (() => {
                    try {
                      return new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                      }).format(new Date(release.published_at));
                    } catch {
                      return new Date(release.published_at).toLocaleDateString();
                    }
                  })();

                  return (
                    <button
                      key={release.id}
                      onClick={() => handleSelectRelease(release.tag_name)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-100 bg-white text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold leading-tight">
                          {release.name ?? `Release ${release.tag_name}`}
                        </span>
                        {index === 0 && (
                          <span
                            className={`text-xs font-semibold uppercase ${
                              isActive ? 'text-white/70' : 'text-primary-600'
                            }`}
                          >
                            {t('list.latest')}
                          </span>
                        )}
                      </div>
                      <p
                        className={`mt-1 text-xs ${
                          isActive ? 'text-white/70' : 'text-gray-500'
                        }`}
                      >
                        {formatted}
                      </p>
                    </button>
                  );
                })}
              </div>
            </aside>

            {selectedRelease ? (
              <div className="space-y-8">
                <div className="rounded-3xl border border-gray-100 bg-white/80 shadow-xl shadow-gray-900/5">
                  <div className="border-b border-gray-100 p-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-gray-900 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-white">
                        {selectedRelease.tag_name}
                      </span>
                      <a
                        href={selectedRelease.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-sm font-semibold text-primary-600 hover:text-primary-700"
                      >
                        {t('metadata.link')}
                        <FiExternalLink className="ml-1" size={16} />
                      </a>
                    </div>
                    <h2 className="mt-6 text-3xl font-bold text-gray-900">
                      {selectedRelease.name ??
                        `Release ${selectedRelease.tag_name}`}
                    </h2>
                    <p className="mt-2 text-gray-500">{formattedDate}</p>
                  </div>
                  <div className="grid gap-8 p-8 md:grid-cols-3">
                    {metadataItems.map((item) => (
                      <div key={item.label}>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          {item.label}
                        </p>
                        <p className="mt-2 text-lg text-gray-900">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedRelease.assets.length > 0 ? (
                  <div className="rounded-3xl border border-gray-100 bg-white/80 p-8 shadow-xl shadow-gray-900/5">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
                      <h3 className="text-2xl font-semibold text-gray-900">
                        {t('assets.title')}
                      </h3>
                    </div>
                    <div className="mt-6 space-y-4">
                      {selectedRelease.assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-5 text-sm text-gray-700 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="text-base font-semibold text-gray-900">
                              {asset.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {t('assets.meta', {
                                size: formatFileSize(asset.size),
                                count: asset.download_count,
                              })}
                            </p>
                          </div>
                          <a
                            href={asset.browser_download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-white"
                          >
                            <FiDownload className="mr-2" />
                            {t('assets.downloadCta')}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-gray-200 bg-white/60 p-8 text-center text-gray-500">
                    {t('assets.empty')}
                  </div>
                )}

                <div className="rounded-3xl border border-gray-100 bg-white/90 p-8 shadow-xl shadow-gray-900/5">
                  <h3 className="text-2xl font-semibold text-gray-900">
                    {t('markdown.title')}
                  </h3>
                  <article className="prose prose-neutral mt-6 max-w-none">
                    {selectedRelease.body ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedRelease.body}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-gray-500">{t('markdown.empty')}</p>
                    )}
                  </article>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white/70 p-10 text-center text-gray-500">
                {t('list.empty')}
              </div>
            )}
          </div>
        )}
      </Container>
    </section>
  );
};

export default ReleaseNotesPage;
