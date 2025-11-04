import { motion } from 'framer-motion';
import { Container, Section } from '../../../shared/ui';
import { RoadmapCard } from './RoadmapCard';
import { FiDollarSign, FiTrendingUp, FiGlobe, FiShield } from 'react-icons/fi';

const roadmapItems = [
  {
    title: 'AI 비용 산정',
    description: '리소스를 분석해 월간 예상 비용을 추정합니다.',
    icon: FiDollarSign,
    status: '예정',
    quarter: 'Q2 2025',
  },
  {
    title: '배포 후 조언',
    description: '로그·헬스 결과를 요약해 개선 팁을 제공합니다.',
    icon: FiTrendingUp,
    status: '예정',
    quarter: 'Q2 2025',
  },
  {
    title: '다중 클라우드 지원',
    description: 'AWS, GCP, Azure 등 다양한 클라우드 플랫폼을 지원합니다.',
    icon: FiGlobe,
    status: '개발중',
    quarter: 'Q3 2025',
  },
  {
    title: '엔터프라이즈 보안',
    description: '기업용 보안 기능과 규정 준수 도구를 제공합니다.',
    icon: FiShield,
    status: '계획중',
    quarter: 'Q4 2025',
  },
];

export const Roadmap = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <Section
      id="roadmap"
      eyebrow="ROADMAP"
      heading="다음 업데이트에서 만나요"
      description="ARFNI는 지속적으로 발전하고 있습니다. 앞으로 추가될 기능들을 확인해보세요."
    >
      <Container>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-6"
        >
          {roadmapItems.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <RoadmapCard {...item} />
            </motion.div>
          ))}
        </motion.div>

        {/* Timeline Visualization */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 relative"
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary-600 to-transparent" />

          <div className="space-y-8">
            {['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'].map((quarter, index) => (
              <motion.div
                key={quarter}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`flex items-center ${
                  index % 2 === 0 ? 'justify-start' : 'justify-end'
                }`}
              >
                <div className={`max-w-xs ${index % 2 === 0 ? 'pr-8 text-right' : 'pl-8'}`}>
                  <h4 className="font-bold text-primary-600">{quarter}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {roadmapItems.filter(item => item.quarter === quarter).map(item => item.title).join(', ')}
                  </p>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2">
                  <motion.div
                    whileHover={{ scale: 1.2 }}
                    className="w-4 h-4 bg-primary-600 rounded-full border-4 border-white shadow-lg"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Container>
    </Section>
  );
};