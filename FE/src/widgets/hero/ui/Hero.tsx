import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiGithub, FiArrowDown } from 'react-icons/fi';
import { Container, Button } from '../../../shared/ui';
import { DOWNLOAD_LINKS, SOCIAL_LINKS } from '../../../shared/config';

export const Hero = () => {
  const { t } = useTranslation('hero');
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
      transition: {
        duration: 0.5,
      },
    },
  };

  const handleScrollToFeatures = () => {
    const element = document.querySelector('#features');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid -z-10" />

      <Container>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid lg:grid-cols-2 gap-12 items-center"
        >
          {/* Content */}
          <div className="text-center lg:text-left">
            <motion.h1
              variants={itemVariants}
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight"
            >
              <span className="text-gray-900">{t('title.line1')}</span>
              <br />
              <span className="text-gradient">{t('title.line2')}</span>
              <br />
              <span className="text-gray-900">{t('title.line3')}</span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto lg:mx-0"
              dangerouslySetInnerHTML={{
                __html: t('description').replace('<strong>', '<span class="font-semibold text-gray-900">').replace('</strong>', '</span>')
              }}
            />

            <motion.div
              variants={itemVariants}
              className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
              id="download"
            >
              <Button
                size="lg"
                className="group"
                onClick={() => window.open(DOWNLOAD_LINKS.windows, '_blank')}
              >
                <FiDownload className="mr-2 group-hover:animate-bounce" />
                {t('buttons.download')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => window.open(SOCIAL_LINKS.github, '_blank')}
              >
                <FiGithub className="mr-2" />
                {t('buttons.github')}
              </Button>
            </motion.div>

            <motion.p
              variants={itemVariants}
              className="mt-4 text-sm text-gray-500"
            >
              {t('platformNote')}
            </motion.p>
          </div>

          {/* Illustration */}
          <motion.div
            variants={itemVariants}
            className="relative"
          >
            <motion.div
              animate={{
                y: [0, -20, 0],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative"
            >
              {/* ARFNI Blocks Illustration */}
              <img
                src="/images/arfni-blocks.png"
                alt="ARFNI - AI Infrastructure Modeling"
                className="w-full h-auto max-w-md mx-auto drop-shadow-2xl"
              />

              {/* Floating elements */}
              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="absolute -top-8 -right-8 w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-xl opacity-20"
              />
              <motion.div
                animate={{
                  rotate: -360,
                }}
                transition={{
                  duration: 15,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="absolute -bottom-8 -left-8 w-32 h-32 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full opacity-20"
              />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.button
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            onClick={handleScrollToFeatures}
            className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
            aria-label="Scroll to features"
          >
            <FiArrowDown size={24} />
          </motion.button>
        </motion.div>
      </Container>
    </section>
  );
};