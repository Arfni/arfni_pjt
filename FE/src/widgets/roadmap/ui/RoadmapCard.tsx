import { motion } from 'framer-motion';
import type { IconType } from 'react-icons';
import { cn } from '../../../shared/lib';

interface RoadmapCardProps {
  title: string;
  description: string;
  icon: IconType;
  status: string;
  quarter: string;
}

export const RoadmapCard = ({ title, description, icon: Icon, status, quarter }: RoadmapCardProps) => {
  const statusColors = {
    '예정': 'bg-blue-100 text-blue-700',
    '개발중': 'bg-yellow-100 text-yellow-700',
    '계획중': 'bg-gray-100 text-gray-700',
    '완료': 'bg-green-100 text-green-700',
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative bg-white rounded-2xl p-6 border border-gray-200 hover:border-primary-300 hover:shadow-lg transition-all duration-300 overflow-hidden"
    >
      {/* Status Badge */}
      <div className="absolute top-4 right-4">
        <span className={cn(
          'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium',
          statusColors[status as keyof typeof statusColors] || statusColors['계획중']
        )}>
          {status}
        </span>
      </div>

      {/* Icon */}
      <motion.div
        whileHover={{ rotate: 15 }}
        className="w-12 h-12 bg-gradient-to-br from-primary-100 to-primary-50 rounded-xl flex items-center justify-center text-primary-600 mb-4"
      >
        <Icon size={24} />
      </motion.div>

      {/* Content */}
      <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-3">{description}</p>

      {/* Quarter */}
      <div className="flex items-center text-xs text-gray-500">
        <span className="font-medium">{quarter}</span>
      </div>

      {/* Background Pattern */}
      <motion.div
        className="absolute -bottom-10 -right-10 w-40 h-40 opacity-5"
        animate={{
          rotate: [0, 360],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <div className="w-full h-full bg-gradient-to-br from-primary-600 to-primary-400 rounded-full" />
      </motion.div>
    </motion.div>
  );
};