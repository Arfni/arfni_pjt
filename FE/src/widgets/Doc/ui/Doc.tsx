import { motion } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiArrowRight,
  // FiBookOpen,
  // FiCode,
  FiGitBranch,
  FiHome,
  // FiLayers,
} from 'react-icons/fi';
// import type { IconType } from 'react-icons';
import { useNavigate } from 'react-router-dom';
import { Button, Container } from '../../../shared/ui';

type DocumentationStatus = 'live' | 'planned';

// type DocumentationEntry = {
//   id: string;
//   title: string;
//   description: string;
//   highlight?: string;
//   icon: IconType;
//   status: DocumentationStatus;
//   tags: string[];
//   accent: string;
//   actionLabel?: string;
//   onAction?: () => void;
// };

// type DocumentationSection = {
//   id: string;
//   title: string;
//   description: string;
//   documents: DocumentationEntry[];
// };

type GitHubRelease = {
  id: number;
  name: string | null;
  tag_name: string;
  body: string;
  html_url: string;
  published_at: string;
};

const statusStyles: Record<DocumentationStatus, string> = {
  live: 'bg-emerald-100 text-emerald-700',
  planned: 'bg-gray-100 text-gray-600',
};

const releaseAccentPalette = [
  'from-primary-500 to-amber-400',
  'from-blue-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-purple-500 to-pink-500',
];

const RELEASES_API_URL =
  'https://api.github.com/repos/Arfni/arfni_pjt/releases';

const getReleaseSummary = (body?: string | null, fallback?: string) => {
  if (!body) {
    return fallback ?? '';
  }

  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return fallback ?? '';
  }

  return lines[0].replace(/^#+\s*/, '');
};

