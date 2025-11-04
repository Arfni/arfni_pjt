import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Container, Section } from '../../../shared/ui';
import { FeatureCard } from './FeatureCard';
import { FiLayout, FiServer, FiZap, FiCheck } from 'react-icons/fi';

export const Features = () => {
  const { t } = useTranslation('features');

  const features = [
    {
      title: t('cards.visualDesign.title'),
      description: t('cards.visualDesign.description'),
      icon: FiLayout,
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      title: t('cards.localDocker.title'),
      description: t('cards.localDocker.description'),
      icon: FiServer,
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      title: t('cards.oneShotExecution.title'),
      description: t('cards.oneShotExecution.description'),
      icon: FiZap,
      gradient: 'from-orange-500 to-red-500',
    },
    {
      title: t('cards.realTimeMonitoring.title'),
      description: t('cards.realTimeMonitoring.description'),
      icon: FiCheck,
      gradient: 'from-green-500 to-emerald-500',
    },
  ];
  return (
    <Section
      id="features"
      eyebrow={t('eyebrow')}
      heading={t('heading')}
      description={t('description')}
      className="bg-gray-50"
    >
      <Container>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid md:grid-cols-2 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <FeatureCard {...feature} />
            </motion.div>
          ))}
        </motion.div>

        {/* Feature Image Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {[1, 2, 3].map((item) => (
            <motion.div
              key={item}
              whileHover={{ scale: 1.05 }}
              className="relative aspect-video bg-white rounded-2xl shadow-lg overflow-hidden"
            >
              {/* Placeholder for feature screenshots */}
              <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center">
                <span className="text-gray-400">Feature Screenshot {item}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </Section>
  );
};