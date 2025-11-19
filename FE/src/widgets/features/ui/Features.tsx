import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Container, Section } from '../../../shared/ui';
import { FiLayout, FiServer, FiZap, FiCpu, FiPackage, FiEye } from 'react-icons/fi';
import type { IconType } from 'react-icons';

interface Feature {
  title: string;
  description: string;
  icon: IconType;
  gradient: string;
  imagePlaceholder: string;
  imageSrc: string;
  imageAlt: string;
}

export const Features = () => {
  const { t } = useTranslation('features');

  const features: Feature[] = [
    {
      title: t('cards.guiDesign.title'),
      description: t('cards.guiDesign.description'),
      icon: FiLayout,
      gradient: 'from-blue-500 to-cyan-500',
      imagePlaceholder: 'GUI Design',
      imageSrc: '/images/1.gif',
      imageAlt: 'GUI Design preview',
    },
    {
      title: t('cards.autoGeneration.title'),
      description: t('cards.autoGeneration.description'),
      icon: FiServer,
      gradient: 'from-purple-500 to-pink-500',
      imagePlaceholder: 'Auto Generation',
      imageSrc: '/images/2.gif',
      imageAlt: 'Auto Generation preview',
    },
    {
      title: t('cards.visualFeedback.title'),
      description: t('cards.visualFeedback.description'),
      icon: FiEye,
      gradient: 'from-orange-500 to-red-500',
      imagePlaceholder: 'Visual Feedback',
      imageSrc: '/images/3.gif',
      imageAlt: 'Visual Feedback preview',
    },
    {
      title: t('cards.aiSupport.title'),
      description: t('cards.aiSupport.description'),
      icon: FiCpu,
      gradient: 'from-green-500 to-emerald-500',
      imagePlaceholder: 'AI Support',
      imageSrc: '/images/4.gif',
      imageAlt: 'AI Support preview',
    },
    {
      title: t('cards.monitoring.title'),
      description: t('cards.monitoring.description'),
      icon: FiZap,
      gradient: 'from-indigo-500 to-blue-500',
      imagePlaceholder: 'Monitoring',
      imageSrc: '/images/5.gif',
      imageAlt: 'Monitoring preview',
    },
    {
      title: t('cards.pluginSystem.title'),
      description: t('cards.pluginSystem.description'),
      icon: FiPackage,
      gradient: 'from-pink-500 to-rose-500',
      imagePlaceholder: 'Plugin System',
      imageSrc: '/images/6.gif',
      imageAlt: 'Plugin System preview',
    },
  ];

  return (
    <Section
      id="features"
      eyebrow={t('eyebrow')}
      heading={t('heading')}
      description={t('description')}
      className="bg-white"
    >
      <Container>
        <div className="space-y-32">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isReversed = index % 2 === 1;

            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center ${
                  isReversed ? 'lg:grid-flow-dense' : ''
                }`}
              >
                {/* Content Section */}
                <div className={isReversed ? 'lg:col-start-2' : ''}>
                  <motion.div
                    initial={{ opacity: 0, x: isReversed ? 20 : -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                  >
                    {/* Icon */}
                    <div
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 shadow-lg`}
                    >
                      <Icon className="w-7 h-7 text-white" />
                    </div>

                    {/* Title */}
                    <h3 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                      {feature.title}
                    </h3>

                    {/* Description */}
                    <p className="text-lg text-gray-600 leading-relaxed">
                      {feature.description}
                    </p>
                  </motion.div>
                </div>

                {/* Image Section (GIF 표시) */}
                <div className={isReversed ? 'lg:col-start-1 lg:row-start-1' : ''}>
                  <motion.div
                    initial={{ opacity: 0, x: isReversed ? -20 : 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="relative aspect-video rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br from-gray-50 to-gray-100"
                  >
                    <img
                      src={feature.imageSrc}
                      alt={feature.imageAlt}
                      className="w-full h-full object-cover"
                    />
                  </motion.div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
};
