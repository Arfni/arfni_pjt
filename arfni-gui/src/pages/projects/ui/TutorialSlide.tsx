import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import local1 from '../../../assets/tutorials/local-1.png';
import local2 from '../../../assets/tutorials/local-2.png';
import local3 from '../../../assets/tutorials/local-3.png';
import local4 from '../../../assets/tutorials/local-4.png';
import remote1 from '../../../assets/tutorials/remote-1.png';
import remote2 from '../../../assets/tutorials/remote-2.png';
import remote3 from '../../../assets/tutorials/remote-3.png';
import remote4 from '../../../assets/tutorials/remote-4.png';

interface TutorialSlideProps {
  type?: 'local' | 'remote';
  onClose: () => void;
  onSkip: () => void;
}

export const TutorialSlide: React.FC<TutorialSlideProps> = ({ type = 'local', onClose, onSkip }) => {
  const { t } = useTranslation('projects');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedTab, setSelectedTab] = useState<'local' | 'remote'>(type);

  // Tutorial images based on selected tab
  const slideType = selectedTab;
  const tutorialImages = {
    local: [local1, local2, local3, local4],
    remote: [remote1, remote2, remote3, remote4]
  };

  const slides = [
    {
      image: tutorialImages[slideType][0],
      title: t(`tutorial.${slideType}.slide1.title`),
      desc: t(`tutorial.${slideType}.slide1.desc`)
    },
    {
      image: tutorialImages[slideType][1],
      title: t(`tutorial.${slideType}.slide2.title`),
      desc: t(`tutorial.${slideType}.slide2.desc`)
    },
    {
      image: tutorialImages[slideType][2],
      title: t(`tutorial.${slideType}.slide3.title`),
      desc: t(`tutorial.${slideType}.slide3.desc`)
    },
    {
      image: tutorialImages[slideType][3],
      title: t(`tutorial.${slideType}.slide4.title`),
      desc: t(`tutorial.${slideType}.slide4.desc`)
    },
  ];

  const totalSlides = slides.length;

  const handlePrevious = () => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const handleDotClick = (index: number) => {
    setCurrentSlide(index);
  };

  const handleTabChange = (tab: 'local' | 'remote') => {
    setSelectedTab(tab);
    setCurrentSlide(0); // Reset to first slide when changing tabs
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 p-8">
        {/* Close button */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close tutorial"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Tutorial content */}
        <div className="flex flex-col items-center">
          {/* Tab selector */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => handleTabChange('local')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedTab === 'local'
                  ? 'bg-white text-[#4C65E2] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {t('sidebar.local')}
            </button>
            <button
              onClick={() => handleTabChange('remote')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedTab === 'remote'
                  ? 'bg-white text-[#4C65E2] shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {t('sidebar.ec2')}
            </button>
          </div>

          {/* Title and description */}
          <div className="text-center mb-2">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {slides[currentSlide].title}
            </h2>
            <p className="text-gray-600">
              {slides[currentSlide].desc}
            </p>
          </div>

          {/* Image container with dots overlay */}
          <div className="relative w-full h-96 mb-4 flex items-center justify-center bg-white rounded-lg overflow-hidden">
            <img
              src={slides[currentSlide].image}
              alt={slides[currentSlide].title}
              className="max-w-full max-h-full object-contain"
            />

            {/* Slide indicators (dots) - inside image */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1.5">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  className={`rounded-full transition-all ${
                    index === currentSlide
                      ? 'w-2 h-2 bg-gray-800'
                      : 'w-1.5 h-1.5 bg-gray-400 hover:bg-gray-500'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Navigation buttons - below image */}
          <div className="flex items-center justify-between w-full gap-4">
            <button
              onClick={handlePrevious}
              disabled={currentSlide === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                currentSlide === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="font-medium">Previous</span>
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: '#4C65E2' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3B52C9')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4C65E2')}
            >
              <span className="font-medium">
                {currentSlide === totalSlides - 1 ? 'Get Started' : 'Next'}
              </span>
              {currentSlide < totalSlides - 1 && <ChevronRight className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
