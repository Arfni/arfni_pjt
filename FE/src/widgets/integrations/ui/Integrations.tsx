import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Container, Section } from '../../../shared/ui';
import {
  SiReact,
  SiVuedotjs,
  SiAngular,
  SiNextdotjs,
  SiSpringboot,
  SiFastapi,
  SiExpress,
  SiDjango,
  SiMysql,
  SiPostgresql,
  SiMongodb,
  SiRedis,
  SiNginx,
  SiDocker,
} from 'react-icons/si';

interface Integration {
  name: string;
  icon: typeof SiReact;
  category: 'frontend' | 'backend' | 'database' | 'infrastructure';
  color: string;
}

export const Integrations = () => {
  const { t } = useTranslation('integrations');

  const integrations: Integration[] = [
    // Frontend
    { name: 'React', icon: SiReact, category: 'frontend', color: '#61DAFB' },
    { name: 'Vue', icon: SiVuedotjs, category: 'frontend', color: '#4FC08D' },
    { name: 'Angular', icon: SiAngular, category: 'frontend', color: '#DD0031' },
    { name: 'Next.js', icon: SiNextdotjs, category: 'frontend', color: '#000000' },

    // Backend
    { name: 'Spring Boot', icon: SiSpringboot, category: 'backend', color: '#6DB33F' },
    { name: 'FastAPI', icon: SiFastapi, category: 'backend', color: '#009688' },
    { name: 'Express', icon: SiExpress, category: 'backend', color: '#000000' },
    { name: 'Django', icon: SiDjango, category: 'backend', color: '#092E20' },

    // Database
    { name: 'MySQL', icon: SiMysql, category: 'database', color: '#4479A1' },
    { name: 'PostgreSQL', icon: SiPostgresql, category: 'database', color: '#4169E1' },
    { name: 'MongoDB', icon: SiMongodb, category: 'database', color: '#47A248' },
    { name: 'Redis', icon: SiRedis, category: 'database', color: '#DC382D' },

    // Infrastructure
    { name: 'Nginx', icon: SiNginx, category: 'infrastructure', color: '#009639' },
    { name: 'Docker', icon: SiDocker, category: 'infrastructure', color: '#2496ED' },
  ];

  // Duplicate for seamless infinite scroll
  const duplicatedIntegrations = [...integrations, ...integrations];

  return (
    <Section
      id="integrations"
      eyebrow={t('eyebrow')}
      heading={t('heading')}
      description={t('description')}
      className="bg-gray-50"
    >
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden py-4"
        >
          <div className="relative">
            {/* Infinite Scroll Container */}
            <div
              className="flex gap-8 animate-scroll hover:pause-animation"
              style={{
                width: 'max-content',
                animation: 'scroll 25s linear infinite',
              }}
            >
              {duplicatedIntegrations.map((integration, index) => {
                const Icon = integration.icon;
                return (
                  <div
                    key={`${integration.name}-${index}`}
                    className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm hover:shadow-md transition-all group hover:scale-110 hover:-translate-y-1 flex-shrink-0"
                    style={{ width: '140px' }}
                  >
                    <Icon
                      className="w-12 h-12 mb-3 transition-colors"
                      style={{ color: integration.color }}
                    />
                    <span className="text-sm font-medium text-gray-700 text-center">
                      {integration.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Plugin Note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-gray-600">
            {t('description')}
          </p>
        </motion.div>
      </Container>

      {/* CSS Animation */}
      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .hover\\:pause-animation:hover {
          animation-play-state: paused !important;
        }
      `}</style>
    </Section>
  );
};
