import { motion } from 'framer-motion';
import type { IconType } from 'react-icons';
import { cn } from '../../../shared/lib';

interface FeatureCardProps {
  title: string;
  description: string;
  icon: IconType;
  gradient: string;
}

export const FeatureCard = ({ title, description, icon: Icon, gradient }: FeatureCardProps) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="group relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 min-h-[280px] flex flex-col"
    >
      {/* Background Gradient on Hover */}
      <motion.div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity',
          gradient
        )}
      />

      {/* Icon */}
      <div className="relative">
        <div className={cn(
          'w-14 h-14 bg-gradient-to-br rounded-xl flex items-center justify-center text-white shadow-lg',
          gradient
        )}>
          <Icon size={28} />
        </div>
      </div>

      {/* Content */}
      <h3 className="mt-6 text-xl font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
        {title}
      </h3>
      <p className="mt-3 text-gray-600 leading-relaxed">
        {description}
      </p>

      {/* Decorative Element */}
      <motion.div
        className="absolute top-8 right-8 w-20 h-20 opacity-5"
        animate={{
          rotate: [0, 360],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <div className={cn('w-full h-full bg-gradient-to-br rounded-full', gradient)} />
      </motion.div>
    </motion.div>
  );
};