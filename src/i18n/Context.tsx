import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations } from './translations';

type Language = 'en' | 'fr';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, ...args: any[]) => string | any;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('ks-lang');
    return (saved === 'en' || saved === 'fr') ? saved : 'fr';
  });

  useEffect(() => {
    localStorage.setItem('ks-lang', lang);
  }, [lang]);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
  };

  const t = (path: string, ...args: any[]) => {
    const keys = path.split('.');
    let result: any = translations[lang];
    for (const key of keys) {
      if (result[key] === undefined) {
        console.warn(`Translation key not found: ${path}`);
        return path;
      }
      result = result[key];
    }
    if (typeof result === 'function') {
      return result(...args);
    }
    return result;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