export const Doc = () => {
  const { t, i18n } = useTranslation('doc');
  const navigate = useNavigate();
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(true);
  const [releasesError, setReleasesError] = useState<string | null>(null);

  const fetchReleases = useCallback(async (signal?: AbortSignal) => {
    try {
      setReleasesLoading(true);
      setReleasesError(null);

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
      setReleasesError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!signal || !signal.aborted) {
        setReleasesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchReleases(controller.signal);

    return () => controller.abort();
  }, [fetchReleases]);

  const locale = i18n.language || 'en';

  const formatReleaseDate = useCallback(
    (date: string) => {
      try {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(date));
      } catch {
        return new Date(date).toLocaleString();
      }
    },
    [locale]
  );

  const releaseCards = useMemo(
    () =>
      releases.map((release, index) => {
        const accent =
          releaseAccentPalette[index % releaseAccentPalette.length];

        return {
          ...release,
          accent,
          summary: getReleaseSummary(
            release.body,
            t('releases.noDescription')
          ),
          publishedLabel: formatReleaseDate(release.published_at),
          action: () => navigate(`/note?tag=${encodeURIComponent(release.tag_name)}`),
        };
      }),
    [releases, formatReleaseDate, navigate, t]
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  // const documentationSections: DocumentationSection[] = [
  //   {
  //     id: 'developerDocs',
  //     title: t('sections.developerDocs.title'),
  //     description: t('sections.developerDocs.description'),
  //     documents: [
  //       {
  //         id: 'developerGuide',
  //         title: t('documents.developerGuide.title'),
  //         description: t('documents.developerGuide.description'),
  //         highlight: t('documents.developerGuide.highlight'),
  //         icon: FiBookOpen,
  //         status: 'planned',
  //         tags: [t('tags.developer'), t('tags.guide')],
  //         accent: 'from-blue-500 to-indigo-500',
  //       },
  //       {
  //         id: 'apiReference',
  //         title: t('documents.apiReference.title'),
  //         description: t('documents.apiReference.description'),
  //         highlight: t('documents.apiReference.highlight'),
  //         icon: FiCode,
  //         status: 'planned',
  //         tags: [t('tags.api'), t('tags.developer')],
  //         accent: 'from-emerald-500 to-teal-500',
  //       },
  //       {
  //         id: 'integrationPlaybook',
  //         title: t('documents.integrationPlaybook.title'),
  //         description: t('documents.integrationPlaybook.description'),
  //         highlight: t('documents.integrationPlaybook.highlight'),
  //         icon: FiLayers,
  //         status: 'planned',
  //         tags: [t('tags.integrations'), t('tags.guide')],
  //         accent: 'from-purple-500 to-pink-500',
  //       },
  //     ],
  //   },
  // ];

  return (
    <section className="relative min-h-screen pt-24 pb-16 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-60 -z-10" />
      <div className="absolute -top-40 right-0 w-[28rem] h-[28rem] bg-gradient-to-br from-amber-300/40 to-orange-500/30 blur-3xl -z-20" />
      <div className="absolute bottom-0 left-0 w-[26rem] h-[26rem] bg-gradient-to-tr from-blue-400/30 to-purple-500/30 blur-[160px] -z-20" />

      <Container className="relative space-y-16">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-4xl"
        >
          <motion.p
            variants={itemVariants}
            className="uppercase tracking-[0.35em] text-sm text-primary-600"
          >
            {t('hero.eyebrow')}
          </motion.p>
          <motion.h1
            variants={itemVariants}
            className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-gray-900"
          >
            <span className="block">{t('hero.title.line1')}</span>
            <span className="text-gradient">{t('hero.title.line2')}</span>
            <span className="block">{t('hero.title.line3')}</span>
          </motion.h1>
          <motion.p
            variants={itemVariants}
            className="mt-6 text-lg text-gray-600 max-w-2xl"
          >
            {t('hero.description')}
          </motion.p>
          <motion.div
            variants={itemVariants}
            className="mt-8 flex flex-wrap gap-4"
          >
            <Button size="lg" onClick={() => navigate('/note')}>
              <FiGitBranch className="mr-2" />
              {t('actions.primary')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/')}
              className="text-gray-700"
            >
              <FiHome className="mr-2" />
              {t('actions.secondary')}
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-16"
        >
          <motion.div variants={itemVariants}>
            <div className="flex flex-col gap-4 mb-8">
              <div>
                <p className="text-sm font-medium text-primary-600 uppercase tracking-[0.25em]">
                  {t('sections.updates.title')}
                </p>
                <p className="mt-2 text-gray-600 max-w-2xl">
                  {t('sections.updates.description')}
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {t('releases.subheading')}
              </div>
            </div>

            {releasesLoading && (
              <div className="rounded-3xl border border-gray-100 bg-white/70 p-10 text-center backdrop-blur">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-500" />
                <p className="mt-4 text-gray-500">{t('releases.loading')}</p>
              </div>
            )}

            {!releasesLoading && releasesError && (
              <div className="rounded-3xl border border-red-100 bg-red-50/80 p-8 text-center">
                <p className="text-lg font-semibold text-red-600">
                  {t('releases.error.title')}
                </p>
                <p className="mt-2 text-sm text-red-500">
                  {t('releases.error.description')}
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => fetchReleases()}
                >
                  {t('releases.error.retry')}
                </Button>
              </div>
            )}

            {!releasesLoading &&
              !releasesError &&
              releaseCards.length === 0 && (
                <div className="rounded-3xl border border-dashed border-gray-200 bg-white/70 p-8 text-center text-gray-500">
                  {t('releases.empty')}
                </div>
              )}

            {!releasesLoading && !releasesError && releaseCards.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {releaseCards.map((release) => (
                  <div
                    key={release.id}
                    className="flex flex-col h-full rounded-3xl border border-gray-100 bg-white/80 p-6 shadow-lg shadow-gray-900/5"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div
                        className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${release.accent} flex items-center justify-center text-white`}
                      >
                        <FiGitBranch size={26} />
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${statusStyles.live}`}
                      >
                        {t('statuses.live')}
                      </span>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                      {t('releases.versionLabel', {
                        version: release.tag_name,
                      })}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold text-gray-900">
                      {release.name ?? `Release ${release.tag_name}`}
                    </h3>
                    <p className="mt-3 text-gray-600 flex-1">
                      {release.summary}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      {t('releases.publishedOn', {
                        date: release.publishedLabel,
                      })}
                    </p>
                    <Button
                      size="md"
                      className="mt-6 justify-between"
                      onClick={release.action}
                    >
                      <span>{t('documents.releaseNotes.action')}</span>
                      <FiArrowRight className="ml-2" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* {documentationSections.map((section) => (
            <motion.div key={section.id} variants={itemVariants}>
              <div className="flex flex-col gap-4 mb-8">
                <div>
                  <p className="text-sm font-medium text-primary-600 uppercase tracking-[0.25em]">
                    {section.title}
                  </p>
                  <p className="mt-2 text-gray-600 max-w-2xl">
                    {section.description}
                  </p>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {section.documents.map((doc) => {
                  const Icon = doc.icon;
                  const statusLabel =
                    doc.status === 'live'
                      ? t('statuses.live')
                      : t('statuses.comingSoon');

                  return (
                    <div
                      key={doc.id}
                      className="flex flex-col h-full rounded-3xl border border-gray-100 bg-white/80 p-6 shadow-lg shadow-gray-900/5 backdrop-blur-sm"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div
                          className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${doc.accent} flex items-center justify-center text-white`}
                        >
                          <Icon size={26} />
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${statusStyles[doc.status]}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {doc.title}
                      </h3>
                      <p className="mt-3 text-gray-600 flex-1">
                        {doc.description}
                      </p>
                      {doc.highlight && (
                        <p className="mt-2 text-sm text-gray-500">
                          {doc.highlight}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      {doc.actionLabel && doc.onAction && (
                        <Button
                          size="md"
                          className="mt-6 justify-between"
                          onClick={doc.onAction}
                        >
                          <span>{doc.actionLabel}</span>
                          <FiArrowRight className="ml-2" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))} */}
        </motion.div>
      </Container>
    </section>
  );
};
