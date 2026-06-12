const { isWordExportRequest, isPatentGenerationRequest, findLastPatentContent } = require('./pipeline');
const { isPriorArtSearchRequest, isSearchMetaQuestion } = require('./priorArtSearch');

const CHAT_PATTERNS = [
  /^(你是谁|你是什么|你好|您好|谢谢|多谢|hi|hello)[\s!！。,?？]*$/i,
  /^(你能做什么|你会什么|怎么用|如何使用|使用说明|帮助)[\s?？]*$/i,
];

const PATENT_DRAFT_PATTERNS = [
  /^(随机)?生成(一个)?专利$/,
  /随机生成.*专利/,
  /帮我(撰写|写|生成).*专利/,
  /撰写.*专利.*交底书/,
  /按.*skill.*(撰写|生成|输出)/i,
  /输出完整.*交底书/,
  /重新(撰写|生成).*专利/,
  /请.*撰写.*完整/,
  /写一份.*专利/,
  /生成.*交底书/,
];

const CONSULT_PATTERNS = [
  /[？?]$/,
  /为什么|怎么|如何|是否|能否|可不可以|有没有|什么问题|疑问|够吗|可以吗|行不行/,
  /查重|新颖性|创造性|驳回|审查|权利要求|发明点|区别|对比|评估|分析|解释|说明|建议|优化|改进/,
  /有问题|不太懂|不明白|不清楚|担心|风险/,
];

/**
 * @returns {'word_export'|'search_sites_info'|'prior_art_search'|'chat'|'consult'|'patent_draft'}
 */
function classifyUserIntent(message, priorHistory = []) {
  const t = (message || '').trim();
  if (!t) return 'chat';

  if (isWordExportRequest(t)) return 'word_export';

  if (isSearchMetaQuestion(t)) return 'search_sites_info';

  if (isPriorArtSearchRequest(t, priorHistory)) return 'prior_art_search';

  if (CHAT_PATTERNS.some((p) => p.test(t))) return 'chat';

  if (PATENT_DRAFT_PATTERNS.some((p) => p.test(t)) || isPatentGenerationRequest(t)) {
    return 'patent_draft';
  }

  if (/撰写|写一份|完整交底书|按.*phase/i.test(t) && !/[？?]$/.test(t)) {
    return 'patent_draft';
  }

  // 较长技术描述且无疑问语气 → 视为正式撰写请求
  if (
    t.length >= 60
    && !/[？?]$/.test(t)
    && !/[吗呢么]$/.test(t)
    && /方法|系统|装置|模块|算法|机制|流程|架构|优化|调度|设备|专利|发明/i.test(t)
  ) {
    return 'patent_draft';
  }

  if (CONSULT_PATTERNS.some((p) => p.test(t))) return 'consult';

  const hasPatent = !!findLastPatentContent(priorHistory);
  if (hasPatent) {
    if (/完整|交底书|全文|skill|phase/i.test(t) && /修改|重写|重新|撰写|生成/.test(t)) {
      return 'patent_draft';
    }
    if (/修改|补充|调整|更新|改成|改为|加上|删除|替换|继续完善/.test(t)) {
      return 'consult';
    }
    return 'consult';
  }

  if (t.length <= 32 && !/专利|系统|撰写|交底书|发明|方法|装置/i.test(t)) {
    return 'chat';
  }

  return 'consult';
}

module.exports = { classifyUserIntent };
