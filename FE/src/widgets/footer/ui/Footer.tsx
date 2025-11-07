import { motion } from 'framer-motion';
import { FiGithub, FiTwitter, FiMail, FiHeart } from 'react-icons/fi';
import { FaDiscord } from 'react-icons/fa';
import { Container } from '../../../shared/ui';
import { APP_NAME, NAVIGATION_ITEMS, SOCIAL_LINKS } from '../../../shared/config';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: FiGithub, href: SOCIAL_LINKS.github, label: 'GitHub' },
    { icon: FiTwitter, href: SOCIAL_LINKS.twitter, label: 'Twitter' },
    { icon: FaDiscord, href: SOCIAL_LINKS.discord, label: 'Discord' },
    { icon: FiMail, href: 'mailto:support@arfni.com', label: 'Email' },
  ];

  return (
    <footer className="bg-[#1A1A1A] text-white">
      <Container>
        {/* Main Footer */}
        <div className="py-16 grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="md:col-span-2"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">A</span>
              </div>
              <span className="font-bold text-xl">{APP_NAME}</span>
            </div>
            <p className="text-gray-400 max-w-md">
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
          >
            <h4 className="font-semibold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-2">
              {NAVIGATION_ITEMS.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className="text-gray-400 hover:text-primary-400 transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Resources */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <h4 className="font-semibold text-lg mb-4">Resources</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="#docs"
                  className="text-gray-400 hover:text-primary-400 transition-colors"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="#api"
                  className="text-gray-400 hover:text-primary-400 transition-colors"
                >
                  API Reference
                </a>
              </li>
              <li>
                <a
                  href="#blog"
                  className="text-gray-400 hover:text-primary-400 transition-colors"
                >
                  Blog
                </a>
              </li>
              <li>
                <a
                  href="#support"
                  className="text-gray-400 hover:text-primary-400 transition-colors"
                >
                  Support
                </a>
              </li>
            </ul>
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
            Made with <FiHeart className="text-red-500" size={16} /> by the ARFNI Team
          </p>
        </motion.div>
      </Container>
    </footer>
  );
};