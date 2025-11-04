import { motion } from 'framer-motion';
import { Header } from '../../../widgets/header';
import { Hero } from '../../../widgets/hero';
import { Features } from '../../../widgets/features';
import { Roadmap } from '../../../widgets/roadmap';
import { Footer } from '../../../widgets/footer';

export const LandingPage = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen"
    >
      <Header />

      <main>
        <Hero />
        <Features />
        <Roadmap />
      </main>

      <Footer />
    </motion.div>
  );
};