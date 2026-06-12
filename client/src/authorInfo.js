export const AUTHOR_EMAIL = '13960565525@163.com';

export const AUTHOR_NAME = {
  zh: '陈兴华',
  en: 'Xinghua Chen',
};

export function getAuthorName(locale = 'zh') {
  return AUTHOR_NAME[locale === 'en' ? 'en' : 'zh'] || AUTHOR_NAME.zh;
}
