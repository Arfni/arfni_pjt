import { motion } from 'framer-motion';
// import { useTranslation } from 'react-i18next';
import { FiArrowLeft } from 'react-icons/fi';
import { Container, Button } from '../../../shared/ui';
import { useNavigate } from 'react-router-dom';

export const Doc = () => {
//   const { t } = useTranslation('doc');
  const navigate = useNavigate();

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

  const handleGoBack = () => {
    navigate(-1);
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
          className="text-center max-w-3xl mx-auto"
        >
          {/* Construction Icon */}
          <motion.div
            variants={itemVariants}
            className="mb-8"
          >
            <motion.div
              animate={{
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <svg
                className="mx-auto h-32 w-32 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </motion.div>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={itemVariants}
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6"
          >
            <span className="text-gradient">🚧 공사중입니다 🚧</span>
          </motion.h1>

          {/* Description */}
          <motion.p
            variants={itemVariants}
            className="text-lg sm:text-xl text-gray-600 mb-8"
          >
            현재 페이지를 개선하고 있습니다.
            <br />
            곧 더 나은 모습으로 찾아뵙겠습니다.
          </motion.p>

          {/* Back Button */}
          <motion.div
            variants={itemVariants}
            className="flex justify-center"
          >
            <Button
              size="lg"
              onClick={handleGoBack}
              className="group"
            >
              <FiArrowLeft 
                size={20} 
                className="mr-2 flex-shrink-0 group-hover:-translate-x-1 transition-transform" 
              />
              뒤로 가기
            </Button>
          </motion.div>

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
            className="absolute top-20 right-20 w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-xl opacity-20"
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
            className="absolute bottom-20 left-20 w-32 h-32 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full opacity-20"
          />
        </motion.div>
      </Container>
    </section>
  );
};