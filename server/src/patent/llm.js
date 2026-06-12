const { buildSystemPrompt, buildChatSystemPrompt } = require('./prompt');
const { getProviderModels, getModelById } = require('./providerModels');
const { rankModelsForTask } = require('./modelRouter');

function supportsVision(model) {
  if (!model) return false;
  const id = String(model);
  const hit = getModelById(id)
    || getProviderModels().find((p) => id === p.id || id.startsWith(`${p.id}-`) || id.startsWith(`${p.id}/`));
  return !!hit?.vision;
}

function prepareMessagesForApi(messages, options = {}) {
  const images = options.images || [];
  const model = options.model || process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!images.length) {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
  return messages.map((m, idx) => {
    if (m.role !== 'user' || idx !== lastUserIdx) {
      return { role: m.role, content: m.content };
    }

    if (supportsVision(model)) {
      const parts = [{ type: 'text', text: m.content }];
      for (const img of images) {
        parts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
      }
      // #region agent log
      try {
        fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
          body: JSON.stringify({
            sessionId: '36d6f3',
            runId: 'vision-fix-v1',
            hypothesisId: 'H-vision-payload',
            location: 'llm.js:prepareMessagesForApi',
            message: 'vision payload attached',
            data: { model, imageCount: images.length, supportsVision: true },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch { /* ignore */ }
      // #endregion
      return { role: 'user', content: parts };
    }

    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'vision-fix-v1',
          hypothesisId: 'H-vision-payload',
          location: 'llm.js:prepareMessagesForApi',
          message: 'vision payload skipped',
          data: { model, imageCount: images.length, supportsVision: false },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion

    return {
      role: 'user',
      content: `${m.content}\n\n> 已附 ${images.length} 张图片；当前模型（${model}）可能不支持视觉，请优先依据文本附件与文字说明分析。`,
    };
  });
}

function isRetryableLlmError(err) {
  const status = err?.status;
  if ([403, 408, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = err?.message || '';
  return /no access to model|model.*not.*found|does not exist|无可用|不可用|bad_response_status_code|openai_error|gateway|timeout|timed out|overloaded|rate limit/i.test(msg);
}

function humanizeLlmError(err, triedModels = []) {
  const status = err?.status;
  const triedNote = triedModels.length > 1 ? `（已自动尝试 ${triedModels.length} 个模型）` : '';
  if (status === 504) {
    return `模型网关超时 504${triedNote}。上游服务响应过慢，请稍后重试；建议保持 AUTO 开启以自动切换备选模型。`;
  }
  if (status === 502 || status === 503) {
    return `模型服务暂时不可用（${status}）${triedNote}，请稍后重试。`;
  }
  if (status === 429) {
    return `模型请求过于频繁（429）${triedNote}，请稍后再试。`;
  }
  if (status === 403) {
    return `当前 API Key 无权限访问该模型${triedNote}，请在设置中调整已选模型。`;
  }
  if (status === 400 && /too long|input is too long|context length/i.test(err?.message || '')) {
    return `对话上下文过长，模型无法处理${triedNote}。系统已尝试压缩历史；若仍失败，请新建对话并说明「基于上一份专利重写」，或只发送简短修改要求。`;
  }
  return err?.message || '模型调用失败';
}

async function callLLMOnce(baseUrl, apiKey, model, systemContent, apiMessages, options = {}) {
  const defaultMax = options.mode === 'patent' ? 16384 : 8192;
  const body = {
    model,
    messages: [
      { role: 'system', content: systemContent },
      ...apiMessages,
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? defaultMax,
    stream: false,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  }).catch((err) => {
    throw new Error(
      `无法连接 LLM 服务（${baseUrl}）：${err.message}。请检查网络/代理，或在「设置」中确认 API Key 与已选模型。`
    );
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`LLM API 错误 (${res.status}): ${errText.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { content, model: data.model || model, usage: data.usage };
}

async function callLLM(messages, options = {}) {
  const baseUrl = (process.env.LLM_API_BASE || '').replace(/\/$/, '');
  const apiKey = process.env.LLM_API_KEY || '';
  const mode = options.mode || 'patent';
  const hasImages = !!(options.images && options.images.length);
  const hasTextAttachments = !!options.hasTextAttachments;

  const locale = options.locale === 'en' ? 'en' : 'zh';

  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    return {
      content: mode === 'patent'
        ? generateFallbackPatent(messages, { locale })
        : generateFallbackChat(messages, { locale }),
      model: 'fallback-local',
      usage: null,
    };
  }

  const systemContent = mode === 'patent'
    ? buildSystemPrompt({ locale })
    : buildChatSystemPrompt({ hasPatentContext: !!options.hasPatentContext, locale });

  const route = (options.model && (!hasImages || supportsVision(options.model)))
    ? { models: [options.model], auto: false, reason: 'explicit' }
    : rankModelsForTask({
      mode,
      hasImages,
      hasTextAttachments,
      attachmentProfile: options.attachmentProfile,
      selectedRaw: options.selectedRaw,
    });
  let modelQueue = route.models;
  if (hasImages && modelQueue.length && !modelQueue.some((id) => supportsVision(id))) {
    modelQueue = getProviderModels().filter((m) => m.vision).map((m) => m.id);
  }

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'model-router',
        hypothesisId: 'H-auto-pick',
        location: 'llm.js:callLLM',
        message: 'model queue ranked',
        data: {
          mode,
          locale,
          hasImages,
          hasTextAttachments,
          attachmentProfile: options.attachmentProfile,
          auto: route.auto,
          reason: route.reason,
          modelQueue,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  let lastError = null;
  const triedModels = [];
  for (let i = 0; i < modelQueue.length; i++) {
    const model = modelQueue[i];
    const apiMessages = prepareMessagesForApi(messages, { images: options.images, model });
    const attemptOptions = {
      ...options,
      maxTokens: i === 0
        ? options.maxTokens
        : Math.min(options.maxTokens ?? (options.mode === 'patent' ? 16384 : 8192), 8192),
    };
    try {
      const result = await callLLMOnce(baseUrl, apiKey, model, systemContent, apiMessages, attemptOptions);
      // #region agent log
      try {
        fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
          body: JSON.stringify({
            sessionId: '36d6f3',
            runId: 'model-router',
            hypothesisId: 'H-model-pick',
            location: 'llm.js:callLLM:success',
            message: 'model call succeeded',
            data: { model: result.model, tried: modelQueue.indexOf(model) + 1 },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch { /* ignore */ }
      // #endregion
      return { ...result, modelRoute: route };
    } catch (err) {
      lastError = err;
      triedModels.push(model);
      const retryable = isRetryableLlmError(err);
      const hasNext = i < modelQueue.length - 1;
      // #region agent log
      try {
        fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
          body: JSON.stringify({
            sessionId: '36d6f3',
            runId: 'llm-retry',
            hypothesisId: 'H-504-fallback',
            location: 'llm.js:callLLM:retry',
            message: 'model call failed',
            data: {
              model,
              status: err.status,
              retryable,
              hasNext,
              triedModels: [...triedModels],
              errPreview: (err.message || '').slice(0, 200),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch { /* ignore */ }
      // #endregion
      if (!retryable || !hasNext) break;
    }
  }

  const friendly = humanizeLlmError(lastError, triedModels);
  throw new Error(triedModels.length
    ? `${friendly}`
    : (lastError?.message || '所有已选模型均调用失败，请在设置中调整模型或检查 API Key'));
}

function extractUserTopic(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  return lastUser?.content?.slice(0, 200) || '一种信息系统优化方法';
}

function generateFallbackPatent(messages) {
  const topic = extractUserTopic(messages);
  const today = new Date().toISOString().slice(0, 10);
  const inventionName = topic.replace(/[。，,.]/g, '').slice(0, 40) || '一种应用性能优化方法';

  return `> ⚠️ 当前未配置 LLM API Key，以下为演示模板。请在「设置」中配置 API Key 后重新生成。

正在执行 **Phase 1～2** 专利撰写流程…

\`\`\`markdown
# 专利_${inventionName}_技术交底书与说明书

## 项 目
${inventionName}

## 技术术语
【本方案所涉及到的技术术语的解释，特别是英文大写字母缩写的技术术语，请给出全拼及对应的中文术语。】

- 调度器：负责按策略分配系统资源的软件模块
- 阈值 Tbudget：判定是否切换备用处理路径的时间或负载门限

## 背 景 技 术
【现有技术具体方案、存在的问题、导致问题的原因。】

现有信息系统在高峰负载或冷启动场景下存在响应耗时过长的问题，主要原因为资源调度不均衡与关键路径阻塞。

## 本发明的技术方案
【简要描述本软件/算法/方法应用的设备和场景，结合技术问题和实施的效果详细描述本方法的实现过程，涉及软硬件结合的需结合具体步骤的执行主体来写。】

步骤1：系统服务在开机阶段预注册目标应用的关键组件信息。
步骤2：当用户触发启动意图时，调度器优先分配独立渲染线程。
步骤3：若检测到主线程阻塞超过阈值 Tbudget，则切换至备用启动路径。
步骤4：启动完成后记录耗时指标并更新策略权重。

## 有 益 效 果
【与现有的产品、技术相比具有的优点。】

1. 缩短关键路径响应时间，提升用户体验。
2. 降低高负载场景下的阻塞与超时风险。
3. 自适应策略可持续优化后续运行性能。

## 发明点
【最想保护的技术点是什么？】

1. 基于 Tbudget 阈值的阻塞检测与备用路径切换机制。
2. 初始化阶段预注册与运行调度协同的预加载策略。
3. 运行耗时反馈驱动的策略权重自适应更新方法。

## 图纸
【本软件/算法/方法实现的详细流程图，应用设备的组成框图（可选）】

\`\`\`mermaid
flowchart TD
    A([开始]) --> B[初始化预注册]
    B --> C{收到业务请求?}
    C -->|是| D[分配处理资源]
    C -->|否| E[等待]
    E --> C
    D --> F{阻塞超过 Tbudget?}
    F -->|是| G[切换备用处理路径]
    F -->|否| H[常规处理流程]
    G --> I[记录耗时并更新权重]
    H --> I
    I --> J([结束])
\`\`\`

## 技术联系人
（导出 Word 时由用户自行填写）

---

## 查重与检索说明
- 检索日期：${today}
- 检索平台：国家知识产权局 PSS、Google Patents、EPO、WIPO、soopat 等（演示模式未实际联网检索）
- 结论：演示模式下请配置 API 后执行完整 Phase 3 检索

## 查重自检
- 自检日期：${today}
- 说明：配置 LLM API 后将执行完整自检流程

## 新创行评估
- 新颖性：与常规性能优化在阈值切换机制上存在区别
- 创造性：技术手段组合非显而易见
- 实用性：可在目标设备或系统中实施

## 可行性与商业价值
适用于智能终端、工业控制、云平台等多类产品线，可提升稳定性与体验指标。

## 专利质量自评
- 等级：🟡 P1（演示模式，配置 API 后目标 P0）
\`\`\`

请在 **设置 → LLM API Key** 中填入有效的 OpenAI 兼容 API Key，即可生成完整专利并导出 Word。`;
}

function generateFallbackChat(messages, options = {}) {
  const locale = options.locale === 'en' ? 'en' : 'zh';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() || '';
  if (locale === 'en') {
    if (/who are you|what are you|what can you do/i.test(lastUser)) {
      return `I am the **Patent Drafting Assistant**. I can:

- **Q&A chat**: Answer questions on patent drafting, prior-art search, novelty, and solution revisions (just ask)
- **Full drafting**: When you say "draft a patent for…" or describe a complete technical solution, I follow Skill Phases 1–6 to generate the disclosure and export Word

> ⚠️ No LLM API Key is configured — this is a local demo reply. Configure your API Key in **Settings** for full chat.`;
    }
    return `> ⚠️ No LLM API Key is configured — cannot call the model.

You mentioned: "${lastUser.slice(0, 120)}"

Configure your Key under **Settings → LLM API** and resend. To generate a full patent, say "draft a patent for…" or describe your technical solution.`;
  }
  if (/你是谁|你是什么|你能做什么/.test(lastUser)) {
    return `我是 **专利撰写助手**，可以：

- **咨询对话**：解答专利撰写、查重、新颖性、方案修改等问题（直接提问即可）
- **正式撰写**：当你说「帮我撰写…专利」或描述完整技术方案时，按 Skill Phase 1～6 生成交底书并导出 Word

> ⚠️ 当前未配置 LLM API Key，以上为本地演示回复。请在「设置」中配置 API 后获得完整对话能力。`;
  }
  return `> ⚠️ 当前未配置 LLM API Key，无法调用模型回答咨询。

您刚才提到：「${lastUser.slice(0, 120)}」

请在 **设置 → LLM API** 配置 Key 后重新发送。若需生成完整专利，请明确说「帮我撰写…专利」或描述技术方案。`;
}

module.exports = { callLLM, buildSystemPrompt, buildChatSystemPrompt, supportsVision, prepareMessagesForApi };
