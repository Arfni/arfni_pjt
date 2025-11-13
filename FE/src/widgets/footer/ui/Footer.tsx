import { motion } from 'framer-motion';
import { FiGithub, FiMail, FiHeart, FiChevronRight } from 'react-icons/fi';
import { Container } from '../../../shared/ui';
import { APP_NAME, SOCIAL_LINKS } from '../../../shared/config';
import { cn } from '../../../shared/lib';
import { useTranslation } from 'react-i18next';

const LOGO_IMAGE_SRC = '/images/Group 15.png';

// Header와 맞추기 위한 네비게이션 타입
type NavItem = 'download' | 'features' | 'docs';

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation('common');

  const socialLinks = [
    { icon: FiGithub, href: SOCIAL_LINKS.github, label: 'GitHub' },
    { icon: FiMail, href: 'mailto:arfni201@googlegroups.com', label: 'Email' },
  ];

  const handleNavClick = (item: NavItem) => {
    // (1) docs → 다른 페이지로 이동
    if (item === 'docs') {
      window.location.href = '/docs';
      return;
    }

    // (2) download → 페이지 최상단으로 이동
    if (item === 'download') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // (3) features → 섹션 스크롤 이동
    const selector = `#${item}`;
    const element = document.querySelector(selector);
    if (!element) return;

    const headerOffset = 80; // 헤더 높이만큼 보정
    const elementTop = element.getBoundingClientRect().top + window.scrollY;
    const targetY = elementTop - headerOffset;

    window.scrollTo({
      top: targetY,
      behavior: 'smooth',
    });
  };

  const quickLinks: NavItem[] = ['download', 'features', 'docs'];

  return (
    <footer className="bg-[#1A1A1A] text-white">
      <Container>
        {/* Main Footer */}
        <div className="py-16 grid md:grid-cols-2 gap-8 items-start">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center',
                  LOGO_IMAGE_SRC
                    ? 'bg-transparent'
                    : 'bg-gradient-to-br from-primary-600 to-primary-400'
                )}
              >
                {LOGO_IMAGE_SRC ? (
                  <img
                    src={LOGO_IMAGE_SRC}
                    alt={t('appName')}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-white font-bold text-xl">A</span>
                )}
              </div>
              <span className="font-bold text-xl">{APP_NAME}</span>
            </div>
            <p className="text-gray-400 max-w-md leading-relaxed">
              AI와 인프라를 연결하는 혁신적인 도구로, 복잡한 배포 과정을 단순화하고
              개발자가 비즈니스 로직에 집중할 수 있도록 돕습니다.
            </p>

            {/* Social Links */}
            <div className="flex gap-4 mt-6">
              {socialLinks.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="w-10 h-10 bg-gray-800 hover:bg-primary-600 rounded-lg flex items-center justify-center transition-colors"
                  aria-label={social.label}
                >
                  <social.icon size={20} />
                </motion.a>
              ))}
            </div>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="md:justify-self-end w-full"
          >
            <div className="bg-gray-900/40 rounded-xl p-5 md:max-w-xs md:ml-auto">
              <h4 className="font-semibold text-lg mb-3 border-b border-gray-700 pb-2">
                Quick Links
              </h4>
              <ul className="space-y-2">
                {quickLinks.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => handleNavClick(item)}
                      className="w-full flex items-center justify-between text-sm text-gray-300 hover:text-primary-400 hover:bg-gray-800/70 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span>{t(`navigation.${item}`)}</span>
                      <FiChevronRight className="opacity-70" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>

        {/* Bottom Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="py-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <p className="text-gray-400 text-sm text-center md:text-left">
            © {currentYear} {APP_NAME}. All rights reserved.
          </p>
          <p className="text-gray-400 text-sm flex items-center gap-1">
            Made with <FiHeart className="text-red-500" size={16} /> by the ARFNI
            Team
          </p>
        </motion.div>
      </Container>
    </footer>
  );
};
