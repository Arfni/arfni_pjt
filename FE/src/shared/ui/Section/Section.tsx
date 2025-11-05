import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export interface SectionProps {
  eyebrow?: string;
  heading?: string;
  description?: string;
  animate?: boolean;
  className?: string;
  id?: string;
  children?: React.ReactNode;
}

const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, eyebrow, heading, description, animate = true, children, ...props }, ref) => {
    const content = (
      <>
        {(eyebrow || heading || description) && (
          <div className="mb-16 text-center">
            {eyebrow && (
              <span className="text-sm font-semibold uppercase tracking-wider text-primary-600">
                {eyebrow}
              </span>
            )}
            {heading && (
              <h2 className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                {heading}
              </h2>
            )}
            {description && (
              <p className="mt-6 text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </>
    );

    if (animate) {
      return (
        <motion.section
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className={cn('py-20 sm:py-32', className)}
          {...props}
        >
          {content}
        </motion.section>
      );
    }

    return (
      <section
        ref={ref}
        className={cn('py-20 sm:py-32', className)}
        {...props}
      >
        {content}
      </section>
    );
  }
);

Section.displayName = 'Section';

export default Section;